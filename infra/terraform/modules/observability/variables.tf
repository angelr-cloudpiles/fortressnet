variable "name" {
  description = "Name prefix."
  type        = string
}

variable "alarm_email" {
  description = "Optional email subscription for alarms."
  type        = string
  default     = ""
}

variable "ecs_cluster_name" {
  description = "ECS cluster name."
  type        = string
}

variable "ecs_service_name" {
  description = "ECS service name."
  type        = string
}

variable "alb_arn_suffix" {
  description = "ALB ARN suffix."
  type        = string
}

variable "target_group_suffix" {
  description = "Target group ARN suffix."
  type        = string
}

variable "cloudfront_id" {
  description = "CloudFront distribution ID."
  type        = string
}

variable "waf_web_acl_name" {
  description = "WAF Web ACL name."
  type        = string
}

variable "waf_web_acl_scope" {
  description = "WAF Web ACL scope for metrics."
  type        = string
}

variable "dashboard_region" {
  description = "Region shown in the CloudWatch dashboard widgets."
  type        = string
}

variable "platform_kms_key_arn" {
  description = "Platform KMS key ARN used to encrypt alert topics."
  type        = string
}

variable "audit_logs_bucket_name" {
  description = "S3 bucket containing immutable control-plane audit events."
  type        = string
}

variable "reports_bucket_name" {
  description = "S3 bucket used for Athena query results and generated reports."
  type        = string
}
