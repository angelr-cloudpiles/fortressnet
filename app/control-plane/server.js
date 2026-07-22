import crypto from "node:crypto";
import dns from "node:dns/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { ACMClient, DescribeCertificateCommand, RequestCertificateCommand } from "@aws-sdk/client-acm";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 80);
const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
const s3 = new S3Client({ region });
// CloudFront only accepts ACM certificates issued in us-east-1.
const acm = new ACMClient({ region: "us-east-1" });

const tables = {
  tenants: process.env.TENANTS_TABLE,
  domains: process.env.DOMAINS_TABLE,
  policies: process.env.SECURITY_POLICIES_TABLE,
  entitlements: process.env.ENTITLEMENTS_TABLE,
  users: process.env.USERS_TABLE,
  apiKeys: process.env.API_KEYS_TABLE,
  idpConnections: process.env.IDP_CONNECTIONS_TABLE,
  profiles: process.env.PROFILES_TABLE,
  origins: process.env.ORIGINS_TABLE,
  originPools: process.env.ORIGIN_POOLS_TABLE,
  certificates: process.env.CERTIFICATES_TABLE,
  wafChangeSets: process.env.WAF_CHANGE_SETS_TABLE
};

const roleScopes = {
  platform_owner: ["*"],
  tenant_admin: ["tenant:read", "tenant:write", "domain:read", "domain:write", "policy:read", "policy:write", "edge:read", "edge:write", "identity:read", "identity:write", "billing:read", "profile:write"],
  security_admin: ["tenant:read", "domain:read", "domain:write", "policy:read", "policy:write", "edge:read", "edge:write", "events:read", "reports:read", "profile:write"],
  security_analyst: ["tenant:read", "domain:read", "policy:read", "edge:read", "events:read", "reports:read", "profile:write"],
  billing_admin: ["tenant:read", "billing:read", "billing:write", "profile:write"],
  read_only: ["tenant:read", "domain:read", "policy:read", "edge:read", "events:read", "reports:read", "billing:read", "identity:read", "profile:write"]
};

const allowedScopes = Array.from(new Set(Object.values(roleScopes).flat())).filter((scope) => scope !== "*").sort();

const platformConfig = parseJson(process.env.PLATFORM_CONFIG_SECRET, {});
const managementToken = platformConfig.management_bootstrap_token || process.env.MANAGEMENT_BOOTSTRAP_TOKEN;

app.disable("x-powered-by");
app.use(securityHeaders);
app.use(express.json({ limit: "256kb" }));

app.get("/healthz", (_req, res) => {
  res.type("text/plain").send("ok\n");
});

app.get("/api/platform", (_req, res) => {
  res.json({
    environment: process.env.FORTRESSNET_ENV || "unknown",
    auth_mode: "bootstrap_token_or_api_key",
    cognito_user_pool_id: process.env.COGNITO_USER_POOL_ID || null,
    cognito_app_client_id: process.env.COGNITO_APP_CLIENT_ID || null,
    management_ready: Boolean(managementToken),
    roles: Object.keys(roleScopes),
    scopes: allowedScopes,
    tables_ready: Object.fromEntries(Object.entries(tables).map(([key, value]) => [key, Boolean(value)]))
  });
});

app.use("/api", requireManagementAccess);

