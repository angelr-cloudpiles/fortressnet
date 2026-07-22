import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 80);
const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
const s3 = new S3Client({ region });

const tables = {
  tenants: process.env.TENANTS_TABLE,
  domains: process.env.DOMAINS_TABLE,
  policies: process.env.SECURITY_POLICIES_TABLE,
  entitlements: process.env.ENTITLEMENTS_TABLE,
  users: process.env.USERS_TABLE,
  apiKeys: process.env.API_KEYS_TABLE,
  idpConnections: process.env.IDP_CONNECTIONS_TABLE,
  profiles: process.env.PROFILES_TABLE
};

const roleScopes = {
  platform_owner: ["*"],
  tenant_admin: ["tenant:read", "tenant:write", "domain:read", "domain:write", "policy:read", "policy:write", "identity:read", "identity:write", "billing:read", "profile:write"],
  security_admin: ["tenant:read", "domain:read", "domain:write", "policy:read", "policy:write", "events:read", "reports:read", "profile:write"],
  security_analyst: ["tenant:read", "domain:read", "policy:read", "events:read", "reports:read", "profile:write"],
  billing_admin: ["tenant:read", "billing:read", "billing:write", "profile:write"],
  read_only: ["tenant:read", "domain:read", "policy:read", "events:read", "reports:read", "billing:read", "identity:read", "profile:write"]
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
    const [tenants, domains, policies, entitlements, users, apiKeys, idpConnections, profiles] = await Promise.all([
      scanTable(tables.tenants),
      scanTable(tables.domains),
      scanTable(tables.policies),
      scanTable(tables.entitlements),
      scanTable(tables.users),
      scanTable(tables.apiKeys),
      scanTable(tables.idpConnections),
      scanTable(tables.profiles)
    ]);

    res.json({
      tenants: sortByDate(tenants),
      domains: sortByDate(domains),
      policies: sortByDate(policies),
      entitlements: sortByDate(entitlements),
      users: sortByDate(users),
      api_keys: sortByDate(apiKeys).map(publicApiKey),
      idp_connections: sortByDate(idpConnections),
      profiles: sortByDate(profiles)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/tenants", requireScope("tenant:write"), async (req, res, next) => {
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

app.get("/api/tenants", requireScope("tenant:read"), async (_req, res, next) => {
  try {
    res.json({ tenants: sortByDate(await scanTable(tables.tenants)) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/domains", requireScope("domain:write"), async (req, res, next) => {
  try {
    const body = req.body || {};
    const tenantId = clean(body.tenant_id);
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
      cname_target: `${tenantId.replaceAll("_", "-")}.edge.fortressnet.app`,
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
    const tenantId = clean(req.query.tenant_id);
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

app.post("/api/policies", requireScope("policy:write"), async (req, res, next) => {
  try {
    const body = req.body || {};
    const tenantId = clean(body.tenant_id);
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
    const tenantId = clean(req.query.tenant_id);
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

app.get("/api/events", requireScope("events:read"), (_req, res) => {
  res.json({ events: [] });
});

app.get("/api/reports", requireScope("reports:read"), (_req, res) => {
  res.json({ reports: [] });
});

app.get("/api/users", requireScope("identity:read"), async (req, res, next) => {
  try {
    const tenantId = clean(req.query.tenant_id);
    const users = tenantId ? await queryByTenant(tables.users, tenantId) : await scanTable(tables.users);
    res.json({ users: sortByDate(users) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/users", requireScope("identity:write"), async (req, res, next) => {
  try {
    const body = req.body || {};
    const tenantId = clean(body.tenant_id) || "platform";
    const email = normalizeEmail(body.email);
    const displayName = clean(body.display_name);
    const roles = normalizeList(body.roles).filter((role) => roleScopes[role]);
    const scopes = Array.from(new Set([...roles.flatMap((role) => roleScopes[role] || []), ...normalizeList(body.scopes)]));

    if (!email) return res.status(400).json({ error: "valid_email_required" });
    if (!displayName) return res.status(400).json({ error: "display_name_required" });
    if (!roles.length) return res.status(400).json({ error: "role_required" });

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
    const tenantId = clean(req.query.tenant_id);
    const apiKeys = tenantId ? await queryByTenant(tables.apiKeys, tenantId) : await scanTable(tables.apiKeys);
    res.json({ api_keys: sortByDate(apiKeys).map(publicApiKey) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/api-keys", requireScope("identity:write"), async (req, res, next) => {
  try {
    const body = req.body || {};
    const tenantId = clean(body.tenant_id);
    const name = clean(body.name);
    const scopes = normalizeList(body.scopes).filter((scope) => allowedScopes.includes(scope));
    if (!tenantId) return res.status(400).json({ error: "tenant_id_required" });
    if (!name) return res.status(400).json({ error: "api_key_name_required" });
    if (!scopes.length) return res.status(400).json({ error: "scope_required" });

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
    const tenantId = clean(req.query.tenant_id);
    const connections = tenantId ? await queryByTenant(tables.idpConnections, tenantId) : await scanTable(tables.idpConnections);
    res.json({ idp_connections: sortByDate(connections) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/idp-connections", requireScope("identity:write"), async (req, res, next) => {
  try {
    const body = req.body || {};
    const tenantId = clean(body.tenant_id);
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
  res.status(500).json({ error: "internal_error" });
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
