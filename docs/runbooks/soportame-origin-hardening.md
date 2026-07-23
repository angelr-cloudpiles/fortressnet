# SoportaMe Origin Hardening Runbook

## Objective

Remove the public origin bypass found during the `www.soporta.me` assessment, patch the exposed WordPress surface, and complete the DNS hardening that cannot be managed from the FortressNet AWS account.

The FortressNet edge now enforces HTTPS to the origin and browser security headers. That does **not** protect a request that reaches the Apache origin directly. Complete this runbook before treating the site as fully protected.

## 1. Create a dedicated origin hostname

1. Create `origin.soporta.me` in the DNS provider and point it to the web server, not to CloudFront.
2. Issue a valid TLS certificate for `origin.soporta.me`.
3. Configure Apache to serve the WordPress virtual host on that hostname.
4. In FortressNet, open **Origins**, add `https://origin.soporta.me`, validate its health path, and use the origin-update approval workflow to move the distribution to the new origin.

Do not reuse `www.soporta.me` as the CloudFront origin. Once traffic DNS points at FortressNet, that hostname resolves to the edge and prevents an independent origin health or bypass check.

## 2. Restrict the origin to FortressNet

Retrieve the generated header with **Origins > Edge Hardening > Copy origin header**. Treat its value as a credential; never commit it or expose it in source code.

For Apache 2.4, restrict the dedicated origin vhost after confirming the header name and value from FortressNet:

```apache
<VirtualHost *:443>
    ServerName origin.soporta.me
    DocumentRoot /var/www/soporta.me

    <Location />
        Require expr "%{HTTP:X-FortressNet-Origin-Verify} == 'PASTE_VALUE_FROM_FORTRESSNET'"
    </Location>

    Options -Indexes
    ServerTokens Prod
    ServerSignature Off
</VirtualHost>
```

Use the actual header name returned by FortressNet, not the example name above. Test from CloudFront first, then request the dedicated origin without the header. The direct request must return `401` or `403`; record that result with **Check origin lock** in FortressNet.

If the server supports a security group or network firewall, allow inbound HTTPS only from the approved ingress path as an additional control. Do not rely on source-IP allowlists alone: CloudFront IP ranges change and must be maintained automatically.

## 3. WordPress and Apache remediation

Apply these changes on the web host before enabling a blocking WAF policy:

1. Update WordPress core, Jetpack, the active Blockskit theme, PHP, Apache, and every active plugin to supported versions.
2. Remove unused themes and plugins. Disable directory indexes at the virtual-host level with `Options -Indexes`.
3. Disable XML-RPC unless an identified integration needs it. If it is required, disable pingbacks and restrict the caller set.
4. Restrict `wp-login.php` with MFA, a login rate limiter, and an approved administrative source policy. Keep emergency access documented.
5. Disable public WordPress user enumeration through REST and author archives when there is no business requirement for it.
6. Re-test the protected hostname and the dedicated origin after every change. A direct origin request without the FortressNet verification header must remain denied.

FortressNet prepares a tenant-approved **WordPress hardened** WAF policy with AWS WordPress and PHP managed rules plus controls for XML-RPC, user enumeration, directory indexes, scanners, and login rate limiting. It must first run in monitor mode for 24 hours and then be applied by a tenant approver who did not create the change.

## 4. DNS and email security

Manage these records in the authoritative DNS provider:

1. Add a CAA record that authorizes the certificate authority used for the site and review it when the certificate provider changes.
2. Change DMARC from `p=none` to `p=quarantine` after reviewing aggregate reports, then to `p=reject` when all legitimate senders are aligned.
3. Keep SPF and DKIM aligned for every sending service before changing DMARC enforcement.

## Acceptance Criteria

- `www.soporta.me` serves through CloudFront with enforced browser security headers.
- The CloudFront origin is `origin.soporta.me`, with valid TLS and a healthy application path.
- Direct requests to the origin without the FortressNet verification header receive `401` or `403`.
- WordPress, plugins, theme, PHP, and Apache are updated and exposed directory indexes/XML-RPC/user enumeration have been remediated or explicitly accepted.
- CAA and enforced DMARC are live at the authoritative DNS provider.
- The WordPress hardened WAF change has completed tenant approval, the independent 24-hour monitoring period, and a tenant-admin application step.
