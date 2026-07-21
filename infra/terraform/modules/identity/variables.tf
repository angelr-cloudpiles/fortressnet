variable "name" {
  description = "Name prefix."
  type        = string
}

variable "app_fqdn" {
  description = "Application FQDN."
  type        = string
}

variable "domain_url" {
  description = "Application HTTPS URL."
  type        = string
}

variable "temporary_password_validity_days" {
  description = "Temporary password validity period."
  type        = number
  default     = 7
}
