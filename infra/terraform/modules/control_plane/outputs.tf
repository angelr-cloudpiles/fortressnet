output "cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.this.name
}

output "service_name" {
  description = "ECS service name."
  value       = aws_ecs_service.this.name
}

output "service_security_group_id" {
  description = "ECS service security group ID."
  value       = aws_security_group.service.id
}

output "alb_dns_name" {
  description = "ALB DNS name."
  value       = aws_lb.this.dns_name
}

output "alb_zone_id" {
  description = "ALB Route 53 hosted zone ID."
  value       = aws_lb.this.zone_id
}

output "alb_arn_suffix" {
  description = "ALB ARN suffix for CloudWatch metrics."
  value       = aws_lb.this.arn_suffix
}

output "target_group_arn_suffix" {
  description = "Target group ARN suffix for CloudWatch metrics."
  value       = aws_lb_target_group.service.arn_suffix
}
