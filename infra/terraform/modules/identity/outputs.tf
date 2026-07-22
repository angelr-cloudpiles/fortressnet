output "user_pool_id" {
  description = "Cognito user pool ID."
  value       = aws_cognito_user_pool.this.id
}

output "user_pool_arn" {
  description = "Cognito user pool ARN."
  value       = aws_cognito_user_pool.this.arn
}

output "app_client_id" {
  description = "Cognito app client ID."
  value       = aws_cognito_user_pool_client.web.id
}

output "hosted_ui_domain" {
  description = "Cognito hosted UI domain."
  value       = aws_cognito_user_pool_domain.this.domain
}

output "hosted_ui_url" {
  description = "Cognito hosted UI base URL."
  value       = "https://${aws_cognito_user_pool_domain.this.domain}.auth.${data.aws_region.current.region}.amazoncognito.com"
}
