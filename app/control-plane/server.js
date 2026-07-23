import crypto from "node:crypto";
import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { ACMClient, DescribeCertificateCommand, RequestCertificateCommand } from "@aws-sdk/client-acm";
import { CloudFrontClient, CreateDistributionCommand, CreateResponseHeadersPolicyCommand, GetDistributionCommand, GetDistributionConfigCommand, UpdateDistributionCommand } from "@aws-sdk/client-cloudfront";
import { CloudWatchLogsClient, CreateLogGroupCommand, FilterLogEventsCommand, PutRetentionPolicyCommand } from "@aws-sdk/client-cloudwatch-logs";
import { AdminAddUserToGroupCommand, AdminCreateUserCommand, AdminDeleteUserCommand, AssociateSoftwareTokenCommand, CreateIdentityProviderCommand, CognitoIdentityProviderClient, DescribeUserPoolClientCommand, SetUserMFAPreferenceCommand, UpdateUserPoolClientCommand, VerifySoftwareTokenCommand } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, ScanCommand, TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ChangeResourceRecordSetsCommand, CreateHostedZoneCommand, CreateKeySigningKeyCommand, EnableHostedZoneDNSSECCommand, GetDNSSECCommand, ListResourceRecordSetsCommand, Route53Client } from "@aws-sdk/client-route-53";
import { CreateVerifiedAccessEndpointCommand, CreateVerifiedAccessTrustProviderCommand, DescribeVerifiedAccessEndpointsCommand, EC2Client } from "@aws-sdk/client-ec2";
import { BatchMeterUsageCommand, MarketplaceMeteringClient } from "@aws-sdk/client-marketplace-metering";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { CreateIPSetCommand, CreateWebACLCommand, DeleteIPSetCommand, GetIPSetCommand, GetWebACLCommand, ListWebACLsCommand, PutLoggingConfigurationCommand, UpdateWebACLCommand, WAFV2Client } from "@aws-sdk/client-wafv2";
import { CognitoJwtVerifier } from "aws-jwt-verify";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 80);
const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
const s3 = new S3Client({ region });
// CloudFront only accepts ACM certificates issued in us-east-1.
const acm = new ACMClient({ region: "us-east-1" });
const cloudfront = new CloudFrontClient({ region: "us-east-1" });
const waf = new WAFV2Client({ region: "us-east-1" });
const cloudwatchLogs = new CloudWatchLogsClient({ region: "us-east-1" });
const cognito = new CognitoIdentityProviderClient({ region });
const route53 = new Route53Client({ region });
const ec2 = new EC2Client({ region });
const marketplaceMetering = new MarketplaceMeteringClient({ region });
const cognitoVerifier = process.env.COGNITO_USER_POOL_ID && process.env.COGNITO_APP_CLIENT_ID
  ? CognitoJwtVerifier.create({ userPoolId: process.env.COGNITO_USER_POOL_ID, tokenUse: "id", clientId: process.env.COGNITO_APP_CLIENT_ID })
  : null;
const cognitoAccessVerifier = process.env.COGNITO_USER_POOL_ID && process.env.COGNITO_APP_CLIENT_ID
  ? CognitoJwtVerifier.create({ userPoolId: process.env.COGNITO_USER_POOL_ID, tokenUse: "access", clientId: process.env.COGNITO_APP_CLIENT_ID })
  : null;

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
  originHealthEvents: process.env.ORIGIN_HEALTH_EVENTS_TABLE,
  operationLocks: process.env.OPERATION_LOCKS_TABLE,
  originPools: process.env.ORIGIN_POOLS_TABLE,
  certificates: process.env.CERTIFICATES_TABLE,
  wafChangeSets: process.env.WAF_CHANGE_SETS_TABLE,
  edgeDeployments: process.env.EDGE_DEPLOYMENTS_TABLE,
  approvals: process.env.APPROVALS_TABLE,
  dnsZones: process.env.DNS_ZONES_TABLE,
  dnsRecords: process.env.DNS_RECORDS_TABLE,
  aiFindings: process.env.AI_FINDINGS_TABLE,
  ztnaApplications: process.env.ZTNA_APPLICATIONS_TABLE,
  apiInventory: process.env.API_INVENTORY_TABLE,
  apiSchemas: process.env.API_SCHEMAS_TABLE,
  wafEvents: process.env.WAF_EVENTS_TABLE,
  dmarcConfigurations: process.env.DMARC_CONFIGURATIONS_TABLE,
  dmarcReports: process.env.DMARC_REPORTS_TABLE,
  clientSecurityEvents: process.env.CLIENT_SECURITY_EVENTS_TABLE,
  marketplaceUsage: process.env.MARKETPLACE_USAGE_TABLE
};

const roleScopes = {
  platform_owner: ["*"],
  tenant_admin: ["tenant:read", "tenant:write", "domain:read", "domain:write", "policy:read", "policy:write", "edge:read", "edge:write", "edge:approve", "identity:read", "identity:write", "billing:read", "profile:write", "ai:read"],
  security_admin: ["tenant:read", "domain:read", "domain:write", "policy:read", "policy:write", "edge:read", "edge:write", "edge:approve", "events:read", "reports:read", "profile:write", "ai:read"],
  security_analyst: ["tenant:read", "domain:read", "policy:read", "edge:read", "events:read", "reports:read", "profile:write", "ai:read"],
  billing_admin: ["tenant:read", "billing:read", "billing:write", "profile:write"],
  read_only: ["tenant:read", "domain:read", "policy:read", "edge:read", "events:read", "reports:read", "billing:read", "identity:read", "profile:write"]
};

const planCatalog = Object.freeze({
  pilot: {
    label: "Pilot",
    billing_status: "pilot_pending_contract",
    limits: { domains: 1, users: 5, api_keys: 2, idp_connections: 1, dns_zones: 1, policies: 3, log_retention_days: 30 }
  },
  business: {
    label: "Business",
    billing_status: "contract_pending",
    limits: { domains: 10, users: 25, api_keys: 10, idp_connections: 3, dns_zones: 10, policies: 25, log_retention_days: 90 }
  },
  enterprise: {
    label: "Enterprise",
    billing_status: "contract_pending",
    limits: { domains: 100, users: 250, api_keys: 100, idp_connections: 25, dns_zones: 100, policies: 250, log_retention_days: 365 }
  }
});

const supportedWafCountries = new Set([
  "AR", "AU", "BE", "BR", "CA", "CH", "CL", "CO", "DE", "DK", "ES", "FI", "FR", "GB", "HK", "IE", "IN", "IT", "JP", "KR", "MX", "NL", "NO", "NZ", "PE", "PL", "PT", "SE", "SG", "US", "ZA"
]);

const allowedScopes = Array.from(new Set(Object.values(roleScopes).flat())).filter((scope) => scope !== "*").sort();

const platformConfig = parseJson(process.env.PLATFORM_CONFIG_SECRET, {});
const managementToken = platformConfig.management_bootstrap_token || process.env.MANAGEMENT_BOOTSTRAP_TOKEN;
const cognitoHostedUiOrigin = safeHttpsOrigin(process.env.COGNITO_HOSTED_UI_URL);

app.disable("x-powered-by");
app.use(securityHeaders);
app.use(express.json({ type: ["application/json", "application/csp-report", "application/reports+json"], limit: "256kb" }));

app.get("/healthz", (_req, res) => {
  res.type("text/plain").send("ok\n");
});

app.get("/api/platform", (_req, res) => {
  res.json({
    environment: process.env.FORTRESSNET_ENV || "unknown",
    auth_mode: "cognito_id_token_or_api_key_or_recovery_token",
    cognito_user_pool_id: process.env.COGNITO_USER_POOL_ID || null,
    cognito_app_client_id: process.env.COGNITO_APP_CLIENT_ID || null,
    cognito_hosted_ui_url: process.env.COGNITO_HOSTED_UI_URL || null,
    management_ready: Boolean(managementToken),
    roles: Object.keys(roleScopes),
    scopes: allowedScopes,
    tables_ready: Object.fromEntries(Object.entries(tables).map(([key, value]) => [key, Boolean(value)]))
  });
});

app.get("/api/auth/session", requireManagementAccess, (req, res) => {
  res.json({ actor: publicActor(req.actor) });
});

// Browsers send CSP reports without a console session. The random deployment
// token and exact protected-domain validation keep this ingestion path scoped.
app.post("/api/client-security/reports/:token", async (req, res) => {
  try {
    const deployment = (await scanTable(tables.edgeDeployments)).find((item) => timingSafeEqual(item.client_security_token || "", clean(req.params.token)));
    if (!deployment) return res.status(404).end();
    const report = normalizeClientSecurityReport(req.body, deployment);
    if (!report) return res.status(204).end();
    await putUnique(tables.clientSecurityEvents, report, "event_id").catch((error) => {
      if (error?.name !== "ConditionalCheckFailedException") throw error;
    });
    res.status(204).end();
  } catch (error) {
    console.warn("client_security_report_rejected", error?.message || error);
    res.status(204).end();
  }
});

app.use("/api", requireManagementAccess);

app.get("/api/management/state", requireScope("tenant:read"), async (req, res, next) => {
  try {
    const [tenants, domains, policies, entitlements, users, apiKeys, idpConnections, profiles, origins, originPools, certificates, wafChangeSets, edgeDeployments, approvals, dnsZones, dnsRecords, aiFindings, ztnaApplications, dmarcConfigurations] = await Promise.all([
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
      scanTable(tables.wafChangeSets),
      scanTable(tables.edgeDeployments),
      scanTable(tables.approvals),
      scanTable(tables.dnsZones),
      scanTable(tables.dnsRecords),
      scanTable(tables.aiFindings),
      scanTable(tables.ztnaApplications),
      scanTable(tables.dmarcConfigurations)
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
      waf_change_sets: sortByDate(scopeItems(req.actor, wafChangeSets)),
      edge_deployments: sortByDate(scopeItems(req.actor, edgeDeployments)),
      approvals: sortByDate(scopeItems(req.actor, approvals)),
      dns_zones: sortByDate(scopeItems(req.actor, dnsZones)),
      dns_records: sortByDate(scopeItems(req.actor, dnsRecords)),
      ai_findings: sortByDate(scopeItems(req.actor, aiFindings)),
      ztna_applications: sortByDate(scopeItems(req.actor, ztnaApplications)),
      dmarc_configurations: sortByDate(scopeItems(req.actor, dmarcConfigurations))
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
    await enforceTenantLimit(tenantId, "domains", (await queryByTenant(tables.domains, tenantId)).length);

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
    const plan = normalizePlan(body.plan);
    if (!plan) return res.status(400).json({ error: "supported_plan_required" });

    const now = new Date().toISOString();
    const tenant = {
      tenant_id: `tenant_${slugify(name)}_${crypto.randomBytes(3).toString("hex")}`,
      name,
      status: clean(body.status) || "active",
      plan,
      created_at: now,
      updated_at: now
    };
    const entitlement = createEntitlement(tenant, now);
    await dynamo.send(new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName: tables.tenants, Item: tenant, ConditionExpression: "attribute_not_exists(tenant_id)" } },
        { Put: { TableName: tables.entitlements, Item: entitlement, ConditionExpression: "attribute_not_exists(customer_identifier)" } }
      ]
    }));
    await audit("tenant.created", tenant.tenant_id, { tenant, entitlement }, req.actor);
    res.status(201).json({ tenant, entitlement });
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

