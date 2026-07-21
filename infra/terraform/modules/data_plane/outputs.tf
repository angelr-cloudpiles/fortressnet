output "kms_key_arn" {
  description = "Platform KMS key ARN."
  value       = aws_kms_key.platform.arn
}

output "database_endpoint" {
  description = "RDS endpoint."
  value       = aws_db_instance.this.endpoint
}

output "database_secret_arn" {
  description = "Database secret ARN."
  value       = aws_secretsmanager_secret.database.arn
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
}

output "edge_logs_bucket_name" {
  description = "Edge logs bucket name."
  value       = aws_s3_bucket.this["edge_logs"].bucket
}

output "reports_bucket_name" {
  description = "Reports bucket name."
  value       = aws_s3_bucket.this["reports"].bucket
}

output "ai_events_bucket_name" {
  description = "AI events bucket name."
  value       = aws_s3_bucket.this["ai_events"].bucket
}
