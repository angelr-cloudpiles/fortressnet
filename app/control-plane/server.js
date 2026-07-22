import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
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
  entitlements: process.env.ENTITLEMENTS_TABLE
};

const platformConfig = parseJson(process.env.PLATFORM_CONFIG_SECRET, {});
const managementToken = platformConfig.management_bootstrap_token || process.env.MANAGEMENT_BOOTSTRAP_TOKEN;

app.use(express.json({ limit: "256kb" }));

app.get("/healthz", (_req, res) => {
  res.type("text/plain").send("ok\n");
});

app.get("/api/platform", (_req, res) => {
  res.json({
    environment: process.env.FORTRESSNET_ENV || "unknown",
    auth_mode: "bootstrap_token",
    cognito_user_pool_id: process.env.COGNITO_USER_POOL_ID || null,
    cognito_app_client_id: process.env.COGNITO_APP_CLIENT_ID || null,
    management_ready: Boolean(managementToken),
    tables_ready: Object.fromEntries(Object.entries(tables).map(([key, value]) => [key, Boolean(value)]))
  });
});

app.use("/api", requireManagementAccess);

app.get("/api/management/state", async (_req, res, next) => {
  try {
    const [tenants, domains, policies, entitlements] = await Promise.all([
      scanTable(tables.tenants),
      scanTable(tables.domains),
      scanTable(tables.policies),
      scanTable(tables.entitlements)
    ]);

    res.json({
      tenants: sortByDate(tenants),
      domains: sortByDate(domains),
      policies: sortByDate(policies),
      entitlements: sortByDate(entitlements)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/tenants", async (req, res, next) => {
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
    await audit("tenant.created", tenant.tenant_id, tenant);
    res.status(201).json({ tenant });
  } catch (error) {
    next(error);
  }
});

app.get("/api/tenants", async (_req, res, next) => {
  try {
    res.json({ tenants: sortByDate(await scanTable(tables.tenants)) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/domains", async (req, res, next) => {
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
    await audit("domain.created", tenantId, domain);
    res.status(201).json({ domain });
  } catch (error) {
    next(error);
  }
});

app.get("/api/domains", async (req, res, next) => {
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

app.post("/api/policies", async (req, res, next) => {
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
    await audit("policy.created", tenantId, policy);
    res.status(201).json({ policy });
  } catch (error) {
    next(error);
  }
});

app.get("/api/policies", async (req, res, next) => {
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

app.get("/api/events", (_req, res) => {
  res.json({ events: [] });
});

app.get("/api/reports", (_req, res) => {
  res.json({ reports: [] });
});

app.use(express.static(path.join(__dirname, "dist")));
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "internal_error" });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`FortressNet control plane listening on ${port}`);
});

function requireManagementAccess(req, res, next) {
  if (!managementToken) return res.status(503).json({ error: "management_token_not_configured" });

  const auth = req.headers.authorization || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  const header = req.headers["x-fortressnet-admin-token"] || "";
  const supplied = String(bearer || header);

  if (!timingSafeEqual(supplied, managementToken)) {
    return res.status(401).json({ error: "management_access_required" });
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

async function audit(action, tenantId, payload) {
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
      Body: JSON.stringify({ action, tenant_id: tenantId, payload, at: now.toISOString() })
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

function normalizeDomain(value) {
  const domain = clean(value).toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return "";
  return domain;
}

function slugify(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 42) || "tenant";
}
