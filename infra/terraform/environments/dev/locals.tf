locals {
  name = "${var.project}-${var.environment}"

  app_fqdn = "${var.app_subdomain}.${var.domain_name}"

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
