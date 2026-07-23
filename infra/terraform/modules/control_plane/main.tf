data "aws_region" "current" {}

data "aws_caller_identity" "current" {}

data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

locals {
  secretsmanager_service = "secretsmanager.${data.aws_region.current.region}.amazonaws.com"
  s3_service             = "s3.${data.aws_region.current.region}.amazonaws.com"
  dynamodb_service       = "dynamodb.${data.aws_region.current.region}.amazonaws.com"
}

resource "aws_cloudwatch_log_group" "service" {
  name              = "/aws/ecs/${var.name}/control-plane"
  retention_in_days = 365
  kms_key_id        = var.platform_kms_key_arn
}

resource "aws_security_group" "alb" {
  name        = "${var.name}-alb"
  description = "FortressNet control plane ALB"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "alb_from_cloudfront" {
  security_group_id = aws_security_group.alb.id
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront.id
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  description       = "Allow HTTPS from CloudFront origin-facing prefix list only"
}

resource "aws_vpc_security_group_ingress_rule" "alb_direct_https" {
  for_each = toset(var.allow_direct_http_cidr_blocks)

  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = each.value
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  description       = "Allow temporary direct HTTPS access from approved CIDR"
}

resource "aws_vpc_security_group_egress_rule" "alb" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.service.id
  from_port                    = var.container_port
  to_port                      = var.container_port
  ip_protocol                  = "tcp"
  description                  = "Allow ALB egress only to control plane service targets"
}

resource "aws_security_group" "service" {
  name        = "${var.name}-service"
  description = "FortressNet control plane service"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "service_from_alb" {
  security_group_id            = aws_security_group.service.id
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = var.container_port
  to_port                      = var.container_port
  ip_protocol                  = "tcp"
  description                  = "Allow control plane traffic from ALB only"
}

resource "aws_vpc_security_group_ingress_rule" "database_from_service" {
  security_group_id            = var.database_security_group_id
  referenced_security_group_id = aws_security_group.service.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
  description                  = "Allow PostgreSQL access from control plane service"
}

resource "aws_lb" "this" {
  name                       = substr(replace("${var.name}-alb", "_", "-"), 0, 32)
  load_balancer_type         = "application"
  internal                   = false
  security_groups            = [aws_security_group.alb.id]
  subnets                    = var.public_subnet_ids
  enable_deletion_protection = true
  drop_invalid_header_fields = true

  access_logs {
    bucket  = var.log_bucket_name
    prefix  = "alb"
    enabled = true
  }
}

resource "aws_lb_target_group" "service" {
  name        = substr(replace("${var.name}-tg", "_", "-"), 0, 32)
  port        = var.container_port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc_id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200-399"
    path                = "/healthz"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = var.alb_certificate_arn
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"

  default_action {
    type = "fixed-response"

    fixed_response {
      content_type = "application/json"
      message_body = jsonencode({ error = "forbidden" })
      status_code  = "403"
    }
  }
}

resource "aws_lb_listener_rule" "verified_cloudfront_origin" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.service.arn
  }

  condition {
    http_header {
      http_header_name = var.origin_verify_header_name
      values           = [var.origin_verify_header_value]
    }
  }
}

resource "aws_ecs_cluster" "this" {
  name = var.name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_iam_role" "execution" {
  name = "${var.name}-ecs-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  name = "${var.name}-execution-secrets"
  role = aws_iam_role.execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          var.database_secret_arn,
          var.platform_config_secret
        ]
      },
      {
        Effect   = "Allow"
        Action   = "kms:Decrypt"
        Resource = var.platform_kms_key_arn
        Condition = {
          StringEquals = {
            "kms:ViaService" = local.secretsmanager_service
          }
        }
      }
    ]
  })
}

