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

`backend.tf.example` shows an S3 backend template. Create the backend bucket and lock table first, then copy it to `backend.tf`.
