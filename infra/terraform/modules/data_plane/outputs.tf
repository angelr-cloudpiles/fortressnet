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
