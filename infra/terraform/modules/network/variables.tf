variable "name" {
  description = "Name prefix for network resources."
  type        = string
}

variable "vpc_cidr" {
  description = "VPC CIDR block."
  type        = string
}

variable "availability_zones" {
  description = "Availability zones to use."
  type        = list(string)
}

variable "public_subnets" {
  description = "Public subnet CIDR blocks."
  type        = list(string)
}

variable "private_subnets" {
  description = "Private subnet CIDR blocks."
  type        = list(string)
}

variable "enable_nat_gateway" {
  description = "Whether to create a single NAT Gateway."
  type        = bool
  default     = true
}
