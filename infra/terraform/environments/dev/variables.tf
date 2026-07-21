variable "project" {
  description = "Project name used for naming resources."
  type        = string
  default     = "fortressnet"
}

variable "environment" {
  description = "Environment name."
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "Primary AWS region."
  type        = string
  default     = "us-east-1"
}

variable "domain_name" {
  description = "Base domain for the SaaS platform."
  type        = string
  default     = "fortressnet.app"
}

variable "hosted_zone_name" {
  description = "Route 53 hosted zone name for the platform domain."
  type        = string
  default     = "fortressnet.app"
}

variable "app_subdomain" {
  description = "Subdomain for the SaaS app."
  type        = string
  default     = "app"
}

variable "app_image" {
  description = "Container image for the FortressNet control plane."
  type        = string
  default     = "public.ecr.aws/nginx/nginx:stable-alpine"
}

variable "app_container_port" {
  description = "Container port exposed by the control plane."
  type        = number
  default     = 80
}

variable "desired_count" {
  description = "Desired ECS task count."
  type        = number
  default     = 2
}

variable "enable_nat_gateway" {
  description = "Whether to create a NAT Gateway for private subnet egress."
  type        = bool
  default     = true
}

variable "database_name" {
  description = "PostgreSQL database name."
  type        = string
  default     = "fortressnet"
}

variable "database_username" {
  description = "PostgreSQL master username."
  type        = string
  default     = "fortressnet_admin"
}

variable "database_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "alarm_email" {
  description = "Email endpoint for platform alarms. Leave empty to skip email subscription."
  type        = string
  default     = ""
}

variable "waf_rate_limit" {
  description = "Default IP rate limit over a five-minute window."
  type        = number
  default     = 2000
}

variable "tags" {
  description = "Additional tags."
  type        = map(string)
  default     = {}
}
