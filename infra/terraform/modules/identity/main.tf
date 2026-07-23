data "aws_region" "current" {}

locals {
  application_domain_urls = distinct(concat([var.domain_url], var.additional_domain_urls))
}

resource "aws_cognito_user_pool" "this" {
  name = "FortressNet"

  deletion_protection = "ACTIVE"
  mfa_configuration   = "OPTIONAL"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  admin_create_user_config {
    allow_admin_create_user_only = true

    invite_message_template {
      email_subject = "FortressNet access"
      email_message = "Your FortressNet username is {username} and your temporary password is {####}."
      sms_message   = "Your FortressNet username is {username} and temporary password is {####}."
    }
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  password_policy {
    minimum_length                   = 14
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = var.temporary_password_validity_days
  }

  schema {
    name                = "tenant_id"
    attribute_data_type = "String"
    mutable             = true
    required            = false

    string_attribute_constraints {
      min_length = 1
      max_length = 64
    }
  }

  schema {
    name                = "role"
    attribute_data_type = "String"
    mutable             = true
    required            = false

    string_attribute_constraints {
      min_length = 1
      max_length = 64
    }
  }

  user_attribute_update_settings {
    attributes_require_verification_before_update = ["email"]
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
  }

  software_token_mfa_configuration {
    enabled = true
  }
}

resource "random_id" "hosted_ui_domain" {
  byte_length = 4
}

resource "aws_cognito_user_pool_domain" "this" {
  domain       = "${var.name}-${random_id.hosted_ui_domain.hex}"
  user_pool_id = aws_cognito_user_pool.this.id
}

# The Cognito Hosted UI remains the authentication authority, but it must not
# look like an unrelated AWS page when a customer is asked to authenticate.
resource "aws_cognito_user_pool_ui_customization" "fortressnet" {
  user_pool_id = aws_cognito_user_pool.this.id
  client_id    = aws_cognito_user_pool_client.web.id

  css = <<-CSS
    .background-customizable { background: #07182a !important; }
    .banner-customizable {
      min-height: 76px !important;
      padding: 22px 30px !important;
      background: #07182a url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNjAiIGhlaWdodD0iNDQiIHZpZXdCb3g9IjAgMCAyNjAgNDQiPjxyZWN0IHdpZHRoPSI0NCIgaGVpZ2h0PSI0NCIgcng9IjgiIGZpbGw9IiMxNzY5ZTAiLz48cGF0aCBkPSJNMTMgMzFWMTNoMTh2NkgyMHY0aDl2NmgtOXYyeiIgZmlsbD0id2hpdGUiLz48dGV4dCB4PSI1OCIgeT0iMjkiIGZvbnQtZmFtaWx5PSJBcmlhbCxzYW5zLXNlcmlmIiBmb250LXNpemU9IjIyIiBmb250LXdlaWdodD0iNzAwIiBsZXR0ZXItc3BhY2luZz0iMS4yIiBmaWxsPSJ3aGl0ZSI+Rk9SVFJFU1NORVQ8L3RleHQ+PC9zdmc+") no-repeat 30px center !important;
      border-bottom: 1px solid rgba(184, 204, 229, .22) !important;
      color: #ffffff !important;
      font-weight: 760 !important;
      letter-spacing: .02em !important;
    }
    .label-customizable { color: #344054 !important; font-weight: 650 !important; }
    .redirect-customizable { color: #344054 !important; font-weight: 650 !important; }
    .textDescription-customizable { color: #667085 !important; }
    .inputField-customizable {
      height: 44px !important;
      border: 1px solid #cfd8e6 !important;
      border-radius: 6px !important;
      box-shadow: none !important;
    }
    .submitButton-customizable {
      height: 44px !important;
      background: #1769e0 !important;
      border: 1px solid #1769e0 !important;
      border-radius: 6px !important;
      box-shadow: none !important;
      font-weight: 700 !important;
    }
    .errorMessage-customizable { color: #b42318 !important; }
  CSS
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.name}-web"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret = false

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["aws.cognito.signin.user.admin", "email", "openid", "profile"]
  callback_urls                        = [for url in local.application_domain_urls : "${url}/auth/callback"]
  logout_urls                          = [for url in local.application_domain_urls : "${url}/logout"]
  supported_identity_providers         = ["COGNITO"]

  explicit_auth_flows = [
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  prevent_user_existence_errors = "ENABLED"
}

resource "aws_cognito_user_group" "platform_admins" {
  name         = "platform_owners"
  user_pool_id = aws_cognito_user_pool.this.id
  description  = "FortressNet platform administrators"
  precedence   = 10
}

resource "aws_cognito_user_group" "tenant_admins" {
  name         = "tenant_admins"
  user_pool_id = aws_cognito_user_pool.this.id
  description  = "Tenant administrators"
  precedence   = 20
}

resource "aws_cognito_user_group" "security_admins" {
  name         = "security_admins"
  user_pool_id = aws_cognito_user_pool.this.id
  description  = "Tenant security administrators"
  precedence   = 30
}

resource "aws_cognito_user_group" "security_analysts" {
  name         = "security_analysts"
  user_pool_id = aws_cognito_user_pool.this.id
  description  = "Tenant security analysts"
  precedence   = 40
}

resource "aws_cognito_user_group" "billing_admins" {
  name         = "billing_admins"
  user_pool_id = aws_cognito_user_pool.this.id
  description  = "Tenant billing administrators"
  precedence   = 50
}

resource "aws_cognito_user_group" "read_only" {
  name         = "read_only"
  user_pool_id = aws_cognito_user_pool.this.id
  description  = "Tenant read-only users"
  precedence   = 60
}
