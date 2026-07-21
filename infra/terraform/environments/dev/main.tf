module "network" {
  source = "../../modules/network"

  name               = local.name
  vpc_cidr           = "10.42.0.0/16"
  availability_zones = ["${var.aws_region}a", "${var.aws_region}b"]
  public_subnets     = ["10.42.0.0/24", "10.42.1.0/24"]
  private_subnets    = ["10.42.10.0/24", "10.42.11.0/24"]
  enable_nat_gateway = var.enable_nat_gateway
}

module "data_plane" {
  source = "../../modules/data_plane"

  name                    = local.name
  database_name           = var.database_name
  database_username       = var.database_username
  database_instance_class = var.database_instance_class
  vpc_id                  = module.network.vpc_id
  private_subnet_ids      = module.network.private_subnet_ids
}

module "identity" {
  source = "../../modules/identity"

  name       = local.name
  app_fqdn   = local.app_fqdn
  domain_url = "https://${local.app_fqdn}"
}

module "control_plane" {
  source = "../../modules/control_plane"

  name                       = local.name
  vpc_id                     = module.network.vpc_id
  public_subnet_ids          = module.network.public_subnet_ids
  private_subnet_ids         = module.network.private_subnet_ids
  app_image                  = var.app_image
  container_port             = var.app_container_port
  desired_count              = var.desired_count
  database_secret_arn        = module.data_plane.database_secret_arn
  database_secret_version    = module.data_plane.database_secret_version_id
  database_host              = module.data_plane.database_address
  database_port              = module.data_plane.database_port
  database_security_group_id = module.data_plane.database_security_group_id
  platform_config_secret     = module.data_plane.platform_config_secret_arn
  platform_kms_key_arn       = module.data_plane.kms_key_arn
  log_bucket_name            = module.data_plane.audit_logs_bucket_name
  tenants_table_name         = module.data_plane.tenants_table_name
  domains_table_name         = module.data_plane.domains_table_name
  entitlements_table_name    = module.data_plane.entitlements_table_name
  cognito_user_pool_id       = module.identity.user_pool_id
  cognito_app_client_id      = module.identity.app_client_id

  depends_on = [module.data_plane]
}

module "edge" {
  source = "../../modules/edge"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  name                    = local.name
  app_fqdn                = local.app_fqdn
  hosted_zone_name        = var.hosted_zone_name
  origin_domain           = module.control_plane.alb_dns_name
  origin_protocol         = "http-only"
  waf_rate_limit          = var.waf_rate_limit
  logs_bucket_name        = module.data_plane.edge_logs_bucket_name
  logs_bucket_domain_name = module.data_plane.edge_logs_bucket_domain_name
  price_class             = "PriceClass_100"

  depends_on = [module.data_plane]
}

module "observability" {
  source = "../../modules/observability"

  name                = local.name
  alarm_email         = var.alarm_email
  ecs_cluster_name    = module.control_plane.cluster_name
  ecs_service_name    = module.control_plane.service_name
  alb_arn_suffix      = module.control_plane.alb_arn_suffix
  target_group_suffix = module.control_plane.target_group_arn_suffix
  cloudfront_id       = module.edge.cloudfront_distribution_id
  waf_web_acl_name    = module.edge.waf_web_acl_name
  waf_web_acl_scope   = "CloudFront"
  dashboard_region    = var.aws_region
}
