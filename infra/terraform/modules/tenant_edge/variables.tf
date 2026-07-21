variable "name" {
  description = "Name prefix."
  type        = string
}

variable "tenant_id" {
  description = "Tenant identifier."
  type        = string
}

variable "customer_domain" {
  description = "Customer domain to protect."
  type        = string
}

variable "origin_domain" {
  description = "Customer origin domain."
  type        = string
}

variable "customer_hosted_zone_id" {
  description = "Route 53 hosted zone ID when FortressNet manages DNS validation and cutover."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "Existing us-east-1 ACM certificate ARN. Required when customer_hosted_zone_id is not provided."
  type        = string
  default     = ""
}

variable "create_customer_alias_record" {
  description = "Whether to create A/AAAA alias records in the customer hosted zone."
  type        = bool
  default     = false
}

variable "waf_rate_limit" {
  description = "Tenant IP rate limit over a five-minute window."
  type        = number
  default     = 2000
}

variable "price_class" {
  description = "CloudFront price class."
  type        = string
  default     = "PriceClass_100"
}
