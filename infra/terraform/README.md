# FortressNet Terraform

This Terraform project deploys the AWS infrastructure foundation for the FortressNet SaaS platform.

## Environments

- `environments/dev`: first deployable environment for MVP validation.

## Modules

- `network`: VPC, subnets, route tables, internet gateway, optional NAT gateway.
- `data_plane`: encrypted RDS, DynamoDB metadata tables, S3 log/report buckets, Secrets Manager.
- `identity`: Cognito user pool, app client, and SaaS role groups.
- `control_plane`: ECS Fargate service, ALB, IAM roles, service logs.
- `edge`: CloudFront, WAF, ACM, and Route 53 for the FortressNet app domain.
- `observability`: CloudWatch dashboard, alarms, and SNS alerting.
- `tenant_edge`: customer-domain edge template for pilot/dedicated tenant deployments.

## Provider Notes

CloudFront certificates and WAF Web ACLs require `us-east-1`. Environments configure both the primary AWS provider and an `aws.us_east_1` alias.

## Remote State

`environments/dev/backend.tf` uses:

- bucket: `fortressnet-terraform-state-422128689549-us-east-1`
- key: `fortressnet/dev/terraform.tfstate`
- region: `us-east-1`
- profile: `fortressnet`
- native S3 lockfile support

The backend bucket must exist before `terraform init`; it is intentionally outside the main environment state.
