variable "name" {
  description = "Name prefix."
  type        = string
}

variable "app_fqdn" {
  description = "Fully qualified application domain."
  type        = string
}

variable "additional_aliases" {
  description = "Additional CloudFront aliases to serve with the same edge distribution."
  type        = list(string)
  default     = []
}

variable "hosted_zone_name" {
  description = "Route 53 hosted zone name."
  type        = string
}

variable "origin_domain" {
  description = "Origin domain name."
  type        = string
}

variable "origin_protocol" {
  description = "Origin protocol policy."
  type        = string
  default     = "http-only"

  validation {
    condition     = contains(["http-only", "https-only", "match-viewer"], var.origin_protocol)
    error_message = "origin_protocol must be http-only, https-only, or match-viewer."
  }
}

variable "waf_rate_limit" {
  description = "IP rate limit over a five-minute window."
  type        = number
}

variable "logs_bucket_name" {
  description = "Edge logs bucket name."
  type        = string
}

variable "logs_bucket_domain_name" {
  description = "Edge logs bucket domain name for CloudFront standard logs."
  type        = string
}

variable "price_class" {
  description = "CloudFront price class."
  type        = string
  default     = "PriceClass_100"
}
