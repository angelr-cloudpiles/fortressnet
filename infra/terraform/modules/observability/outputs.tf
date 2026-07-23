output "alerts_topic_arn" {
  description = "SNS alerts topic ARN."
  value       = aws_sns_topic.alerts.arn
}

output "dashboard_name" {
  description = "CloudWatch dashboard name."
  value       = aws_cloudwatch_dashboard.platform.dashboard_name
}

output "security_lake_database_name" {
  description = "Glue database holding FortressNet security-lake catalog tables."
  value       = aws_glue_catalog_database.security_lake.name
}

output "security_lake_workgroup_name" {
  description = "Athena workgroup for historical FortressNet security reporting."
  value       = aws_athena_workgroup.security_lake.name
}