resource "aws_iam_role" "task" {
  name = "${var.name}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "task" {
  name = "${var.name}-task-access"
  role = aws_iam_role.task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem",
          "dynamodb:DeleteItem",
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:UpdateItem"
        ]
        Resource = [
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.tenants_table_name}",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.customers_table_name}",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.domains_table_name}",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.entitlements_table_name}",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.security_policies_table_name}",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.users_table_name}",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.api_keys_table_name}",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.idp_connections_table_name}",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.profiles_table_name}",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.origins_table_name}",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.origin_health_events_table_name}",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.operation_locks_table_name}",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.origin_pools_table_name}",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.certificates_table_name}",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.waf_change_sets_table_name}",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.edge_deployments_table_name}",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.approvals_table_name}",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.dns_zones_table_name}",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.dns_records_table_name}",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.ai_findings_table_name}",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.ztna_applications_table_name}",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.api_inventory_table_name}",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.api_schemas_table_name}",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.waf_events_table_name}",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.dmarc_configurations_table_name}",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.dmarc_reports_table_name}",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.client_security_events_table_name}",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.marketplace_usage_table_name}",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.domains_table_name}/index/*",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.security_policies_table_name}/index/*",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.users_table_name}/index/*",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.api_keys_table_name}/index/*",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.idp_connections_table_name}/index/*",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.origins_table_name}/index/*",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.origin_health_events_table_name}/index/*",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.origin_pools_table_name}/index/*",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.certificates_table_name}/index/*",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.waf_change_sets_table_name}/index/*",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.edge_deployments_table_name}/index/*",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.approvals_table_name}/index/*",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.dns_zones_table_name}/index/*",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.dns_records_table_name}/index/*",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.ai_findings_table_name}/index/*",
          "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.ztna_applications_table_name}/index/*"
          , "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.api_inventory_table_name}/index/*"
          , "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.api_schemas_table_name}/index/*"
          , "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.waf_events_table_name}/index/*"
          , "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.dmarc_configurations_table_name}/index/*"
          , "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.dmarc_reports_table_name}/index/*"
          , "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.client_security_events_table_name}/index/*"
          , "arn:aws:dynamodb:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${var.marketplace_usage_table_name}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "cognito-idp:AdminAddUserToGroup",
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminDeleteUser",
          "cognito-idp:AdminRemoveUserFromGroup",
          "cognito-idp:CreateIdentityProvider",
          "cognito-idp:DescribeUserPoolClient",
          "cognito-idp:UpdateUserPoolClient"
        ]
        Resource = "arn:aws:cognito-idp:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:userpool/${var.cognito_user_pool_id}"
      },
      {
        Effect = "Allow"
        Action = [
          "route53:ChangeResourceRecordSets",
          "route53:CreateHostedZone",
          "route53:GetDNSSEC"
          , "route53:ListResourceRecordSets"
          , "route53:GetChange"
          , "route53:CreateKeySigningKey"
          , "route53:EnableHostedZoneDNSSEC"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "acm:RequestCertificate",
          "acm:AddTagsToCertificate"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "aws:RequestTag/ManagedBy" = "FortressNet"
          }
        }
      },
      {
        Effect   = "Allow"
        Action   = "kms:DescribeKey"
        Resource = var.platform_kms_key_arn
      },
      {
        Effect = "Allow"
        Action = [
          "acm:DescribeCertificate"
        ]
        Resource = "arn:aws:acm:us-east-1:${data.aws_caller_identity.current.account_id}:certificate/*"
      },
      {
        Effect = "Allow"
        Action = [
          "cloudfront:CreateDistribution",
          "cloudfront:GetDistribution",
          "cloudfront:GetDistributionConfig",
          "cloudfront:ListDistributions"
          , "cloudfront:UpdateDistribution"
          , "cloudfront:CreateResponseHeadersPolicy"
          , "cloudfront:GetResponseHeadersPolicy"
          , "cloudfront:ListResponseHeadersPolicies"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "wafv2:CreateWebACL",
          "wafv2:TagResource",
          "wafv2:CreateIPSet",
          "wafv2:DeleteIPSet",
          "wafv2:GetIPSet",
          "wafv2:GetWebACL",
          "wafv2:ListWebACLs",
          "wafv2:UpdateWebACL",
          "wafv2:PutLoggingConfiguration",
          "wafv2:GetLoggingConfiguration"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "aws:RequestedRegion" = "us-east-1"
          }
        }
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetBucketAcl",
          "s3:PutBucketAcl"
        ]
        Resource = "arn:aws:s3:::${trimsuffix(var.edge_logs_bucket_domain_name, ".s3.amazonaws.com")}"
      },
      {
        Effect = "Allow"
        Action = [
          "logs:AssociateKmsKey",
          "logs:CreateLogGroup",
          "logs:CreateLogDelivery",
          "logs:DeleteLogDelivery",
          "logs:DescribeLogGroups",
          "logs:DescribeResourcePolicies",
          "logs:FilterLogEvents",
          "logs:PutResourcePolicy",
          "logs:PutRetentionPolicy"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "aws:RequestedRegion" = "us-east-1"
          }
        }
      },
      {
        Effect = "Allow"
        Action = [
          "ec2:CreateVerifiedAccessTrustProvider",
          "ec2:CreateVerifiedAccessEndpoint",
          "ec2:DeleteVerifiedAccessEndpoint",
          "ec2:DescribeVerifiedAccessEndpoints",
          "ec2:DescribeVerifiedAccessTrustProviders",
          "ec2:ModifyVerifiedAccessEndpoint"
        ]
        Resource  = "*"
        Condition = { StringEquals = { "aws:RequestedRegion" = data.aws_region.current.region } }
      },
      {
        Effect   = "Allow"
        Action   = ["aws-marketplace:BatchMeterUsage", "aws-marketplace:GetEntitlements", "aws-marketplace:ResolveCustomer"]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::${var.log_bucket_name}",
          "arn:aws:s3:::${var.log_bucket_name}/*",
          "arn:aws:s3:::${var.dmarc_intake_bucket_name}",
          "arn:aws:s3:::${var.dmarc_intake_bucket_name}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          var.database_secret_arn,
          var.platform_config_secret
        ]
      },
      {
        Effect   = "Allow"
        Action   = "kms:Decrypt"
        Resource = var.platform_kms_key_arn
        Condition = {
          StringEquals = {
            "kms:ViaService" = local.secretsmanager_service
          }
        }
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:GenerateDataKey"
        ]
        Resource = var.platform_kms_key_arn
        Condition = {
          StringEquals = {
            "kms:ViaService" = [
              local.dynamodb_service,
              local.s3_service
            ]
          }
        }
      }
    ]
  })
}

resource "aws_ecs_task_definition" "this" {
  family                   = "${var.name}-control-plane"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = "control-plane"
      image     = var.app_image
      essential = true
      portMappings = [
        {
          containerPort = var.container_port
          hostPort      = var.container_port
          protocol      = "tcp"
        }
      ]
      environment = [
        {
          name  = "FORTRESSNET_ENV"
          value = var.name
        },
        {
          name  = "AWS_REGION"
          value = data.aws_region.current.region
        },
        {
          name  = "TENANTS_TABLE"
          value = var.tenants_table_name
        },
        {
          name  = "CUSTOMERS_TABLE"
          value = var.customers_table_name
        },
        {
          name  = "DOMAINS_TABLE"
          value = var.domains_table_name
        },
        {
          name  = "ENTITLEMENTS_TABLE"
          value = var.entitlements_table_name
        },
        {
          name  = "SECURITY_POLICIES_TABLE"
          value = var.security_policies_table_name
        },
        {
          name  = "USERS_TABLE"
          value = var.users_table_name
        },
        {
          name  = "API_KEYS_TABLE"
          value = var.api_keys_table_name
        },
        {
          name  = "IDP_CONNECTIONS_TABLE"
          value = var.idp_connections_table_name
        },
        {
          name  = "PROFILES_TABLE"
          value = var.profiles_table_name
        },
        {
          name  = "ORIGINS_TABLE"
          value = var.origins_table_name
        },
        {
          name  = "ORIGIN_HEALTH_EVENTS_TABLE"
          value = var.origin_health_events_table_name
        },
        {
          name  = "OPERATION_LOCKS_TABLE"
          value = var.operation_locks_table_name
        },
        {
          name  = "ORIGIN_HEALTH_SCHEDULER_ENABLED"
          value = "true"
        },
        {
          name  = "ORIGIN_POOLS_TABLE"
          value = var.origin_pools_table_name
        },
        {
          name  = "CERTIFICATES_TABLE"
          value = var.certificates_table_name
        },
        {
          name  = "WAF_CHANGE_SETS_TABLE"
          value = var.waf_change_sets_table_name
        },
        {
          name  = "EDGE_DEPLOYMENTS_TABLE"
          value = var.edge_deployments_table_name
        },
        {
          name  = "APPROVALS_TABLE"
          value = var.approvals_table_name
        },
        {
          name  = "DNS_ZONES_TABLE"
          value = var.dns_zones_table_name
        },
        {
          name  = "DNS_RECORDS_TABLE"
          value = var.dns_records_table_name
        },
        {
          name  = "AI_FINDINGS_TABLE"
          value = var.ai_findings_table_name
        },
        {
          name  = "ZTNA_APPLICATIONS_TABLE"
          value = var.ztna_applications_table_name
        },
        {
          name  = "API_INVENTORY_TABLE"
          value = var.api_inventory_table_name
        },
        {
          name  = "API_SCHEMAS_TABLE"
          value = var.api_schemas_table_name
        },
        {
          name  = "WAF_EVENTS_TABLE"
          value = var.waf_events_table_name
        },
        {
          name  = "DMARC_CONFIGURATIONS_TABLE"
          value = var.dmarc_configurations_table_name
        },
        {
          name  = "DMARC_REPORTS_TABLE"
          value = var.dmarc_reports_table_name
        },
        {
          name  = "CLIENT_SECURITY_EVENTS_TABLE"
          value = var.client_security_events_table_name
        },
        {
          name  = "MARKETPLACE_USAGE_TABLE"
          value = var.marketplace_usage_table_name
        },
        {
          name  = "DNSSEC_KMS_KEY_ARN"
          value = var.dnssec_kms_key_arn
        },
        {
          name  = "VERIFIED_ACCESS_INSTANCE_ID"
          value = var.verified_access_instance_id
        },
        {
          name  = "DMARC_RECEIVER_DOMAIN"
          value = var.dmarc_receiver_domain
        },
        {
          name  = "DMARC_INTAKE_BUCKET"
          value = var.dmarc_intake_bucket_name
        },
        {
          name  = "EDGE_LOGS_BUCKET_DOMAIN_NAME"
          value = var.edge_logs_bucket_domain_name
        },
        {
          name  = "PLATFORM_KMS_KEY_ARN"
          value = var.platform_kms_key_arn
        },
        {
          name  = "COGNITO_USER_POOL_ID"
          value = var.cognito_user_pool_id
        },
        {
          name  = "COGNITO_APP_CLIENT_ID"
          value = var.cognito_app_client_id
        },
        {
          name  = "COGNITO_HOSTED_UI_URL"
          value = var.cognito_hosted_ui_url
        },
        {
          name  = "AUDIT_LOG_BUCKET"
          value = var.log_bucket_name
        },
        {
          name  = "DATABASE_HOST"
          value = var.database_host
        },
        {
          name  = "DATABASE_PORT"
          value = tostring(var.database_port)
        },
        {
          name  = "DATABASE_SECRET_VERSION"
          value = var.database_secret_version
        }
      ]
      secrets = [
        {
          name      = "DATABASE_SECRET"
          valueFrom = var.database_secret_arn
        },
        {
          name      = "PLATFORM_CONFIG_SECRET"
          valueFrom = var.platform_config_secret
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.service.name
          awslogs-region        = data.aws_region.current.region
          awslogs-stream-prefix = "control-plane"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "this" {
  name                              = "control-plane"
  cluster                           = aws_ecs_cluster.this.id
  task_definition                   = aws_ecs_task_definition.this.arn
  desired_count                     = var.desired_count
  launch_type                       = "FARGATE"
  health_check_grace_period_seconds = 60

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.service.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.service.arn
    container_name   = "control-plane"
    container_port   = var.container_port
  }

  depends_on = [aws_lb_listener.https]
}
