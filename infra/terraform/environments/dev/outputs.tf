output "app_url" {
  description = "FortressNet SaaS app URL."
  value       = "https://${local.app_fqdn}"
}

output "site_url" {
  description = "FortressNet public site URL."
  value       = "https://${var.domain_name}"
}

output "control_plane_ecr_repository_url" {
  description = "ECR repository URL for the control plane image."
  value       = aws_ecr_repository.control_plane.repository_url
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain."
  value       = module.edge.cloudfront_domain_name
}

output "alb_dns_name" {
  description = "Control plane ALB DNS name."
  value       = module.control_plane.alb_dns_name
}

output "database_secret_arn" {
  description = "Secrets Manager ARN for the database credentials."
  value       = module.data_plane.database_secret_arn
  sensitive   = true
}

output "tenant_tables" {
  description = "Tenant metadata table names."
  value = {
    tenants      = module.data_plane.tenants_table_name
    domains      = module.data_plane.domains_table_name
    entitlements = module.data_plane.entitlements_table_name
  }
}

output "identity" {
  description = "Cognito identity resources."
  value = {
    user_pool_id  = module.identity.user_pool_id
    app_client_id = module.identity.app_client_id
  }
}

output "reports_bucket_name" {
  description = "Reports bucket."
  value       = module.data_plane.reports_bucket_name
}
