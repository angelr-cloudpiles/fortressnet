data "aws_caller_identity" "current" {}

data "aws_canonical_user_id" "current" {}

data "aws_region" "current" {}

data "aws_iam_policy_document" "platform_key" {
  statement {
    sid = "EnableAccountAdministration"

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }

    actions   = ["kms:*"]
    resources = ["*"]
  }

  statement {
    sid = "AllowCloudFrontLogDelivery"

    principals {
      type        = "Service"
      identifiers = ["delivery.logs.amazonaws.com"]
    }

    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey*"
    ]

    resources = ["*"]
  }

  statement {
    sid = "AllowRegionalServiceEncryption"

    principals {
      type = "Service"
      identifiers = [
        "logs.${data.aws_region.current.region}.amazonaws.com",
        "sns.amazonaws.com"
      ]
    }

    actions = [
      "kms:Decrypt",
      "kms:DescribeKey",
      "kms:Encrypt",
      "kms:GenerateDataKey*",
      "kms:ReEncrypt*"
    ]

    resources = ["*"]
  }
}

data "aws_iam_policy_document" "audit_logs_bucket" {
  statement {
    sid = "AllowAlbLogDeliveryWrite"

    principals {
      type        = "Service"
      identifiers = ["logdelivery.elasticloadbalancing.amazonaws.com"]
    }

    actions = ["s3:PutObject"]
    resources = [
      "${aws_s3_bucket.this["audit_logs"].arn}/alb/AWSLogs/${data.aws_caller_identity.current.account_id}/*"
    ]
  }

  statement {
    sid = "AllowVpcFlowLogDeliveryAclCheck"

    principals {
      type        = "Service"
      identifiers = ["delivery.logs.amazonaws.com"]
    }

    actions   = ["s3:GetBucketAcl"]
    resources = [aws_s3_bucket.this["audit_logs"].arn]
  }

  statement {
    sid = "AllowVpcFlowLogDeliveryWrite"

    principals {
      type        = "Service"
      identifiers = ["delivery.logs.amazonaws.com"]
    }

    actions = ["s3:PutObject"]
    resources = [
      "${aws_s3_bucket.this["audit_logs"].arn}/vpc-flow-logs/AWSLogs/${data.aws_caller_identity.current.account_id}/*"
    ]

    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }
  }
}

data "aws_iam_policy_document" "edge_logs_bucket" {
  statement {
    sid = "AllowCloudFrontLogDeliveryAclCheck"

    principals {
      type        = "Service"
      identifiers = ["delivery.logs.amazonaws.com"]
    }

    actions   = ["s3:GetBucketAcl"]
    resources = [aws_s3_bucket.this["edge_logs"].arn]
  }

  statement {
    sid = "AllowCloudFrontLogDeliveryWrite"

    principals {
      type        = "Service"
      identifiers = ["delivery.logs.amazonaws.com"]
    }

    actions = ["s3:PutObject"]
    resources = [
      "${aws_s3_bucket.this["edge_logs"].arn}/cloudfront/*"
    ]

    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }
  }
}

locals {
  bucket_suffix = lower(data.aws_caller_identity.current.account_id)

  buckets = {
    audit_logs = "${var.name}-audit-logs-${local.bucket_suffix}"
    edge_logs  = "${var.name}-edge-logs-${local.bucket_suffix}"
    reports    = "${var.name}-reports-${local.bucket_suffix}"
    ai_events  = "${var.name}-ai-events-${local.bucket_suffix}"
  }

}

resource "aws_kms_key" "platform" {
  description             = "FortressNet ${var.name} platform encryption key"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  policy                  = data.aws_iam_policy_document.platform_key.json
}

resource "aws_kms_alias" "platform" {
  name          = "alias/${var.name}-platform"
  target_key_id = aws_kms_key.platform.key_id
}

resource "random_password" "database" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "random_password" "management_bootstrap_token" {
  length  = 40
  special = false
}

resource "random_id" "final_snapshot" {
  byte_length = 4

  keepers = {
    db_identifier = "${var.name}-postgres"
  }
}

