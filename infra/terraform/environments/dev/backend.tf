terraform {
  backend "s3" {
    bucket       = "fortressnet-terraform-state-422128689549-us-east-1"
    key          = "fortressnet/dev/terraform.tfstate"
    region       = "us-east-1"
    profile      = "fortressnet"
    encrypt      = true
    use_lockfile = true
  }
}
