variable "name" {
  description = "Name prefix."
  type        = string
}

variable "vpc_id" {
  description = "VPC ID."
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet IDs for the ALB."
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for ECS tasks."
  type        = list(string)
}

variable "app_image" {
  description = "Control plane container image."
  type        = string
}

variable "container_port" {
  description = "Container port."
  type        = number
}

variable "desired_count" {
  description = "Desired ECS task count."
  type        = number
}

variable "database_secret_arn" {
  description = "Database secret ARN."
  type        = string
}

variable "database_secret_version" {
  description = "Database secret version ID. Used to force task definition ordering after secret material exists."
  type        = string
}

variable "database_host" {
  description = "Database hostname."
  type        = string
}

variable "database_port" {
  description = "Database port."
  type        = number
}

variable "database_security_group_id" {
  description = "Database security group ID."
  type        = string
}

variable "platform_config_secret" {
  description = "Platform config secret ARN."
  type        = string
}

variable "platform_kms_key_arn" {
  description = "Platform KMS key ARN."
  type        = string
}

variable "alb_certificate_arn" {
  description = "ACM certificate ARN for the public ALB HTTPS listener."
  type        = string
}

variable "origin_verify_header_name" {
  description = "Header name CloudFront must send for the ALB to forward origin traffic."
  type        = string
}

variable "origin_verify_header_value" {
  description = "Header value CloudFront must send for the ALB to forward origin traffic."
  type        = string
  sensitive   = true
}

variable "log_bucket_name" {
  description = "Audit log bucket name."
  type        = string
}

variable "tenants_table_name" {
  description = "Tenants table name."
  type        = string
}

variable "domains_table_name" {
  description = "Domains table name."
  type        = string
}

variable "entitlements_table_name" {
  description = "Entitlements table name."
  type        = string
}

variable "security_policies_table_name" {
  description = "Security policies table name."
  type        = string
}

variable "users_table_name" {
  description = "Users table name."
  type        = string
}

variable "api_keys_table_name" {
  description = "API keys table name."
  type        = string
}

variable "idp_connections_table_name" {
  description = "Identity provider connections table name."
  type        = string
}

variable "profiles_table_name" {
  description = "Profiles table name."
  type        = string
}

variable "cognito_user_pool_id" {
  description = "Cognito user pool ID."
  type        = string
}

variable "cognito_app_client_id" {
  description = "Cognito app client ID."
  type        = string
}

variable "cpu" {
  description = "Fargate task CPU units."
  type        = number
  default     = 512
}

variable "memory" {
  description = "Fargate task memory MiB."
  type        = number
  default     = 1024
}

variable "allow_direct_http_cidr_blocks" {
  description = "Additional CIDRs allowed to reach the ALB directly."
  type        = list(string)
  default     = []
}
