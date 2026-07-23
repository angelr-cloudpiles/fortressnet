import assert from "node:assert/strict";
import test from "node:test";
import { clientSecurityResponseHeadersPolicyConfig, cloudFrontDistributionConfig, normalizeOriginUrl } from "../server.js";

const deployment = {
  deployment_id: "edge_test",
  tenant_id: "tenant_test",
  domain_id: "dom_test",
  failover_enabled: true
};

const domain = { domain_id: "dom_test", domain_name: "www.example.com" };
const certificate = { certificate_arn: "arn:aws:acm:us-east-1:123456789012:certificate/test" };
const origins = [
  { origin_id: "primary", hostname: "primary.example.com", port: "443" },
  { origin_id: "secondary", hostname: "secondary.example.com", port: "8443" }
];

test("creates a CloudFront origin group for a validated failover pool", () => {
  const config = cloudFrontDistributionConfig(deployment, domain, origins, certificate, "arn:aws:wafv2:us-east-1:123456789012:global/webacl/test", "X-FortressNet-Origin-Verify", "secret");

  assert.equal(config.Origins.Quantity, 2);
  assert.equal(config.Origins.Items[1].CustomOriginConfig.HTTPSPort, 8443);
  assert.equal(config.OriginGroups.Quantity, 1);
  assert.equal(config.DefaultCacheBehavior.TargetOriginId, "origin-group-dom_test");
  assert.equal(config.DefaultCacheBehavior.OriginRequestPolicyId, "216adef6-5c7f-47e4-b989-5492eafa07d3");
  assert.deepEqual(config.OriginGroups.Items[0].FailoverCriteria.StatusCodes.Items, [500, 502, 503, 504]);
  assert.deepEqual(config.OriginGroups.Items[0].Members.Items, [{ OriginId: "origin-primary" }, { OriginId: "origin-secondary" }]);
});

test("keeps a single-origin pool direct", () => {
  const config = cloudFrontDistributionConfig({ ...deployment, failover_enabled: false }, domain, [origins[0]], certificate, "arn:aws:wafv2:us-east-1:123456789012:global/webacl/test", "X-FortressNet-Origin-Verify", "secret");

  assert.equal(config.Origins.Quantity, 1);
  assert.equal(config.OriginGroups.Quantity, 0);
  assert.equal(config.DefaultCacheBehavior.TargetOriginId, "origin-primary");
});

test("rejects origin URLs with invalid TCP ports", () => {
  assert.equal(normalizeOriginUrl("https://origin.example.com:0"), null);
  assert.equal(normalizeOriginUrl("https://origin.example.com:8443").port, "8443");
});

test("creates enforced browser controls with CSP telemetry", () => {
  const policy = clientSecurityResponseHeadersPolicyConfig("fn-csp-test", "www.example.com", "client-token");

  assert.equal(policy.SecurityHeadersConfig.ContentTypeOptions.Override, true);
  assert.equal(policy.SecurityHeadersConfig.StrictTransportSecurity.AccessControlMaxAgeSec, 31536000);
  assert.deepEqual(policy.CustomHeadersConfig.Items[0], {
    Header: "Content-Security-Policy-Report-Only",
    Value: "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; report-uri https://app.fortressnet.app/api/client-security/reports/client-token",
    Override: true
  });
  assert.equal(policy.CustomHeadersConfig.Items[1].Header, "Permissions-Policy");
});
