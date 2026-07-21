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

variable "platform_config_secret" {
  description = "Platform config secret ARN."
  type        = string
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
