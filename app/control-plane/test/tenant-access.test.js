import assert from "node:assert/strict";
import test from "node:test";
import { buildTenantAccess, hasScope } from "../server.js";

test("keeps tenant permission assignments isolated", () => {
  const access = buildTenantAccess({
    tenant_id: "tenant_alpha",
    tenant_ids: ["tenant_alpha", "tenant_beta"],
    roles: ["domain_dns_admin", "security_analyst"],
    access_assignments: [
      { tenant_id: "tenant_alpha", profile_id: "domain_dns_admin", permissions: ["tenant:read", "dns:read", "dns:write"] },
      { tenant_id: "tenant_beta", profile_id: "security_analyst", permissions: ["tenant:read", "events:read"] }
    ]
  }, ["domain_dns_admin", "security_analyst"]);

  const actor = { scopes: access.scopes, tenant_permissions: access.permissions };
  assert.equal(hasScope(actor, "dns:write", "tenant_alpha"), true);
  assert.equal(hasScope(actor, "dns:write", "tenant_beta"), false);
  assert.equal(hasScope(actor, "events:read", "tenant_alpha"), false);
  assert.equal(hasScope(actor, "events:read", "tenant_beta"), true);
});

test("keeps legacy records functional until their first access edit", () => {
  const access = buildTenantAccess({
    tenant_id: "tenant_legacy",
    tenant_ids: ["tenant_legacy"],
    roles: ["security_analyst"],
    scopes: []
  }, ["security_analyst"]);

  assert.equal(hasScope({ tenant_permissions: access.permissions }, "events:read", "tenant_legacy"), true);
  assert.equal(hasScope({ tenant_permissions: access.permissions }, "waf:write", "tenant_legacy"), false);
});
