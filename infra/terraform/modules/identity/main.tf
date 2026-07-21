resource "aws_cognito_user_pool" "this" {
  name = "${var.name}-users"

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
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.name}-web"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret = false

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["email", "openid", "profile"]
  callback_urls                        = ["${var.domain_url}/auth/callback"]
  logout_urls                          = ["${var.domain_url}/logout"]
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
  name         = "platform_admins"
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

resource "aws_cognito_user_group" "security_analysts" {
  name         = "security_analysts"
  user_pool_id = aws_cognito_user_pool.this.id
  description  = "Tenant security analysts"
  precedence   = 30
}
