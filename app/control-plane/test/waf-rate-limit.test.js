import assert from "node:assert/strict";
import test from "node:test";
import { buildApiInventory, compileWafRules, normalizeTenantRegistration, normalizeWafAdvancedConfig, normalizeWafRateLimitConfig, publicTenant, toAwsWafRules, validateOpenApiDocument } from "../server.js";

test("compiles a rate limit scoped to path, methods, and countries", () => {
  const policy = {
    mode: "block",
    rate_limit: 600,
    rate_limit_path: "/login",
    rate_limit_methods: ["POST", "PUT"],
    rate_limit_countries: ["AR", "ES"]
  };
  const rateRule = compileWafRules(policy).find((rule) => rule.type === "rate_based_rule");
  const awsRule = toAwsWafRules([rateRule], "dom_test")[0];
  const rateStatement = awsRule.Statement.RateBasedStatement;

  assert.equal(awsRule.Action.Block !== undefined, true);
  assert.equal(rateStatement.AggregateKeyType, "IP");
  assert.equal(rateStatement.Limit, 600);
  assert.equal(rateStatement.EvaluationWindowSec, 300);
  assert.equal(rateStatement.ScopeDownStatement.AndStatement.Statements.length, 3);

  const [pathStatement, methodStatement, countryStatement] = rateStatement.ScopeDownStatement.AndStatement.Statements;
  assert.equal(pathStatement.ByteMatchStatement.SearchString.toString(), "/login");
  assert.equal(pathStatement.ByteMatchStatement.FieldToMatch.UriPath !== undefined, true);
  assert.equal(methodStatement.OrStatement.Statements.length, 2);
  assert.equal(methodStatement.OrStatement.Statements[0].ByteMatchStatement.SearchString.toString(), "POST");
  assert.deepEqual(countryStatement.GeoMatchStatement.CountryCodes, ["AR", "ES"]);
});

test("keeps the global rate limit unscoped when no conditions are selected", () => {
  const rateRule = compileWafRules({ mode: "monitor", rate_limit: 2000 }).find((rule) => rule.type === "rate_based_rule");
  const awsRule = toAwsWafRules([rateRule], "dom_test")[0];

  assert.equal(awsRule.Action.Count !== undefined, true);
  assert.equal(awsRule.Statement.RateBasedStatement.ScopeDownStatement, undefined);
});

test("rejects unsafe rate limit configuration", () => {
  assert.throws(() => normalizeWafRateLimitConfig({ rate_limit: 99 }), { message: "rate_limit_invalid" });
  assert.throws(() => normalizeWafRateLimitConfig({ rate_limit: 200, rate_limit_path: "login" }), { message: "rate_limit_path_invalid" });
  assert.throws(() => normalizeWafRateLimitConfig({ rate_limit: 200, rate_limit_methods: ["TRACE"] }), { message: "rate_limit_methods_invalid" });
  assert.throws(() => normalizeWafRateLimitConfig({ rate_limit: 200, rate_limit_countries: ["ZZ"] }), { message: "rate_limit_countries_invalid" });
});

test("compiles opt-in managed protections and advanced WAF statements", () => {
  const policy = {
    mode: "block",
    rate_limit: 2000,
    managed_protections: ["ip_reputation", "anonymous_ip"],
    blocked_asns: [64512],
    blocked_header_name: "x-forwarded-host",
    blocked_header_values: ["invalid.example", "unknown.example"]
  };
  const rules = compileWafRules(policy);
  assert.equal(rules.filter((rule) => rule.type === "managed_rule_group").length, 5);
  const awsRules = toAwsWafRules(rules.filter((rule) => ["asn_match", "header_match"].includes(rule.type)), "dom_test");
  assert.deepEqual(awsRules[0].Statement.AsnMatchStatement.ASNs, [64512]);
  assert.equal(awsRules[1].Statement.OrStatement.Statements.length, 2);
  assert.equal(awsRules[1].Action.Block !== undefined, true);
});

test("validates IP lists and header constraints", () => {
  const advanced = normalizeWafAdvancedConfig({
    managed_protections: ["ip_reputation"],
    allowed_ip_cidrs: "203.0.113.0/24\n2001:db8::/32",
    blocked_ip_cidrs: ["198.51.100.0/24"],
    blocked_header_name: "x-tenant",
    blocked_header_values: "untrusted"
  });
  assert.deepEqual(advanced.allowed_ip_cidrs, ["203.0.113.0/24", "2001:db8::/32"]);
  assert.throws(() => normalizeWafAdvancedConfig({ blocked_ip_cidrs: "10.0.0.1" }), { message: "ip_cidr_list_invalid" });
  assert.throws(() => normalizeWafAdvancedConfig({ blocked_header_name: "bad header", blocked_header_values: "x" }), { message: "blocked_header_invalid" });
});

test("builds API inventory from real WAF event shape and validates OpenAPI 3", () => {
  const inventory = buildApiInventory("tenant_test", [{ domain_id: "dom_test", method: "GET", uri: "/v1/orders/123", action: "ALLOW", timestamp: Date.now() }, { domain_id: "dom_test", method: "GET", uri: "/v1/orders/456", action: "BLOCK", timestamp: Date.now() }]);
  assert.equal(inventory.length, 1);
  assert.equal(inventory[0].path_template, "/v1/orders/{id}");
  assert.equal(inventory[0].blocked_requests, 1);
  assert.deepEqual(validateOpenApiDocument({ openapi: "3.0.3", info: { title: "Orders", version: "1" }, paths: { "/v1/orders/{id}": { get: {} } } }).endpoints, [{ method: "GET", path_template: "/v1/orders/{id}" }]);
  assert.throws(() => validateOpenApiDocument({ openapi: "2.0", info: { title: "Old" }, paths: {} }), { message: "openapi_3_document_required" });
});

test("normalizes a tenant registration and excludes opportunity data from the public tenant", () => {
  const registration = normalizeTenantRegistration({
    company: { legal_name: "Example Legal Entity", country: "ES", website: "https://example.test" },
    primary_contact: { full_name: "Primary Contact", email: "primary@example.test", phone: "+34 600 000 000" },
    technical_contact: { full_name: "Technical Contact", email: "technical@example.test" },
    commercial: { estimated_domains: 3, expected_traffic_tier: "1m_to_10m", use_case: "Protect public applications." },
    opportunity_authorized: true
  }, "Example Tenant", "business");
  const tenant = { tenant_id: "tenant_example", name: "Example Tenant", plan: "business", status: "registered", registration };
  assert.equal(registration.company.country, "ES");
  assert.equal(registration.commercial.requested_plan, "business");
  assert.equal(publicTenant(tenant).registration_status, "registered");
  assert.equal("registration" in publicTenant(tenant), false);
  assert.throws(() => normalizeTenantRegistration({}, "Example Tenant", "pilot"), { message: "legal_entity_name_required" });
});
