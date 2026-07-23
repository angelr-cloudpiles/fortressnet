import assert from "node:assert/strict";
import test from "node:test";
import { cloudFrontDistributionConfig, normalizeOriginUrl } from "../server.js";

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
