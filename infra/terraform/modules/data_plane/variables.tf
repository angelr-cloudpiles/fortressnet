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

variable "database_deletion_protection" {
  description = "Whether to enable deletion protection on the RDS instance."
  type        = bool
  default     = true
}

variable "database_skip_final_snapshot" {
  description = "Whether to skip the final RDS snapshot on deletion."
  type        = bool
  default     = false
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
