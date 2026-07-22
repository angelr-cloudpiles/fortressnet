locals {
  name = "${var.project}-${var.environment}"

  app_fqdn = "${var.app_subdomain}.${var.domain_name}"

  origin_fqdn = "origin.${var.domain_name}"

  origin_verify_header_name = "x-fortressnet-origin-verify"

  tags = merge(
    {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
      Repository  = "angelr-cloudpiles/fortressnet"
    },
    var.tags
  )
}
