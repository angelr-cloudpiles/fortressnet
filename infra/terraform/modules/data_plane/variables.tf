variable "name" {
  description = "Name prefix."
  type        = string
}

variable "database_name" {
  description = "PostgreSQL database name."
  type        = string
}

variable "database_username" {
  description = "PostgreSQL master username."
  type        = string
}

variable "database_instance_class" {
  description = "RDS instance class."
  type        = string
}

variable "vpc_id" {
  description = "VPC ID."
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs."
  type        = list(string)
}

variable "allowed_cidr_blocks" {
  description = "CIDR blocks allowed to reach PostgreSQL."
  type        = list(string)
  default     = []
}

variable "app_security_group_ids" {
  description = "Security groups allowed to reach PostgreSQL."
  type        = list(string)
  default     = []
}
