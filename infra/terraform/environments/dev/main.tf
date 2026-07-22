module "network" {
  source = "../../modules/network"

  name               = local.name
  vpc_cidr           = "10.42.0.0/16"
  availability_zones = ["${var.aws_region}a", "${var.aws_region}b"]
  public_subnets     = ["10.42.0.0/24", "10.42.1.0/24"]
  private_subnets    = ["10.42.10.0/24", "10.42.11.0/24"]
  enable_nat_gateway = var.enable_nat_gateway
}

module "data_plane" {
  source = "../../modules/data_plane"

  name                    = local.name
  database_name           = var.database_name
  database_username       = var.database_username
  database_instance_class = var.database_instance_class
  vpc_id                  = module.network.vpc_id
  private_subnet_ids      = module.network.private_subnet_ids
}

module "identity" {
  source = "../../modules/identity"

  name                   = local.name
  app_fqdn               = local.app_fqdn
  domain_url             = "https://${local.app_fqdn}"
  additional_domain_urls = ["https://${var.domain_name}"]
}

resource "random_password" "origin_verify_header" {
  length  = 32
  special = false
}

data "aws_route53_zone" "platform" {
  name         = var.hosted_zone_name
  private_zone = false
}

resource "aws_acm_certificate" "origin" {
  domain_name       = local.origin_fqdn
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "origin_certificate_validation" {
  for_each = {
    for dvo in aws_acm_certificate.origin.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id = data.aws_route53_zone.platform.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

resource "aws_acm_certificate_validation" "origin" {
  certificate_arn         = aws_acm_certificate.origin.arn
  validation_record_fqdns = [for record in aws_route53_record.origin_certificate_validation : record.fqdn]
}

module "control_plane" {
  source = "../../modules/control_plane"

  name                         = local.name
  vpc_id                       = module.network.vpc_id
  public_subnet_ids            = module.network.public_subnet_ids
  private_subnet_ids           = module.network.private_subnet_ids
  app_image                    = "${aws_ecr_repository.control_plane.repository_url}:${var.app_image_tag}"
  container_port               = var.app_container_port
  desired_count                = var.desired_count
  database_secret_arn          = module.data_plane.database_secret_arn
  database_secret_version      = module.data_plane.database_secret_version_id
  database_host                = module.data_plane.database_address
  database_port                = module.data_plane.database_port
  database_security_group_id   = module.data_plane.database_security_group_id
  platform_config_secret       = module.data_plane.platform_config_secret_arn
  platform_kms_key_arn         = module.data_plane.kms_key_arn
  alb_certificate_arn          = aws_acm_certificate_validation.origin.certificate_arn
  origin_verify_header_name    = local.origin_verify_header_name
  origin_verify_header_value   = random_password.origin_verify_header.result
  log_bucket_name              = module.data_plane.audit_logs_bucket_name
  tenants_table_name           = module.data_plane.tenants_table_name
  domains_table_name           = module.data_plane.domains_table_name
  entitlements_table_name      = module.data_plane.entitlements_table_name
  security_policies_table_name = module.data_plane.security_policies_table_name
  users_table_name             = module.data_plane.users_table_name
  api_keys_table_name          = module.data_plane.api_keys_table_name
  idp_connections_table_name   = module.data_plane.idp_connections_table_name
  profiles_table_name          = module.data_plane.profiles_table_name
  origins_table_name           = module.data_plane.origins_table_name
  origin_pools_table_name      = module.data_plane.origin_pools_table_name
  certificates_table_name      = module.data_plane.certificates_table_name
  waf_change_sets_table_name   = module.data_plane.waf_change_sets_table_name
  edge_deployments_table_name  = module.data_plane.edge_deployments_table_name
  approvals_table_name         = module.data_plane.approvals_table_name
  dns_zones_table_name         = module.data_plane.dns_zones_table_name
  dns_records_table_name       = module.data_plane.dns_records_table_name
  ai_findings_table_name       = module.data_plane.ai_findings_table_name
  edge_logs_bucket_domain_name = module.data_plane.edge_logs_bucket_domain_name
  cognito_user_pool_id         = module.identity.user_pool_id
  cognito_app_client_id        = module.identity.app_client_id
  cognito_hosted_ui_url        = module.identity.hosted_ui_url
}

resource "aws_route53_record" "origin_ipv4" {
  zone_id = data.aws_route53_zone.platform.zone_id
  name    = local.origin_fqdn
  type    = "A"

  alias {
    name                   = module.control_plane.alb_dns_name
    zone_id                = module.control_plane.alb_zone_id
    evaluate_target_health = true
  }
}

module "edge" {
  source = "../../modules/edge"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  name                       = local.name
  app_fqdn                   = local.app_fqdn
  additional_aliases         = [var.domain_name]
  hosted_zone_name           = var.hosted_zone_name
  origin_domain              = local.origin_fqdn
  origin_protocol            = "https-only"
  origin_verify_header_name  = local.origin_verify_header_name
  origin_verify_header_value = random_password.origin_verify_header.result
  waf_rate_limit             = var.waf_rate_limit
  logs_bucket_name           = module.data_plane.edge_logs_bucket_name
  logs_bucket_domain_name    = module.data_plane.edge_logs_bucket_domain_name
  platform_kms_key_arn       = module.data_plane.kms_key_arn
  price_class                = "PriceClass_100"
}

resource "aws_security_group" "vpc_endpoints" {
  name        = "${local.name}-vpc-endpoints"
  description = "Private AWS API endpoints for FortressNet control plane"
  vpc_id      = module.network.vpc_id

  tags = local.tags
}

resource "aws_vpc_security_group_ingress_rule" "vpc_endpoints_from_control_plane" {
  security_group_id            = aws_security_group.vpc_endpoints.id
  referenced_security_group_id = module.control_plane.service_security_group_id
  from_port                    = 443
  to_port                      = 443
  ip_protocol                  = "tcp"
  description                  = "Allow HTTPS from control plane tasks to private AWS API endpoints"
}

resource "aws_vpc_security_group_egress_rule" "control_plane_to_vpc_endpoints" {
  security_group_id            = module.control_plane.service_security_group_id
  referenced_security_group_id = aws_security_group.vpc_endpoints.id
  from_port                    = 443
  to_port                      = 443
  ip_protocol                  = "tcp"
  description                  = "Allow HTTPS from control plane tasks to private interface endpoints"
}

# Cognito Managed Login user pools do not support PrivateLink API calls. The
# control plane therefore reaches Cognito through the existing NAT gateway on
# HTTPS only; security groups cannot express an AWS service FQDN restriction.
resource "aws_vpc_security_group_egress_rule" "control_plane_to_cognito" {
  security_group_id = module.control_plane.service_security_group_id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  description       = "Allow HTTPS to Cognito Managed Login APIs through NAT"
}

data "aws_ec2_managed_prefix_list" "s3" {
  name = "com.amazonaws.${var.aws_region}.s3"
}

data "aws_ec2_managed_prefix_list" "dynamodb" {
  name = "com.amazonaws.${var.aws_region}.dynamodb"
}

resource "aws_vpc_security_group_egress_rule" "control_plane_to_s3_gateway" {
  security_group_id = module.control_plane.service_security_group_id
  prefix_list_id    = data.aws_ec2_managed_prefix_list.s3.id
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  description       = "Allow HTTPS from control plane tasks to S3 gateway endpoint"
}

resource "aws_vpc_security_group_egress_rule" "control_plane_to_dynamodb_gateway" {
  security_group_id = module.control_plane.service_security_group_id
  prefix_list_id    = data.aws_ec2_managed_prefix_list.dynamodb.id
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  description       = "Allow HTTPS from control plane tasks to DynamoDB gateway endpoint"
}

resource "aws_vpc_endpoint" "gateway" {
  for_each = toset(["s3", "dynamodb"])

  vpc_id            = module.network.vpc_id
  service_name      = "com.amazonaws.${var.aws_region}.${each.value}"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [module.network.private_route_table_id]

  tags = merge(local.tags, {
    Name = "${local.name}-${each.value}-gateway"
  })
}

resource "aws_vpc_endpoint" "interface" {
  for_each = toset([
    "ecr.api",
    "ecr.dkr",
    "logs",
    "secretsmanager",
    "kms"
  ])

  vpc_id              = module.network.vpc_id
  service_name        = "com.amazonaws.${var.aws_region}.${each.value}"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.network.private_subnet_ids
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = merge(local.tags, {
    Name = "${local.name}-${replace(each.value, ".", "-")}-endpoint"
  })
}

resource "aws_flow_log" "vpc" {
  log_destination      = "arn:aws:s3:::${module.data_plane.audit_logs_bucket_name}/vpc-flow-logs/"
  log_destination_type = "s3"
  traffic_type         = "ALL"
  vpc_id               = module.network.vpc_id

  tags = local.tags
}

module "observability" {
  source = "../../modules/observability"

  name                 = local.name
  alarm_email          = var.alarm_email
  ecs_cluster_name     = module.control_plane.cluster_name
  ecs_service_name     = module.control_plane.service_name
  alb_arn_suffix       = module.control_plane.alb_arn_suffix
  target_group_suffix  = module.control_plane.target_group_arn_suffix
  cloudfront_id        = module.edge.cloudfront_distribution_id
  waf_web_acl_name     = module.edge.waf_web_acl_name
  waf_web_acl_scope    = "CloudFront"
  dashboard_region     = var.aws_region
  platform_kms_key_arn = module.data_plane.kms_key_arn
}
