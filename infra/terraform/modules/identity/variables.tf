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

variable "additional_domain_urls" {
  description = "Additional production HTTPS origins allowed as OAuth callbacks and logout URLs."
  type        = list(string)
  default     = []
}

variable "temporary_password_validity_days" {
  description = "Temporary password validity period."
  type        = number
  default     = 7
}
