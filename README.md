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
- DynamoDB tables for tenants, domains, entitlements, policy metadata, approval records, and tenant-edge deployments.
- S3 buckets for audit logs, reports, edge logs, and AI analyst event input.
- KMS key for platform encryption.
- CloudWatch log groups, dashboard, alarms, and SNS alert topic.
- Reusable `tenant_edge` module for early customer site onboarding or dedicated edge stacks.

AWS Shield Advanced is intentionally not included yet.

## Repository Layout

```text
app/
  control-plane/       # Vite/React FortressNet SaaS console packaged for ECS
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

## Product Action Plan

The full Cloudflare-parity execution backlog is documented in
[`docs/architecture/cloudflare-parity-action-plan.md`](docs/architecture/cloudflare-parity-action-plan.md).

It covers the implementation plan for WAF, DDoS, SSL/TLS, API Shield, Client-side
Security, DNS, DMARC Management, Load Balancing, AI analysis, and SASE/ZTNA.

## Prerequisites

- Terraform `>= 1.7`
- AWS CLI configured with credentials for the target account
- A Route 53 hosted zone for `fortressnet.app`
- An application container image in ECR or another reachable registry

The dev environment creates an ECR repository for the FortressNet control-plane image.

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
- `app_image_tag`
- `alarm_email`

## SaaS Tenancy Model

The Terraform baseline creates shared platform infrastructure. Customer tenants are logical tenants in the control plane:

- tenant identity and metadata in DynamoDB/PostgreSQL
- user authentication in Cognito
- domain ownership verification through DNS TXT records
- policy state stored per tenant/domain
- edge provisioning triggered by the control plane
- logs partitioned by tenant and written to S3

For MVP and pilot customers, the included `tenant_edge` module can be used to provision a tenant-specific CloudFront/WAF edge stack from Terraform. The control plane now provides the equivalent managed workflow: an issued ACM certificate and validated origin are required, the request needs approval by a different tenant operator, then it creates the CloudFront distribution, a tenant WAF ACL, encrypted WAF logs, and the cutover target. No tenant edge is created from sample data.

The current traffic cutover verifier accepts a direct CNAME. Apex domains require an ALIAS/ANAME-capable DNS provider or a managed Route 53 zone; that workflow remains a product extension rather than an unsafe implicit fallback.

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
- Tenant-edge WAF changes use approval, explicit domain selection, apply, rollback, and audit records.
- Origin health checks resolve and pin a public IP, rejecting private or mixed public/private DNS answers.
- WAF event views and reports query real CloudWatch WAF log groups; empty tenants remain empty.

## Deployment Status

The `dev` environment is deployed in AWS account `422128689549` using profile `fortressnet`.

- Site URL: `https://fortressnet.app`
- App URL: `https://app.fortressnet.app`
- Region: `us-east-1`
- Control plane image: `422128689549.dkr.ecr.us-east-1.amazonaws.com/fortressnet/control-plane:secure-20260722-acm-tenant-001`
- Terraform backend: `s3://fortressnet-terraform-state-422128689549-us-east-1/fortressnet/dev/terraform.tfstate`

## Management Access

The deployed control plane includes a bootstrap-protected management API for the first operational stage. Retrieve the token from Secrets Manager and paste it in `Settings -> Management Access`:

```bash
aws secretsmanager get-secret-value \
  --profile fortressnet \
  --region us-east-1 \
  --secret-id fortressnet-dev/platform-config \
  --query SecretString \
  --output text
```

The JSON field is `management_bootstrap_token`. Treat it as a secret. Cognito is provisioned and will replace this bootstrap flow once the hosted login is wired into the frontend.

Tenant onboarding now verifies an ownership TXT record before requesting a tagged ACM certificate in `us-east-1`. The console exposes the ACM DNS validation CNAME and tracks issuance. Tenant CloudFront/WAF provisioning remains an explicit next approval workflow; no traffic cutover occurs automatically.

Application code, CI/CD pipelines, marketplace fulfillment, AI event analysis, and automated tenant edge provisioning are expected to grow as separate workstreams.
