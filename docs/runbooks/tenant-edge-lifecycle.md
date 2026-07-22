# Tenant Edge Lifecycle

## Purpose

This runbook defines the production workflow for connecting one tenant domain to a FortressNet managed web edge. It intentionally creates no edge resources until the customer has completed ownership and certificate validation.

## Preconditions

- A platform operator creates the tenant and grants the tenant operator the required roles.
- A tenant operator creates a protected site with an HTTPS public origin.
- The tenant publishes the FortressNet ownership TXT record.
- FortressNet requests ACM only after TXT verification. The tenant publishes the ACM validation CNAME and the certificate reaches `ISSUED`.
- The tenant operator runs the origin health check. Resolution must contain only public addresses.

## Approval And Provisioning

1. A user with `edge:write` requests the tenant edge for the validated domain.
2. A different user with `edge:approve` approves it. A requester cannot approve their own request except for a platform actor.
3. A user with `edge:write` provisions it. The control plane creates or reuses the tenant WAF ACL, a KMS-encrypted WAF log group with 365-day retention, and the CloudFront distribution.
4. When the distribution is deployed, the console shows the CloudFront traffic target.
5. The tenant retrieves the origin verification header from the console and configures its origin to require that header before allowing production traffic.

## Traffic Cutover

1. Create a direct CNAME from the protected hostname to the displayed CloudFront target.
2. Run `Check DNS` in the console. FortressNet resolves the CNAME and compares it to the provisioned target.
3. The domain becomes `active` only after that exact match.

The current verifier is intentionally limited to direct CNAME records. Apex records must be handled by a DNS provider with ALIAS/ANAME support or a Route 53 Alias implementation, which needs a dedicated provider-aware workflow.

## WAF Changes

1. Compile a tenant policy to a change set.
2. A different authorized operator approves the change set.
3. Select the exact tenant domain in the console and apply the change.
4. Use rollback to restore the previous WAF rules if the change has an unexpected effect.

## Evidence And Incident Response

- Approval actions, provisioning, header retrieval, WAF applies, and rollbacks are written to the audit stream.
- WAF event and report endpoints return events from the tenant's CloudWatch log group and hash client IP addresses before presentation.
- Do not add simulated tenant, domain, or event records to validate the platform. Validate capabilities with platform health, IAM, Terraform, and empty-state checks until a real customer domain is authorized.
