output "kms_key_arn" {
  description = "Platform KMS key ARN."
  value       = aws_kms_key.platform.arn
}

output "database_endpoint" {
  description = "RDS endpoint."
  value       = aws_db_instance.this.endpoint
}

output "database_address" {
  description = "RDS hostname."
  value       = aws_db_instance.this.address
}

output "database_port" {
  description = "RDS port."
  value       = aws_db_instance.this.port
}

output "database_security_group_id" {
  description = "RDS security group ID."
  value       = aws_security_group.database.id
}

output "database_secret_arn" {
  description = "Database secret ARN."
  value       = aws_secretsmanager_secret.database.arn
}

output "database_secret_version_id" {
  description = "Database secret version ID."
  value       = aws_secretsmanager_secret_version.database.version_id
}

output "platform_config_secret_arn" {
  description = "Platform config secret ARN."
  value       = aws_secretsmanager_secret.platform_config.arn
}

output "tenants_table_name" {
  description = "Tenants table name."
  value       = aws_dynamodb_table.tenants.name
}

output "domains_table_name" {
  description = "Domains table name."
  value       = aws_dynamodb_table.domains.name
}

output "entitlements_table_name" {
  description = "Entitlements table name."
  value       = aws_dynamodb_table.entitlements.name
}

output "security_policies_table_name" {
  description = "Security policies table name."
  value       = aws_dynamodb_table.security_policies.name
}

output "users_table_name" {
  description = "Users table name."
  value       = aws_dynamodb_table.users.name
}

output "api_keys_table_name" {
  description = "API keys table name."
  value       = aws_dynamodb_table.api_keys.name
}

output "idp_connections_table_name" {
  description = "Identity provider connections table name."
  value       = aws_dynamodb_table.idp_connections.name
}

output "profiles_table_name" {
  description = "Profiles table name."
  value       = aws_dynamodb_table.profiles.name
}

output "origins_table_name" {
  description = "Origins table name."
  value       = aws_dynamodb_table.origins.name
}

output "origin_health_events_table_name" {
  description = "Origin health event history table name."
  value       = aws_dynamodb_table.origin_health_events.name
}

output "operation_locks_table_name" {
  description = "Distributed operation lock table name."
  value       = aws_dynamodb_table.operation_locks.name
}

output "origin_pools_table_name" {
  description = "Origin pools table name."
  value       = aws_dynamodb_table.origin_pools.name
}

output "certificates_table_name" {
  description = "Certificates table name."
  value       = aws_dynamodb_table.certificates.name
}

output "waf_change_sets_table_name" {
  description = "WAF change sets table name."
  value       = aws_dynamodb_table.waf_change_sets.name
}

output "edge_deployments_table_name" {
  description = "Tenant edge deployment table name."
  value       = aws_dynamodb_table.edge_deployments.name
}

output "approvals_table_name" {
  description = "Approval workflow table name."
  value       = aws_dynamodb_table.approvals.name
}

output "dns_zones_table_name" {
  description = "Managed DNS zones table name."
  value       = aws_dynamodb_table.dns_zones.name
}

output "dns_records_table_name" {
  description = "Managed DNS records table name."
  value       = aws_dynamodb_table.dns_records.name
}

output "ai_findings_table_name" {
  description = "AI analyst findings table name."
  value       = aws_dynamodb_table.ai_findings.name
}

output "ztna_applications_table_name" {
  description = "Zero Trust private application catalog table name."
  value       = aws_dynamodb_table.ztna_applications.name
}

output "audit_logs_bucket_name" {
  description = "Audit logs bucket name."
  value       = aws_s3_bucket.this["audit_logs"].bucket

  depends_on = [
    aws_s3_bucket_policy.audit_logs,
    aws_s3_bucket_server_side_encryption_configuration.audit_logs
  ]
}

output "edge_logs_bucket_name" {
  description = "Edge logs bucket name."
  value       = aws_s3_bucket.this["edge_logs"].bucket
}

output "edge_logs_bucket_domain_name" {
  description = "Edge logs bucket domain name for CloudFront logging."
  value       = aws_s3_bucket.this["edge_logs"].bucket_domain_name

  depends_on = [
    aws_s3_bucket_acl.edge_logs,
    aws_s3_bucket_policy.edge_logs,
    aws_s3_bucket_server_side_encryption_configuration.kms
  ]
}

output "reports_bucket_name" {
  description = "Reports bucket name."
  value       = aws_s3_bucket.this["reports"].bucket
}

output "ai_events_bucket_name" {
  description = "AI events bucket name."
  value       = aws_s3_bucket.this["ai_events"].bucket
}