app.get("/api/management/state", requireScope("tenant:read"), async (_req, res, next) => {
  try {
    const [tenants, domains, policies, entitlements, users, apiKeys, idpConnections, profiles, origins, originPools, certificates, wafChangeSets] = await Promise.all([
      scanTable(tables.tenants),
      scanTable(tables.domains),
      scanTable(tables.policies),
      scanTable(tables.entitlements),
      scanTable(tables.users),
      scanTable(tables.apiKeys),
      scanTable(tables.idpConnections),
      scanTable(tables.profiles),
      scanTable(tables.origins),
      scanTable(tables.originPools),
      scanTable(tables.certificates),
      scanTable(tables.wafChangeSets)
    ]);

    res.json({
      tenants: sortByDate(scopeItems(req.actor, tenants)),
      domains: sortByDate(scopeItems(req.actor, domains)),
      policies: sortByDate(scopeItems(req.actor, policies)),
      entitlements: sortByDate(scopeItems(req.actor, entitlements)),
      users: sortByDate(scopeItems(req.actor, users)),
      api_keys: sortByDate(scopeItems(req.actor, apiKeys)).map(publicApiKey),
      idp_connections: sortByDate(scopeItems(req.actor, idpConnections)),
      profiles: sortByDate(scopeProfiles(req.actor, profiles)),
      origins: sortByDate(scopeItems(req.actor, origins)),
      origin_pools: sortByDate(scopeItems(req.actor, originPools)),
      certificates: sortByDate(scopeItems(req.actor, certificates)),
      waf_change_sets: sortByDate(scopeItems(req.actor, wafChangeSets))
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/domain-onboarding", requireScope("domain:write"), async (req, res, next) => {
  try {
    const body = req.body || {};
    const tenantId = tenantForActor(req.actor, clean(body.tenant_id));
    const domainName = normalizeDomain(body.domain_name);
    const originUrl = normalizeOriginUrl(body.origin_url);
    if (!tenantId) return res.status(400).json({ error: "tenant_id_required" });
    if (!domainName) return res.status(400).json({ error: "valid_domain_required" });
    if (!originUrl) return res.status(400).json({ error: "valid_public_origin_url_required" });
    if (!tables.origins || !tables.originPools || !tables.certificates) return res.status(503).json({ error: "onboarding_tables_not_configured" });

    const now = new Date().toISOString();
    const verification = crypto.randomBytes(16).toString("hex");
    const domain = {
      domain_id: `dom_${crypto.randomUUID()}`,
      tenant_id: tenantId,
      domain_name: domainName,
      origin_url: originUrl.href,
      dns_mode: clean(body.dns_mode) || "cname",
      status: "pending_dns",
      verification_type: "TXT",
      verification_name: `_fortressnet-verify.${domainName}`,
      verification_value: `fn-${verification}`,
      edge_status: "not_provisioned",
      requests: 0,
      blocked: 0,
      waf_matches: 0,
      latency_p95_ms: null,
      onboarding_step: "dns_verification",
      created_at: now,
      updated_at: now
    };

    const origin = {
      origin_id: `org_${crypto.randomUUID()}`,
      tenant_id: tenantId,
      domain_id: domain.domain_id,
      name: clean(body.origin_name) || "primary",
      origin_url: originUrl.href,
      hostname: originUrl.hostname,
      protocol: originUrl.protocol.replace(":", ""),
      port: originUrl.port || (originUrl.protocol === "https:" ? "443" : "80"),
      host_header: clean(body.host_header) || originUrl.hostname,
      health_path: clean(body.health_path) || "/",
      timeout_seconds: Number(body.timeout_seconds || 10),
      status: "pending_health_check",
      created_at: now,
      updated_at: now
    };

    const pool = {
      pool_id: `pool_${crypto.randomUUID()}`,
      tenant_id: tenantId,
      domain_id: domain.domain_id,
      name: "primary-pool",
      origin_ids: [origin.origin_id],
      strategy: "priority",
      failover_enabled: false,
      status: "pending_health_check",
      created_at: now,
      updated_at: now
    };

    const certificate = {
      certificate_id: `cert_${crypto.randomUUID()}`,
      tenant_id: tenantId,
      domain_id: domain.domain_id,
      domain_name: domainName,
      provider: "aws_acm",
      region: "us-east-1",
      status: "pending_ownership_verification",
      created_at: now,
      updated_at: now
    };

    await Promise.all([
      putUnique(tables.domains, domain, "domain_id"),
      putUnique(tables.origins, origin, "origin_id"),
      putUnique(tables.originPools, pool, "pool_id"),
      putUnique(tables.certificates, certificate, "certificate_id")
    ]);
    await audit("domain_onboarding.created", tenantId, { domain, origin, pool, certificate }, req.actor);
    res.status(201).json({ domain, origin, origin_pool: pool, certificate, next_step: "create_dns_txt_record" });
  } catch (error) {
    next(error);
  }
});

app.post("/api/tenants", requirePlatformActor, requireScope("tenant:write"), async (req, res, next) => {
  try {
    const body = req.body || {};
    const name = clean(body.name);
    if (!name) return res.status(400).json({ error: "tenant_name_required" });

    const now = new Date().toISOString();
    const tenant = {
      tenant_id: `tenant_${slugify(name)}_${crypto.randomBytes(3).toString("hex")}`,
      name,
      status: clean(body.status) || "active",
      plan: clean(body.plan) || "pilot",
      created_at: now,
      updated_at: now
    };

    await dynamo.send(new PutCommand({
      TableName: tables.tenants,
      Item: tenant,
      ConditionExpression: "attribute_not_exists(tenant_id)"
    }));
    await audit("tenant.created", tenant.tenant_id, tenant, req.actor);
    res.status(201).json({ tenant });
  } catch (error) {
    next(error);
  }
});

app.get("/api/tenants", requireScope("tenant:read"), async (req, res, next) => {
  try {
    res.json({ tenants: sortByDate(scopeItems(req.actor, await scanTable(tables.tenants))) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/domains", requireScope("domain:write"), async (req, res, next) => {
  try {
    const body = req.body || {};
    const tenantId = tenantForActor(req.actor, clean(body.tenant_id));
    const domainName = normalizeDomain(body.domain_name);
    if (!tenantId) return res.status(400).json({ error: "tenant_id_required" });
    if (!domainName) return res.status(400).json({ error: "valid_domain_required" });

    const now = new Date().toISOString();
    const verification = crypto.randomBytes(12).toString("hex");
    const domain = {
      domain_id: `dom_${crypto.randomUUID()}`,
      tenant_id: tenantId,
      domain_name: domainName,
      origin_url: clean(body.origin_url) || "",
      status: "pending_dns",
      verification_type: "TXT",
      verification_name: `_fortressnet-verify.${domainName}`,
      verification_value: `fn-${verification}`,
      edge_status: "not_provisioned",
      requests: 0,
      blocked: 0,
      waf_matches: 0,
      latency_p95_ms: null,
      created_at: now,
      updated_at: now
    };

    await dynamo.send(new PutCommand({
      TableName: tables.domains,
      Item: domain,
      ConditionExpression: "attribute_not_exists(domain_id)"
    }));
    await audit("domain.created", tenantId, domain, req.actor);
    res.status(201).json({ domain });
  } catch (error) {
    next(error);
  }
});

app.get("/api/domains", requireScope("domain:read"), async (req, res, next) => {
  try {
    const tenantId = tenantForActor(req.actor, clean(req.query.tenant_id));
    if (!tenantId) return res.json({ domains: sortByDate(await scanTable(tables.domains)) });

    const result = await dynamo.send(new QueryCommand({
      TableName: tables.domains,
      IndexName: "tenant_id-index",
      KeyConditionExpression: "tenant_id = :tenant_id",
      ExpressionAttributeValues: { ":tenant_id": tenantId }
    }));
    res.json({ domains: sortByDate(result.Items || []) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/domains/:domainId/verify-dns", requireScope("domain:write"), async (req, res, next) => {
  try {
    const domainId = clean(req.params.domainId);
    if (!domainId) return res.status(400).json({ error: "domain_id_required" });
    const current = await getById(tables.domains, { domain_id: domainId });
    if (!current) return res.status(404).json({ error: "domain_not_found" });
    tenantForActor(req.actor, current.tenant_id);

    let records = [];
    let verified = false;
    let error = "";
    try {
      records = await dns.resolveTxt(current.verification_name);
      verified = records.flat().includes(current.verification_value);
    } catch (lookupError) {
      error = lookupError?.code || "dns_lookup_failed";
    }

    const now = new Date().toISOString();
    const result = await dynamo.send(new UpdateCommand({
      TableName: tables.domains,
      Key: { domain_id: domainId },
      UpdateExpression: "SET #status = :status, onboarding_step = :step, dns_last_checked_at = :checked, dns_last_error = :error, updated_at = :updated_at",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": verified ? "verified_pending_certificate" : "pending_dns",
        ":step": verified ? "certificate_validation" : "dns_verification",
        ":checked": now,
        ":error": verified ? "" : error,
        ":updated_at": now
      },
      ReturnValues: "ALL_NEW"
    }));

    let certificate = null;
    let certificateError = "";
    if (verified) {
      try {
        certificate = await requestOrRefreshCertificate(current, now);
      } catch (requestError) {
        certificateError = requestError?.name || "certificate_request_failed";
      }
    }

    await audit("domain.dns_checked", current.tenant_id, {
      domain_id: domainId,
      verified,
      error,
      certificate_id: certificate?.certificate_id || null,
      certificate_error: certificateError
    }, req.actor);
    res.json({ domain: result.Attributes, verified, records, certificate, certificate_error: certificateError || null });
  } catch (error) {
    next(error);
  }
});

app.get("/api/origins", requireScope("edge:read"), async (req, res, next) => {
  try {
    const tenantId = tenantForActor(req.actor, clean(req.query.tenant_id));
    const origins = tenantId ? await queryByTenant(tables.origins, tenantId) : await scanTable(tables.origins);
    res.json({ origins: sortByDate(origins) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/origins", requireScope("edge:write"), async (req, res, next) => {
  try {
    const body = req.body || {};
    const tenantId = tenantForActor(req.actor, clean(body.tenant_id));
    const domainId = clean(body.domain_id);
    const originUrl = normalizeOriginUrl(body.origin_url);
    if (!tenantId) return res.status(400).json({ error: "tenant_id_required" });
    if (!domainId) return res.status(400).json({ error: "domain_id_required" });
    if (!originUrl) return res.status(400).json({ error: "valid_public_origin_url_required" });
    const domain = await getById(tables.domains, { domain_id: domainId });
    if (!domain || domain.tenant_id !== tenantId) return res.status(404).json({ error: "domain_not_found" });

    const now = new Date().toISOString();
    const origin = {
      origin_id: `org_${crypto.randomUUID()}`,
      tenant_id: tenantId,
      domain_id: domainId,
      name: clean(body.name) || "origin",
      origin_url: originUrl.href,
      hostname: originUrl.hostname,
      protocol: originUrl.protocol.replace(":", ""),
      port: originUrl.port || (originUrl.protocol === "https:" ? "443" : "80"),
      host_header: clean(body.host_header) || originUrl.hostname,
      health_path: clean(body.health_path) || "/",
      timeout_seconds: Number(body.timeout_seconds || 10),
      status: "pending_health_check",
      created_at: now,
      updated_at: now
    };

    await putUnique(tables.origins, origin, "origin_id");
    await audit("origin.created", tenantId, origin, req.actor);
    res.status(201).json({ origin });
  } catch (error) {
    next(error);
  }
});

app.get("/api/origin-pools", requireScope("edge:read"), async (req, res, next) => {
  try {
    const tenantId = tenantForActor(req.actor, clean(req.query.tenant_id));
    const pools = tenantId ? await queryByTenant(tables.originPools, tenantId) : await scanTable(tables.originPools);
    res.json({ origin_pools: sortByDate(pools) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/certificates", requireScope("edge:read"), async (req, res, next) => {
  try {
    const tenantId = tenantForActor(req.actor, clean(req.query.tenant_id));
    const certificates = tenantId ? await queryByTenant(tables.certificates, tenantId) : await scanTable(tables.certificates);
    res.json({ certificates: sortByDate(certificates) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/certificates/:certificateId/refresh", requireScope("edge:write"), async (req, res, next) => {
  try {
    const certificateId = clean(req.params.certificateId);
    if (!certificateId) return res.status(400).json({ error: "certificate_id_required" });
    const certificate = await getById(tables.certificates, { certificate_id: certificateId });
    if (!certificate) return res.status(404).json({ error: "certificate_not_found" });
    tenantForActor(req.actor, certificate.tenant_id);
    if (!certificate.certificate_arn) return res.status(409).json({ error: "certificate_not_requested" });

    const refreshed = await refreshCertificateRecord(certificate);
    await audit("certificate.refreshed", certificate.tenant_id, {
      certificate_id: certificateId,
      status: refreshed.status
    }, req.actor);
    res.json({ certificate: refreshed });
  } catch (error) {
    next(error);
  }
});

app.post("/api/policies", requireScope("policy:write"), async (req, res, next) => {
  try {
    const body = req.body || {};
    const tenantId = tenantForActor(req.actor, clean(body.tenant_id));
    const name = clean(body.name);
    if (!tenantId) return res.status(400).json({ error: "tenant_id_required" });
    if (!name) return res.status(400).json({ error: "policy_name_required" });

    const now = new Date().toISOString();
    const policy = {
      policy_id: `pol_${crypto.randomUUID()}`,
      tenant_id: tenantId,
      name,
      scope: clean(body.scope) || "all_domains",
      mode: clean(body.mode) || "managed_defaults",
      approval_required: true,
      status: "draft",
      created_at: now,
      updated_at: now
    };

    await dynamo.send(new PutCommand({
      TableName: tables.policies,
      Item: policy,
      ConditionExpression: "attribute_not_exists(policy_id)"
    }));
    await audit("policy.created", tenantId, policy, req.actor);
    res.status(201).json({ policy });
  } catch (error) {
    next(error);
  }
});

app.get("/api/policies", requireScope("policy:read"), async (req, res, next) => {
  try {
    const tenantId = tenantForActor(req.actor, clean(req.query.tenant_id));
    if (!tenantId) return res.json({ policies: sortByDate(await scanTable(tables.policies)) });

    const result = await dynamo.send(new QueryCommand({
      TableName: tables.policies,
      IndexName: "tenant_id-index",
      KeyConditionExpression: "tenant_id = :tenant_id",
      ExpressionAttributeValues: { ":tenant_id": tenantId }
    }));
    res.json({ policies: sortByDate(result.Items || []) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/policies/:policyId/compile", requireScope("policy:write"), async (req, res, next) => {
  try {
    const policyId = clean(req.params.policyId);
    if (!policyId) return res.status(400).json({ error: "policy_id_required" });
    if (!tables.wafChangeSets) return res.status(503).json({ error: "waf_change_sets_table_not_configured" });
    const policy = await getById(tables.policies, { policy_id: policyId });
    if (!policy) return res.status(404).json({ error: "policy_not_found" });
    tenantForActor(req.actor, policy.tenant_id);

    const now = new Date().toISOString();
    const rules = compileWafRules(policy);
    const changeSet = {
      change_set_id: `wcs_${crypto.randomUUID()}`,
      tenant_id: policy.tenant_id,
      policy_id: policy.policy_id,
      policy_version: crypto.createHash("sha256").update(JSON.stringify(policy)).digest("hex").slice(0, 12),
      target_scope: policy.scope || "all_domains",
      mode: policy.mode || "managed_defaults",
      status: "pending_approval",
      provider: "aws_wafv2",
      rules,
      summary: `${rules.length} AWS WAF rules compiled in approval mode`,
      created_by: req.actor?.subject || "bootstrap",
      created_at: now,
      updated_at: now
    };

    await putUnique(tables.wafChangeSets, changeSet, "change_set_id");
    await dynamo.send(new UpdateCommand({
      TableName: tables.policies,
      Key: { policy_id: policyId },
      UpdateExpression: "SET #status = :status, last_compiled_at = :compiled, updated_at = :updated",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": "compiled_pending_approval",
        ":compiled": now,
        ":updated": now
      }
    }));
    await audit("policy.compiled", policy.tenant_id, changeSet, req.actor);
    res.status(201).json({ waf_change_set: changeSet });
  } catch (error) {
    next(error);
  }
});

app.get("/api/waf-change-sets", requireScope("policy:read"), async (req, res, next) => {
  try {
    const tenantId = tenantForActor(req.actor, clean(req.query.tenant_id));
    const changeSets = tenantId ? await queryByTenant(tables.wafChangeSets, tenantId) : await scanTable(tables.wafChangeSets);
    res.json({ waf_change_sets: sortByDate(changeSets) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/events", requireScope("events:read"), (_req, res) => {
  res.json({ events: [] });
});

app.get("/api/reports", requireScope("reports:read"), (_req, res) => {
  res.json({ reports: [] });
});

app.get("/api/users", requireScope("identity:read"), async (req, res, next) => {
  try {
    const tenantId = tenantForActor(req.actor, clean(req.query.tenant_id));
    const users = tenantId ? await queryByTenant(tables.users, tenantId) : await scanTable(tables.users);
    res.json({ users: sortByDate(users) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/users", requireScope("identity:write"), async (req, res, next) => {
  try {
    const body = req.body || {};
    const tenantId = tenantForActor(req.actor, clean(body.tenant_id) || (isPlatformActor(req.actor) ? "platform" : ""));
    const email = normalizeEmail(body.email);
    const displayName = clean(body.display_name);
    const roles = normalizeList(body.roles).filter((role) => roleScopes[role] && (isPlatformActor(req.actor) || role !== "platform_owner"));
    const scopes = Array.from(new Set([...roles.flatMap((role) => roleScopes[role] || []), ...normalizeList(body.scopes)]));

    if (!email) return res.status(400).json({ error: "valid_email_required" });
    if (!displayName) return res.status(400).json({ error: "display_name_required" });
    if (!roles.length) return res.status(400).json({ error: "role_required" });
    if (!isPlatformActor(req.actor) && scopes.some((scope) => scope === "*" || !hasScope(req.actor, scope))) {
      return res.status(403).json({ error: "privilege_escalation_denied" });
    }

    const now = new Date().toISOString();
    const user = {
      user_id: `usr_${crypto.randomUUID()}`,
      tenant_id: tenantId,
      email,
      display_name: displayName,
      status: clean(body.status) || "invited",
      roles,
      scopes: scopes.includes("*") ? ["*"] : scopes.filter((scope) => allowedScopes.includes(scope)),
      idp_subject: clean(body.idp_subject),
      mfa_required: body.mfa_required !== false,
      created_at: now,
      updated_at: now
    };

    await dynamo.send(new PutCommand({
      TableName: tables.users,
      Item: user,
      ConditionExpression: "attribute_not_exists(user_id)"
    }));
    await audit("user.created", tenantId, redactUser(user), req.actor);
    res.status(201).json({ user });
  } catch (error) {
    next(error);
  }
});

app.get("/api/api-keys", requireScope("identity:read"), async (req, res, next) => {
  try {
    const tenantId = tenantForActor(req.actor, clean(req.query.tenant_id));
    const apiKeys = tenantId ? await queryByTenant(tables.apiKeys, tenantId) : await scanTable(tables.apiKeys);
    res.json({ api_keys: sortByDate(apiKeys).map(publicApiKey) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/api-keys", requireScope("identity:write"), async (req, res, next) => {
  try {
    const body = req.body || {};
    const tenantId = tenantForActor(req.actor, clean(body.tenant_id));
    const name = clean(body.name);
    const requestedScopes = normalizeList(body.scopes).filter((scope) => allowedScopes.includes(scope));
    const scopes = isPlatformActor(req.actor) ? requestedScopes : requestedScopes.filter((scope) => hasScope(req.actor, scope));
    if (!tenantId) return res.status(400).json({ error: "tenant_id_required" });
    if (!name) return res.status(400).json({ error: "api_key_name_required" });
    if (!scopes.length) return res.status(400).json({ error: "scope_required_or_not_granted" });

    const keyId = `key_${crypto.randomUUID()}`;
    const secret = crypto.randomBytes(32).toString("base64url");
    const apiKeyValue = `fnak_${keyId}_${secret}`;
    const now = new Date().toISOString();
    const apiKey = {
      key_id: keyId,
      tenant_id: tenantId,
      name,
      key_prefix: apiKeyValue.slice(0, 18),
      key_hash: hashSecret(apiKeyValue),
      status: "active",
      scopes,
      expires_at: clean(body.expires_at),
      last_used_at: "",
      created_by: req.actor?.subject || "bootstrap",
      created_at: now,
      updated_at: now
    };

    await dynamo.send(new PutCommand({
      TableName: tables.apiKeys,
      Item: apiKey,
      ConditionExpression: "attribute_not_exists(key_id)"
    }));
    await audit("api_key.created", tenantId, publicApiKey(apiKey), req.actor);
    res.status(201).json({ api_key: publicApiKey(apiKey), api_key_value: apiKeyValue });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/api-keys/:keyId/revoke", requireScope("identity:write"), async (req, res, next) => {
  try {
    const keyId = clean(req.params.keyId);
    if (!keyId) return res.status(400).json({ error: "key_id_required" });
    const current = await getById(tables.apiKeys, { key_id: keyId });
    if (!current) return res.status(404).json({ error: "api_key_not_found" });
    tenantForActor(req.actor, current.tenant_id);
    const now = new Date().toISOString();
    const result = await dynamo.send(new UpdateCommand({
      TableName: tables.apiKeys,
      Key: { key_id: keyId },
      UpdateExpression: "SET #status = :status, updated_at = :updated_at, revoked_at = :revoked_at",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": "revoked",
        ":updated_at": now,
        ":revoked_at": now
      },
      ReturnValues: "ALL_NEW"
    }));
    await audit("api_key.revoked", result.Attributes?.tenant_id || "unknown", publicApiKey(result.Attributes || {}), req.actor);
    res.json({ api_key: publicApiKey(result.Attributes || {}) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/idp-connections", requireScope("identity:read"), async (req, res, next) => {
  try {
    const tenantId = tenantForActor(req.actor, clean(req.query.tenant_id));
    const connections = tenantId ? await queryByTenant(tables.idpConnections, tenantId) : await scanTable(tables.idpConnections);
    res.json({ idp_connections: sortByDate(connections) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/idp-connections", requireScope("identity:write"), async (req, res, next) => {
  try {
    const body = req.body || {};
    const tenantId = tenantForActor(req.actor, clean(body.tenant_id));
    const name = clean(body.name);
    const protocol = clean(body.protocol).toLowerCase();
    if (!tenantId) return res.status(400).json({ error: "tenant_id_required" });
    if (!name) return res.status(400).json({ error: "idp_name_required" });
    if (!["oidc", "saml"].includes(protocol)) return res.status(400).json({ error: "protocol_must_be_oidc_or_saml" });

    const now = new Date().toISOString();
    const connection = {
      idp_id: `idp_${crypto.randomUUID()}`,
      tenant_id: tenantId,
      name,
      protocol,
      issuer_url: clean(body.issuer_url),
      sso_url: clean(body.sso_url),
      metadata_url: clean(body.metadata_url),
      jwks_url: clean(body.jwks_url),
      client_id: clean(body.client_id),
      secret_reference: clean(body.secret_reference),
      attribute_mapping: parseJson(body.attribute_mapping, {
        email: "email",
        display_name: "name",
        groups: "groups"
      }),
      status: "configured_pending_validation",
      auto_provisioning: body.auto_provisioning !== false,
      created_at: now,
      updated_at: now
    };

    await dynamo.send(new PutCommand({
      TableName: tables.idpConnections,
      Item: connection,
      ConditionExpression: "attribute_not_exists(idp_id)"
    }));
    await audit("idp_connection.created", tenantId, connection, req.actor);
    res.status(201).json({ idp_connection: connection });
  } catch (error) {
    next(error);
  }
});

app.get("/api/profile", requireScope("profile:write"), async (req, res, next) => {
  try {
    const profileId = actorProfileId(req.actor);
    const result = await dynamo.send(new GetCommand({
      TableName: tables.profiles,
      Key: { profile_id: profileId }
    }));
    res.json({ profile: result.Item || defaultProfile(profileId) });
  } catch (error) {
    next(error);
  }
});

app.put("/api/profile", requireScope("profile:write"), async (req, res, next) => {
  try {
    const body = req.body || {};
    const profileId = actorProfileId(req.actor);
    const now = new Date().toISOString();
    const profile = {
      profile_id: profileId,
      display_name: clean(body.display_name),
      email: normalizeEmail(body.email),
      timezone: clean(body.timezone) || "UTC",
      locale: clean(body.locale) || "en-US",
      notification_email: body.notification_email !== false,
      notification_security: body.notification_security !== false,
      created_at: clean(body.created_at) || now,
      updated_at: now
    };

    await dynamo.send(new PutCommand({
      TableName: tables.profiles,
      Item: profile
    }));
    await audit("profile.updated", "platform", profile, req.actor);
    res.json({ profile });
  } catch (error) {
    next(error);
  }
});

app.use(blockSensitivePaths);
app.use(express.static(path.join(__dirname, "dist"), {
  dotfiles: "deny",
  index: false,
  maxAge: "1h",
  setHeaders(res, filePath) {
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-store");
    }
  }
}));
app.use((req, res, next) => {
  if (!["GET", "HEAD"].includes(req.method) || req.path.startsWith("/api/")) return next();
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.statusCode || 500).json({ error: error.code || "internal_error" });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`FortressNet control plane listening on ${port}`);
});

async function requireManagementAccess(req, res, next) {
  if (!managementToken) return res.status(503).json({ error: "management_token_not_configured" });

  try {
    const actor = await authenticateRequest(req);
    if (!actor) return res.status(401).json({ error: "management_access_required" });
    req.actor = actor;
    next();
  } catch (error) {
    next(error);
  }
}

async function authenticateRequest(req) {
  const auth = req.headers.authorization || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  const bootstrap = req.headers["x-fortressnet-admin-token"] || "";
  const apiKeyHeader = req.headers["x-fortressnet-api-key"] || "";
  const supplied = String(bearer || bootstrap || apiKeyHeader);

  if (supplied && timingSafeEqual(supplied, managementToken)) {
    return {
      type: "bootstrap",
      subject: "bootstrap-admin",
      tenant_id: "platform",
      roles: ["platform_owner"],
      scopes: ["*"]
    };
  }

  if (!supplied.startsWith("fnak_key_")) return null;
  const match = supplied.match(/^(fnak_key_[0-9a-f-]+)_/);
  if (!match || !tables.apiKeys) return null;

  const result = await dynamo.send(new GetCommand({
    TableName: tables.apiKeys,
    Key: { key_id: match[1] }
  }));
  const record = result.Item;
  if (!record || record.status !== "active") return null;
  if (record.expires_at && new Date(record.expires_at).getTime() <= Date.now()) return null;
  if (!timingSafeEqual(hashSecret(supplied), record.key_hash || "")) return null;

  await dynamo.send(new UpdateCommand({
    TableName: tables.apiKeys,
    Key: { key_id: record.key_id },
    UpdateExpression: "SET last_used_at = :last_used_at",
    ExpressionAttributeValues: { ":last_used_at": new Date().toISOString() }
  }));

  return {
    type: "api_key",
    subject: record.key_id,
    tenant_id: record.tenant_id,
    roles: ["api_key"],
    scopes: record.scopes || []
  };
}

function requireScope(scope) {
  return (req, res, next) => {
    if (!hasScope(req.actor, scope)) return res.status(403).json({ error: "insufficient_scope", required_scope: scope });
    next();
  };
}

function hasScope(actor, scope) {
  const scopes = actor?.scopes || [];
  return scopes.includes("*") || scopes.includes(scope);
}

function requirePlatformActor(req, res, next) {
  if (!isPlatformActor(req.actor)) return res.status(403).json({ error: "platform_access_required" });
  next();
}

function isPlatformActor(actor) {
  return Boolean(actor?.scopes?.includes("*"));
}

function tenantForActor(actor, requestedTenantId) {
  const tenantId = clean(requestedTenantId);
  if (isPlatformActor(actor)) return tenantId;
  if (!actor?.tenant_id || actor.tenant_id === "platform") {
    throw httpError(403, "tenant_context_required");
  }
  if (tenantId && tenantId !== actor.tenant_id) {
    throw httpError(403, "cross_tenant_access_denied");
  }
  return actor.tenant_id;
}

function scopeItems(actor, items) {
  if (isPlatformActor(actor)) return items;
  return items.filter((item) => item?.tenant_id === actor?.tenant_id);
}

function scopeProfiles(actor, profiles) {
  if (isPlatformActor(actor)) return profiles;
  return profiles.filter((profile) => profile?.profile_id === actorProfileId(actor));
}

function httpError(statusCode, code) {
  const error = new Error(code);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function securityHeaders(_req, res, next) {
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "upgrade-insecure-requests"
  ].join("; "));
  next();
}

function blockSensitivePaths(req, res, next) {
  const target = req.path.toLowerCase();
  const blocked = [
    /^\/\./,
    /^\/.*\.env/,
    /^\/.*\.tfstate/,
    /^\/.*\.tfvars/,
    /^\/.*\.pem$/,
    /^\/.*\.key$/,
    /^\/.*\.crt$/,
    /^\/.*\.sql$/,
    /^\/.*\.bak$/,
    /^\/.*\.zip$/,
    /^\/.*\.tar$/,
    /^\/.*\.gz$/,
    /^\/config(\.json)?$/,
    /^\/api\/config$/,
    /^\/keys?\.json$/,
    /^\/server-status$/,
    /^\/phpinfo\.php$/
  ];

  if (blocked.some((pattern) => pattern.test(target))) {
    return res.status(404).json({ error: "not_found" });
  }
  next();
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

async function scanTable(TableName) {
  if (!TableName) return [];
  const items = [];
  let ExclusiveStartKey;
  do {
    const result = await dynamo.send(new ScanCommand({ TableName, ExclusiveStartKey }));
    items.push(...(result.Items || []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function queryByTenant(TableName, tenantId) {
  if (!TableName || !tenantId) return [];
  const result = await dynamo.send(new QueryCommand({
    TableName,
    IndexName: "tenant_id-index",
    KeyConditionExpression: "tenant_id = :tenant_id",
    ExpressionAttributeValues: { ":tenant_id": tenantId }
  }));
  return result.Items || [];
}

async function queryByIndex(TableName, IndexName, keyName, keyValue) {
  if (!TableName || !keyValue) return [];
  const result = await dynamo.send(new QueryCommand({
    TableName,
    IndexName,
    KeyConditionExpression: "#key = :value",
    ExpressionAttributeNames: { "#key": keyName },
    ExpressionAttributeValues: { ":value": keyValue }
  }));
  return result.Items || [];
}

async function getById(TableName, Key) {
  if (!TableName || !Key) return null;
  const result = await dynamo.send(new GetCommand({ TableName, Key }));
  return result.Item || null;
}

async function putUnique(TableName, Item, keyName) {
  if (!TableName) throw new Error("table_not_configured");
  await dynamo.send(new PutCommand({
    TableName,
    Item,
    ConditionExpression: `attribute_not_exists(${keyName})`
  }));
}

async function requestOrRefreshCertificate(domain, now) {
  const [certificate] = await queryByIndex(tables.certificates, "domain_id-index", "domain_id", domain.domain_id);
  if (!certificate) throw httpError(409, "certificate_record_not_found");

  if (certificate.certificate_arn) {
    return refreshCertificateRecord(certificate);
  }

  const request = await acm.send(new RequestCertificateCommand({
    DomainName: domain.domain_name,
    ValidationMethod: "DNS",
    IdempotencyToken: crypto.createHash("sha256").update(domain.domain_id).digest("hex").slice(0, 32),
    Options: { CertificateTransparencyLoggingPreference: "ENABLED" },
    Tags: [
      { Key: "ManagedBy", Value: "FortressNet" },
      { Key: "TenantId", Value: domain.tenant_id },
      { Key: "DomainId", Value: domain.domain_id }
    ]
  }));

  const requested = {
    ...certificate,
    certificate_arn: request.CertificateArn,
    status: "pending_dns_validation",
    requested_at: now,
    updated_at: now
  };
  await dynamo.send(new PutCommand({ TableName: tables.certificates, Item: requested }));

  // ACM can be eventually consistent immediately after RequestCertificate.
  try {
    return await refreshCertificateRecord(requested);
  } catch (error) {
    if (error?.name !== "ResourceNotFoundException") throw error;
    return requested;
  }
}

async function refreshCertificateRecord(certificate) {
  const response = await acm.send(new DescribeCertificateCommand({ CertificateArn: certificate.certificate_arn }));
  const acmCertificate = response.Certificate;
  if (!acmCertificate) throw httpError(502, "certificate_describe_failed");

  const now = new Date().toISOString();
  const refreshed = {
    ...certificate,
    status: acmCertificate.Status || "unknown",
    acm_status: acmCertificate.Status || "unknown",
    validation_records: (acmCertificate.DomainValidationOptions || []).flatMap((option) => {
      const record = option.ResourceRecord;
      return record ? [{
        domain_name: option.DomainName,
        validation_status: option.ValidationStatus,
        name: record.Name,
        type: record.Type,
        value: record.Value
      }] : [];
    }),
    issued_at: acmCertificate.IssuedAt ? new Date(acmCertificate.IssuedAt).toISOString() : "",
    not_after: acmCertificate.NotAfter ? new Date(acmCertificate.NotAfter).toISOString() : "",
    failure_reason: acmCertificate.FailureReason || "",
    updated_at: now
  };
  await dynamo.send(new PutCommand({ TableName: tables.certificates, Item: refreshed }));

  if (acmCertificate.Status === "ISSUED") {
    await dynamo.send(new UpdateCommand({
      TableName: tables.domains,
      Key: { domain_id: certificate.domain_id },
      UpdateExpression: "SET #status = :status, onboarding_step = :step, updated_at = :updated_at",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": "certificate_issued_pending_edge",
        ":step": "edge_provisioning",
        ":updated_at": now
      }
    }));
  }
  return refreshed;
}

async function audit(action, tenantId, payload, actor = null) {
  try {
    const bucket = process.env.AUDIT_LOG_BUCKET;
    if (!bucket) return;

    const now = new Date();
    const key = [
      "control-plane",
      `year=${now.getUTCFullYear()}`,
      `month=${String(now.getUTCMonth() + 1).padStart(2, "0")}`,
      `day=${String(now.getUTCDate()).padStart(2, "0")}`,
      `${now.toISOString()}-${crypto.randomUUID()}.json`
    ].join("/");

    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: "application/json",
      Body: JSON.stringify({ action, tenant_id: tenantId, actor: publicActor(actor), payload, at: now.toISOString() })
    }));
  } catch (error) {
    console.warn("audit_write_failed", error?.message || error);
  }
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function sortByDate(items) {
  return [...items].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

function clean(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  const email = clean(value).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

function normalizeDomain(value) {
  const domain = clean(value).toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return "";
  return domain;
}

function normalizeOriginUrl(value) {
  try {
    const url = new URL(clean(value));
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    if (!host || host === "localhost" || host.endsWith(".local")) return null;
    if (isBlockedIpAddress(host)) return null;
    url.hash = "";
    url.search = "";
    return url;
  } catch {
    return null;
  }
}

function isBlockedIpAddress(host) {
  const normalized = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (isPrivateIpv4(normalized)) return true;
  if (!normalized.includes(":")) return false;
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("::ffff:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}

function isPrivateIpv4(host) {
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function compileWafRules(policy) {
  const action = ["block", "emergency_lockdown"].includes(policy.mode) ? "BLOCK" : "COUNT";
  const managedOverride = action === "BLOCK" ? "none" : "count";
  const baseRules = [
    {
      name: "AWS-AWSManagedRulesCommonRuleSet",
      type: "managed_rule_group",
      vendor: "AWS",
      rule_group: "AWSManagedRulesCommonRuleSet",
      override_action: managedOverride
    },
    {
      name: "AWS-AWSManagedRulesKnownBadInputsRuleSet",
      type: "managed_rule_group",
      vendor: "AWS",
      rule_group: "AWSManagedRulesKnownBadInputsRuleSet",
      override_action: managedOverride
    },
    {
      name: "AWS-AWSManagedRulesSQLiRuleSet",
      type: "managed_rule_group",
      vendor: "AWS",
      rule_group: "AWSManagedRulesSQLiRuleSet",
      override_action: managedOverride
    },
    {
      name: "FortressNetRateLimit",
      type: "rate_based_rule",
      aggregate_key_type: "IP",
      limit: Number(policy.rate_limit || 2000),
      evaluation_window_sec: 300,
      action
    }
  ];

  if (policy.mode === "emergency_lockdown") {
    baseRules.push({
      name: "FortressNetEmergencyLockdown",
      type: "custom_rule",
      expression: "allowlist_required",
      action: "BLOCK"
    });
  }

  return baseRules;
}

function slugify(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 42) || "tenant";
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  return clean(value).split(",").map(clean).filter(Boolean);
}

function hashSecret(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function publicApiKey(apiKey) {
  if (!apiKey) return {};
  const { key_hash, ...safe } = apiKey;
  return safe;
}

function redactUser(user) {
  return {
    user_id: user.user_id,
    tenant_id: user.tenant_id,
    email: user.email,
    roles: user.roles,
    scopes: user.scopes,
    status: user.status
  };
}

function publicActor(actor) {
  if (!actor) return null;
  return {
    type: actor.type,
    subject: actor.subject,
    tenant_id: actor.tenant_id,
    roles: actor.roles,
    scopes: actor.scopes
  };
}

function actorProfileId(actor) {
  return actor?.subject ? `profile_${actor.subject}` : "profile_bootstrap-admin";
}

function defaultProfile(profileId) {
  return {
    profile_id: profileId,
    display_name: "",
    email: "",
    timezone: "UTC",
    locale: "en-US",
    notification_email: true,
    notification_security: true
  };
}
