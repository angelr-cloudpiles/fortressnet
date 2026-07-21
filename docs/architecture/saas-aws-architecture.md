# FortressNet SaaS AWS Architecture

## Platform Layers

FortressNet is split into a shared SaaS control plane and one or more edge data planes.

The control plane owns:

- tenant lifecycle
- authentication and authorization
- domain onboarding
- DNS verification workflow
- security policy management
- billing and entitlements
- reporting and AI analyst workflows

The edge data plane owns:

- TLS termination
- WAF inspection
- rate limiting
- bot/risk signals
- origin routing
- request logging

## AWS Services

| Capability | AWS baseline |
| --- | --- |
| Edge delivery | CloudFront |
| WAF | AWS WAF v2 |
| DNS | Route 53 |
| Certificates | ACM in `us-east-1` for CloudFront |
| Control plane runtime | ECS Fargate |
| API ingress | Application Load Balancer |
| Relational data | RDS PostgreSQL |
| Tenant/policy metadata | DynamoDB |
| Logs and reports | S3 |
| Metrics and alarms | CloudWatch |
| Alerting | SNS |
| Encryption | KMS |
| Secrets | Secrets Manager |

## Tenant Isolation

The MVP uses logical tenancy:

- every tenant has a stable `tenant_id`
- every protected domain belongs to exactly one tenant
- policy documents are scoped by `tenant_id` and `domain_id`
- logs are partitioned by tenant in S3
- API authorization checks tenant membership before data access

Dedicated tenant edge stacks are possible through the `tenant_edge` module for higher isolation or enterprise customers.

## AI Analyst

The AI analyst should start as read-only:

- summarizes WAF and access events
- detects behavioral anomalies
- recommends policy changes
- prepares executive and technical reports

It must not apply blocking policy changes automatically in MVP. Enforcement changes should require human approval or a deterministic rule workflow.