resource "aws_secretsmanager_secret" "database" {
  name                    = "${var.name}/database"
  kms_key_id              = aws_kms_key.platform.arn
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "database" {
  secret_id = aws_secretsmanager_secret.database.id

  secret_string = jsonencode({
    username = var.database_username
    password = random_password.database.result
    database = var.database_name
  })
}

resource "aws_secretsmanager_secret" "platform_config" {
  name                    = "${var.name}/platform-config"
  kms_key_id              = aws_kms_key.platform.arn
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "platform_config" {
  secret_id = aws_secretsmanager_secret.platform_config.id

  secret_string = jsonencode({
    ai_analyst_mode            = "read_only"
    billing_mode               = "saas"
    management_bootstrap_token = random_password.management_bootstrap_token.result
    shield_advanced            = false
  })
}

resource "aws_security_group" "database" {
  name        = "${var.name}-database"
  description = "PostgreSQL access for FortressNet control plane"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "database_from_cidr" {
  for_each = toset(var.allowed_cidr_blocks)

  security_group_id = aws_security_group.database.id
  cidr_ipv4         = each.value
  from_port         = 5432
  to_port           = 5432
  ip_protocol       = "tcp"
  description       = "Allow PostgreSQL from approved CIDR ${each.value}"
}

resource "aws_vpc_security_group_ingress_rule" "database_from_security_group" {
  for_each = toset(var.app_security_group_ids)

  security_group_id            = aws_security_group.database.id
  referenced_security_group_id = each.value
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
  description                  = "Allow PostgreSQL from approved application security group"
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.name}-db"
  subnet_ids = var.private_subnet_ids
}

resource "aws_iam_role" "rds_enhanced_monitoring" {
  name = "${var.name}-rds-enhanced-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "rds_enhanced_monitoring" {
  role       = aws_iam_role.rds_enhanced_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

resource "aws_db_instance" "this" {
  identifier                          = "${var.name}-postgres"
  engine                              = "postgres"
  engine_version                      = "17"
  instance_class                      = var.database_instance_class
  allocated_storage                   = 20
  max_allocated_storage               = 100
  db_name                             = var.database_name
  username                            = var.database_username
  password                            = random_password.database.result
  db_subnet_group_name                = aws_db_subnet_group.this.name
  vpc_security_group_ids              = [aws_security_group.database.id]
  storage_encrypted                   = true
  kms_key_id                          = aws_kms_key.platform.arn
  publicly_accessible                 = false
  multi_az                            = var.database_multi_az
  iam_database_authentication_enabled = true
  apply_immediately                   = true
  skip_final_snapshot                 = var.database_skip_final_snapshot
  final_snapshot_identifier           = var.database_skip_final_snapshot ? null : "${var.name}-postgres-final-${random_id.final_snapshot.hex}"
  deletion_protection                 = var.database_deletion_protection
  backup_retention_period             = 7
  copy_tags_to_snapshot               = true
  auto_minor_version_upgrade          = true
  enabled_cloudwatch_logs_exports = [
    "postgresql",
    "upgrade"
  ]
  monitoring_interval             = 60
  monitoring_role_arn             = aws_iam_role.rds_enhanced_monitoring.arn
  performance_insights_enabled    = true
  performance_insights_kms_key_id = aws_kms_key.platform.arn
}

resource "aws_dynamodb_table" "tenants" {
  name         = "${var.name}-tenants"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "tenant_id"

  attribute {
    name = "tenant_id"
    type = "S"
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.platform.arn
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "domains" {
  name         = "${var.name}-domains"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "domain_id"

  attribute {
    name = "domain_id"
    type = "S"
  }

  attribute {
    name = "tenant_id"
    type = "S"
  }

  global_secondary_index {
    name            = "tenant_id-index"
    projection_type = "ALL"

    key_schema {
      attribute_name = "tenant_id"
      key_type       = "HASH"
    }
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.platform.arn
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "entitlements" {
  name         = "${var.name}-entitlements"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "customer_identifier"

  attribute {
    name = "customer_identifier"
    type = "S"
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.platform.arn
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "security_policies" {
  name         = "${var.name}-security-policies"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "policy_id"

  attribute {
    name = "policy_id"
    type = "S"
  }

  attribute {
    name = "tenant_id"
    type = "S"
  }

  global_secondary_index {
    name            = "tenant_id-index"
    projection_type = "ALL"

    key_schema {
      attribute_name = "tenant_id"
      key_type       = "HASH"
    }
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.platform.arn
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "users" {
  name         = "${var.name}-users"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "tenant_id"
    type = "S"
  }

  attribute {
    name = "email"
    type = "S"
  }

  global_secondary_index {
    name            = "tenant_id-index"
    projection_type = "ALL"

    key_schema {
      attribute_name = "tenant_id"
      key_type       = "HASH"
    }
  }

  global_secondary_index {
    name            = "email-index"
    projection_type = "ALL"

    key_schema {
      attribute_name = "email"
      key_type       = "HASH"
    }
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.platform.arn
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "api_keys" {
  name         = "${var.name}-api-keys"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "key_id"

  attribute {
    name = "key_id"
    type = "S"
  }

  attribute {
    name = "tenant_id"
    type = "S"
  }

  global_secondary_index {
    name            = "tenant_id-index"
    projection_type = "ALL"

    key_schema {
      attribute_name = "tenant_id"
      key_type       = "HASH"
    }
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.platform.arn
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "idp_connections" {
  name         = "${var.name}-idp-connections"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "idp_id"

  attribute {
    name = "idp_id"
    type = "S"
  }

  attribute {
    name = "tenant_id"
    type = "S"
  }

  global_secondary_index {
    name            = "tenant_id-index"
    projection_type = "ALL"

    key_schema {
      attribute_name = "tenant_id"
      key_type       = "HASH"
    }
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.platform.arn
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "profiles" {
  name         = "${var.name}-profiles"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "profile_id"

  attribute {
    name = "profile_id"
    type = "S"
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.platform.arn
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "origins" {
  name         = "${var.name}-origins"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "origin_id"

  attribute {
    name = "origin_id"
    type = "S"
  }

  attribute {
    name = "tenant_id"
    type = "S"
  }

  attribute {
    name = "domain_id"
    type = "S"
  }

  global_secondary_index {
    name            = "tenant_id-index"
    projection_type = "ALL"

    key_schema {
      attribute_name = "tenant_id"
      key_type       = "HASH"
    }
  }

  global_secondary_index {
    name            = "domain_id-index"
    projection_type = "ALL"

    key_schema {
      attribute_name = "domain_id"
      key_type       = "HASH"
    }
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.platform.arn
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "origin_health_events" {
  name         = "${var.name}-origin-health-events"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "health_event_id"

  attribute {
    name = "health_event_id"
    type = "S"
  }

  attribute {
    name = "tenant_id"
    type = "S"
  }

  attribute {
    name = "origin_id"
    type = "S"
  }

  global_secondary_index {
    name            = "tenant_id-index"
    projection_type = "ALL"

    key_schema {
      attribute_name = "tenant_id"
      key_type       = "HASH"
    }
  }

  global_secondary_index {
    name            = "origin_id-index"
    projection_type = "ALL"

    key_schema {
      attribute_name = "origin_id"
      key_type       = "HASH"
    }
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.platform.arn
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "operation_locks" {
  name         = "${var.name}-operation-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "lock_id"

  attribute {
    name = "lock_id"
    type = "S"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.platform.arn
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "origin_pools" {
  name         = "${var.name}-origin-pools"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pool_id"

  attribute {
    name = "pool_id"
    type = "S"
  }

  attribute {
    name = "tenant_id"
    type = "S"
  }

  attribute {
    name = "domain_id"
    type = "S"
  }

  global_secondary_index {
    name            = "tenant_id-index"
    projection_type = "ALL"

    key_schema {
      attribute_name = "tenant_id"
      key_type       = "HASH"
    }
  }

  global_secondary_index {
    name            = "domain_id-index"
    projection_type = "ALL"

    key_schema {
      attribute_name = "domain_id"
      key_type       = "HASH"
    }
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.platform.arn
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "certificates" {
  name         = "${var.name}-certificates"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "certificate_id"

  attribute {
    name = "certificate_id"
    type = "S"
  }

  attribute {
    name = "tenant_id"
    type = "S"
  }

  attribute {
    name = "domain_id"
    type = "S"
  }

  global_secondary_index {
    name            = "tenant_id-index"
    projection_type = "ALL"

    key_schema {
      attribute_name = "tenant_id"
      key_type       = "HASH"
    }
  }

  global_secondary_index {
    name            = "domain_id-index"
    projection_type = "ALL"

    key_schema {
      attribute_name = "domain_id"
      key_type       = "HASH"
    }
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.platform.arn
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "waf_change_sets" {
  name         = "${var.name}-waf-change-sets"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "change_set_id"

  attribute {
    name = "change_set_id"
    type = "S"
  }

  attribute {
    name = "tenant_id"
    type = "S"
  }

  attribute {
    name = "policy_id"
    type = "S"
  }

  global_secondary_index {
    name            = "tenant_id-index"
    projection_type = "ALL"

    key_schema {
      attribute_name = "tenant_id"
      key_type       = "HASH"
    }
  }

  global_secondary_index {
    name            = "policy_id-index"
    projection_type = "ALL"

    key_schema {
      attribute_name = "policy_id"
      key_type       = "HASH"
    }
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.platform.arn
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "edge_deployments" {
  name         = "${var.name}-edge-deployments"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "deployment_id"

  attribute {
    name = "deployment_id"
    type = "S"
  }

  attribute {
    name = "tenant_id"
    type = "S"
  }

  attribute {
    name = "domain_id"
    type = "S"
  }

  global_secondary_index {
    name            = "tenant_id-index"
    projection_type = "ALL"

    key_schema {
      attribute_name = "tenant_id"
      key_type       = "HASH"
    }
  }

  global_secondary_index {
    name            = "domain_id-index"
    projection_type = "ALL"

    key_schema {
      attribute_name = "domain_id"
      key_type       = "HASH"
    }
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.platform.arn
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "approvals" {
  name         = "${var.name}-approvals"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "approval_id"

  attribute {
    name = "approval_id"
    type = "S"
  }

  attribute {
    name = "tenant_id"
    type = "S"
  }

  global_secondary_index {
    name            = "tenant_id-index"
    projection_type = "ALL"

    key_schema {
      attribute_name = "tenant_id"
      key_type       = "HASH"
    }
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.platform.arn
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "dns_zones" {
  name         = "${var.name}-dns-zones"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "zone_id"

  attribute {
    name = "zone_id"
    type = "S"
  }

  attribute {
    name = "tenant_id"
    type = "S"
  }

  global_secondary_index {
    name            = "tenant_id-index"
    projection_type = "ALL"

    key_schema {
      attribute_name = "tenant_id"
      key_type       = "HASH"
    }
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.platform.arn
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "dns_records" {
  name         = "${var.name}-dns-records"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "record_id"

  attribute {
    name = "record_id"
    type = "S"
  }

  attribute {
    name = "tenant_id"
    type = "S"
  }

  attribute {
    name = "zone_id"
    type = "S"
  }

  global_secondary_index {
    name            = "tenant_id-index"
    projection_type = "ALL"

    key_schema {
      attribute_name = "tenant_id"
      key_type       = "HASH"
    }
  }

  global_secondary_index {
    name            = "zone_id-index"
    projection_type = "ALL"

    key_schema {
      attribute_name = "zone_id"
      key_type       = "HASH"
    }
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.platform.arn
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "ai_findings" {
  name         = "${var.name}-ai-findings"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "finding_id"

  attribute {
    name = "finding_id"
    type = "S"
  }

  attribute {
    name = "tenant_id"
    type = "S"
  }

  global_secondary_index {
    name            = "tenant_id-index"
    projection_type = "ALL"

    key_schema {
      attribute_name = "tenant_id"
      key_type       = "HASH"
    }
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.platform.arn
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_s3_bucket" "this" {
  for_each = local.buckets

  bucket        = each.value
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "this" {
  for_each = aws_s3_bucket.this

  bucket                  = each.value.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "edge_logs" {
  bucket = aws_s3_bucket.this["edge_logs"].id

  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_acl" "edge_logs" {
  bucket = aws_s3_bucket.this["edge_logs"].id

  access_control_policy {
    owner {
      id = data.aws_canonical_user_id.current.id
    }

    grant {
      grantee {
        id   = data.aws_canonical_user_id.current.id
        type = "CanonicalUser"
      }
      permission = "FULL_CONTROL"
    }

    grant {
      grantee {
        id   = "c4c1ede66af53448b93c283ce9448c4ba468c9432aa01d700d3878632f77d2d0"
        type = "CanonicalUser"
      }
      permission = "FULL_CONTROL"
    }
  }

  depends_on = [
    aws_s3_bucket_ownership_controls.edge_logs,
    aws_s3_bucket_public_access_block.this
  ]
}

resource "aws_s3_bucket_server_side_encryption_configuration" "kms" {
  for_each = {
    for key, bucket in aws_s3_bucket.this : key => bucket
    if key != "audit_logs"
  }

  bucket = each.value.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.platform.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "audit_logs" {
  bucket = aws_s3_bucket.this["audit_logs"].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "this" {
  for_each = aws_s3_bucket.this

  bucket = each.value.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_policy" "audit_logs" {
  bucket = aws_s3_bucket.this["audit_logs"].id
  policy = data.aws_iam_policy_document.audit_logs_bucket.json
}

resource "aws_s3_bucket_policy" "edge_logs" {
  bucket = aws_s3_bucket.this["edge_logs"].id
  policy = data.aws_iam_policy_document.edge_logs_bucket.json
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  for_each = aws_s3_bucket.this

  bucket = each.value.id

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}
