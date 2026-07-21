# FortressNet

FortressNet is a conceptual SaaS security edge platform for protecting web applications with managed DNS onboarding, WAF policies, rate limiting, tenant isolation, observability, reporting, and AI-assisted security analysis.

This repository contains the Infrastructure as Code baseline for the SaaS control plane and edge foundation on AWS.

## What This Deploys

The Terraform project under `infra/terraform` provisions the first production-shaped AWS foundation:

- VPC with public and private subnets across availability zones.
- ECS Fargate control plane behind an Application Load Balancer.
- CloudFront distribution and AWS WAF Web ACL for the FortressNet console/API entrypoint.
- Route 53 records and ACM certificate for `app.fortressnet.app`.
- Cognito user pool, app client, and role groups for SaaS authentication.
- RDS PostgreSQL for relational control-plane data.
- DynamoDB tables for tenants, domains, entitlements, and security policy metadata.
- S3 buckets for audit logs, reports, edge logs, and AI analyst event input.
- KMS key for platform encryption.
- CloudWatch log groups, dashboard, alarms, and SNS alert topic.
- Reusable `tenant_edge` module for early customer site onboarding or dedicated edge stacks.

AWS Shield Advanced is intentionally not included yet.

## Repository Layout

```text
infra/terraform/
  environments/
    dev/                 # Deployable development environment
  modules/
    network/             # VPC, subnets, gateways, routing
    data_plane/          # RDS, DynamoDB, S3, KMS, Secrets Manager
    identity/            # Cognito user pool, app client, SaaS role groups
    control_plane/       # ECS/Fargate API service and ALB
    edge/                # CloudFront + WAF + ACM + Route 53 for FortressNet app
    observability/       # CloudWatch dashboard, alarms, SNS
    tenant_edge/         # Reusable customer-domain edge stack template
docs/
  architecture/          # Architecture notes
  runbooks/              # Operational runbooks
```

## Prerequisites

- Terraform `>= 1.7`
- AWS CLI configured with credentials for the target account
- A Route 53 hosted zone for `fortressnet.app`
- An application container image in ECR or another reachable registry

The default dev example uses a public nginx image as a placeholder. Replace it with the real FortressNet control-plane image before deploying a real environment.

## Quick Start

```bash
cd infra/terraform/environments/dev
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

Before applying, edit `terraform.tfvars` and set at least:

- `aws_region`
- `domain_name`
- `hosted_zone_name`
- `app_image`
- `alarm_email`

## SaaS Tenancy Model

The Terraform baseline creates shared platform infrastructure. Customer tenants are logical tenants in the control plane:

- tenant identity and metadata in DynamoDB/PostgreSQL
- user authentication in Cognito
- domain ownership verification through DNS TXT records
- policy state stored per tenant/domain
- edge provisioning triggered by the control plane
- logs partitioned by tenant and written to S3

For MVP and pilot customers, the included `tenant_edge` module can be used to provision a tenant-specific CloudFront/WAF edge stack from Terraform. At scale, the control plane should provision tenant edge resources through controlled workflows or internal platform automation.

## Cost Posture

This scaffold is production-shaped, not free-tier-minimal. Main cost drivers are:

- NAT Gateway
- RDS PostgreSQL
- CloudFront traffic and requests
- WAF request/rule evaluations
- ECS Fargate tasks
- CloudWatch logs and metrics
- Bedrock/AI analyst usage once implemented

For the lowest MVP cost, use `enable_nat_gateway = false` only if your services do not need outbound internet access from private subnets, or replace it with VPC endpoints and a tighter egress design.

## Security Notes

- No secrets are committed.
- Buckets use encryption, public access block, and versioning.
- RDS is private and encrypted.
- ECS task roles are scoped separately from execution roles.
- WAF managed rule groups are enabled at the edge.
- AI analyst is designed as read-only in MVP; enforcement remains deterministic.

## Deployment Status

This repo currently contains the infrastructure baseline. Application code, CI/CD pipelines, and tenant provisioning service code are expected to be added as separate workstreams.
