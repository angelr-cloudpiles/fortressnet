# Tenant Edge Lifecycle

## Purpose

This runbook defines the production workflow for connecting one tenant domain to a FortressNet managed web edge. It intentionally creates no edge resources until the customer has completed ownership and certificate validation.

## Identity Prerequisite

- Invite the tenant operator from the Access screen. FortressNet creates the Cognito user and sends the temporary password by email.
- The operator signs in through the Cognito Hosted UI from `https://fortressnet.app` or `https://app.fortressnet.app`. The callback origin must match one of the registered production URLs.
- After changing the temporary password, the operator completes MFA from `Profile -> Multi-Factor Authentication`. This generates a `FortressNet` TOTP QR through the FortressNet console and verifies it with Cognito. The API accepts the signed Cognito ID token only after matching its email and groups to the tenant user record.
- For OIDC or SAML, configure the tenant IdP before inviting users. The provider is created in Cognito, while client secrets are never stored in the FortressNet database.

## Preconditions

- A platform operator creates the tenant and grants the tenant operator the required roles.
- A tenant operator creates a protected site with an HTTPS public origin.
- The tenant publishes the FortressNet ownership TXT record.
- FortressNet requests ACM only after TXT verification. The tenant publishes the ACM validation CNAME and the certificate reaches `ISSUED`.
- The tenant operator runs the origin health check. Resolution must contain only public addresses.
- The tenant has an active entitlement. Pilot limits are enforced before any new domain, user, API key, IdP, DNS zone or policy is created.

## Origin Pool And Failover

1. Before requesting the tenant edge, add the secondary HTTPS origin from Origins > Add Origin.
2. Run a health check for the primary and secondary origins. FortressNet rejects private, mixed public/private, or unhealthy origins.
3. In Origins > Failover Configuration, select the two healthy origins in priority order and enable primary-to-secondary failover.
4. FortressNet compiles that pool to a CloudFront Origin Group when the edge is provisioned. Failover is limited to origin 5xx responses: 500, 502, 503, and 504.
5. Origin configuration becomes locked once an edge request exists. Do not claim or apply a failover change to an active distribution through this workflow; use a dedicated controlled edge update.

## Approval And Provisioning

1. A user with `edge:write` requests the tenant edge for the validated domain.
2. A different user with `edge:approve` approves it. A requester cannot approve their own request except for a platform actor.
3. A user with `edge:write` provisions it. The control plane creates or reuses the tenant WAF ACL, a KMS-encrypted WAF log group with 365-day retention, and the CloudFront distribution. A validated failover pool is compiled as a CloudFront Origin Group.
4. When the distribution is deployed, the console shows the CloudFront traffic target.
5. The tenant retrieves the origin verification header from the console and configures its origin to require that header before allowing production traffic.

## Traffic Cutover

1. Create a direct CNAME from the protected hostname to the displayed CloudFront target.
2. Run `Check DNS` in the console. FortressNet resolves the CNAME and compares it to the provisioned target.
3. The domain becomes `active` only after that exact match.

The current verifier is intentionally limited to direct CNAME records. Apex records must be handled by a DNS provider with ALIAS/ANAME support or a Route 53 Alias implementation, which needs a dedicated provider-aware workflow.

## DNS Management

1. After ownership verification, choose `External guided` or `Delegate Route 53`.
2. For Route 53 delegation, publish the returned NS records at the parent zone before adding managed records.
3. Run DNS posture to review CAA, DNSSEC, DMARC, SPF and possible origin IP exposure.
4. Do not create or modify a hosted zone for a domain that has not passed FortressNet ownership verification.

## WAF Changes

1. Start the first tenant policy in `monitor` mode. Set the IP threshold and, when required, limit it to a path prefix, HTTP methods and selected countries before compiling the change set.
2. A different authorized operator approves the change set.
3. Select the exact tenant domain in the console and apply the change.
4. Keep monitor mode applied for at least 24 hours before applying a `block` policy to the same domain.
5. Use rollback to restore the previous WAF rules if the change has an unexpected effect.

## Origin Health

- The control plane checks each registered public HTTPS origin every five minutes and records the resulting health event for 90 days.
- A failed scheduled check marks the origin unhealthy and recalculates the pool state; CloudFront origin groups retain their configured runtime failover behavior.
- Use the manual check after an origin remediation. Origin configuration for an existing edge remains immutable until the controlled active-edge update workflow is available.

## Pilot Billing And Readiness

- The Billing view is an operational entitlement view, not an invoice. It reports enforced limits and observed WAF events; no consumption is fabricated.
- A plan upgrade is a platform-owner operation until Marketplace fulfillment is integrated.
- Do not create a tenant until the customer, domain and origin are real and authorized. The first platform owner is invited through Cognito and must complete the temporary-password flow before normal console administration.

## Evidence And Incident Response

- Approval actions, provisioning, header retrieval, WAF applies, and rollbacks are written to the audit stream.
- WAF event and report endpoints return events from the tenant's CloudWatch log group and hash client IP addresses before presentation.
- The AI Analyst is explicitly read-only. It derives findings from real WAF logs and creates recommendations that still require the normal policy approval workflow.
- Do not add simulated tenant, domain, or event records to validate the platform. Validate capabilities with platform health, IAM, Terraform, and empty-state checks until a real customer domain is authorized.