app.get("/api/billing/summary", requireScope("billing:read"), async (req, res, next) => {
  try {
    const tenantId = tenantForActor(req.actor, clean(req.query.tenant_id));
    if (!tenantId) return res.status(400).json({ error: "tenant_id_required" });
    const [tenant, entitlement, domains, users, apiKeys, idpConnections, dnsZones, policies, deployments] = await Promise.all([
      getById(tables.tenants, { tenant_id: tenantId }),
      getTenantEntitlement(tenantId),
      queryByTenant(tables.domains, tenantId),
      queryByTenant(tables.users, tenantId),
      queryByTenant(tables.apiKeys, tenantId),
      queryByTenant(tables.idpConnections, tenantId),
      queryByTenant(tables.dnsZones, tenantId),
      queryByTenant(tables.policies, tenantId),
      queryByTenant(tables.edgeDeployments, tenantId)
    ]);
    if (!tenant || !entitlement) return res.status(404).json({ error: "tenant_entitlement_not_found" });
    const events = await collectSecurityEvents(deployments, 5000);
    const usage = {
      domains: domains.length,
      users: users.length,
      api_keys: apiKeys.filter((item) => item.status === "active").length,
      idp_connections: idpConnections.filter((item) => item.status === "active").length,
      dns_zones: dnsZones.length,
      policies: policies.length,
      observed_waf_requests: events.length,
      blocked_waf_requests: events.filter((event) => event.action === "BLOCK").length
    };
    res.json({ tenant, entitlement: publicEntitlement(entitlement), usage, usage_period: currentUsagePeriod() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/marketplace/status", requirePlatformActor, requireScope("billing:read"), async (_req, res) => {
  res.json({
    integration: "aws_marketplace_saas",
    enabled: Boolean(process.env.MARKETPLACE_PRODUCT_CODE),
    product_code_configured: Boolean(process.env.MARKETPLACE_PRODUCT_CODE),
    required_before_live_metering: process.env.MARKETPLACE_PRODUCT_CODE ? [] : ["AWS Marketplace SaaS product code"],
    metering_dimensions: ["protected_domains", "protected_requests"]
  });
});

app.post("/api/marketplace/usage/submit", requirePlatformActor, requireScope("billing:write"), async (req, res, next) => {
  try {
    const tenantId = clean(req.body?.tenant_id);
    const dimension = clean(req.body?.dimension);
    if (!tenantId || !["protected_domains", "protected_requests"].includes(dimension)) return res.status(400).json({ error: "tenant_id_and_supported_dimension_required" });
    const entitlement = await getTenantEntitlement(tenantId);
    if (!entitlement?.marketplace_customer_identifier || !process.env.MARKETPLACE_PRODUCT_CODE) return res.status(409).json({ error: "marketplace_customer_and_product_code_required" });
    const summary = await buildMarketplaceUsage(tenantId, dimension);
    const response = await marketplaceMetering.send(new BatchMeterUsageCommand({
      ProductCode: process.env.MARKETPLACE_PRODUCT_CODE,
      UsageRecords: [{ CustomerIdentifier: entitlement.marketplace_customer_identifier, Dimension: dimension, Quantity: summary.quantity, Timestamp: new Date() }]
    }));
    const now = new Date().toISOString();
    const usage = { usage_id: `mpu_${crypto.randomUUID()}`, tenant_id: tenantId, dimension, quantity: summary.quantity, period: currentUsagePeriod(), status: response.UnprocessedRecords?.length ? "unprocessed" : "submitted", marketplace_response: { unprocessed_records: response.UnprocessedRecords?.length || 0 }, created_at: now, updated_at: now };
    await putUnique(tables.marketplaceUsage, usage, "usage_id");
    await audit("marketplace.usage_submitted", tenantId, { usage_id: usage.usage_id, dimension, quantity: usage.quantity, status: usage.status }, req.actor);
    res.status(202).json({ usage });
  } catch (error) { next(error); }
});

app.put("/api/tenants/:tenantId/entitlement", requirePlatformActor, requireScope("billing:write"), async (req, res, next) => {
  try {
    const tenantId = clean(req.params.tenantId);
    const tenant = await getById(tables.tenants, { tenant_id: tenantId });
    const plan = normalizePlan(req.body?.plan);
    if (!tenant) return res.status(404).json({ error: "tenant_not_found" });
    if (!plan) return res.status(400).json({ error: "supported_plan_required" });
    const entitlement = createEntitlement({ ...tenant, plan }, new Date().toISOString());
    await dynamo.send(new PutCommand({ TableName: tables.entitlements, Item: entitlement }));
    await dynamo.send(new UpdateCommand({
      TableName: tables.tenants,
      Key: { tenant_id: tenantId },
      UpdateExpression: "SET #plan = :plan, updated_at = :updated_at",
      ExpressionAttributeNames: { "#plan": "plan" },
      ExpressionAttributeValues: { ":plan": plan, ":updated_at": entitlement.updated_at }
    }));
    await audit("tenant.entitlement_updated", tenantId, publicEntitlement(entitlement), req.actor);
    res.json({ entitlement: publicEntitlement(entitlement) });
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
    await enforceTenantLimit(tenantId, "domains", (await queryByTenant(tables.domains, tenantId)).length);

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

app.get("/api/origin-health-events", requireScope("edge:read"), async (req, res, next) => {
  try {
    const tenantId = tenantForActor(req.actor, clean(req.query.tenant_id));
    if (!tenantId) return res.status(400).json({ error: "tenant_id_required" });
    const originId = clean(req.query.origin_id);
    const events = originId
      ? (await queryByIndex(tables.originHealthEvents, "origin_id-index", "origin_id", originId)).filter((event) => event.tenant_id === tenantId)
      : await queryByTenant(tables.originHealthEvents, tenantId);
    res.json({ origin_health_events: sortByDate(events).slice(0, 200) });
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
    await assertOriginConfigurationEditable(tenantId, domainId);

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

app.post("/api/origin-pools", requireScope("edge:write"), async (req, res, next) => {
  try {
    const body = req.body || {};
    const tenantId = tenantForActor(req.actor, clean(body.tenant_id));
    const domainId = clean(body.domain_id);
    if (!tenantId) return res.status(400).json({ error: "tenant_id_required" });
    if (!domainId) return res.status(400).json({ error: "domain_id_required" });
    const domain = await getById(tables.domains, { domain_id: domainId });
    if (!domain || domain.tenant_id !== tenantId) return res.status(404).json({ error: "domain_not_found" });
    await assertOriginConfigurationEditable(tenantId, domainId);
    const existing = await queryByIndex(tables.originPools, "domain_id-index", "domain_id", domainId);
    if (existing.some((pool) => pool.tenant_id === tenantId)) return res.status(409).json({ error: "origin_pool_already_exists" });
    const configuration = await validateOriginPoolConfiguration(tenantId, domainId, body);
    const now = new Date().toISOString();
    const pool = {
      pool_id: `pool_${crypto.randomUUID()}`,
      tenant_id: tenantId,
      domain_id: domainId,
      name: clean(body.name) || "primary-pool",
      ...configuration,
      created_at: now,
      updated_at: now
    };
    await putUnique(tables.originPools, pool, "pool_id");
    await audit("origin_pool.created", tenantId, publicOriginPool(pool), req.actor);
    res.status(201).json({ origin_pool: pool });
  } catch (error) {
    next(error);
  }
});

app.put("/api/origin-pools/:poolId", requireScope("edge:write"), async (req, res, next) => {
  try {
    const pool = await getById(tables.originPools, { pool_id: clean(req.params.poolId) });
    if (!pool) return res.status(404).json({ error: "origin_pool_not_found" });
    tenantForActor(req.actor, pool.tenant_id);
    await assertOriginConfigurationEditable(pool.tenant_id, pool.domain_id);
    const configuration = await validateOriginPoolConfiguration(pool.tenant_id, pool.domain_id, req.body || {});
    const now = new Date().toISOString();
    const updated = {
      ...pool,
      name: clean(req.body?.name) || pool.name,
      ...configuration,
      updated_at: now
    };
    await dynamo.send(new PutCommand({ TableName: tables.originPools, Item: updated }));
    await audit("origin_pool.updated", pool.tenant_id, { before: publicOriginPool(pool), after: publicOriginPool(updated) }, req.actor);
    res.json({ origin_pool: updated });
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

app.post("/api/domains/:domainId/edge-deployment-request", requireScope("edge:write"), async (req, res, next) => {
  try {
    const domain = await getById(tables.domains, { domain_id: clean(req.params.domainId) });
    if (!domain) return res.status(404).json({ error: "domain_not_found" });
    tenantForActor(req.actor, domain.tenant_id);
    const certificates = await queryByIndex(tables.certificates, "domain_id-index", "domain_id", domain.domain_id);
    const pools = await queryByIndex(tables.originPools, "domain_id-index", "domain_id", domain.domain_id);
    const certificate = certificates.find((item) => item.certificate_arn && item.status === "ISSUED");
    const pool = pools.find((item) => item.tenant_id === domain.tenant_id);
    const origins = pool ? await loadPoolOrigins(pool) : [];
    const origin = origins[0];
    if (!certificate) return res.status(409).json({ error: "issued_certificate_required" });
    if (!pool || !origin || origin.status !== "healthy") return res.status(409).json({ error: "healthy_origin_pool_required" });
    if (pool.failover_enabled && (origins.length !== 2 || origins.some((item) => item.status !== "healthy"))) return res.status(409).json({ error: "healthy_failover_origin_required" });
    const existing = await queryByIndex(tables.edgeDeployments, "domain_id-index", "domain_id", domain.domain_id);
    if (existing.some((item) => !["failed", "rolled_back"].includes(item.status))) return res.status(409).json({ error: "edge_deployment_already_exists" });

    const now = new Date().toISOString();
    const deployment = {
      deployment_id: `edge_${crypto.randomUUID()}`,
      tenant_id: domain.tenant_id,
      domain_id: domain.domain_id,
      domain_name: domain.domain_name,
      origin_id: origin.origin_id,
      origin_pool_id: pool.pool_id,
      origin_ids: origins.map((item) => item.origin_id),
      failover_enabled: pool.failover_enabled === true,
      certificate_id: certificate.certificate_id,
      status: "pending_approval",
      requested_by: req.actor?.subject || "unknown",
      log_group_name: tenantWafLogGroup(domain.domain_id),
      created_at: now,
      updated_at: now
    };
    const approval = createApproval(domain.tenant_id, "edge_deployment", deployment.deployment_id, req.actor, now);
    await Promise.all([
      putUnique(tables.edgeDeployments, deployment, "deployment_id"),
      putUnique(tables.approvals, approval, "approval_id")
    ]);
    await audit("edge_deployment.requested", domain.tenant_id, { deployment, approval }, req.actor);
    res.status(201).json({ edge_deployment: deployment, approval });
  } catch (error) {
    next(error);
  }
});

app.get("/api/edge-deployments", requireScope("edge:read"), async (req, res, next) => {
  try {
    const tenantId = tenantForActor(req.actor, clean(req.query.tenant_id));
    const deployments = tenantId ? await queryByTenant(tables.edgeDeployments, tenantId) : await scanTable(tables.edgeDeployments);
    res.json({ edge_deployments: sortByDate(deployments) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/edge-deployments/:deploymentId/approve", requireScope("edge:approve"), async (req, res, next) => {
  try {
    const deployment = await getById(tables.edgeDeployments, { deployment_id: clean(req.params.deploymentId) });
    if (!deployment) return res.status(404).json({ error: "edge_deployment_not_found" });
    tenantForActor(req.actor, deployment.tenant_id);
    if (deployment.status !== "pending_approval") return res.status(409).json({ error: "edge_deployment_not_pending_approval" });
    if (!isPlatformActor(req.actor) && deployment.requested_by === req.actor?.subject) return res.status(409).json({ error: "separation_of_duties_required" });
    const now = new Date().toISOString();
    const result = await dynamo.send(new UpdateCommand({
      TableName: tables.edgeDeployments,
      Key: { deployment_id: deployment.deployment_id },
      UpdateExpression: "SET #status = :status, approved_by = :approved_by, approved_at = :approved_at, updated_at = :updated_at",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": "approved",
        ":approved_by": req.actor?.subject || "unknown",
        ":approved_at": now,
        ":updated_at": now
      },
      ReturnValues: "ALL_NEW"
    }));
    await approveSubject(deployment.tenant_id, "edge_deployment", deployment.deployment_id, req.actor, now);
    await audit("edge_deployment.approved", deployment.tenant_id, { deployment_id: deployment.deployment_id }, req.actor);
    res.json({ edge_deployment: result.Attributes });
  } catch (error) {
    next(error);
  }
});

app.post("/api/edge-deployments/:deploymentId/provision", requireScope("edge:write"), async (req, res, next) => {
  try {
    const deployment = await getById(tables.edgeDeployments, { deployment_id: clean(req.params.deploymentId) });
    if (!deployment) return res.status(404).json({ error: "edge_deployment_not_found" });
    tenantForActor(req.actor, deployment.tenant_id);
    if (deployment.status !== "approved") return res.status(409).json({ error: "approved_edge_deployment_required" });
    const domain = await getById(tables.domains, { domain_id: deployment.domain_id });
    const origin = await getById(tables.origins, { origin_id: deployment.origin_id });
    const certificate = await getById(tables.certificates, { certificate_id: deployment.certificate_id });
    if (!domain || !origin || !certificate || certificate.status !== "ISSUED") return res.status(409).json({ error: "edge_deployment_dependencies_not_ready" });
    const pool = deployment.origin_pool_id ? await getById(tables.originPools, { pool_id: deployment.origin_pool_id }) : null;
    const origins = pool ? await loadPoolOrigins(pool) : [origin];
    if (!origins.length || origins[0].origin_id !== origin.origin_id || origins.some((item) => item.status !== "healthy")) return res.status(409).json({ error: "healthy_origin_pool_required" });
    if (deployment.failover_enabled && origins.length !== 2) return res.status(409).json({ error: "healthy_failover_origin_required" });

    const provisioned = await provisionTenantEdge(deployment, domain, origins, certificate);
    await audit("edge_deployment.provisioned", deployment.tenant_id, publicEdgeDeployment(provisioned), req.actor);
    res.status(202).json({ edge_deployment: publicEdgeDeployment(provisioned) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/edge-deployments/:deploymentId/refresh", requireScope("edge:read"), async (req, res, next) => {
  try {
    const deployment = await getById(tables.edgeDeployments, { deployment_id: clean(req.params.deploymentId) });
    if (!deployment) return res.status(404).json({ error: "edge_deployment_not_found" });
    tenantForActor(req.actor, deployment.tenant_id);
    if (!deployment.distribution_id) return res.status(409).json({ error: "distribution_not_created" });
    const refreshed = await refreshEdgeDeployment(deployment);
    res.json({ edge_deployment: publicEdgeDeployment(refreshed) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/edge-deployments/:deploymentId/origin-update-request", requireScope("edge:write"), async (req, res, next) => {
  try {
    const deployment = await getById(tables.edgeDeployments, { deployment_id: clean(req.params.deploymentId) });
    if (!deployment) return res.status(404).json({ error: "edge_deployment_not_found" });
    tenantForActor(req.actor, deployment.tenant_id);
    if (!deployment.distribution_id || !["ready_for_cutover", "active"].includes(deployment.status)) return res.status(409).json({ error: "active_edge_deployment_required" });
    if (deployment.origin_update_status === "pending_approval") return res.status(409).json({ error: "origin_update_already_pending" });
    const requested = await validateOriginPoolConfiguration(deployment.tenant_id, deployment.domain_id, req.body || {});
    const now = new Date().toISOString();
    const approval = createApproval(deployment.tenant_id, "origin_update", deployment.deployment_id, req.actor, now);
    const updated = {
      ...deployment,
      origin_update: requested,
      origin_update_status: "pending_approval",
      origin_update_requested_by: req.actor?.subject || "unknown",
      origin_update_requested_at: now,
      updated_at: now
    };
    await Promise.all([
      dynamo.send(new PutCommand({ TableName: tables.edgeDeployments, Item: updated })),
      putUnique(tables.approvals, approval, "approval_id")
    ]);
    await audit("edge_deployment.origin_update_requested", deployment.tenant_id, { deployment_id: deployment.deployment_id, origin_update: requested, approval }, req.actor);
    res.status(201).json({ edge_deployment: publicEdgeDeployment(updated), approval });
  } catch (error) { next(error); }
});

app.post("/api/edge-deployments/:deploymentId/origin-update-approve", requireScope("edge:approve"), async (req, res, next) => {
  try {
    const deployment = await getById(tables.edgeDeployments, { deployment_id: clean(req.params.deploymentId) });
    if (!deployment) return res.status(404).json({ error: "edge_deployment_not_found" });
    tenantForActor(req.actor, deployment.tenant_id);
    if (deployment.origin_update_status !== "pending_approval") return res.status(409).json({ error: "origin_update_not_pending" });
    if (!isPlatformActor(req.actor) && deployment.origin_update_requested_by === req.actor?.subject) return res.status(409).json({ error: "separation_of_duties_required" });
    const now = new Date().toISOString();
    const updated = { ...deployment, origin_update_status: "approved", origin_update_approved_by: req.actor?.subject || "unknown", origin_update_approved_at: now, updated_at: now };
    await dynamo.send(new PutCommand({ TableName: tables.edgeDeployments, Item: updated }));
    await approveSubject(deployment.tenant_id, "origin_update", deployment.deployment_id, req.actor, now);
    await audit("edge_deployment.origin_update_approved", deployment.tenant_id, { deployment_id: deployment.deployment_id }, req.actor);
    res.json({ edge_deployment: publicEdgeDeployment(updated) });
  } catch (error) { next(error); }
});

app.post("/api/edge-deployments/:deploymentId/origin-update-apply", requireScope("edge:write"), async (req, res, next) => {
  try {
    const deployment = await getById(tables.edgeDeployments, { deployment_id: clean(req.params.deploymentId) });
    if (!deployment) return res.status(404).json({ error: "edge_deployment_not_found" });
    tenantForActor(req.actor, deployment.tenant_id);
    if (deployment.origin_update_status !== "approved" || !deployment.origin_update) return res.status(409).json({ error: "approved_origin_update_required" });
    const pool = await getById(tables.originPools, { pool_id: deployment.origin_pool_id });
    if (!pool) return res.status(409).json({ error: "origin_pool_not_found" });
    const proposedPool = { ...pool, ...deployment.origin_update };
    const origins = await loadPoolOrigins(proposedPool);
    if (!origins.length || origins.some((origin) => origin.status !== "healthy")) return res.status(409).json({ error: "healthy_origin_pool_required" });
    await updateCloudFrontOriginPool(deployment, proposedPool, origins);
    const now = new Date().toISOString();
    const completed = { ...deployment, origin_ids: proposedPool.origin_ids, failover_enabled: proposedPool.failover_enabled, origin_id: origins[0].origin_id, origin_update_status: "applied", origin_update_applied_at: now, origin_update: undefined, updated_at: now };
    await Promise.all([
      dynamo.send(new PutCommand({ TableName: tables.originPools, Item: { ...proposedPool, updated_at: now } })),
      dynamo.send(new PutCommand({ TableName: tables.edgeDeployments, Item: completed }))
    ]);
    await audit("edge_deployment.origin_update_applied", deployment.tenant_id, { deployment_id: deployment.deployment_id, origin_ids: completed.origin_ids }, req.actor);
    res.status(202).json({ edge_deployment: publicEdgeDeployment(completed) });
  } catch (error) { next(error); }
});

app.patch("/api/domains/:domainId/verify-cutover", requireScope("edge:write"), async (req, res, next) => {
  try {
    const domain = await getById(tables.domains, { domain_id: clean(req.params.domainId) });
    if (!domain) return res.status(404).json({ error: "domain_not_found" });
    tenantForActor(req.actor, domain.tenant_id);
    const [deployment] = await queryByIndex(tables.edgeDeployments, "domain_id-index", "domain_id", domain.domain_id);
    if (!deployment || deployment.status !== "ready_for_cutover") return res.status(409).json({ error: "ready_edge_deployment_required" });
    const cnameRecords = await dns.resolveCname(domain.domain_name).catch(() => []);
    const target = clean(deployment.distribution_domain_name).replace(/\.$/, "");
    const cutoverVerified = cnameRecords.some((record) => clean(record).replace(/\.$/, "") === target);
    const now = new Date().toISOString();
    const result = await dynamo.send(new UpdateCommand({
      TableName: tables.domains,
      Key: { domain_id: domain.domain_id },
      UpdateExpression: "SET #status = :status, onboarding_step = :step, cutover_last_checked_at = :checked, updated_at = :updated_at",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": cutoverVerified ? "active" : "pending_traffic_dns",
        ":step": cutoverVerified ? "active" : "traffic_dns_cutover",
        ":checked": now,
        ":updated_at": now
      },
      ReturnValues: "ALL_NEW"
    }));
    await audit("edge_deployment.cutover_checked", domain.tenant_id, { domain_id: domain.domain_id, cutoverVerified }, req.actor);
    res.json({ domain: result.Attributes, verified: cutoverVerified, cname_records: cnameRecords, required_target: target });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/origins/:originId/health-check", requireScope("edge:write"), async (req, res, next) => {
  try {
    const origin = await getById(tables.origins, { origin_id: clean(req.params.originId) });
    if (!origin) return res.status(404).json({ error: "origin_not_found" });
    tenantForActor(req.actor, origin.tenant_id);
    const checked = await recordOriginHealthCheck(origin, req.actor, "manual");
    res.json({ origin: checked.origin, health: checked.health });
  } catch (error) {
    next(error);
  }
});

app.get("/api/dns/zones", requireScope("domain:read"), async (req, res, next) => {
  try {
    const tenantId = tenantForActor(req.actor, clean(req.query.tenant_id));
    const zones = tenantId ? await queryByTenant(tables.dnsZones, tenantId) : await scanTable(tables.dnsZones);
    res.json({ dns_zones: sortByDate(zones) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/domains/:domainId/dns-zone", requireScope("domain:write"), async (req, res, next) => {
  try {
    const domain = await getById(tables.domains, { domain_id: clean(req.params.domainId) });
    if (!domain) return res.status(404).json({ error: "domain_not_found" });
    tenantForActor(req.actor, domain.tenant_id);
    if (!["verified_pending_certificate", "certificate_validation", "certificate_issued_pending_edge", "edge_provisioning", "pending_traffic_dns", "active"].includes(domain.status)) {
      return res.status(409).json({ error: "verified_domain_required_for_dns_management" });
    }
    const mode = clean(req.body?.mode) || "external_guided";
    if (!["external_guided", "route53_delegated"].includes(mode)) return res.status(400).json({ error: "unsupported_dns_mode" });
    const existing = (await queryByTenant(tables.dnsZones, domain.tenant_id)).find((zone) => zone.domain_id === domain.domain_id);
    if (existing) return res.status(409).json({ error: "dns_zone_already_exists" });
    await enforceTenantLimit(domain.tenant_id, "dns_zones", (await queryByTenant(tables.dnsZones, domain.tenant_id)).length);

    const now = new Date().toISOString();
    const zone = {
      zone_id: `zone_${crypto.randomUUID()}`,
      tenant_id: domain.tenant_id,
      domain_id: domain.domain_id,
      zone_name: domain.domain_name,
      mode,
      status: mode === "external_guided" ? "external_guidance_ready" : "creating",
      created_by: req.actor?.subject || "unknown",
      created_at: now,
      updated_at: now
    };
    if (mode === "route53_delegated") {
      const created = await route53.send(new CreateHostedZoneCommand({
        Name: domain.domain_name,
        CallerReference: `${zone.zone_id}-${now}`,
        HostedZoneConfig: { Comment: `FortressNet tenant ${domain.tenant_id}`, PrivateZone: false }
      }));
      zone.route53_zone_id = clean(created.HostedZone?.Id).replace("/hostedzone/", "");
      zone.name_servers = created.DelegationSet?.NameServers || [];
      zone.status = "awaiting_ns_delegation";
    }
    await putUnique(tables.dnsZones, zone, "zone_id");
    await audit("dns_zone.created", domain.tenant_id, zone, req.actor);
    res.status(201).json({ dns_zone: zone });
  } catch (error) {
    next(error);
  }
});

app.post("/api/dns/zones/:zoneId/records", requireScope("domain:write"), async (req, res, next) => {
  try {
    const zone = await getById(tables.dnsZones, { zone_id: clean(req.params.zoneId) });
    if (!zone) return res.status(404).json({ error: "dns_zone_not_found" });
    tenantForActor(req.actor, zone.tenant_id);
    if (zone.mode !== "route53_delegated" || !zone.route53_zone_id) return res.status(409).json({ error: "route53_delegated_zone_required" });
    const type = clean(req.body?.type).toUpperCase();
    const name = normalizeDnsRecordName(req.body?.name, zone.zone_name);
    const values = normalizeDnsRecordValues(req.body?.values, type);
    const ttl = Math.min(Math.max(Number(req.body?.ttl || 300), 60), 86400);
    if (!name || !["A", "AAAA", "CAA", "CNAME", "MX", "SRV", "TXT"].includes(type) || !values.length) return res.status(400).json({ error: "valid_dns_record_required" });
    const change = await route53.send(new ChangeResourceRecordSetsCommand({
      HostedZoneId: zone.route53_zone_id,
      ChangeBatch: {
        Comment: `FortressNet managed record for ${zone.tenant_id}`,
        Changes: [{
          Action: "UPSERT",
          ResourceRecordSet: { Name: name, Type: type, TTL: ttl, ResourceRecords: values.map((Value) => ({ Value })) }
        }]
      }
    }));
    const now = new Date().toISOString();
    const record = {
      record_id: `rec_${crypto.randomUUID()}`,
      tenant_id: zone.tenant_id,
      zone_id: zone.zone_id,
      name,
      type,
      values,
      ttl,
      change_id: clean(change.ChangeInfo?.Id),
      change_status: clean(change.ChangeInfo?.Status) || "PENDING",
      created_at: now,
      updated_at: now
    };
    await putUnique(tables.dnsRecords, record, "record_id");
    await audit("dns_record.upserted", zone.tenant_id, record, req.actor);
    res.status(201).json({ dns_record: record });
  } catch (error) {
    next(error);
  }
});

app.get("/api/dns/zones/:zoneId/records", requireScope("domain:read"), async (req, res, next) => {
  try {
    const zone = await getById(tables.dnsZones, { zone_id: clean(req.params.zoneId) });
    if (!zone) return res.status(404).json({ error: "dns_zone_not_found" });
    tenantForActor(req.actor, zone.tenant_id);
    if (zone.mode !== "route53_delegated" || !zone.route53_zone_id) return res.status(409).json({ error: "route53_delegated_zone_required" });
    const records = [];
    let StartRecordName;
    do {
      const page = await route53.send(new ListResourceRecordSetsCommand({ HostedZoneId: zone.route53_zone_id, StartRecordName, MaxItems: "300" }));
      records.push(...(page.ResourceRecordSets || []).map(publicRoute53Record));
      StartRecordName = page.IsTruncated ? page.NextRecordName : undefined;
    } while (StartRecordName);
    res.json({ records });
  } catch (error) { next(error); }
});

app.get("/api/dns/zones/:zoneId/export", requireScope("domain:read"), async (req, res, next) => {
  try {
    const zone = await getById(tables.dnsZones, { zone_id: clean(req.params.zoneId) });
    if (!zone) return res.status(404).json({ error: "dns_zone_not_found" });
    tenantForActor(req.actor, zone.tenant_id);
    if (zone.mode !== "route53_delegated" || !zone.route53_zone_id) return res.status(409).json({ error: "route53_delegated_zone_required" });
    const response = await route53.send(new ListResourceRecordSetsCommand({ HostedZoneId: zone.route53_zone_id }));
    res.json({ version: 1, zone_name: zone.zone_name, exported_at: new Date().toISOString(), records: (response.ResourceRecordSets || []).filter((record) => record.Type !== "NS" && record.Type !== "SOA").map(publicRoute53Record) });
  } catch (error) { next(error); }
});

app.post("/api/dns/zones/:zoneId/import", requireScope("domain:write"), async (req, res, next) => {
  try {
    const zone = await getById(tables.dnsZones, { zone_id: clean(req.params.zoneId) });
    if (!zone) return res.status(404).json({ error: "dns_zone_not_found" });
    tenantForActor(req.actor, zone.tenant_id);
    if (zone.mode !== "route53_delegated" || !zone.route53_zone_id) return res.status(409).json({ error: "route53_delegated_zone_required" });
    const requested = Array.isArray(req.body?.records) ? req.body.records.slice(0, 100) : [];
    const changes = requested.map((record) => normalizeImportDnsRecord(record, zone.zone_name)).filter(Boolean).map((record) => ({ Action: "UPSERT", ResourceRecordSet: record }));
    if (!changes.length) return res.status(400).json({ error: "valid_dns_import_records_required" });
    const change = await route53.send(new ChangeResourceRecordSetsCommand({ HostedZoneId: zone.route53_zone_id, ChangeBatch: { Comment: `FortressNet import for ${zone.tenant_id}`, Changes: changes } }));
    await audit("dns_zone.imported", zone.tenant_id, { zone_id: zone.zone_id, records: changes.length, change_id: clean(change.ChangeInfo?.Id) }, req.actor);
    res.status(202).json({ imported_records: changes.length, change_id: clean(change.ChangeInfo?.Id), status: clean(change.ChangeInfo?.Status) || "PENDING" });
  } catch (error) { next(error); }
});

app.delete("/api/dns/zones/:zoneId/records/:recordId", requireScope("domain:write"), async (req, res, next) => {
  try {
    const zone = await getById(tables.dnsZones, { zone_id: clean(req.params.zoneId) });
    const record = await getById(tables.dnsRecords, { record_id: clean(req.params.recordId) });
    if (!zone || !record || record.zone_id !== zone.zone_id) return res.status(404).json({ error: "dns_record_not_found" });
    tenantForActor(req.actor, zone.tenant_id);
    if (zone.mode !== "route53_delegated" || !zone.route53_zone_id) return res.status(409).json({ error: "route53_delegated_zone_required" });
    await route53.send(new ChangeResourceRecordSetsCommand({
      HostedZoneId: zone.route53_zone_id,
      ChangeBatch: { Comment: `FortressNet delete for ${zone.tenant_id}`, Changes: [{ Action: "DELETE", ResourceRecordSet: { Name: record.name, Type: record.type, TTL: record.ttl, ResourceRecords: record.values.map((Value) => ({ Value })) } }] }
    }));
    await dynamo.send(new UpdateCommand({ TableName: tables.dnsRecords, Key: { record_id: record.record_id }, UpdateExpression: "SET #status = :status, updated_at = :updated_at", ExpressionAttributeNames: { "#status": "status" }, ExpressionAttributeValues: { ":status": "deleted", ":updated_at": new Date().toISOString() } }));
    await audit("dns_record.deleted", zone.tenant_id, { record_id: record.record_id }, req.actor);
    res.status(204).end();
  } catch (error) { next(error); }
});

app.post("/api/dns/zones/:zoneId/dnssec/enable", requireScope("domain:write"), async (req, res, next) => {
  try {
    const zone = await getById(tables.dnsZones, { zone_id: clean(req.params.zoneId) });
    if (!zone) return res.status(404).json({ error: "dns_zone_not_found" });
    tenantForActor(req.actor, zone.tenant_id);
    if (zone.mode !== "route53_delegated" || !zone.route53_zone_id || !process.env.DNSSEC_KMS_KEY_ARN) return res.status(409).json({ error: "route53_delegated_zone_required" });
    const kskName = `fn-${zone.zone_id.slice(-20)}`;
    await route53.send(new CreateKeySigningKeyCommand({ HostedZoneId: zone.route53_zone_id, KeyManagementServiceArn: process.env.DNSSEC_KMS_KEY_ARN, Name: kskName, Status: "ACTIVE" })).catch((error) => {
      if (!["KeySigningKeyAlreadyExists", "InvalidKeySigningKeyStatus"].includes(error?.name)) throw error;
    });
    await route53.send(new EnableHostedZoneDNSSECCommand({ HostedZoneId: zone.route53_zone_id })).catch((error) => {
      if (error?.name !== "HostedZonePartiallyDelegated") throw error;
    });
    const now = new Date().toISOString();
    await dynamo.send(new PutCommand({ TableName: tables.dnsZones, Item: { ...zone, dnssec_status: "enabling", dnssec_requested_at: now, updated_at: now } }));
    await audit("dns_zone.dnssec_enable_requested", zone.tenant_id, { zone_id: zone.zone_id, ksk_name: kskName }, req.actor);
    res.status(202).json({ zone_id: zone.zone_id, dnssec_status: "enabling", ksk_name: kskName });
  } catch (error) { next(error); }
});

app.get("/api/domains/:domainId/dns-posture", requireScope("domain:read"), async (req, res, next) => {
  try {
    const domain = await getById(tables.domains, { domain_id: clean(req.params.domainId) });
    if (!domain) return res.status(404).json({ error: "domain_not_found" });
    tenantForActor(req.actor, domain.tenant_id);
    const zone = (await queryByTenant(tables.dnsZones, domain.tenant_id)).find((item) => item.domain_id === domain.domain_id);
    const origin = (await queryByIndex(tables.origins, "domain_id-index", "domain_id", domain.domain_id))[0];
    res.json({ posture: await evaluateDnsPosture(domain, origin, zone) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/dmarc/configurations", requireScope("domain:read"), async (req, res, next) => {
  try {
    const tenantId = tenantForActor(req.actor, clean(req.query.tenant_id));
    res.json({ configurations: sortByDate(tenantId ? await queryByTenant(tables.dmarcConfigurations, tenantId) : await scanTable(tables.dmarcConfigurations)) });
  } catch (error) { next(error); }
});

app.get("/api/dmarc/reports", requireScope("reports:read"), async (req, res, next) => {
  try {
    const tenantId = tenantForActor(req.actor, clean(req.query.tenant_id));
    res.json({ reports: sortByDate(tenantId ? await queryByTenant(tables.dmarcReports, tenantId) : await scanTable(tables.dmarcReports)) });
  } catch (error) { next(error); }
});

app.post("/api/domains/:domainId/dmarc", requireScope("domain:write"), async (req, res, next) => {
  try {
    const domain = await getById(tables.domains, { domain_id: clean(req.params.domainId) });
    if (!domain) return res.status(404).json({ error: "domain_not_found" });
    tenantForActor(req.actor, domain.tenant_id);
    if (!isVerifiedDomainStatus(domain.status)) return res.status(409).json({ error: "verified_domain_required" });
    const policy = clean(req.body?.policy || "none").toLowerCase();
    const alignment = clean(req.body?.alignment || "r").toLowerCase();
    const percentage = Math.min(Math.max(Number(req.body?.percentage ?? 100), 1), 100);
    if (!new Set(["none", "quarantine", "reject"]).has(policy) || !new Set(["r", "s"]).has(alignment)) return res.status(400).json({ error: "dmarc_policy_or_alignment_invalid" });
    const reportToken = crypto.randomBytes(18).toString("base64url");
    const rua = `dmarc+${reportToken}@${process.env.DMARC_RECEIVER_DOMAIN || "reports.fortressnet.app"}`;
    const value = `v=DMARC1; p=${policy}; rua=mailto:${rua}; adkim=${alignment}; aspf=${alignment}; pct=${percentage}`;
    const zone = (await queryByTenant(tables.dnsZones, domain.tenant_id)).find((item) => item.domain_id === domain.domain_id);
    const now = new Date().toISOString();
    const configuration = {
      configuration_id: `dmc_${crypto.randomUUID()}`,
      tenant_id: domain.tenant_id,
      domain_id: domain.domain_id,
      domain_name: domain.domain_name,
      report_token: reportToken,
      rua,
      record_name: `_dmarc.${domain.domain_name}`,
      record_value: value,
      policy,
      alignment,
      percentage,
      status: zone?.mode === "route53_delegated" ? "publishing" : "awaiting_external_dns",
      created_at: now,
      updated_at: now
    };
    if (zone?.mode === "route53_delegated" && zone.route53_zone_id) {
      await route53.send(new ChangeResourceRecordSetsCommand({ HostedZoneId: zone.route53_zone_id, ChangeBatch: { Comment: `FortressNet DMARC for ${domain.tenant_id}`, Changes: [{ Action: "UPSERT", ResourceRecordSet: { Name: `${configuration.record_name}.`, Type: "TXT", TTL: 300, ResourceRecords: [{ Value: `"${value}"` }] } }] } }));
      configuration.status = "published_pending_dns";
    }
    await putUnique(tables.dmarcConfigurations, configuration, "configuration_id");
    await audit("dmarc.configuration_created", domain.tenant_id, { configuration_id: configuration.configuration_id, domain_id: domain.domain_id, policy, status: configuration.status }, req.actor);
    res.status(201).json({ configuration });
  } catch (error) { next(error); }
});

app.get("/api/ztna/applications", requireScope("identity:read"), async (req, res, next) => {
  try {
    const tenantId = tenantForActor(req.actor, clean(req.query.tenant_id));
    const applications = tenantId ? await queryByTenant(tables.ztnaApplications, tenantId) : await scanTable(tables.ztnaApplications);
    res.json({ applications: sortByDate(applications) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/api-shield/inventory/refresh", requireScope("policy:read"), async (req, res, next) => {
  try {
    const tenantId = tenantForActor(req.actor, clean(req.body?.tenant_id));
    if (!tenantId) return res.status(400).json({ error: "tenant_id_required" });
    const deployments = await queryByTenant(tables.edgeDeployments, tenantId);
    const inventory = buildApiInventory(tenantId, await collectSecurityEvents(deployments, 500));
    for (const endpoint of inventory) await dynamo.send(new PutCommand({ TableName: tables.apiInventory, Item: endpoint }));
    await audit("api_shield.inventory_refreshed", tenantId, { endpoints: inventory.length }, req.actor);
    res.json({ mode: "read_only", observed_events: inventory.reduce((total, endpoint) => total + endpoint.observed_requests, 0), inventory });
  } catch (error) { next(error); }
});

app.get("/api/api-shield/inventory", requireScope("policy:read"), async (req, res, next) => {
  try {
    const tenantId = tenantForActor(req.actor, clean(req.query.tenant_id));
    res.json({ inventory: sortByDate(tenantId ? await queryByTenant(tables.apiInventory, tenantId) : await scanTable(tables.apiInventory)) });
  } catch (error) { next(error); }
});

app.get("/api/api-shield/schemas", requireScope("policy:read"), async (req, res, next) => {
  try {
    const tenantId = tenantForActor(req.actor, clean(req.query.tenant_id));
    res.json({ schemas: sortByDate(tenantId ? await queryByTenant(tables.apiSchemas, tenantId) : await scanTable(tables.apiSchemas)) });
  } catch (error) { next(error); }
});

app.post("/api/api-shield/schemas", requireScope("policy:write"), async (req, res, next) => {
  try {
    const tenantId = tenantForActor(req.actor, clean(req.body?.tenant_id));
    const name = clean(req.body?.name);
    const document = req.body?.document;
    if (!tenantId) return res.status(400).json({ error: "tenant_id_required" });
    if (!name || name.length > 100) return res.status(400).json({ error: "schema_name_invalid" });
    const openapi = validateOpenApiDocument(document);
    const now = new Date().toISOString();
    const schema = { schema_id: `oas_${crypto.randomUUID()}`, tenant_id: tenantId, name, version: clean(document.info?.version) || "unversioned", mode: "report_only", status: "draft", endpoint_count: openapi.endpoints.length, endpoints: openapi.endpoints, document, created_at: now, updated_at: now };
    await putUnique(tables.apiSchemas, schema, "schema_id");
    await audit("api_shield.openapi_imported", tenantId, { schema_id: schema.schema_id, endpoint_count: schema.endpoint_count, mode: schema.mode }, req.actor);
    res.status(201).json({ schema });
  } catch (error) { next(error); }
});

app.post("/api/ztna/applications", requireScope("identity:write"), async (req, res, next) => {
  try {
    const body = req.body || {};
    const tenantId = tenantForActor(req.actor, clean(body.tenant_id));
    const name = clean(body.name);
    const protocol = clean(body.protocol).toLowerCase();
    const privateHostname = normalizePrivateApplicationHostname(body.private_hostname);
    const idpConnectionId = clean(body.idp_connection_id);
    if (!tenantId) return res.status(400).json({ error: "tenant_id_required" });
    if (!name || name.length > 100) return res.status(400).json({ error: "ztna_application_name_invalid" });
    if (!new Set(["https", "ssh", "rdp", "tcp"]).has(protocol)) return res.status(400).json({ error: "ztna_application_protocol_invalid" });
    if (!privateHostname) return res.status(400).json({ error: "ztna_private_hostname_invalid" });
    if (idpConnectionId) {
      const connection = await getById(tables.idpConnections, { connection_id: idpConnectionId });
      if (!connection || connection.tenant_id !== tenantId || connection.status !== "active") return res.status(409).json({ error: "active_tenant_idp_required" });
    }
    const now = new Date().toISOString();
    const application = {
      application_id: `ztna_${crypto.randomUUID()}`,
      tenant_id: tenantId,
      name,
      protocol,
      private_hostname: privateHostname,
      idp_connection_id: idpConnectionId || null,
      device_posture_required: Boolean(body.device_posture_required),
      status: "design",
      created_at: now,
      updated_at: now
    };
    await putUnique(tables.ztnaApplications, application, "application_id");
    await audit("ztna.application_registered", tenantId, application, req.actor);
    res.status(201).json({ application });
  } catch (error) {
    next(error);
  }
});

app.post("/api/ztna/applications/:applicationId/verified-access-request", requireScope("identity:write"), async (req, res, next) => {
  try {
    const application = await getById(tables.ztnaApplications, { application_id: clean(req.params.applicationId) });
    if (!application) return res.status(404).json({ error: "ztna_application_not_found" });
    tenantForActor(req.actor, application.tenant_id);
    if (!process.env.VERIFIED_ACCESS_INSTANCE_ID) return res.status(503).json({ error: "verified_access_not_configured" });
    if (!application.idp_connection_id) return res.status(409).json({ error: "external_oidc_idp_required" });
    const connection = await getById(tables.idpConnections, { idp_id: application.idp_connection_id });
    if (!connection || connection.tenant_id !== application.tenant_id || connection.status !== "active" || connection.protocol !== "oidc") return res.status(409).json({ error: "active_oidc_idp_required" });
    const request = normalizeVerifiedAccessRequest(req.body, application, connection);
    if (application.verified_access_status === "pending_approval") return res.status(409).json({ error: "verified_access_request_already_pending" });
    const now = new Date().toISOString();
    const approval = createApproval(application.tenant_id, "verified_access_endpoint", application.application_id, req.actor, now);
    const updated = { ...application, verified_access_request: request, verified_access_status: "pending_approval", verified_access_requested_by: req.actor?.subject || "unknown", verified_access_requested_at: now, updated_at: now };
    await Promise.all([dynamo.send(new PutCommand({ TableName: tables.ztnaApplications, Item: updated })), putUnique(tables.approvals, approval, "approval_id")]);
    await audit("ztna.verified_access_requested", application.tenant_id, { application_id: application.application_id, request, approval }, req.actor);
    res.status(201).json({ application: updated, approval });
  } catch (error) { next(error); }
});

app.post("/api/ztna/applications/:applicationId/verified-access-approve", requireScope("edge:approve"), async (req, res, next) => {
  try {
    const application = await getById(tables.ztnaApplications, { application_id: clean(req.params.applicationId) });
    if (!application) return res.status(404).json({ error: "ztna_application_not_found" });
    tenantForActor(req.actor, application.tenant_id);
    if (application.verified_access_status !== "pending_approval") return res.status(409).json({ error: "verified_access_request_not_pending" });
    if (!isPlatformActor(req.actor) && application.verified_access_requested_by === req.actor?.subject) return res.status(409).json({ error: "separation_of_duties_required" });
    const now = new Date().toISOString();
    const updated = { ...application, verified_access_status: "approved", verified_access_approved_by: req.actor?.subject || "unknown", verified_access_approved_at: now, updated_at: now };
    await dynamo.send(new PutCommand({ TableName: tables.ztnaApplications, Item: updated }));
    await approveSubject(application.tenant_id, "verified_access_endpoint", application.application_id, req.actor, now);
    await audit("ztna.verified_access_approved", application.tenant_id, { application_id: application.application_id }, req.actor);
    res.json({ application: updated });
  } catch (error) { next(error); }
});

app.post("/api/ztna/applications/:applicationId/verified-access-provision", requireScope("identity:write"), async (req, res, next) => {
  try {
    const application = await getById(tables.ztnaApplications, { application_id: clean(req.params.applicationId) });
    if (!application) return res.status(404).json({ error: "ztna_application_not_found" });
    tenantForActor(req.actor, application.tenant_id);
    if (application.verified_access_status !== "approved" || !application.verified_access_request) return res.status(409).json({ error: "approved_verified_access_request_required" });
    const connection = await getById(tables.idpConnections, { idp_id: application.idp_connection_id });
    const clientSecret = clean(req.body?.client_secret);
    if (!connection || !clientSecret) return res.status(400).json({ error: "oidc_client_secret_required_for_provisioning" });
    const request = application.verified_access_request;
    const trustProvider = await ec2.send(new CreateVerifiedAccessTrustProviderCommand({
      VerifiedAccessInstanceId: process.env.VERIFIED_ACCESS_INSTANCE_ID,
      TrustProviderType: "user",
      UserTrustProviderType: "oidc",
      OidcOptions: {
        Issuer: connection.issuer_url,
        AuthorizationEndpoint: request.authorization_endpoint,
        TokenEndpoint: request.token_endpoint,
        UserInfoEndpoint: request.user_info_endpoint,
        ClientId: connection.client_id,
        ClientSecret: clientSecret,
        Scope: request.scope
      },
      Description: `FortressNet tenant ${application.tenant_id} application ${application.application_id}`,
      TagSpecifications: [{ ResourceType: "verified-access-trust-provider", Tags: [{ Key: "ManagedBy", Value: "FortressNet" }, { Key: "TenantId", Value: application.tenant_id }] }]
    }));
    const trustProviderId = trustProvider.VerifiedAccessTrustProvider?.VerifiedAccessTrustProviderId;
    if (!trustProviderId) throw httpError(502, "verified_access_trust_provider_create_failed");
    const endpoint = await ec2.send(new CreateVerifiedAccessEndpointCommand({
      VerifiedAccessInstanceId: process.env.VERIFIED_ACCESS_INSTANCE_ID,
      VerifiedAccessTrustProviderId: trustProviderId,
      EndpointType: "network-interface",
      AttachmentType: "vpc",
      ApplicationDomain: application.private_hostname,
      DomainCertificateArn: request.certificate_arn,
      SecurityGroupIds: request.security_group_ids,
      NetworkInterfaceOptions: { NetworkInterfaceId: request.network_interface_id, Protocol: request.protocol, Port: request.port },
      Description: `FortressNet ZTNA: ${application.name}`,
      TagSpecifications: [{ ResourceType: "verified-access-endpoint", Tags: [{ Key: "ManagedBy", Value: "FortressNet" }, { Key: "TenantId", Value: application.tenant_id }, { Key: "ApplicationId", Value: application.application_id }] }]
    }));
    const verifiedEndpoint = endpoint.VerifiedAccessEndpoint;
    if (!verifiedEndpoint?.VerifiedAccessEndpointId) throw httpError(502, "verified_access_endpoint_create_failed");
    const now = new Date().toISOString();
    const updated = { ...application, status: "provisioning", verified_access_status: "provisioning", verified_access_trust_provider_id: trustProviderId, verified_access_endpoint_id: verifiedEndpoint.VerifiedAccessEndpointId, verified_access_endpoint_domain: verifiedEndpoint.EndpointDomain, verified_access_provisioned_at: now, updated_at: now };
    delete updated.verified_access_request;
    await dynamo.send(new PutCommand({ TableName: tables.ztnaApplications, Item: updated }));
    await audit("ztna.verified_access_provisioned", application.tenant_id, { application_id: application.application_id, endpoint_id: updated.verified_access_endpoint_id }, req.actor);
    res.status(202).json({ application: updated });
  } catch (error) { next(error); }
});

app.patch("/api/ztna/applications/:applicationId/verified-access-refresh", requireScope("identity:read"), async (req, res, next) => {
  try {
    const application = await getById(tables.ztnaApplications, { application_id: clean(req.params.applicationId) });
    if (!application?.verified_access_endpoint_id) return res.status(404).json({ error: "verified_access_endpoint_not_found" });
    tenantForActor(req.actor, application.tenant_id);
    const response = await ec2.send(new DescribeVerifiedAccessEndpointsCommand({ VerifiedAccessEndpointIds: [application.verified_access_endpoint_id] }));
    const endpoint = response.VerifiedAccessEndpoints?.[0];
    if (!endpoint) return res.status(404).json({ error: "verified_access_endpoint_not_found" });
    const now = new Date().toISOString();
    const updated = { ...application, status: endpoint.Status?.Code === "active" ? "active" : endpoint.Status?.Code || "provisioning", verified_access_status: endpoint.Status?.Code || "provisioning", verified_access_endpoint_domain: endpoint.EndpointDomain || application.verified_access_endpoint_domain, updated_at: now };
    await dynamo.send(new PutCommand({ TableName: tables.ztnaApplications, Item: updated }));
    res.json({ application: updated });
  } catch (error) { next(error); }
});

app.get("/api/ai/findings", requireScope("ai:read"), async (req, res, next) => {
  try {
    const tenantId = tenantForActor(req.actor, clean(req.query.tenant_id));
    const findings = tenantId ? await queryByTenant(tables.aiFindings, tenantId) : await scanTable(tables.aiFindings);
    res.json({ findings: sortByDate(findings) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/ai/analyze", requireScope("ai:read"), async (req, res, next) => {
  try {
    const tenantId = tenantForActor(req.actor, clean(req.body?.tenant_id));
    if (!tenantId) return res.status(400).json({ error: "tenant_id_required" });
    const deployments = await queryByTenant(tables.edgeDeployments, tenantId);
    const events = await collectSecurityEvents(deployments, 500);
    const findings = buildAiFindings(tenantId, events);
    const persisted = [];
    for (const finding of findings) {
      try {
        await putUnique(tables.aiFindings, finding, "finding_id");
        persisted.push(finding);
      } catch (error) {
        if (error?.name !== "ConditionalCheckFailedException") throw error;
      }
    }
    await audit("ai_analysis.completed", tenantId, { event_count: events.length, findings_created: persisted.length }, req.actor);
    const currentFindings = await queryByTenant(tables.aiFindings, tenantId);
    res.json({ mode: "read_only", analyzed_events: events.length, findings: sortByDate(currentFindings), findings_created: persisted.length });
  } catch (error) {
    next(error);
  }
});

app.get("/api/edge-deployments/:deploymentId/origin-verification", requireScope("edge:write"), async (req, res, next) => {
  try {
    const deploymentId = clean(req.params.deploymentId);
    const deployment = await getById(tables.edgeDeployments, { deployment_id: deploymentId });
    if (!deployment) return res.status(404).json({ error: "edge_deployment_not_found" });
    tenantForActor(req.actor, deployment.tenant_id);
    if (!deployment.origin_header_name || !deployment.origin_header_value) return res.status(409).json({ error: "origin_verification_not_available" });
    await audit("edge_deployment.origin_verification_viewed", deployment.tenant_id, { deployment_id: deploymentId }, req.actor);
    res.json({ origin_verification: { header_name: deployment.origin_header_name, header_value: deployment.origin_header_value } });
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
    await enforceTenantLimit(tenantId, "policies", (await queryByTenant(tables.policies, tenantId)).length);
    const mode = normalizeWafMode(body.mode);
    if (!mode) return res.status(400).json({ error: "supported_waf_mode_required" });
    const rateLimit = normalizeWafRateLimitConfig(body);
    const advanced = normalizeWafAdvancedConfig(body);

    const now = new Date().toISOString();
    const policy = {
      policy_id: `pol_${crypto.randomUUID()}`,
      tenant_id: tenantId,
      name,
      scope: clean(body.scope) || "all_domains",
      mode,
      ...rateLimit,
      ...advanced,
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

app.post("/api/waf-change-sets/:changeSetId/approve", requireScope("edge:approve"), async (req, res, next) => {
  try {
    const changeSet = await getById(tables.wafChangeSets, { change_set_id: clean(req.params.changeSetId) });
    if (!changeSet) return res.status(404).json({ error: "waf_change_set_not_found" });
    tenantForActor(req.actor, changeSet.tenant_id);
    if (changeSet.status !== "pending_approval") return res.status(409).json({ error: "waf_change_set_not_pending_approval" });
    if (!isPlatformActor(req.actor) && changeSet.created_by === req.actor?.subject) return res.status(409).json({ error: "separation_of_duties_required" });
    const now = new Date().toISOString();
    const result = await dynamo.send(new UpdateCommand({
      TableName: tables.wafChangeSets,
      Key: { change_set_id: changeSet.change_set_id },
      UpdateExpression: "SET #status = :status, approved_by = :approved_by, approved_at = :approved_at, updated_at = :updated_at",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": "approved",
        ":approved_by": req.actor?.subject || "unknown",
        ":approved_at": now,
        ":updated_at": now
      },
      ReturnValues: "ALL_NEW"
    }));
    const approval = createApproval(changeSet.tenant_id, "waf_change_set", changeSet.change_set_id, changeSet.created_by, now);
    approval.status = "approved";
    approval.approved_by = req.actor?.subject || "unknown";
    approval.approved_at = now;
    await putUnique(tables.approvals, approval, "approval_id");
    await audit("waf_change_set.approved", changeSet.tenant_id, { change_set_id: changeSet.change_set_id }, req.actor);
    res.json({ waf_change_set: result.Attributes, approval });
  } catch (error) {
    next(error);
  }
});

app.post("/api/waf-change-sets/:changeSetId/apply", requireScope("edge:write"), async (req, res, next) => {
  try {
    const changeSet = await getById(tables.wafChangeSets, { change_set_id: clean(req.params.changeSetId) });
    if (!changeSet) return res.status(404).json({ error: "waf_change_set_not_found" });
    tenantForActor(req.actor, changeSet.tenant_id);
    if (changeSet.status !== "approved") return res.status(409).json({ error: "approved_waf_change_set_required" });
    const domainId = clean(req.body?.domain_id);
    if (!domainId) return res.status(400).json({ error: "domain_id_required" });
    const edgeDeployment = await edgeDeploymentForDomain(domainId, changeSet.tenant_id);
    if (!edgeDeployment?.web_acl_id || !["provisioning", "ready_for_cutover", "active"].includes(edgeDeployment.status)) return res.status(409).json({ error: "provisioned_edge_required" });
    if (changeSet.mode === "block") await requirePilotMonitorBaseline(changeSet, edgeDeployment);

    const applied = await applyWafChangeSet(changeSet, edgeDeployment);
    await audit("waf_change_set.applied", changeSet.tenant_id, { change_set_id: changeSet.change_set_id, domain_id: domainId }, req.actor);
    res.json({ waf_change_set: applied });
  } catch (error) {
    next(error);
  }
});

app.post("/api/waf-change-sets/:changeSetId/rollback", requireScope("edge:write"), async (req, res, next) => {
  try {
    const changeSet = await getById(tables.wafChangeSets, { change_set_id: clean(req.params.changeSetId) });
    if (!changeSet) return res.status(404).json({ error: "waf_change_set_not_found" });
    tenantForActor(req.actor, changeSet.tenant_id);
    if (changeSet.status !== "applied" || !Array.isArray(changeSet.rollback_rules)) return res.status(409).json({ error: "rollback_not_available" });
    const domainId = clean(req.body?.domain_id);
    if (!domainId) return res.status(400).json({ error: "domain_id_required" });
    const edgeDeployment = await edgeDeploymentForDomain(domainId, changeSet.tenant_id);
    if (!edgeDeployment?.web_acl_id) return res.status(409).json({ error: "provisioned_edge_required" });
    await replaceWafRules(edgeDeployment, changeSet.rollback_rules);
    const now = new Date().toISOString();
    const result = await dynamo.send(new UpdateCommand({
      TableName: tables.wafChangeSets,
      Key: { change_set_id: changeSet.change_set_id },
      UpdateExpression: "SET #status = :status, rolled_back_at = :rolled_back_at, updated_at = :updated_at",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":status": "rolled_back", ":rolled_back_at": now, ":updated_at": now },
      ReturnValues: "ALL_NEW"
    }));
    await dynamo.send(new UpdateCommand({
      TableName: tables.edgeDeployments,
      Key: { deployment_id: edgeDeployment.deployment_id },
      UpdateExpression: "SET updated_at = :updated_at REMOVE waf_ip_sets",
      ExpressionAttributeValues: { ":updated_at": now }
    }));
    await deleteWafIpSets(changeSet.waf_ip_sets || []);
    await audit("waf_change_set.rolled_back", changeSet.tenant_id, { change_set_id: changeSet.change_set_id, domain_id: domainId }, req.actor);
    res.json({ waf_change_set: result.Attributes });
  } catch (error) {
    next(error);
  }
});

app.get("/api/events", requireScope("events:read"), async (req, res, next) => {
  try {
    const tenantId = tenantForActor(req.actor, clean(req.query.tenant_id));
    const deployments = tenantId ? await queryByTenant(tables.edgeDeployments, tenantId) : await scanTable(tables.edgeDeployments);
    res.json({ events: await collectSecurityEvents(deployments, Number(req.query.limit || 100)) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/waf-history", requireScope("events:read"), async (req, res, next) => {
  try {
    const tenantId = tenantForActor(req.actor, clean(req.query.tenant_id));
    const events = tenantId ? await queryByTenant(tables.wafEvents, tenantId) : await scanTable(tables.wafEvents);
    res.json({ events: events.sort((left, right) => Number(right.timestamp || 0) - Number(left.timestamp || 0)).slice(0, Math.min(Math.max(Number(req.query.limit || 100), 1), 500)) });
  } catch (error) { next(error); }
});

app.get("/api/client-security/reports", requireScope("events:read"), async (req, res, next) => {
  try {
    const tenantId = tenantForActor(req.actor, clean(req.query.tenant_id));
    const events = tenantId ? await queryByTenant(tables.clientSecurityEvents, tenantId) : await scanTable(tables.clientSecurityEvents);
    res.json({ reports: sortByDate(events).slice(0, Math.min(Math.max(Number(req.query.limit || 100), 1), 500)) });
  } catch (error) { next(error); }
});

app.get("/api/reports", requireScope("reports:read"), async (req, res, next) => {
  try {
    const tenantId = tenantForActor(req.actor, clean(req.query.tenant_id));
    const deployments = tenantId ? await queryByTenant(tables.edgeDeployments, tenantId) : await scanTable(tables.edgeDeployments);
    const events = await collectSecurityEvents(deployments, 500);
    res.json({ reports: [buildSecurityReport(tenantId || "platform", events, deployments)] });
  } catch (error) {
    next(error);
  }
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

    const existing = await queryByIndex(tables.users, "email-index", "email", email);
    if (existing.some((item) => item.tenant_id === tenantId)) return res.status(409).json({ error: "user_already_exists" });
    await enforceTenantLimit(tenantId, "users", (await queryByTenant(tables.users, tenantId)).length);
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
    const cognitoGroups = roles.map(cognitoGroupForRole).filter(Boolean);
    if (!cognitoGroups.length) return res.status(400).json({ error: "cognito_group_not_available_for_role" });
    let cognitoCreated = false;
    try {
      await cognito.send(new AdminCreateUserCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        Username: email,
        DesiredDeliveryMediums: ["EMAIL"],
        UserAttributes: [
          { Name: "email", Value: email },
          { Name: "email_verified", Value: "true" },
          { Name: "name", Value: displayName },
          { Name: "custom:tenant_id", Value: tenantId },
          { Name: "custom:role", Value: roles[0] }
        ]
      }));
      cognitoCreated = true;
      await Promise.all(cognitoGroups.map((groupName) => cognito.send(new AdminAddUserToGroupCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        Username: email,
        GroupName: groupName
      }))));
      await dynamo.send(new PutCommand({
        TableName: tables.users,
        Item: user,
        ConditionExpression: "attribute_not_exists(user_id)"
      }));
    } catch (error) {
      if (cognitoCreated) {
        await cognito.send(new AdminDeleteUserCommand({ UserPoolId: process.env.COGNITO_USER_POOL_ID, Username: email })).catch(() => {});
      }
      throw error;
    }
    await audit("user.created", tenantId, redactUser(user), req.actor);
    res.status(201).json({ user, invitation_status: "sent" });
  } catch (error) {
    next(error);
  }
});

function cognitoGroupForRole(role) {
  return {
    platform_owner: "platform_owners",
    tenant_admin: "tenant_admins",
    security_admin: "security_admins",
    security_analyst: "security_analysts",
    billing_admin: "billing_admins",
    read_only: "read_only"
  }[role] || "";
}

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
    await enforceTenantLimit(tenantId, "api_keys", (await queryByTenant(tables.apiKeys, tenantId)).filter((item) => item.status === "active").length);

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
    if (protocol === "oidc" && (!isHttpsUrl(body.issuer_url) || !clean(body.client_id) || !clean(body.client_secret))) return res.status(400).json({ error: "oidc_issuer_client_id_and_secret_required" });
    if (protocol === "saml" && !isHttpsUrl(body.metadata_url)) return res.status(400).json({ error: "saml_metadata_url_required" });
    const existing = (await queryByTenant(tables.idpConnections, tenantId)).find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (existing) return res.status(409).json({ error: "idp_connection_name_already_exists" });
    await enforceTenantLimit(tenantId, "idp_connections", (await queryByTenant(tables.idpConnections, tenantId)).length);

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
      secret_reference: "stored_in_cognito",
      attribute_mapping: parseJson(body.attribute_mapping, {
        email: "email",
        display_name: "name",
        groups: "groups"
      }),
      provider_name: `fn_${tenantId.replace(/[^a-zA-Z0-9]/g, "").slice(-20)}_${crypto.randomBytes(4).toString("hex")}`,
      default_role: roleScopes[clean(body.default_role)] ? clean(body.default_role) : "read_only",
      status: "creating",
      auto_provisioning: body.auto_provisioning !== false,
      created_at: now,
      updated_at: now
    };
    await cognito.send(new CreateIdentityProviderCommand({
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      ProviderName: connection.provider_name,
      ProviderType: protocol === "oidc" ? "OIDC" : "SAML",
      ProviderDetails: protocol === "oidc"
        ? {
            client_id: connection.client_id,
            client_secret: clean(body.client_secret),
            attributes_request_method: "GET",
            oidc_issuer: connection.issuer_url,
            authorize_scopes: "openid profile email"
          }
        : { MetadataURL: connection.metadata_url },
      AttributeMapping: { email: "email", name: "name" }
    }));
    await enableCognitoIdentityProvider(connection.provider_name);
    connection.status = "active";
    await dynamo.send(new PutCommand({ TableName: tables.idpConnections, Item: connection, ConditionExpression: "attribute_not_exists(idp_id)" }));
    await audit("idp_connection.created", tenantId, connection, req.actor);
    res.status(201).json({ idp_connection: connection });
  } catch (error) {
    next(error);
  }
});

async function enableCognitoIdentityProvider(providerName) {
  const current = await cognito.send(new DescribeUserPoolClientCommand({
    UserPoolId: process.env.COGNITO_USER_POOL_ID,
    ClientId: process.env.COGNITO_APP_CLIENT_ID
  }));
  const client = current.UserPoolClient;
  if (!client) throw httpError(502, "cognito_client_not_available");
  const supportedIdentityProviders = Array.from(new Set([...(client.SupportedIdentityProviders || ["COGNITO"]), providerName]));
  await cognito.send(new UpdateUserPoolClientCommand({
    UserPoolId: process.env.COGNITO_USER_POOL_ID,
    ClientId: process.env.COGNITO_APP_CLIENT_ID,
    SupportedIdentityProviders: supportedIdentityProviders,
    AllowedOAuthFlowsUserPoolClient: client.AllowedOAuthFlowsUserPoolClient,
    AllowedOAuthFlows: client.AllowedOAuthFlows,
    AllowedOAuthScopes: client.AllowedOAuthScopes,
    CallbackURLs: client.CallbackURLs,
    LogoutURLs: client.LogoutURLs,
    ExplicitAuthFlows: client.ExplicitAuthFlows,
    PreventUserExistenceErrors: client.PreventUserExistenceErrors,
    AccessTokenValidity: client.AccessTokenValidity,
    IdTokenValidity: client.IdTokenValidity,
    RefreshTokenValidity: client.RefreshTokenValidity,
    TokenValidityUnits: client.TokenValidityUnits
  }));
}

app.get("/api/profile", requireScope("profile:write"), async (req, res, next) => {
  try {
    const profileId = actorProfileId(req.actor);
    const result = await dynamo.send(new GetCommand({
      TableName: tables.profiles,
      Key: { profile_id: profileId }
    }));
    res.json({ profile: { ...defaultProfile(profileId, req.actor), ...(result.Item || {}) } });
  } catch (error) {
    next(error);
  }
});

app.put("/api/profile", requireScope("profile:write"), async (req, res, next) => {
  try {
    const body = req.body || {};
    const profileId = actorProfileId(req.actor);
    const existing = await dynamo.send(new GetCommand({
      TableName: tables.profiles,
      Key: { profile_id: profileId }
    }));
    const now = new Date().toISOString();
    const profile = {
      profile_id: profileId,
      display_name: clean(body.display_name),
      // Cognito owns the authenticated email address. Keeping it immutable here
      // prevents the console profile from diverging from the login identity.
      email: req.actor?.type === "cognito" ? req.actor.email : normalizeEmail(body.email),
      timezone: normalizeProfileTimezone(body.timezone),
      locale: normalizeProfileLocale(body.locale),
      notification_email: body.notification_email !== false,
      notification_security: body.notification_security !== false,
      mfa_enrolled_at: existing.Item?.mfa_enrolled_at || "",
      mfa_issuer: existing.Item?.mfa_issuer || "",
      created_at: existing.Item?.created_at || now,
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

app.post("/api/profile/mfa/totp", requireScope("profile:write"), async (req, res, next) => {
  try {
    const accessToken = clean(req.body?.access_token);
    await requireActorAccessToken(req.actor, accessToken);
    const result = await cognito.send(new AssociateSoftwareTokenCommand({ AccessToken: accessToken }));
    if (!result.SecretCode) throw httpError(502, "cognito_totp_secret_unavailable");
    await audit("profile.mfa_enrollment_started", req.actor.tenant_id, { method: "totp", issuer: "FortressNet" }, req.actor);
    res.json({ secret_code: result.SecretCode, issuer: "FortressNet" });
  } catch (error) {
    next(error);
  }
});

app.post("/api/profile/mfa/totp/verify", requireScope("profile:write"), async (req, res, next) => {
  try {
    const accessToken = clean(req.body?.access_token);
    const code = clean(req.body?.code);
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: "totp_code_invalid" });
    await requireActorAccessToken(req.actor, accessToken);
    const verification = await cognito.send(new VerifySoftwareTokenCommand({
      AccessToken: accessToken,
      UserCode: code,
      FriendlyDeviceName: "FortressNet"
    }));
    if (verification.Status !== "SUCCESS") return res.status(400).json({ error: "totp_verification_failed" });
    await cognito.send(new SetUserMFAPreferenceCommand({
      AccessToken: accessToken,
      SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true }
    }));
    const now = new Date().toISOString();
    await dynamo.send(new UpdateCommand({
      TableName: tables.profiles,
      Key: { profile_id: actorProfileId(req.actor) },
      UpdateExpression: "SET mfa_enrolled_at = :now, mfa_issuer = :issuer, updated_at = :now",
      ExpressionAttributeValues: { ":now": now, ":issuer": "FortressNet" }
    }));
    await audit("profile.mfa_enrolled", req.actor.tenant_id, { method: "totp", issuer: "FortressNet" }, req.actor);
    res.json({ status: "enabled", issuer: "FortressNet", enrolled_at: now });
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
  res.status(error.statusCode || 500).json({ error: error.code || "internal_error", details: error.details || undefined });
});

if (process.env.NODE_ENV !== "test") {
  startOriginHealthScheduler();
  app.listen(port, "0.0.0.0", () => {
    console.log(`FortressNet control plane listening on ${port}`);
  });
}

async function requireManagementAccess(req, res, next) {
  if (!managementToken && !cognitoVerifier) return res.status(503).json({ error: "identity_not_configured" });

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

  if (managementToken && supplied && timingSafeEqual(supplied, managementToken)) {
    return {
      type: "bootstrap",
      subject: "bootstrap-admin",
      tenant_id: "platform",
      roles: ["platform_owner"],
      scopes: ["*"]
    };
  }

  const cognitoActor = await authenticateCognitoToken(supplied);
  if (cognitoActor) return cognitoActor;

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

async function authenticateCognitoToken(token) {
  if (!token || !cognitoVerifier) return null;
  let claims;
  try {
    claims = await cognitoVerifier.verify(token);
  } catch {
    return null;
  }

  const email = normalizeEmail(claims.email);
  const username = clean(claims["cognito:username"]);
  const groups = normalizeList(claims["cognito:groups"]);
  const groupRoles = rolesFromCognitoGroups(groups);
  let user = email ? (await queryByIndex(tables.users, "email-index", "email", email))[0] : null;

  if (!user) {
    user = await provisionExternalIdpUser(claims, email, username, groups);
  }
  if (!user || !["invited", "active"].includes(user.status)) return null;

  const externalProvider = externalIdentityProviderName(claims);
  let permittedRoles = (user.roles || []).filter((role) => groupRoles.includes(role));
  if (user.idp_connection_id) {
    const connection = await getById(tables.idpConnections, { idp_id: user.idp_connection_id });
    if (!connection || connection.status !== "active" || connection.provider_name !== externalProvider) return null;
    permittedRoles = user.roles || [];
  }
  if (!permittedRoles.length) return null;
  if (user.status === "invited") {
    user = { ...user, status: "active", activated_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    await dynamo.send(new PutCommand({ TableName: tables.users, Item: user }));
  }
  const mfaRequired = user.mfa_required === true;
  const profile = mfaRequired ? await getById(tables.profiles, { profile_id: `profile_${clean(claims.sub)}` }) : null;

  return {
    type: "cognito",
    subject: clean(claims.sub),
    username,
    tenant_id: user.tenant_id,
    roles: permittedRoles,
    scopes: Array.from(new Set(permittedRoles.flatMap((role) => roleScopes[role] || []))),
    email,
    mfa_required: mfaRequired,
    mfa_enrolled: Boolean(profile?.mfa_enrolled_at)
  };
}

async function requireActorAccessToken(actor, accessToken) {
  if (actor?.type !== "cognito" || !accessToken || !cognitoAccessVerifier) throw httpError(403, "cognito_session_required");
  let claims;
  try {
    claims = await cognitoAccessVerifier.verify(accessToken);
  } catch {
    throw httpError(401, "cognito_access_token_invalid");
  }
  if (clean(claims.sub) !== clean(actor.subject)) throw httpError(403, "cognito_session_subject_mismatch");
  return claims;
}

function rolesFromCognitoGroups(groups) {
  const mappings = {
    platform_owners: "platform_owner",
    tenant_admins: "tenant_admin",
    security_admins: "security_admin",
    security_analysts: "security_analyst",
    billing_admins: "billing_admin",
    read_only: "read_only"
  };
  return groups.map((group) => mappings[group]).filter(Boolean);
}

async function provisionExternalIdpUser(claims, email, username, groups) {
  if (!email || !tables.idpConnections) return null;
  const providerName = externalIdentityProviderName(claims);
  if (!providerName) return null;
  const connections = await scanTable(tables.idpConnections);
  const connection = connections.find((item) => item.status === "active" && item.auto_provisioning && item.provider_name === providerName);
  if (!connection) return null;
  const role = roleScopes[connection.default_role] ? connection.default_role : "read_only";
  const now = new Date().toISOString();
  const user = {
    user_id: `usr_${crypto.randomUUID()}`,
    tenant_id: connection.tenant_id,
    email,
    display_name: clean(claims.name) || email,
    status: "active",
    roles: [role],
    scopes: roleScopes[role],
    idp_subject: username || clean(claims.sub),
    idp_connection_id: connection.idp_id,
    mfa_required: true,
    created_at: now,
    updated_at: now
  };
  try {
    await putUnique(tables.users, user, "user_id");
  } catch (error) {
    if (error?.name !== "ConditionalCheckFailedException") throw error;
  }
  await audit("user.auto_provisioned", connection.tenant_id, redactUser(user), { type: "cognito", subject: clean(claims.sub) });
  return user;
}

function externalIdentityProviderName(claims) {
  const identities = Array.isArray(claims.identities) ? claims.identities : parseJson(claims.identities, []);
  return Array.isArray(identities) ? clean(identities[0]?.providerName) : "";
}

function requireScope(scope) {
  return (req, res, next) => {
    if (req.actor?.mfa_required && !req.actor?.mfa_enrolled && scope !== "profile:write") {
      return res.status(428).json({ error: "mfa_enrollment_required" });
    }
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
    `connect-src 'self'${cognitoHostedUiOrigin ? ` ${cognitoHostedUiOrigin}` : ""}`,
    "upgrade-insecure-requests"
  ].join("; "));
  next();
}

function safeHttpsOrigin(value) {
  try {
    const url = new URL(clean(value));
    return url.protocol === "https:" ? url.origin : "";
  } catch {
    return "";
  }
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
  return queryByIndex(TableName, "tenant_id-index", "tenant_id", tenantId);
}

async function queryByIndex(TableName, IndexName, keyName, keyValue) {
  if (!TableName || !keyValue) return [];
  const items = [];
  let ExclusiveStartKey;
  do {
    const result = await dynamo.send(new QueryCommand({
      TableName,
      IndexName,
      KeyConditionExpression: "#key = :value",
      ExpressionAttributeNames: { "#key": keyName },
      ExpressionAttributeValues: { ":value": keyValue },
      ExclusiveStartKey
    }));
    items.push(...(result.Items || []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function getById(TableName, Key) {
  if (!TableName || !Key) return null;
  const result = await dynamo.send(new GetCommand({ TableName, Key }));
  return result.Item || null;
}

function normalizePlan(value) {
  const plan = clean(value).toLowerCase() || "pilot";
  return planCatalog[plan] ? plan : "";
}

function createEntitlement(tenant, now) {
  const plan = normalizePlan(tenant.plan);
  const definition = planCatalog[plan];
  return {
    customer_identifier: tenant.tenant_id,
    tenant_id: tenant.tenant_id,
    plan,
    plan_label: definition.label,
    billing_status: definition.billing_status,
    source: "direct_pilot",
    limits: definition.limits,
    created_at: now,
    updated_at: now
  };
}

async function getTenantEntitlement(tenantId) {
  if (!tenantId || tenantId === "platform") return null;
  return getById(tables.entitlements, { customer_identifier: tenantId });
}

async function enforceTenantLimit(tenantId, resource, currentCount) {
  if (!tenantId || tenantId === "platform") return;
  const entitlement = await getTenantEntitlement(tenantId);
  if (!entitlement) throw httpError(409, "tenant_entitlement_required");
  const limit = Number(entitlement.limits?.[resource]);
  if (Number.isFinite(limit) && currentCount >= limit) {
    const error = httpError(409, "plan_limit_exceeded");
    error.details = { resource, limit, current: currentCount, plan: entitlement.plan };
    throw error;
  }
}

function publicEntitlement(entitlement) {
  return {
    customer_identifier: entitlement.customer_identifier,
    tenant_id: entitlement.tenant_id,
    plan: entitlement.plan,
    plan_label: entitlement.plan_label,
    billing_status: entitlement.billing_status,
    source: entitlement.source,
    limits: entitlement.limits,
    updated_at: entitlement.updated_at
  };
}

function currentUsagePeriod() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { starts_at: start.toISOString(), ends_at: end.toISOString(), source: "observed_control_plane_and_waf_events" };
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

function createApproval(tenantId, subjectType, subjectId, actor, now) {
  return {
    approval_id: `apr_${crypto.randomUUID()}`,
    tenant_id: tenantId,
    subject_type: subjectType,
    subject_id: subjectId,
    status: "pending",
    requested_by: typeof actor === "string" ? actor : actor?.subject || "unknown",
    created_at: now,
    updated_at: now
  };
}

async function approveSubject(tenantId, subjectType, subjectId, actor, now) {
  const approvals = await queryByTenant(tables.approvals, tenantId);
  const approval = approvals.find((item) => item.subject_type === subjectType && item.subject_id === subjectId && item.status === "pending");
  if (!approval) return;
  await dynamo.send(new UpdateCommand({
    TableName: tables.approvals,
    Key: { approval_id: approval.approval_id },
    UpdateExpression: "SET #status = :status, approved_by = :approved_by, approved_at = :approved_at, updated_at = :updated_at",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":status": "approved",
      ":approved_by": actor?.subject || "unknown",
      ":approved_at": now,
      ":updated_at": now
    }
  }));
}

async function edgeDeploymentForDomain(domainId, tenantId) {
  const deployments = await queryByIndex(tables.edgeDeployments, "domain_id-index", "domain_id", domainId);
  return deployments.find((deployment) => deployment.tenant_id === tenantId) || null;
}

async function provisionTenantEdge(deployment, domain, origins, certificate) {
  const now = new Date().toISOString();
  const logGroupName = deployment.log_group_name || tenantWafLogGroup(domain.domain_id);
  await ensureWafLogGroup(logGroupName);
  const webAcl = await ensureTenantWebAcl(deployment, domain);
  await ensureWafLogging(webAcl.ARN, logGroupName);
  const originHeaderName = deployment.origin_header_name || "X-FortressNet-Origin-Verify";
  const originHeaderValue = deployment.origin_header_value || crypto.randomBytes(24).toString("base64url");
  const clientSecurityToken = deployment.client_security_token || crypto.randomBytes(24).toString("base64url");
  const responseHeadersPolicyId = deployment.response_headers_policy_id || await ensureClientSecurityResponsePolicy(deployment, domain, clientSecurityToken);
  const distribution = deployment.distribution_id
    ? await cloudfront.send(new GetDistributionCommand({ Id: deployment.distribution_id }))
    : await cloudfront.send(new CreateDistributionCommand({
      DistributionConfig: cloudFrontDistributionConfig({ ...deployment, response_headers_policy_id: responseHeadersPolicyId }, domain, origins, certificate, webAcl.ARN, originHeaderName, originHeaderValue)
    }));
  const current = distribution.Distribution;
  const updated = {
    ...deployment,
    status: current?.Status === "Deployed" ? "ready_for_cutover" : "provisioning",
    web_acl_id: webAcl.Id,
    web_acl_arn: webAcl.ARN,
    web_acl_name: webAcl.Name,
    distribution_id: current?.Id,
    distribution_domain_name: current?.DomainName,
    log_group_name: logGroupName,
    origin_header_name: originHeaderName,
    origin_header_value: originHeaderValue,
    client_security_token: clientSecurityToken,
    response_headers_policy_id: responseHeadersPolicyId,
    provisioned_at: now,
    updated_at: now
  };
  await dynamo.send(new PutCommand({ TableName: tables.edgeDeployments, Item: updated }));
  await dynamo.send(new UpdateCommand({
    TableName: tables.domains,
    Key: { domain_id: domain.domain_id },
    UpdateExpression: "SET #status = :status, onboarding_step = :step, edge_target = :target, updated_at = :updated_at",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":status": updated.status === "ready_for_cutover" ? "pending_traffic_dns" : "edge_provisioning",
      ":step": updated.status === "ready_for_cutover" ? "traffic_dns_cutover" : "edge_provisioning",
      ":target": current?.DomainName || "",
      ":updated_at": now
    }
  }));
  return updated;
}

async function refreshEdgeDeployment(deployment) {
  const response = await cloudfront.send(new GetDistributionCommand({ Id: deployment.distribution_id }));
  const now = new Date().toISOString();
  const ready = response.Distribution?.Status === "Deployed";
  const updated = {
    ...deployment,
    status: ready ? "ready_for_cutover" : "provisioning",
    distribution_domain_name: response.Distribution?.DomainName || deployment.distribution_domain_name,
    updated_at: now
  };
  await dynamo.send(new PutCommand({ TableName: tables.edgeDeployments, Item: updated }));
  if (ready) {
    await dynamo.send(new UpdateCommand({
      TableName: tables.domains,
      Key: { domain_id: deployment.domain_id },
      UpdateExpression: "SET #status = :status, onboarding_step = :step, edge_target = :target, updated_at = :updated_at",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": "pending_traffic_dns",
        ":step": "traffic_dns_cutover",
        ":target": updated.distribution_domain_name,
        ":updated_at": now
      }
    }));
  }
  return updated;
}

async function ensureWafLogGroup(logGroupName) {
  try {
    await cloudwatchLogs.send(new CreateLogGroupCommand({
      logGroupName,
      kmsKeyId: process.env.PLATFORM_KMS_KEY_ARN
    }));
  } catch (error) {
    if (error?.name !== "ResourceAlreadyExistsException") throw error;
  }
  await cloudwatchLogs.send(new PutRetentionPolicyCommand({ logGroupName, retentionInDays: 365 }));
}

async function ensureTenantWebAcl(deployment, domain) {
  if (deployment.web_acl_id && deployment.web_acl_arn) return { Id: deployment.web_acl_id, ARN: deployment.web_acl_arn, Name: deployment.web_acl_name || tenantWebAclName(domain.domain_id) };
  const name = tenantWebAclName(domain.domain_id);
  let nextMarker;
  do {
    const existing = await waf.send(new ListWebACLsCommand({ Scope: "CLOUDFRONT", Limit: 100, NextMarker: nextMarker }));
    const match = (existing.WebACLs || []).find((item) => item.Name === name);
    if (match) return { Id: match.Id, ARN: match.ARN, Name: match.Name };
    nextMarker = existing.NextMarker;
  } while (nextMarker);
  const response = await waf.send(new CreateWebACLCommand({
    Name: name,
    Description: `FortressNet managed edge for ${domain.domain_name}`,
    Scope: "CLOUDFRONT",
    DefaultAction: { Allow: {} },
    Rules: [],
    VisibilityConfig: wafVisibilityConfig(`fn_${domain.domain_id}`),
    Tags: [
      { Key: "ManagedBy", Value: "FortressNet" },
      { Key: "TenantId", Value: domain.tenant_id },
      { Key: "DomainId", Value: domain.domain_id }
    ]
  }));
  if (!response.Summary?.Id || !response.Summary.ARN) throw httpError(502, "waf_web_acl_create_failed");
  return response.Summary;
}

async function ensureWafLogging(webAclArn, logGroupName) {
  const accountId = webAclArn.split(":")[4];
  await waf.send(new PutLoggingConfigurationCommand({
    ResourceArn: webAclArn,
    LogDestinationConfigs: [`arn:aws:logs:us-east-1:${accountId}:log-group:${logGroupName}`],
    RedactedFields: [
      { SingleHeader: { Name: "authorization" } },
      { SingleHeader: { Name: "cookie" } }
    ]
  }));
}

function cloudFrontDistributionConfig(deployment, domain, origins, certificate, webAclArn, originHeaderName, originHeaderValue) {
  const originItems = origins.map((origin) => ({
    Id: `origin-${origin.origin_id}`,
    DomainName: origin.hostname,
    CustomHeaders: { Quantity: 1, Items: [{ HeaderName: originHeaderName, HeaderValue: originHeaderValue }] },
    CustomOriginConfig: {
      HTTPPort: 80,
      HTTPSPort: Number(origin.port || 443),
      OriginProtocolPolicy: "https-only",
      OriginSSLProtocols: { Quantity: 1, Items: ["TLSv1.2"] }
    }
  }));
  const failoverEnabled = deployment.failover_enabled === true && originItems.length === 2;
  const originGroupId = `origin-group-${domain.domain_id}`;
  const targetOriginId = failoverEnabled ? originGroupId : originItems[0]?.Id;
  if (!targetOriginId) throw httpError(409, "healthy_origin_pool_required");
  return {
    CallerReference: deployment.deployment_id,
    Comment: `FortressNet tenant edge ${domain.domain_name}`,
    Enabled: true,
    Aliases: { Quantity: 1, Items: [domain.domain_name] },
    Origins: {
      Quantity: originItems.length,
      Items: originItems
    },
    OriginGroups: failoverEnabled ? {
      Quantity: 1,
      Items: [{
        Id: originGroupId,
        FailoverCriteria: { StatusCodes: { Quantity: 4, Items: [500, 502, 503, 504] } },
        Members: { Quantity: 2, Items: originItems.map((origin) => ({ OriginId: origin.Id })) }
      }]
    } : { Quantity: 0 },
    DefaultCacheBehavior: {
      TargetOriginId: targetOriginId,
      ViewerProtocolPolicy: "redirect-to-https",
      AllowedMethods: { Quantity: 7, Items: ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"], CachedMethods: { Quantity: 3, Items: ["GET", "HEAD", "OPTIONS"] } },
      Compress: true,
      CachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
      OriginRequestPolicyId: "b689b0a8-53d0-40ab-baf2-68738e2966ac",
      ResponseHeadersPolicyId: deployment.response_headers_policy_id || "67f7725c-6f97-4210-82d7-5512b31e9d03",
      TrustedSigners: { Enabled: false, Quantity: 0 },
      TrustedKeyGroups: { Enabled: false, Quantity: 0 }
    },
    Restrictions: { GeoRestriction: { RestrictionType: "none", Quantity: 0 } },
    ViewerCertificate: { ACMCertificateArn: certificate.certificate_arn, SSLSupportMethod: "sni-only", MinimumProtocolVersion: "TLSv1.2_2021" },
    WebACLId: webAclArn,
    HttpVersion: "http2and3",
    IsIPV6Enabled: true,
    PriceClass: "PriceClass_100",
    Logging: {
      Enabled: true,
      IncludeCookies: false,
      Bucket: process.env.EDGE_LOGS_BUCKET_DOMAIN_NAME,
      Prefix: `tenant/${deployment.tenant_id}/domain/${domain.domain_id}/`
    }
  };
}

async function ensureClientSecurityResponsePolicy(deployment, domain, token) {
  const reportUri = `https://${process.env.PUBLIC_APP_FQDN || "app.fortressnet.app"}/api/client-security/reports/${token}`;
  const response = await cloudfront.send(new CreateResponseHeadersPolicyCommand({
    ResponseHeadersPolicyConfig: {
      Name: `fn-csp-${deployment.deployment_id}`.slice(0, 128),
      Comment: `FortressNet report-only client security telemetry for ${domain.domain_name}`,
      SecurityHeadersConfig: {
        ContentSecurityPolicy: {
          ContentSecurityPolicy: `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; report-uri ${reportUri}`,
          Override: false
        }
      }
    }
  })).catch((error) => {
    if (error?.name === "ResponseHeadersPolicyAlreadyExists") throw httpError(409, "client_security_policy_conflict");
    throw error;
  });
  const policyId = response.ResponseHeadersPolicy?.Id;
  if (!policyId) throw httpError(502, "client_security_policy_create_failed");
  return policyId;
}

async function updateCloudFrontOriginPool(deployment, pool, origins) {
  const response = await cloudfront.send(new GetDistributionConfigCommand({ Id: deployment.distribution_id }));
  const config = response.DistributionConfig;
  if (!config || !response.ETag) throw httpError(502, "cloudfront_distribution_config_unavailable");
  const originItems = origins.map((origin) => ({
    Id: `origin-${origin.origin_id}`,
    DomainName: origin.hostname,
    CustomHeaders: { Quantity: 1, Items: [{ HeaderName: deployment.origin_header_name, HeaderValue: deployment.origin_header_value }] },
    CustomOriginConfig: {
      HTTPPort: 80,
      HTTPSPort: Number(origin.port || 443),
      OriginProtocolPolicy: "https-only",
      OriginSSLProtocols: { Quantity: 1, Items: ["TLSv1.2"] }
    }
  }));
  const failoverEnabled = pool.failover_enabled === true && originItems.length === 2;
  const originGroupId = `origin-group-${deployment.domain_id}`;
  config.Origins = { Quantity: originItems.length, Items: originItems };
  config.OriginGroups = failoverEnabled ? {
    Quantity: 1,
    Items: [{
      Id: originGroupId,
      FailoverCriteria: { StatusCodes: { Quantity: 4, Items: [500, 502, 503, 504] } },
      Members: { Quantity: 2, Items: originItems.map((origin) => ({ OriginId: origin.Id })) }
    }]
  } : { Quantity: 0 };
  config.DefaultCacheBehavior.TargetOriginId = failoverEnabled ? originGroupId : originItems[0].Id;
  await cloudfront.send(new UpdateDistributionCommand({ Id: deployment.distribution_id, IfMatch: response.ETag, DistributionConfig: config }));
}

async function assertOriginConfigurationEditable(tenantId, domainId) {
  const deployments = await queryByIndex(tables.edgeDeployments, "domain_id-index", "domain_id", domainId);
  if (deployments.some((deployment) => deployment.tenant_id === tenantId && !["failed", "rolled_back"].includes(deployment.status))) {
    throw httpError(409, "origin_configuration_locked_after_edge_request");
  }
}

async function validateOriginPoolConfiguration(tenantId, domainId, body) {
  const originIds = Array.from(new Set(normalizeList(body.origin_ids)));
  const failoverEnabled = body.failover_enabled === true;
  const strategy = clean(body.strategy) || "priority";
  if (strategy !== "priority") throw httpError(400, "origin_pool_strategy_must_be_priority");
  if (!originIds.length || originIds.length > 2) throw httpError(400, "origin_pool_requires_one_or_two_origins");
  if (failoverEnabled !== (originIds.length === 2)) throw httpError(400, "failover_requires_exactly_two_origins");
  const origins = await queryByIndex(tables.origins, "domain_id-index", "domain_id", domainId);
  const selected = originIds.map((originId) => origins.find((origin) => origin.origin_id === originId && origin.tenant_id === tenantId)).filter(Boolean);
  if (selected.length !== originIds.length) throw httpError(400, "origin_pool_origins_must_belong_to_domain");
  if (selected.some((origin) => origin.status !== "healthy")) throw httpError(409, "healthy_origins_required_for_pool");
  return {
    origin_ids: originIds,
    strategy,
    failover_enabled: failoverEnabled,
    status: failoverEnabled ? "failover_ready" : "ready"
  };
}

async function loadPoolOrigins(pool) {
  const origins = await queryByIndex(tables.origins, "domain_id-index", "domain_id", pool.domain_id);
  return (pool.origin_ids || []).map((originId) => origins.find((origin) => origin.origin_id === originId && origin.tenant_id === pool.tenant_id)).filter(Boolean);
}

async function refreshOriginPoolStatuses(tenantId, domainId) {
  const pools = await queryByIndex(tables.originPools, "domain_id-index", "domain_id", domainId);
  const origins = await queryByIndex(tables.origins, "domain_id-index", "domain_id", domainId);
  const now = new Date().toISOString();
  await Promise.all(pools.filter((pool) => pool.tenant_id === tenantId).map(async (pool) => {
    const selected = (pool.origin_ids || []).map((originId) => origins.find((origin) => origin.origin_id === originId && origin.tenant_id === tenantId)).filter(Boolean);
    const expectedOrigins = pool.failover_enabled ? 2 : 1;
    const healthy = selected.length === expectedOrigins && selected.every((origin) => origin.status === "healthy");
    const status = healthy ? (pool.failover_enabled ? "failover_ready" : "ready") : "degraded";
    if (pool.status === status) return;
    await dynamo.send(new UpdateCommand({
      TableName: tables.originPools,
      Key: { pool_id: pool.pool_id },
      UpdateExpression: "SET #status = :status, updated_at = :updated_at",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":status": status, ":updated_at": now }
    }));
  }));
}

function publicOriginPool(pool) {
  return {
    pool_id: pool.pool_id,
    tenant_id: pool.tenant_id,
    domain_id: pool.domain_id,
    name: pool.name,
    origin_ids: pool.origin_ids || [],
    strategy: pool.strategy,
    failover_enabled: pool.failover_enabled === true,
    status: pool.status
  };
}

function tenantWafLogGroup(domainId) {
  return `aws-waf-logs-${process.env.FORTRESSNET_ENV || "fortressnet"}-${domainId}`.slice(0, 512);
}

function tenantWebAclName(domainId) {
  return `fortressnet-${process.env.FORTRESSNET_ENV || "edge"}-${domainId}`.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 128);
}

function wafVisibilityConfig(metricName) {
  return {
    CloudWatchMetricsEnabled: true,
    MetricName: metricName.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 128),
    SampledRequestsEnabled: true
  };
}

function publicEdgeDeployment(deployment) {
  if (!deployment) return {};
  const { origin_header_value, ...safe } = deployment;
  return safe;
}

async function checkOriginHealth(origin) {
  const target = normalizeOriginUrl(origin.origin_url);
  if (!target) throw httpError(400, "valid_https_origin_url_required");
  const address = await resolvePublicOriginAddress(target.hostname);
  const pathName = normalizeHealthPath(origin.health_path);
  const timeoutMs = Math.min(Math.max(Number(origin.timeout_seconds || 10) * 1000, 1000), 15000);
  const result = await requestHealthCheck(target, address, pathName, timeoutMs, origin.host_header || target.hostname);
  return { ...result, address, checked_url: `${target.protocol}//${target.hostname}${pathName}` };
}

async function recordOriginHealthCheck(origin, actor = null, source = "scheduled") {
  let health;
  try {
    health = await checkOriginHealth(origin);
  } catch (error) {
    health = { healthy: false, status_code: 0, error: error.code || error.message || "health_check_failed" };
  }
  const now = new Date().toISOString();
  const status = health.healthy ? "healthy" : "unhealthy";
  const statusChanged = origin.status !== status;
  const result = await dynamo.send(new UpdateCommand({
    TableName: tables.origins,
    Key: { origin_id: origin.origin_id },
    UpdateExpression: "SET #status = :status, last_health_check_at = :checked, last_health_check = :health, last_health_status_changed_at = :status_changed, updated_at = :updated_at",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":status": status,
      ":checked": now,
      ":health": health,
      ":status_changed": statusChanged ? now : (origin.last_health_status_changed_at || now),
      ":updated_at": now
    },
    ReturnValues: "ALL_NEW"
  }));

  const event = {
    health_event_id: `ohe_${crypto.randomUUID()}`,
    tenant_id: origin.tenant_id,
    domain_id: origin.domain_id,
    origin_id: origin.origin_id,
    source,
    status,
    status_changed: statusChanged,
    health,
    checked_at: now,
    created_at: now,
    expires_at: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60)
  };
  if (tables.originHealthEvents) await putUnique(tables.originHealthEvents, event, "health_event_id");
  await refreshOriginPoolStatuses(origin.tenant_id, origin.domain_id);
  if (source === "manual" || statusChanged) {
    await audit("origin.health_checked", origin.tenant_id, { origin_id: origin.origin_id, source, status_changed: statusChanged, health }, actor);
  }
  return { origin: result.Attributes, health, event };
}

function startOriginHealthScheduler() {
  if (process.env.ORIGIN_HEALTH_SCHEDULER_ENABLED !== "true" || !tables.operationLocks || !tables.originHealthEvents) return;
  const intervalMs = 5 * 60 * 1000;
  const run = () => runOriginHealthSweep().catch((error) => console.warn("origin_health_sweep_failed", error?.message || error));
  setTimeout(run, 30_000).unref();
  setInterval(run, intervalMs).unref();
}

async function runOriginHealthSweep() {
  if (!await acquireOperationLock("origin-health-sweep", 4 * 60)) return;
  const origins = await scanTable(tables.origins);
  for (const origin of origins) await recordOriginHealthCheck(origin, { type: "system", subject: "origin_health_scheduler" }, "scheduled");
  await archiveRecentWafEvents();
}

async function archiveRecentWafEvents() {
  if (!tables.wafEvents || !process.env.AUDIT_LOG_BUCKET) return;
  const deployments = (await scanTable(tables.edgeDeployments)).filter((deployment) => deployment.log_group_name);
  const since = Date.now() - (20 * 60 * 1000);
  for (const deployment of deployments) {
    const response = await cloudwatchLogs.send(new FilterLogEventsCommand({ logGroupName: deployment.log_group_name, startTime: since, limit: 500 })).catch((error) => {
      if (["ResourceNotFoundException", "AccessDeniedException"].includes(error?.name)) return { events: [] };
      throw error;
    });
    const archived = [];
    for (const event of response.events || []) {
      const normalized = normalizeWafLogEvent(event, deployment);
      if (!normalized) continue;
      const item = { ...normalized, raw_log: event.message, archived_at: new Date().toISOString(), created_at: new Date().toISOString(), expires_at: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) };
      try {
        await putUnique(tables.wafEvents, item, "event_id");
        archived.push(item);
      } catch (error) {
        if (error?.name !== "ConditionalCheckFailedException") throw error;
      }
    }
    if (!archived.length) continue;
    const now = new Date();
    const key = ["waf-events", `year=${now.getUTCFullYear()}`, `month=${String(now.getUTCMonth() + 1).padStart(2, "0")}`, `day=${String(now.getUTCDate()).padStart(2, "0")}`, `tenant=${deployment.tenant_id}`, `${Date.now()}-${crypto.randomUUID()}.ndjson`].join("/");
    await s3.send(new PutObjectCommand({ Bucket: process.env.AUDIT_LOG_BUCKET, Key: key, ContentType: "application/x-ndjson", Body: archived.map((item) => JSON.stringify(item)).join("\n") }));
  }
}

async function acquireOperationLock(lockId, leaseSeconds) {
  const now = Math.floor(Date.now() / 1000);
  try {
    await dynamo.send(new UpdateCommand({
      TableName: tables.operationLocks,
      Key: { lock_id: lockId },
      UpdateExpression: "SET expires_at = :expires_at, acquired_at = :acquired_at",
      ConditionExpression: "attribute_not_exists(lock_id) OR expires_at < :now",
      ExpressionAttributeValues: {
        ":expires_at": now + leaseSeconds,
        ":acquired_at": new Date().toISOString(),
        ":now": now
      }
    }));
    return true;
  } catch (error) {
    if (error?.name === "ConditionalCheckFailedException") return false;
    throw error;
  }
}

async function resolvePublicOriginAddress(hostname) {
  if (isBlockedIpAddress(hostname)) throw httpError(400, "private_origin_address_denied");
  const addresses = [];
  const [ipv4, ipv6] = await Promise.all([
    dns.resolve4(hostname).catch(() => []),
    dns.resolve6(hostname).catch(() => [])
  ]);
  addresses.push(...ipv4, ...ipv6);
  if (addresses.some((item) => isBlockedIpAddress(item))) throw httpError(400, "mixed_private_origin_resolution_denied");
  const address = addresses.find((item) => !isBlockedIpAddress(item));
  if (!address) throw httpError(400, "public_origin_resolution_required");
  return address;
}

function requestHealthCheck(target, address, pathName, timeoutMs, hostHeader) {
  const client = target.protocol === "https:" ? https : http;
  return new Promise((resolve) => {
    const request = client.request({
      protocol: target.protocol,
      hostname: address,
      servername: target.hostname,
      port: target.port || (target.protocol === "https:" ? 443 : 80),
      path: pathName,
      method: "GET",
      headers: { Host: hostHeader, "User-Agent": "FortressNet-Origin-Health/1.0" },
      timeout: timeoutMs
    }, (response) => {
      response.resume();
      resolve({ healthy: response.statusCode >= 200 && response.statusCode < 400, status_code: response.statusCode, error: "" });
    });
    request.once("timeout", () => request.destroy(new Error("timeout")));
    request.once("error", (error) => resolve({ healthy: false, status_code: 0, error: error?.message || "request_failed" }));
    request.end();
  });
}

function normalizeHealthPath(value) {
  const pathName = clean(value) || "/";
  return pathName.startsWith("/") && !pathName.startsWith("//") ? pathName : "/";
}

function normalizeDnsRecordName(value, zoneName) {
  const recordName = normalizeDomain(value);
  const normalizedZone = normalizeDomain(zoneName);
  if (!recordName || !normalizedZone || (recordName !== normalizedZone && !recordName.endsWith(`.${normalizedZone}`))) return "";
  return `${recordName}.`;
}

function normalizeDnsRecordValues(value, type) {
  const values = normalizeList(value).map((item) => clean(item)).filter((item) => item && item.length <= 1024 && !/[\r\n]/.test(item));
  if (type === "TXT") return values.map((item) => item.startsWith('"') && item.endsWith('"') ? item : `"${item.replaceAll('"', '\\"')}"`);
  return values;
}

function publicRoute53Record(record) {
  return {
    name: clean(record.Name),
    type: clean(record.Type),
    ttl: Number(record.TTL || 0),
    values: (record.ResourceRecords || []).map((item) => clean(item.Value)).filter(Boolean),
    alias_target: record.AliasTarget ? { dns_name: clean(record.AliasTarget.DNSName), hosted_zone_id: clean(record.AliasTarget.HostedZoneId), evaluate_target_health: record.AliasTarget.EvaluateTargetHealth === true } : null
  };
}

function normalizeImportDnsRecord(record, zoneName) {
  const type = clean(record?.type).toUpperCase();
  const name = normalizeDnsRecordName(record?.name, zoneName);
  const values = normalizeDnsRecordValues(record?.values, type);
  const ttl = Math.min(Math.max(Number(record?.ttl || 300), 60), 86400);
  if (!name || !["A", "AAAA", "CAA", "CNAME", "MX", "SRV", "TXT"].includes(type) || !values.length) return null;
  return { Name: name, Type: type, TTL: ttl, ResourceRecords: values.map((Value) => ({ Value })) };
}

function isVerifiedDomainStatus(status) {
  return ["verified_pending_certificate", "certificate_validation", "certificate_issued_pending_edge", "edge_provisioning", "pending_traffic_dns", "active"].includes(clean(status));
}

function normalizeVerifiedAccessRequest(body, application, connection) {
  const networkInterfaceId = clean(body?.network_interface_id);
  const certificateArn = clean(body?.certificate_arn);
  const securityGroupIds = Array.from(new Set(normalizeList(body?.security_group_ids))).filter((item) => /^sg-[a-z0-9]+$/i.test(item)).slice(0, 5);
  const protocol = application.protocol === "https" ? "https" : clean(body?.protocol).toLowerCase();
  const port = Number(body?.port || (protocol === "https" ? 443 : 22));
  const authorizationEndpoint = clean(body?.authorization_endpoint);
  const tokenEndpoint = clean(body?.token_endpoint);
  const userInfoEndpoint = clean(body?.user_info_endpoint);
  const scope = clean(body?.scope) || "openid profile email";
  if (!/^eni-[a-z0-9]+$/i.test(networkInterfaceId) || !/^arn:aws:acm:us-east-1:\d{12}:certificate\//.test(certificateArn) || !securityGroupIds.length || !["https", "ssh", "rdp", "tcp"].includes(protocol) || !Number.isInteger(port) || port < 1 || port > 65535 || !isHttpsUrl(connection.issuer_url) || !isHttpsUrl(authorizationEndpoint) || !isHttpsUrl(tokenEndpoint) || !isHttpsUrl(userInfoEndpoint)) {
    throw httpError(400, "verified_access_request_invalid");
  }
  if (application.protocol === "https" && protocol !== "https") throw httpError(400, "verified_access_protocol_mismatch");
  return { network_interface_id: networkInterfaceId, security_group_ids: securityGroupIds, certificate_arn: certificateArn, protocol, port, authorization_endpoint: authorizationEndpoint, token_endpoint: tokenEndpoint, user_info_endpoint: userInfoEndpoint, scope };
}

function normalizeClientSecurityReport(body, deployment) {
  const source = Array.isArray(body) ? body[0] : body;
  const report = source?.["csp-report"] || source?.body || source;
  const documentUri = clean(report?.["document-uri"] || report?.documentURL);
  let hostname = "";
  try { hostname = new URL(documentUri).hostname; } catch { return null; }
  if (hostname !== deployment.domain_name) return null;
  const now = new Date().toISOString();
  const signature = hashSecret(JSON.stringify({ documentUri, blocked: clean(report?.["blocked-uri"] || report?.blockedURL), directive: clean(report?.["violated-directive"] || report?.effectiveDirective), original: clean(report?.["original-policy"] || report?.originalPolicy) }));
  return {
    event_id: `cse_${deployment.deployment_id}_${signature.slice(0, 24)}`,
    tenant_id: deployment.tenant_id,
    domain_id: deployment.domain_id,
    deployment_id: deployment.deployment_id,
    document_uri: documentUri.slice(0, 2048),
    blocked_uri: clean(report?.["blocked-uri"] || report?.blockedURL).slice(0, 2048),
    effective_directive: clean(report?.["effective-directive"] || report?.effectiveDirective).slice(0, 256),
    violated_directive: clean(report?.["violated-directive"] || report?.violatedDirective).slice(0, 512),
    source_file: clean(report?.["source-file"] || report?.sourceFile).slice(0, 2048),
    line_number: Number(report?.["line-number"] || report?.lineNumber || 0),
    received_at: now,
    created_at: now,
    expires_at: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60)
  };
}

async function buildMarketplaceUsage(tenantId, dimension) {
  if (dimension === "protected_domains") {
    return { quantity: Math.max(1, (await queryByTenant(tables.domains, tenantId)).filter((domain) => domain.status === "active").length) };
  }
  const deployments = await queryByTenant(tables.edgeDeployments, tenantId);
  const events = await collectSecurityEvents(deployments, 500);
  return { quantity: Math.max(1, events.length) };
}

function isHttpsUrl(value) {
  try {
    return new URL(clean(value)).protocol === "https:";
  } catch {
    return false;
  }
}

async function evaluateDnsPosture(domain, origin, zone) {
  const hostname = domain.domain_name;
  const [ipv4, ipv6, caa, dmarc, spf] = await Promise.all([
    dns.resolve4(hostname).catch(() => []),
    dns.resolve6(hostname).catch(() => []),
    (typeof dns.resolveCaa === "function" ? dns.resolveCaa(hostname).catch(() => []) : Promise.resolve([])),
    dns.resolveTxt(`_dmarc.${hostname}`).catch(() => []),
    dns.resolveTxt(hostname).catch(() => [])
  ]);
  const originAddresses = origin?.hostname ? await resolvePublicOriginAddresses(origin.hostname) : [];
  const publicAddresses = [...ipv4, ...ipv6].filter((address) => !isBlockedIpAddress(address));
  const originExposed = originAddresses.some((address) => publicAddresses.includes(address));
  let dnssecStatus = "external_or_unknown";
  if (zone?.route53_zone_id) {
    dnssecStatus = clean((await route53.send(new GetDNSSECCommand({ HostedZoneId: zone.route53_zone_id }))).Status) || "unknown";
  }
  return {
    domain_id: domain.domain_id,
    generated_at: new Date().toISOString(),
    mode: zone?.mode || "external_unmanaged",
    dnssec_status: dnssecStatus,
    caa_present: caa.length > 0,
    dmarc_present: dmarc.length > 0,
    spf_present: spf.some((parts) => parts.join("").toLowerCase().includes("v=spf1")),
    origin_ip_exposed: originExposed,
    public_addresses: publicAddresses,
    findings: [
      ...(caa.length ? [] : [{ code: "caa_missing", severity: "medium", recommendation: "Restrict certificate issuance with CAA records." }]),
      ...(originExposed ? [{ code: "origin_ip_exposed", severity: "high", recommendation: "Restrict direct origin access to the FortressNet verification header and edge ranges." }] : []),
      ...(dmarc.length ? [] : [{ code: "dmarc_missing", severity: "medium", recommendation: "Publish a DMARC policy before enabling email reporting." }])
    ]
  };
}

async function resolvePublicOriginAddresses(hostname) {
  const [ipv4, ipv6] = await Promise.all([dns.resolve4(hostname).catch(() => []), dns.resolve6(hostname).catch(() => [])]);
  const addresses = [...ipv4, ...ipv6];
  return addresses.some((address) => isBlockedIpAddress(address)) ? [] : addresses;
}

function buildAiFindings(tenantId, events) {
  const now = new Date().toISOString();
  const day = now.slice(0, 10);
  const blocked = events.filter((event) => event.action === "BLOCK");
  const findings = [];
  if (blocked.length >= 25) {
    findings.push(aiFinding(tenantId, day, "sustained_blocked_requests", "high", `${blocked.length} blocked WAF requests were observed in the last 24 hours.`, "Review the affected paths and approve a tenant rate-limit or managed-rule tuning change.", blocked.length, now));
  }
  const byRule = blocked.reduce((counts, event) => ({ ...counts, [event.rule_id || "unknown"]: (counts[event.rule_id || "unknown"] || 0) + 1 }), {});
  for (const [ruleId, count] of Object.entries(byRule).filter(([, count]) => count >= 10).slice(0, 3)) {
    findings.push(aiFinding(tenantId, day, `rule_concentration_${hashSecret(ruleId).slice(0, 8)}`, "medium", `Rule ${ruleId} accounted for ${count} blocked requests.`, "Keep the rule in count mode only after an approved change set and review false positives.", count, now));
  }
  return findings;
}

function aiFinding(tenantId, day, code, severity, summary, recommendation, evidenceCount, now) {
  return {
    finding_id: `aif_${tenantId}_${day}_${code}`,
    tenant_id: tenantId,
    code,
    severity,
    status: "open",
    mode: "read_only",
    source: "cloudwatch_waf_logs",
    summary,
    recommendation,
    evidence_count: evidenceCount,
    created_at: now,
    updated_at: now
  };
}

async function applyWafChangeSet(changeSet, edgeDeployment) {
  const webAcl = await waf.send(new GetWebACLCommand({ Id: edgeDeployment.web_acl_id, Name: edgeDeployment.web_acl_name || tenantWebAclName(edgeDeployment.domain_id), Scope: "CLOUDFRONT" }));
  if (!webAcl.LockToken) throw httpError(502, "waf_web_acl_not_available");
  const materialized = await materializeWafRules(changeSet, edgeDeployment);
  try {
    await waf.send(new UpdateWebACLCommand({
      Id: edgeDeployment.web_acl_id,
      Name: webAcl.WebACL.Name,
      Scope: "CLOUDFRONT",
      LockToken: webAcl.LockToken,
      DefaultAction: webAcl.WebACL.DefaultAction || { Allow: {} },
      VisibilityConfig: webAcl.WebACL.VisibilityConfig || wafVisibilityConfig(`fn_${edgeDeployment.domain_id}`),
      Rules: toAwsWafRules(materialized.rules, edgeDeployment.domain_id)
    }));
  } catch (error) {
    await deleteWafIpSets(materialized.ipSets);
    throw error;
  }
  const now = new Date().toISOString();
  const updated = {
    ...changeSet,
    status: "applied",
    domain_id: edgeDeployment.domain_id,
    web_acl_id: edgeDeployment.web_acl_id,
    rollback_rules: webAcl.WebACL.Rules || [],
    waf_ip_sets: materialized.ipSets,
    applied_at: now,
    updated_at: now
  };
  await dynamo.send(new PutCommand({ TableName: tables.wafChangeSets, Item: updated }));
  await dynamo.send(new UpdateCommand({
    TableName: tables.edgeDeployments,
    Key: { deployment_id: edgeDeployment.deployment_id },
    UpdateExpression: "SET waf_ip_sets = :ip_sets, updated_at = :updated_at",
    ExpressionAttributeValues: { ":ip_sets": materialized.ipSets, ":updated_at": now }
  }));
  await deleteWafIpSets(edgeDeployment.waf_ip_sets || []);
  return updated;
}

async function replaceWafRules(edgeDeployment, rules) {
  const webAcl = await waf.send(new GetWebACLCommand({ Id: edgeDeployment.web_acl_id, Name: edgeDeployment.web_acl_name || tenantWebAclName(edgeDeployment.domain_id), Scope: "CLOUDFRONT" }));
  if (!webAcl.LockToken) throw httpError(502, "waf_web_acl_not_available");
  await waf.send(new UpdateWebACLCommand({
    Id: edgeDeployment.web_acl_id,
    Name: webAcl.WebACL.Name,
    Scope: "CLOUDFRONT",
    LockToken: webAcl.LockToken,
    DefaultAction: webAcl.WebACL.DefaultAction || { Allow: {} },
    VisibilityConfig: webAcl.WebACL.VisibilityConfig || wafVisibilityConfig(`fn_${edgeDeployment.domain_id}`),
    Rules: rules
  }));
}

function toAwsWafRules(rules, domainId) {
  return rules.map((rule, index) => {
    const common = {
      Name: `${rule.name}-${index}`.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 128),
      Priority: (index + 1) * 10,
      VisibilityConfig: wafVisibilityConfig(`fn_${domainId}_${index + 1}`)
    };
    if (rule.type === "managed_rule_group") {
      return {
        ...common,
        OverrideAction: rule.override_action === "count" ? { Count: {} } : { None: {} },
        Statement: { ManagedRuleGroupStatement: { Name: rule.rule_group, VendorName: rule.vendor || "AWS" } }
      };
    }
    if (rule.type === "rate_based_rule") {
      const rateBasedStatement = {
        AggregateKeyType: rule.aggregate_key_type || "IP",
        Limit: Number(rule.limit || 2000),
        EvaluationWindowSec: Number(rule.evaluation_window_sec || 300)
      };
      const scopeDownStatement = rateLimitScopeDownStatement(rule);
      if (scopeDownStatement) rateBasedStatement.ScopeDownStatement = scopeDownStatement;
      return {
        ...common,
        Action: rule.action === "COUNT" ? { Count: {} } : { Block: {} },
        Statement: { RateBasedStatement: rateBasedStatement }
      };
    }
    if (rule.type === "asn_match") {
      return {
        ...common,
        Action: rule.action === "COUNT" ? { Count: {} } : { Block: {} },
        Statement: { AsnMatchStatement: { ASNs: rule.asns } }
      };
    }
    if (rule.type === "header_match") {
      const statements = rule.values.map((value) => ({
        ByteMatchStatement: {
          SearchString: Buffer.from(value, "utf8"),
          FieldToMatch: { SingleHeader: { Name: rule.header_name } },
          TextTransformations: [{ Priority: 0, Type: "NONE" }],
          PositionalConstraint: "EXACTLY"
        }
      }));
      return {
        ...common,
        Action: rule.action === "COUNT" ? { Count: {} } : { Block: {} },
        Statement: statements.length === 1 ? statements[0] : { OrStatement: { Statements: statements } }
      };
    }
    if (rule.type === "ip_set_reference") {
      return {
        ...common,
        Action: rule.action === "ALLOW" ? { Allow: {} } : rule.action === "COUNT" ? { Count: {} } : { Block: {} },
        Statement: { IPSetReferenceStatement: { ARN: rule.arn } }
      };
    }
    throw httpError(409, "unsupported_waf_rule_type");
  });
}

async function materializeWafRules(changeSet, edgeDeployment) {
  const ipSets = [];
  const rules = [];
  try {
    for (const rule of changeSet.rules || []) {
      if (rule.type !== "ip_list") {
        rules.push(rule);
        continue;
      }
      for (const [version, addresses] of Object.entries(groupIpAddressesByVersion(rule.addresses))) {
        if (!addresses.length) continue;
        const name = `fn-${edgeDeployment.domain_id.slice(-18)}-${changeSet.change_set_id.slice(-12)}-${rule.list_type}-${version.toLowerCase()}`.slice(0, 128);
        const result = await waf.send(new CreateIPSetCommand({
          Name: name,
          Description: `FortressNet ${rule.list_type} list for ${edgeDeployment.domain_id}`,
          Scope: "CLOUDFRONT",
          IPAddressVersion: version,
          Addresses: addresses,
          Tags: [{ Key: "fortressnet:managed", Value: "true" }, { Key: "fortressnet:tenant-id", Value: changeSet.tenant_id }]
        }));
        const ipSet = result.Summary;
        if (!ipSet?.ARN || !ipSet?.Id || !ipSet?.Name) throw httpError(502, "waf_ip_set_not_available");
        const resource = { arn: ipSet.ARN, id: ipSet.Id, name: ipSet.Name, version, list_type: rule.list_type };
        ipSets.push(resource);
        rules.push({
          name: `${rule.name}-${version}`,
          type: "ip_set_reference",
          arn: ipSet.ARN,
          action: rule.action
        });
      }
    }
    return { rules, ipSets };
  } catch (error) {
    await deleteWafIpSets(ipSets);
    throw error;
  }
}

async function deleteWafIpSets(ipSets) {
  await Promise.all((ipSets || []).map(async (ipSet) => {
    if (!ipSet?.id || !ipSet?.name) return;
    try {
      const current = await waf.send(new GetIPSetCommand({ Id: ipSet.id, Name: ipSet.name, Scope: "CLOUDFRONT" }));
      if (current.LockToken) await waf.send(new DeleteIPSetCommand({ Id: ipSet.id, Name: ipSet.name, Scope: "CLOUDFRONT", LockToken: current.LockToken }));
    } catch (error) {
      if (!["WAFNonexistentItemException", "WAFUnavailableEntityException"].includes(error?.name)) console.warn("waf_ip_set_delete_failed", ipSet.id, error?.message || error);
    }
  }));
}

function rateLimitScopeDownStatement(rule) {
  const statements = [];
  if (rule.path) {
    statements.push({
      ByteMatchStatement: {
        SearchString: Buffer.from(rule.path, "utf8"),
        FieldToMatch: { UriPath: {} },
        TextTransformations: [{ Priority: 0, Type: "NONE" }],
        PositionalConstraint: "STARTS_WITH"
      }
    });
  }

  const methods = Array.isArray(rule.methods) ? rule.methods : [];
  if (methods.length === 1) {
    statements.push(wafMethodStatement(methods[0]));
  } else if (methods.length > 1) {
    statements.push({ OrStatement: { Statements: methods.map(wafMethodStatement) } });
  }

  const countries = Array.isArray(rule.countries) ? rule.countries : [];
  if (countries.length) statements.push({ GeoMatchStatement: { CountryCodes: countries } });
  if (!statements.length) return null;
  return statements.length === 1 ? statements[0] : { AndStatement: { Statements: statements } };
}

function wafMethodStatement(method) {
  return {
    ByteMatchStatement: {
      SearchString: Buffer.from(method, "utf8"),
      FieldToMatch: { Method: {} },
      TextTransformations: [{ Priority: 0, Type: "NONE" }],
      PositionalConstraint: "EXACTLY"
    }
  };
}

async function collectSecurityEvents(deployments, limit) {
  const results = await Promise.all(deployments.filter((item) => item.log_group_name).map(async (deployment) => {
    const response = await cloudwatchLogs.send(new FilterLogEventsCommand({
      logGroupName: deployment.log_group_name,
      startTime: Date.now() - 24 * 60 * 60 * 1000,
      limit: Math.min(Math.max(limit, 1), 500)
    })).catch((error) => {
      if (["ResourceNotFoundException", "AccessDeniedException"].includes(error?.name)) return { events: [] };
      throw error;
    });
    return (response.events || []).map((event) => normalizeWafLogEvent(event, deployment)).filter(Boolean);
  }));
  return results.flat().sort((a, b) => b.timestamp - a.timestamp).slice(0, Math.min(Math.max(limit, 1), 500));
}

function normalizeWafLogEvent(event, deployment) {
  const record = parseJson(event.message, null);
  if (!record) return null;
  const request = record.httpRequest || {};
  return {
    event_id: `evt_${hashSecret(`${deployment.deployment_id}:${event.eventId || event.timestamp}`)}`,
    tenant_id: deployment.tenant_id,
    domain_id: deployment.domain_id,
    timestamp: Number(event.timestamp || record.timestamp || 0),
    action: record.action || "UNKNOWN",
    rule_id: record.terminatingRuleId || "",
    method: request.httpMethod || "",
    uri: request.uri || "",
    country: request.country || "",
    client_ip_hash: request.clientIp ? hashSecret(request.clientIp).slice(0, 16) : ""
  };
}

function buildSecurityReport(tenantId, events, deployments) {
  const blocked = events.filter((event) => event.action === "BLOCK").length;
  const allowed = events.filter((event) => event.action === "ALLOW").length;
  return {
    report_id: `rpt_${tenantId}_${new Date().toISOString().slice(0, 10)}`,
    tenant_id: tenantId,
    generated_at: new Date().toISOString(),
    source: "cloudwatch_waf_logs",
    edge_deployments: deployments.length,
    total_events: events.length,
    blocked_events: blocked,
    allowed_events: allowed,
    top_rules: Object.entries(events.reduce((counts, event) => ({ ...counts, [event.rule_id || "none"]: (counts[event.rule_id || "none"] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([rule_id, count]) => ({ rule_id, count }))
  };
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

function normalizePrivateApplicationHostname(value) {
  const hostname = clean(value).toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!hostname || hostname.length > 253 || /[/?#@\s]/.test(hostname)) return "";
  if (/^(?:localhost|.+\.local)$/i.test(hostname)) return hostname;
  if (isIP(hostname)) return hostname;
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]?$/.test(hostname) ? hostname : "";
}

function normalizeOriginUrl(value) {
  try {
    const url = new URL(clean(value));
    if (url.protocol !== "https:") return null;
    const port = url.port ? Number(url.port) : 443;
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
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

function normalizeWafMode(value) {
  const mode = clean(value).toLowerCase() || "monitor";
  return { managed_defaults: "monitor", count: "monitor", monitor: "monitor", block: "block" }[mode] || "";
}

function buildApiInventory(tenantId, events) {
  const now = new Date().toISOString();
  const endpoints = new Map();
  for (const event of events.filter((item) => item.method && item.uri)) {
    const path = normalizeApiPath(event.uri);
    const key = `${event.domain_id}:${event.method}:${path}`;
    const current = endpoints.get(key) || { endpoint_id: `api_${hashSecret(`${tenantId}:${key}`).slice(0, 24)}`, tenant_id: tenantId, domain_id: event.domain_id, method: event.method, path_template: path, classification: "unknown", auth_posture: "unknown", observed_requests: 0, blocked_requests: 0, first_seen_at: now, created_at: now };
    current.observed_requests += 1;
    if (event.action === "BLOCK") current.blocked_requests += 1;
    current.last_seen_at = new Date(event.timestamp || Date.now()).toISOString();
    current.updated_at = now;
    endpoints.set(key, current);
  }
  return [...endpoints.values()];
}

function normalizeApiPath(value) {
  const path = clean(value).split("?")[0] || "/";
  return path.split("/").map((segment) => (/^\d+$/.test(segment) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment) ? "{id}" : segment)).join("/");
}

function validateOpenApiDocument(document) {
  if (!document || typeof document !== "object" || Array.isArray(document) || !String(document.openapi || "").startsWith("3.")) throw httpError(400, "openapi_3_document_required");
  if (!document.info || typeof document.info !== "object" || !clean(document.info.title)) throw httpError(400, "openapi_info_required");
  if (!document.paths || typeof document.paths !== "object" || Array.isArray(document.paths)) throw httpError(400, "openapi_paths_required");
  if (Buffer.byteLength(JSON.stringify(document), "utf8") > 180000) throw httpError(400, "openapi_document_too_large");
  const endpoints = Object.entries(document.paths).flatMap(([path, operations]) => Object.keys(operations || {}).filter((method) => ["get", "post", "put", "patch", "delete", "head", "options"].includes(method)).map((method) => ({ method: method.toUpperCase(), path_template: path })));
  if (!endpoints.length || endpoints.length > 500) throw httpError(400, "openapi_endpoints_invalid");
  return { endpoints };
}

function normalizeWafRateLimitConfig(body) {
  const limit = Number(body.rate_limit ?? 2000);
  if (!Number.isSafeInteger(limit) || limit < 100 || limit > 2_000_000) throw httpError(400, "rate_limit_invalid");

  const path = clean(body.rate_limit_path);
  if (path && (!path.startsWith("/") || path.startsWith("//") || path.length > 512 || /[?#\r\n]/.test(path))) {
    throw httpError(400, "rate_limit_path_invalid");
  }

  const methods = uniqueNormalizedValues(body.rate_limit_methods, (value) => clean(value).toUpperCase());
  const supportedMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
  if (methods.length > supportedMethods.size || methods.some((method) => !supportedMethods.has(method))) {
    throw httpError(400, "rate_limit_methods_invalid");
  }

  const countries = uniqueNormalizedValues(body.rate_limit_countries, (value) => clean(value).toUpperCase());
  if (countries.length > supportedWafCountries.size || countries.some((country) => !supportedWafCountries.has(country))) {
    throw httpError(400, "rate_limit_countries_invalid");
  }

  return {
    rate_limit: limit,
    rate_limit_path: path,
    rate_limit_methods: methods,
    rate_limit_countries: countries
  };
}

function normalizeWafAdvancedConfig(body) {
  const managedProtections = uniqueNormalizedValues(body.managed_protections, (value) => clean(value).toLowerCase());
  const supportedProtections = new Set(["ip_reputation", "anonymous_ip"]);
  if (managedProtections.some((value) => !supportedProtections.has(value))) throw httpError(400, "managed_protections_invalid");

  const blockedAsns = uniqueNormalizedValues(body.blocked_asns, (value) => clean(value)).map(Number);
  if (blockedAsns.length > 100 || blockedAsns.some((value) => !Number.isSafeInteger(value) || value < 1 || value > 4_294_967_295)) {
    throw httpError(400, "blocked_asns_invalid");
  }

  const headerName = clean(body.blocked_header_name).toLowerCase();
  const headerValues = uniqueNormalizedValues(body.blocked_header_values, (value) => clean(value));
  if ((headerName || headerValues.length) && (!/^[!#$%&'*+.^_`|~0-9a-z-]{1,64}$/.test(headerName) || !headerValues.length || headerValues.length > 10 || headerValues.some((value) => value.length > 200 || /[^\x20-\x7e]/.test(value)))) {
    throw httpError(400, "blocked_header_invalid");
  }

  const allowedIpCidrs = normalizeIpCidrs(body.allowed_ip_cidrs);
  const blockedIpCidrs = normalizeIpCidrs(body.blocked_ip_cidrs);
  return {
    managed_protections: managedProtections,
    blocked_asns: blockedAsns,
    blocked_header_name: headerName,
    blocked_header_values: headerValues,
    allowed_ip_cidrs: allowedIpCidrs,
    blocked_ip_cidrs: blockedIpCidrs
  };
}

function normalizeIpCidrs(value) {
  const addresses = Array.from(new Set(String(Array.isArray(value) ? value.join(",") : value || "").split(/[\s,]+/).map(clean).filter(Boolean)));
  if (addresses.length > 1000 || addresses.some((address) => !isValidIpCidr(address))) throw httpError(400, "ip_cidr_list_invalid");
  return addresses;
}

function isValidIpCidr(value) {
  const [host, prefix, extra] = value.split("/");
  if (!host || !prefix || extra) return false;
  const version = host.includes(":") ? 6 : 4;
  const maxPrefix = version === 6 ? 128 : 32;
  const parsedPrefix = Number(prefix);
  return Number.isSafeInteger(parsedPrefix) && parsedPrefix >= 0 && parsedPrefix <= maxPrefix && isIP(host) === version;
}

function groupIpAddressesByVersion(addresses) {
  return {
    IPV4: addresses.filter((address) => !address.split("/")[0].includes(":")),
    IPV6: addresses.filter((address) => address.split("/")[0].includes(":"))
  };
}

function uniqueNormalizedValues(value, normalize) {
  return Array.from(new Set(normalizeList(value).map(normalize).filter(Boolean)));
}

async function requirePilotMonitorBaseline(changeSet, edgeDeployment) {
  const minimumAgeMs = 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - minimumAgeMs;
  const changeSets = await queryByTenant(tables.wafChangeSets, changeSet.tenant_id);
  const baseline = changeSets.find((item) => (
    item.change_set_id !== changeSet.change_set_id &&
    item.domain_id === edgeDeployment.domain_id &&
    item.status === "applied" &&
    item.mode === "monitor" &&
    Date.parse(item.applied_at || "") <= cutoff
  ));
  if (!baseline) {
    const error = httpError(409, "monitor_observation_window_required");
    error.details = { domain_id: edgeDeployment.domain_id, minimum_observation_hours: 24 };
    throw error;
  }
}

function compileWafRules(policy) {
  const action = policy.mode === "block" ? "BLOCK" : "COUNT";
  const managedOverride = action === "BLOCK" ? "none" : "count";
  const protections = new Set(Array.isArray(policy.managed_protections) ? policy.managed_protections : []);
  const baseRules = [];
  if (Array.isArray(policy.allowed_ip_cidrs) && policy.allowed_ip_cidrs.length) {
    baseRules.push({ name: "FortressNetAllowedSources", type: "ip_list", list_type: "allow", addresses: policy.allowed_ip_cidrs, action: "ALLOW" });
  }
  baseRules.push(
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
      path: policy.rate_limit_path || "",
      methods: Array.isArray(policy.rate_limit_methods) ? policy.rate_limit_methods : [],
      countries: Array.isArray(policy.rate_limit_countries) ? policy.rate_limit_countries : [],
      action
    }
  );
  if (protections.has("ip_reputation")) {
    baseRules.push({
      name: "AWS-AWSManagedRulesAmazonIpReputationList",
      type: "managed_rule_group",
      vendor: "AWS",
      rule_group: "AWSManagedRulesAmazonIpReputationList",
      override_action: managedOverride
    });
  }
  if (protections.has("anonymous_ip")) {
    baseRules.push({
      name: "AWS-AWSManagedRulesAnonymousIpList",
      type: "managed_rule_group",
      vendor: "AWS",
      rule_group: "AWSManagedRulesAnonymousIpList",
      override_action: managedOverride
    });
  }
  if (Array.isArray(policy.blocked_asns) && policy.blocked_asns.length) baseRules.push({ name: "FortressNetBlockedAsns", type: "asn_match", asns: policy.blocked_asns, action });
  if (policy.blocked_header_name && Array.isArray(policy.blocked_header_values) && policy.blocked_header_values.length) {
    baseRules.push({ name: "FortressNetBlockedHeader", type: "header_match", header_name: policy.blocked_header_name, values: policy.blocked_header_values, action });
  }
  if (Array.isArray(policy.blocked_ip_cidrs) && policy.blocked_ip_cidrs.length) {
    baseRules.push({ name: "FortressNetBlockedSources", type: "ip_list", list_type: "block", addresses: policy.blocked_ip_cidrs, action });
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
    scopes: actor.scopes,
    mfa_required: Boolean(actor.mfa_required),
    mfa_enrolled: Boolean(actor.mfa_enrolled)
  };
}

function actorProfileId(actor) {
  return actor?.subject ? `profile_${actor.subject}` : "profile_bootstrap-admin";
}

function defaultProfile(profileId, actor = null) {
  return {
    profile_id: profileId,
    display_name: actor?.email || "",
    email: actor?.email || "",
    timezone: "UTC",
    locale: "en-US",
    notification_email: true,
    notification_security: true
  };
}

function normalizeProfileTimezone(value) {
  const timezone = clean(value) || "UTC";
  if (timezone === "UTC" || /^UTC[+-](?:[0-9]|1[0-9]|2[0-3])(?::[0-5][0-9])?$/.test(timezone)) return timezone;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return timezone;
  } catch {
    throw httpError(400, "profile_timezone_invalid");
  }
}

function normalizeProfileLocale(value) {
  const locale = clean(value) || "en-US";
  const supported = new Set(["en-US", "en-GB", "es-ES", "es-AR", "pt-BR", "fr-FR", "de-DE", "it-IT", "ja-JP"]);
  if (!supported.has(locale)) throw httpError(400, "profile_locale_invalid");
  return locale;
}

export { buildApiInventory, cloudFrontDistributionConfig, compileWafRules, normalizeOriginUrl, normalizeWafAdvancedConfig, normalizeWafRateLimitConfig, toAwsWafRules, validateOpenApiDocument };
