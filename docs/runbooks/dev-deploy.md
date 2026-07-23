# Dev Deploy Runbook

## 1. Configure AWS Credentials

```bash
aws sts get-caller-identity
```

Confirm the account and region before running Terraform.

The `dev` provider and remote state are pinned to the `fortressnet` AWS CLI profile. Confirm it resolves to account `422128689549` before proceeding.

## 2. Configure Variables

```bash
cd infra/terraform/environments/dev
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` for the target account.

## 3. Initialize Terraform

```bash
terraform init
```

## 4. Validate

```bash
terraform fmt -recursive
terraform validate
```

## 5. Plan

```bash
terraform plan -out fortressnet-dev.tfplan
```

## 6. Apply

```bash
terraform apply fortressnet-dev.tfplan
```

## 7. Smoke Test

Use the `app_url` output to verify CloudFront and the control plane entrypoint.

```bash
terraform output app_url
```
