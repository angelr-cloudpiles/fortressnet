import React, { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { createRoot } from "react-dom/client";
import {
  Activity,
  BarChart3,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Copy,
  CreditCard,
  FileText,
  Globe2,
  Home,
  KeyRound,
  Layers3,
  Link2,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Sparkles,
  TerminalSquare,
  Users,
  X
} from "lucide-react";
import "./styles.css";

const navItems = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "onboarding", label: "Onboarding", icon: CheckCircle2 },
  { id: "domains", label: "Domains", icon: Globe2 },
  { id: "dns", label: "DNS & TLS", icon: Globe2 },
  { id: "dmarc", label: "DMARC", icon: FileText },
  { id: "origins", label: "Origins", icon: Layers3 },
  { id: "policies", label: "Policies", icon: Shield },
  { id: "api-shield", label: "API Shield", icon: Shield },
  { id: "access", label: "Access", icon: Users },
  { id: "idp", label: "External IdP", icon: Link2 },
  { id: "ztna", label: "Zero Trust", icon: LockKeyhole },
  { id: "api-keys", label: "API Keys", icon: KeyRound },
  { id: "events", label: "Events", icon: ClipboardList },
  { id: "ai", label: "AI Analyst", icon: Sparkles, badge: "Beta" },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "profile", label: "Profile", icon: Users },
  { id: "settings", label: "Settings", icon: Settings }
];

const profileLocaleOptions = [
  { value: "en-US", label: "English (United States)" },
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "es-ES", label: "Espanol (Espana)" },
  { value: "es-AR", label: "Espanol (Argentina)" },
  { value: "pt-BR", label: "Portugues (Brasil)" },
  { value: "fr-FR", label: "Francais (France)" },
  { value: "de-DE", label: "Deutsch (Deutschland)" },
  { value: "it-IT", label: "Italiano (Italia)" },
  { value: "ja-JP", label: "Japanese (Japan)" }
];

const fallbackTimezoneOptions = [
  "UTC",
  "America/Argentina/Buenos_Aires",
  "America/Los_Angeles",
  "America/New_York",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Paris"
];

const profileTimezoneOptions = Array.from(new Set([
  "UTC",
  ...(typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : fallbackTimezoneOptions)
]));

const rateLimitMethodOptions = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const rateLimitCountryOptions = [
  ["AR", "Argentina"], ["AU", "Australia"], ["BE", "Belgium"], ["BR", "Brazil"], ["CA", "Canada"], ["CH", "Switzerland"], ["CL", "Chile"], ["CO", "Colombia"], ["DE", "Germany"], ["DK", "Denmark"], ["ES", "Spain"], ["FI", "Finland"], ["FR", "France"], ["GB", "United Kingdom"], ["HK", "Hong Kong"], ["IE", "Ireland"], ["IN", "India"], ["IT", "Italy"], ["JP", "Japan"], ["KR", "South Korea"], ["MX", "Mexico"], ["NL", "Netherlands"], ["NO", "Norway"], ["NZ", "New Zealand"], ["PE", "Peru"], ["PL", "Poland"], ["PT", "Portugal"], ["SE", "Sweden"], ["SG", "Singapore"], ["US", "United States"], ["ZA", "South Africa"]
];

const tenantCountryOptions = [
  ["AR", "Argentina"], ["AU", "Australia"], ["BR", "Brazil"], ["CA", "Canada"], ["CL", "Chile"], ["CO", "Colombia"], ["DE", "Germany"], ["ES", "Spain"], ["FR", "France"], ["GB", "United Kingdom"], ["IE", "Ireland"], ["IT", "Italy"], ["JP", "Japan"], ["MX", "Mexico"], ["NL", "Netherlands"], ["PE", "Peru"], ["PT", "Portugal"], ["SG", "Singapore"], ["US", "United States"], ["UY", "Uruguay"]
];

const verifiedDomainStatuses = new Set([
  "verified_pending_certificate",
  "certificate_validation",
  "certificate_issued_pending_edge",
  "edge_provisioning",
  "pending_traffic_dns",
  "active"
]);

const workflowStatusLabels = {
  pending_dns: "Awaiting ownership TXT",
  verified_pending_certificate: "Ownership verified",
  certificate_validation: "Certificate validation in progress",
  pending_ownership_verification: "Preparing certificate validation",
  pending_dns_validation: "Awaiting ACM DNS record",
  PENDING_VALIDATION: "Awaiting ACM validation",
  ISSUED: "Issued",
  FAILED: "Failed",
  certificate_issued_pending_edge: "Certificate issued",
  pending_health_check: "Health check required",
  healthy: "Healthy",
  pending_approval: "Approval required",
  approved: "Approved",
  provisioning: "Provisioning",
  ready_for_cutover: "Ready for traffic DNS",
  pending_traffic_dns: "Awaiting traffic DNS",
  active: "Active",
  applied: "Applied"
};

const emptyState = {
  tenants: [],
  domains: [],
  policies: [],
  entitlements: [],
  users: [],
  api_keys: [],
  idp_connections: [],
  profiles: [],
  origins: [],
  origin_pools: [],
  certificates: [],
  waf_change_sets: [],
  edge_deployments: [],
  approvals: [],
  dns_zones: [],
  dns_records: [],
  ai_findings: [],
  ztna_applications: []
};

function App() {
  const [active, setActive] = useState("overview");
  const [range, setRange] = useState("24H");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [authConfig, setAuthConfig] = useState(null);
  const [platform, setPlatform] = useState(null);
  const [token, setToken] = useState(() => sessionStorage.getItem("fortressnet_auth_token") || sessionStorage.getItem("fortressnet_admin_token") || "");
  const [accessToken, setAccessToken] = useState(() => sessionStorage.getItem("fortressnet_access_token") || "");
  const [authMode, setAuthMode] = useState(() => sessionStorage.getItem("fortressnet_auth_mode") || "");
  const [state, setState] = useState(emptyState);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [tenantWizardOpen, setTenantWizardOpen] = useState(false);
  const [status, setStatus] = useState({ type: "idle", message: "" });
  const pageTitle = navItems.find((item) => item.id === active)?.label ?? "Overview";

  const selectedTenant = useMemo(
    () => state.tenants.find((tenant) => tenant.tenant_id === selectedTenantId) || null,
    [state.tenants, selectedTenantId]
  );

  useEffect(() => {
    fetch("/api/auth/config")
      .then((response) => response.json())
      .then(setAuthConfig)
      .catch(() => setAuthConfig({ login_ready: false }));
  }, []);

  useEffect(() => {
    if (!token) return;
    apiRequest("/api/platform", token).then(setPlatform).catch(() => setPlatform(null));
    loadState(token, setState, setStatus, setSelectedTenantId, () => setActive("profile"));
  }, [token]);

  useEffect(() => {
    if (!authConfig || window.location.pathname !== "/auth/callback") return;
    completeCognitoCallback(authConfig)
      .then((tokens) => {
        sessionStorage.setItem("fortressnet_auth_token", tokens.id_token);
        sessionStorage.setItem("fortressnet_access_token", tokens.access_token);
        sessionStorage.setItem("fortressnet_auth_mode", "cognito");
        setAuthMode("cognito");
        setToken(tokens.id_token);
        setAccessToken(tokens.access_token);
        window.history.replaceState({}, "", "/");
        setStatus({ type: "success", message: "Cognito session established." });
      })
      .catch((error) => {
        window.history.replaceState({}, "", "/");
        setStatus({ type: "error", message: error.message });
      });
  }, [authConfig]);

  const persistToken = (value) => {
    const clean = value.trim();
    setToken(clean);
    if (clean) {
      sessionStorage.setItem("fortressnet_admin_token", clean);
      sessionStorage.removeItem("fortressnet_auth_token");
      sessionStorage.removeItem("fortressnet_access_token");
      sessionStorage.setItem("fortressnet_auth_mode", "bootstrap");
      setAuthMode("bootstrap");
      setAccessToken("");
      loadState(clean, setState, setStatus, setSelectedTenantId, () => setActive("profile"));
    } else {
      sessionStorage.removeItem("fortressnet_admin_token");
      sessionStorage.removeItem("fortressnet_auth_token");
      sessionStorage.removeItem("fortressnet_access_token");
      sessionStorage.removeItem("fortressnet_auth_mode");
      setAuthMode("");
      setState(emptyState);
      setSelectedTenantId("");
      setPlatform(null);
    }
  };

  const reload = async () => {
    if (!token) {
      setStatus({ type: "warning", message: "Management token required." });
      return;
    }
    setStatus({ type: "idle", message: "Synchronizing console data..." });
    await loadState(token, setState, setStatus, setSelectedTenantId, () => setActive("profile"));
  };

  const signIn = () => startCognitoLogin(authConfig).catch((error) => setStatus({ type: "error", message: error.message }));
  const openTenantCreate = () => {
    setTenantWizardOpen(true);
  };
  const searchConsole = (value) => {
    const query = value.trim().toLowerCase();
    if (!query) return;
    const tenant = state.tenants.find((item) => `${item.name} ${item.tenant_id}`.toLowerCase().includes(query));
    if (tenant) {
      setSelectedTenantId(tenant.tenant_id);
      setActive("overview");
      setStatus({ type: "success", message: `Tenant selected: ${tenant.name}.` });
      return;
    }
    const domain = state.domains.find((item) => `${item.domain_name} ${item.domain_id}`.toLowerCase().includes(query));
    if (domain) {
      setSelectedTenantId(domain.tenant_id);
      setActive("domains");
      setStatus({ type: "success", message: `Domain selected: ${domain.domain_name}.` });
      return;
    }
    const policy = state.policies.find((item) => `${item.name} ${item.policy_id}`.toLowerCase().includes(query));
    if (policy) {
      setSelectedTenantId(policy.tenant_id);
      setActive("policies");
      setStatus({ type: "success", message: `Policy selected: ${policy.name}.` });
      return;
    }
    setStatus({ type: "warning", message: "No tenant, domain, or policy matches that search." });
  };
  const signOut = () => {
    sessionStorage.removeItem("fortressnet_admin_token");
    sessionStorage.removeItem("fortressnet_auth_token");
    sessionStorage.removeItem("fortressnet_access_token");
    sessionStorage.removeItem("fortressnet_auth_mode");
    setAuthMode("");
    setToken("");
    setAccessToken("");
    setState(emptyState);
    setSelectedTenantId("");
    if (authConfig?.cognito_hosted_ui_url && authConfig?.cognito_app_client_id) {
      const logoutUrl = new URL(`${authConfig.cognito_hosted_ui_url}/logout`);
      logoutUrl.searchParams.set("client_id", authConfig.cognito_app_client_id);
      logoutUrl.searchParams.set("logout_uri", `${window.location.origin}/logout`);
      window.location.assign(logoutUrl.toString());
    }
  };

  if (!token) {
    return <LoginScreen authConfig={authConfig} status={status} onSignIn={signIn} />;
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <Sidebar active={active} onNavigate={setActive} selectedTenant={selectedTenant} tenants={state.tenants} selectedTenantId={selectedTenantId} setSelectedTenantId={setSelectedTenantId} collapsed={sidebarCollapsed} onCollapse={() => setSidebarCollapsed((current) => !current)} />
      <main className="main">
        <Topbar authenticated authMode={authMode} onSignIn={signIn} onSignOut={signOut} onOpenProfile={() => setActive("profile")} onNavigate={setActive} onSearch={searchConsole} />
        <section className="content">
          <PageHeader active={active} pageTitle={pageTitle} onNavigate={setActive} onReload={reload} onCreateTenant={openTenantCreate} />
          {status.message && <StatusBanner status={status} />}
          {active !== "onboarding" && <WorkflowAssistant
            active={active}
            state={state}
            selectedTenantId={selectedTenantId}
            onNavigate={setActive}
            onCreateTenant={openTenantCreate}
          />}
          {active === "overview" && (
            <Overview
              range={range}
              setRange={setRange}
              token={token}
              state={state}
              selectedTenantId={selectedTenantId}
              setSelectedTenantId={setSelectedTenantId}
              onNavigate={setActive}
              onCreateTenant={openTenantCreate}
            />
          )}
          {active === "onboarding" && (
            <OnboardingScreen
              token={token}
              platform={platform}
              state={state}
              selectedTenantId={selectedTenantId}
              setSelectedTenantId={setSelectedTenantId}
              onCreated={reload}
              setStatus={setStatus}
              onNavigate={setActive}
            />
          )}
          {active === "domains" && (
            <DomainsScreen
              token={token}
              platform={platform}
              state={state}
              selectedTenantId={selectedTenantId}
              setSelectedTenantId={setSelectedTenantId}
              onCreated={reload}
              setStatus={setStatus}
            />
          )}
          {active === "dns" && <DnsScreen token={token} state={state} selectedTenantId={selectedTenantId} setSelectedTenantId={setSelectedTenantId} onCreated={reload} setStatus={setStatus} />}
          {active === "dmarc" && <DmarcScreen token={token} state={state} selectedTenantId={selectedTenantId} setSelectedTenantId={setSelectedTenantId} setStatus={setStatus} />}
          {active === "origins" && (
            <OriginsScreen
              token={token}
              state={state}
              selectedTenantId={selectedTenantId}
              setSelectedTenantId={setSelectedTenantId}
              onCreated={reload}
              setStatus={setStatus}
            />
          )}
          {active === "policies" && (
            <PoliciesScreen
              token={token}
              platform={platform}
              state={state}
              selectedTenantId={selectedTenantId}
              setSelectedTenantId={setSelectedTenantId}
              onCreated={reload}
              setStatus={setStatus}
            />
          )}
          {active === "api-shield" && <ApiShieldScreen token={token} state={state} selectedTenantId={selectedTenantId} setSelectedTenantId={setSelectedTenantId} setStatus={setStatus} />}
          {active === "access" && (
            <AccessScreen
              token={token}
              platform={platform}
              state={state}
              selectedTenantId={selectedTenantId}
              setSelectedTenantId={setSelectedTenantId}
              onCreated={reload}
              setStatus={setStatus}
            />
          )}
          {active === "idp" && (
            <IdpScreen
              token={token}
              state={state}
              selectedTenantId={selectedTenantId}
              setSelectedTenantId={setSelectedTenantId}
              onCreated={reload}
              setStatus={setStatus}
            />
          )}
          {active === "ztna" && <ZtnaScreen token={token} state={state} selectedTenantId={selectedTenantId} setSelectedTenantId={setSelectedTenantId} onCreated={reload} setStatus={setStatus} />}
          {active === "api-keys" && (
            <ApiKeysScreen
              token={token}
              platform={platform}
              state={state}
              selectedTenantId={selectedTenantId}
              setSelectedTenantId={setSelectedTenantId}
              onCreated={reload}
              setStatus={setStatus}
            />
          )}
          {active === "events" && <EventsScreen token={token} selectedTenantId={selectedTenantId} setStatus={setStatus} />}
          {active === "ai" && <AiScreen token={token} selectedTenantId={selectedTenantId} setStatus={setStatus} />}
          {active === "reports" && <ReportsScreen token={token} selectedTenantId={selectedTenantId} setStatus={setStatus} />}
          {active === "billing" && <BillingScreen token={token} state={state} selectedTenantId={selectedTenantId} setSelectedTenantId={setSelectedTenantId} onChanged={reload} setStatus={setStatus} />}
          {active === "profile" && <ProfileScreen token={token} accessToken={accessToken} authMode={authMode} onMfaEnrolled={reload} setStatus={setStatus} />}
          {active === "settings" && <SettingsScreen platform={platform} token={token} authMode={authMode} />}
        </section>
      </main>
      {tenantWizardOpen && <TenantRegistrationWizard token={token} setStatus={setStatus} onClose={() => setTenantWizardOpen(false)} onCreated={(tenant) => {
        setSelectedTenantId(tenant.tenant_id);
        setTenantWizardOpen(false);
        loadState(token, setState, setStatus, setSelectedTenantId, () => setActive("profile"));
      }} />}
    </div>
  );
}

function LoginScreen({ authConfig, status, onSignIn }) {
  const ready = Boolean(authConfig?.login_ready);
  return (
    <main className="login-shell">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand"><span className="login-mark"><Shield size={30} fill="currentColor" /></span><span>FortressNet</span></div>
        <div className="login-copy">
          <p className="login-eyebrow">SECURE CONSOLE</p>
          <h1 id="login-title">Sign in to FortressNet</h1>
          <p>Use your assigned organizational identity to access the console.</p>
        </div>
        <button className="primary login-submit" disabled={!ready} onClick={onSignIn}><LockKeyhole size={17} /> Sign in</button>
        {status.message && <div className={`login-status ${status.type}`}>{status.message}</div>}
        {!ready && <div className="login-status error">Authentication configuration is unavailable. Contact the platform administrator.</div>}
      </section>
    </main>
  );
}

function Sidebar({ active, onNavigate, selectedTenant, tenants, selectedTenantId, setSelectedTenantId, collapsed, onCollapse }) {
  const [tenantMenuOpen, setTenantMenuOpen] = useState(false);
  const selectTenant = (tenantId) => {
    setSelectedTenantId(tenantId);
    setTenantMenuOpen(false);
  };

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="brand">
        <div className="brand-mark"><Shield size={22} fill="currentColor" /></div>
        <span>FortressNet</span>
      </div>
      <div className="tenant-label">Tenant</div>
      <button id="tenant-switcher" className="tenant-button" disabled={!tenants.length} onClick={() => setTenantMenuOpen((current) => !current)} aria-label="Select tenant" title="Select tenant" aria-expanded={tenantMenuOpen} aria-haspopup="menu">
        <Users size={16} />
        <span>{selectedTenant?.name || "No tenant selected"}</span>
        <ChevronDown size={15} />
      </button>
      {tenantMenuOpen && (
        <div className="sidebar-tenant-menu" role="menu">
          {tenants.map((tenant) => <button key={tenant.tenant_id} role="menuitem" className={tenant.tenant_id === selectedTenantId ? "selected" : ""} onClick={() => selectTenant(tenant.tenant_id)}>{tenant.name}</button>)}
        </div>
      )}
      <nav className="nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={`nav-item ${active === item.id ? "active" : ""}`} onClick={() => onNavigate(item.id)} aria-label={item.label} title={item.label}>
              <Icon size={18} />
              <span>{item.label}</span>
              {item.badge && <small>{item.badge}</small>}
            </button>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <button className="collapse" onClick={onCollapse} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} title={collapsed ? "Expand navigation" : "Collapse navigation"}><ChevronRight size={15} /> <span>{collapsed ? "Expand" : "Collapse"}</span></button>
        <div className="edge-status">
          <span className="status-dot green"></span>
          <div>
            <strong>Platform Status</strong>
            <p>Ready</p>
          </div>
        </div>
        <div className="version">Version v2026.07.22</div>
      </div>
    </aside>
  );
}

function Topbar({ authenticated, authMode, onSignIn, onSignOut, onOpenProfile, onNavigate, onSearch }) {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const openProfile = () => {
    setAccountMenuOpen(false);
    onOpenProfile();
  };

  return (
    <header className="topbar">
      <div className="env-select" aria-label="Environment Production">
        <span className="status-dot green"></span>
        <span><small>Environment</small>Production</span>
      </div>
      <form className="search" onSubmit={(event) => { event.preventDefault(); onSearch(query); }}>
        <Search size={17} />
        <input aria-label="Search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tenants, domains, policies..." />
        <kbd>/</kbd>
      </form>
      <div className="date-button"><CalendarDays size={16} /> Live window</div>
      <button className="icon-button" title="Open security events" onClick={() => onNavigate("events")}><Bell size={18} /></button>
      {authenticated ? (
        <div className="user-menu">
          <button className="user" onClick={() => setAccountMenuOpen((current) => !current)} aria-expanded={accountMenuOpen} aria-haspopup="menu" title="Account menu">
            <span>FN</span>
            <div><strong>Console</strong><small>{authMode === "cognito" ? "Cognito session" : "Recovery mode"}</small></div>
            <ChevronDown size={15} />
          </button>
          {accountMenuOpen && (
            <div className="account-menu" role="menu">
              <button role="menuitem" onClick={openProfile}><Users size={16} /> Profile</button>
              <button role="menuitem" className="danger" onClick={onSignOut}><LockKeyhole size={16} /> Sign out</button>
            </div>
          )}
        </div>
      ) : <button className="primary compact" onClick={onSignIn}>Sign in</button>}
    </header>
  );
}

function PageHeader({ active, pageTitle, onNavigate, onReload, onCreateTenant }) {
  const [syncing, setSyncing] = useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const title = active === "overview" ? "FortressNet Console" : pageTitle;
  const subtitle = active === "overview"
    ? "SaaS multi-tenant edge security control plane"
    : "Manage tenants, domains, policies and platform readiness";
  const sync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await onReload();
    } finally {
      setSyncing(false);
    }
  };
  const navigate = (target) => {
    setQuickActionsOpen(false);
    onNavigate(target);
  };

  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="header-actions">
        <button className="secondary" onClick={onCreateTenant}><Plus size={16} /> Create tenant</button>
        <button className="secondary" disabled={syncing} aria-busy={syncing} onClick={sync}><RefreshCw className={syncing ? "spin" : ""} size={16} /> {syncing ? "Syncing" : "Sync"}</button>
        <div className="header-overflow">
          <button className="icon-button bordered" title="More actions" aria-label="More actions" aria-expanded={quickActionsOpen} aria-haspopup="menu" onClick={() => setQuickActionsOpen((current) => !current)}><MoreHorizontal size={18} /></button>
          {quickActionsOpen && (
            <div className="header-action-menu" role="menu">
              <button role="menuitem" onClick={() => navigate("onboarding")}><CheckCircle2 size={16} /> Onboarding</button>
              <button role="menuitem" onClick={() => navigate("domains")}><Globe2 size={16} /> Domains</button>
              <button role="menuitem" onClick={() => navigate("policies")}><Shield size={16} /> Policies</button>
              <button role="menuitem" onClick={() => navigate("events")}><ClipboardList size={16} /> Security events</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function focusGuidedTarget(targetId) {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => target.focus?.({ preventScroll: true }), 220);
}

function activateGuidedTarget(targetId) {
  focusGuidedTarget(targetId);
  window.setTimeout(() => document.getElementById(targetId)?.click(), 250);
}

function WorkflowAssistant({ active, state, selectedTenantId, onNavigate, onCreateTenant }) {
  const domains = filterByTenant(state.domains, selectedTenantId);
  const origins = filterByTenant(state.origins, selectedTenantId);
  const policies = filterByTenant(state.policies, selectedTenantId);
  const apiKeys = filterByTenant(state.api_keys, selectedTenantId);
  const idpConnections = filterByTenant(state.idp_connections, selectedTenantId);
  const ztnaApplications = filterByTenant(state.ztna_applications, selectedTenantId);
  const dnsZones = filterByTenant(state.dns_zones, selectedTenantId);
  const verifiedDomain = domains.find((domain) => verifiedDomainStatuses.has(domain.status));
  const incompleteDomain = domains.find((domain) => domain.status !== "active");
  const activeIdp = idpConnections.find((connection) => connection.status === "active");
  const requiresTenant = !["overview", "profile", "settings"].includes(active);
  let guidance = null;

  if (requiresTenant && !selectedTenantId) {
    guidance = {
      title: "Select a tenant context",
      detail: state.tenants.length
        ? "Use the tenant selector in the sidebar before changing a tenant resource. FortressNet keeps configuration and data isolated per tenant."
        : "Register the customer first. Tenant identity, contacts and commercial scope are required before any protected resource can be created.",
      action: state.tenants.length ? { label: "Open overview", run: () => onNavigate("overview") } : { label: "Create tenant", run: onCreateTenant }
    };
  } else {
    const byScreen = {
      overview: !state.tenants.length
        ? { title: "Register your first tenant", detail: "Start with the customer organization, operational contacts and expected service scope. The registration assistant saves only the submitted tenant data.", action: { label: "Create tenant", run: onCreateTenant } }
        : !selectedTenantId
        ? { title: "Choose a tenant context", detail: "Select the customer in the tenant switcher before reviewing its domains, security posture or billing data.", action: { label: "Select tenant", run: () => activateGuidedTarget("tenant-switcher") } }
        : !domains.length
        ? { title: "Protect the first site", detail: "The selected tenant is ready. Add its public domain, origin URL and health path to begin the guided go-live process.", action: { label: "Start onboarding", run: () => onNavigate("onboarding") } }
        : incompleteDomain
        ? { title: "Continue the protected-site rollout", detail: `${incompleteDomain.domain_name} still has a go-live step pending. The onboarding assistant shows the exact record or approval required.`, action: { label: "Continue onboarding", run: () => onNavigate("onboarding") } }
        : { title: "Review live protection", detail: "All selected domains are active. Review operational events and reports before making policy changes.", action: { label: "Open security events", run: () => onNavigate("events") } },
      domains: !domains.length
        ? { title: "Add a protected domain", detail: "Enter the public hostname, origin URL and health path. FortressNet will generate the ownership verification record after you submit the form.", action: { label: "Open guided onboarding", run: () => onNavigate("onboarding") } }
        : incompleteDomain
        ? { title: "Finish domain go-live", detail: `${incompleteDomain.domain_name} is not active yet. Continue in onboarding to see the current DNS, certificate, edge or traffic step.`, action: { label: "Continue onboarding", run: () => onNavigate("onboarding") } }
        : { title: "Manage an active domain", detail: "The protected domain is live. Use DNS & TLS to review its DNS posture before changing routing or security policy.", action: { label: "Review DNS posture", run: () => onNavigate("dns") } },
      dns: !verifiedDomain
        ? { title: "Verify ownership before DNS management", detail: "DNS posture and managed-zone workflows are enabled only after the protected domain ownership record has been verified.", action: { label: "Open onboarding", run: () => onNavigate("onboarding") } }
        : !dnsZones.length
        ? { title: "Choose the DNS operating model", detail: "For each verified domain, choose Guided for external DNS instructions or Delegate Route 53 when FortressNet will manage the hosted zone. Neither option changes DNS until you confirm its workflow.", action: { label: "View DNS choices", run: () => focusGuidedTarget("dns-management") } }
        : { title: "Check DNS and TLS posture", detail: "Run a posture check for the selected domain to review DNSSEC, CAA and possible origin exposure using observed DNS data.", action: { label: "Open posture checks", run: () => focusGuidedTarget("dns-management") } },
      dmarc: !verifiedDomain
        ? { title: "Verify a domain before email protection", detail: "DMARC records are generated only for domains whose ownership has been verified in the tenant context.", action: { label: "Open onboarding", run: () => onNavigate("onboarding") } }
        : { title: "Start in monitor mode", detail: "Generate a DMARC policy with p=none first, publish the resulting TXT record, then review aggregate reports before moving to quarantine or reject.", action: { label: "Configure DMARC", run: () => focusGuidedTarget("dmarc-policy") } },
      origins: !domains.length
        ? { title: "Register the protected site first", detail: "Origins are linked to an existing tenant domain so their health checks and failover settings cannot cross tenant boundaries.", action: { label: "Open onboarding", run: () => onNavigate("onboarding") } }
        : !origins.length
        ? { title: "Add a backup origin", detail: "The initial origin is created with domain onboarding. Add an additional healthy origin only when you need a separately managed failover target.", action: { label: "Add origin", run: () => focusGuidedTarget("origin-url") } }
        : { title: "Validate origin resilience", detail: "Review the health of each registered origin, then create a pool only when the failover order and targets are ready to be operated.", action: { label: "Review origin health", run: () => focusGuidedTarget("origins-inventory") } },
      policies: !policies.length
        ? { title: "Create a monitor-first policy", detail: "Define the policy scope and rate limits in monitor mode. Compilation and approval remain separate controls before any edge enforcement is applied.", action: { label: "Create policy", run: () => focusGuidedTarget("policy-name") } }
        : { title: "Compile and review policy changes", detail: "A saved policy is not active at the edge until its change set is compiled, reviewed and applied through the approval workflow.", action: { label: "Review change sets", run: () => focusGuidedTarget("waf-change-sets") } },
      "api-shield": { title: "Discover before enforcing", detail: "Discover real API paths from WAF events or import an OpenAPI document. Schema enforcement always starts with observation and requires a later review.", action: { label: "Import OpenAPI schema", run: () => focusGuidedTarget("api-schema-name") } },
      access: { title: "Grant the minimum access needed", detail: "Invite a user with a tenant role first. Assign granular scopes deliberately and require MFA for privileged operational access.", action: { label: "Invite user", run: () => focusGuidedTarget("user-email") } },
      idp: !idpConnections.length
        ? { title: "Connect the customer identity provider", detail: "Choose OIDC or SAML, provide the provider metadata and save the connection in the selected tenant. Credentials remain tenant-scoped.", action: { label: "Add IdP", run: () => focusGuidedTarget("idp-name") } }
        : { title: "Use the IdP for Zero Trust", detail: "The tenant has an identity-provider connection. Confirm its status and then use it when registering private applications.", action: { label: "Open Zero Trust", run: () => onNavigate("ztna") } },
      ztna: !activeIdp
        ? { title: "Activate an external IdP first", detail: "Private access needs an active tenant identity provider so authentication and device posture decisions are tied to a verified identity source.", action: { label: "Configure IdP", run: () => onNavigate("idp") } }
        : !ztnaApplications.length
        ? { title: "Register the first private application", detail: "Provide the private hostname and protocol, select the active IdP, then decide whether device posture is required before registering the access endpoint.", action: { label: "Register application", run: () => focusGuidedTarget("ztna-name") } }
        : { title: "Review private access posture", detail: "Confirm every private application has the intended identity source and device posture requirement before it is made available to users.", action: { label: "Review applications", run: () => focusGuidedTarget("ztna-applications") } },
      "api-keys": !apiKeys.length
        ? { title: "Create a least-privilege API key", detail: "Name the integration and select only the tenant scopes it needs. The secret is displayed once after creation, so store it in an approved secret manager.", action: { label: "Create API key", run: () => focusGuidedTarget("api-key-name") } }
        : { title: "Review automation access", detail: "API keys are tenant-scoped. Confirm their scopes and last-used time regularly, and rotate integrations that no longer need access.", action: { label: "Review API keys", run: () => focusGuidedTarget("api-keys-inventory") } },
      events: { title: "Review observed security activity", detail: "Refresh the event stream to inspect real tenant WAF activity. Events are read-only here; policy changes stay in the approved policy workflow.", action: { label: "Refresh events", run: () => activateGuidedTarget("events-refresh") } },
      ai: { title: "Analyze without automatic enforcement", detail: "The AI analyst reads real tenant WAF events and returns recommendations. It never changes traffic behavior or applies a policy without the normal review flow.", action: { label: "Run analysis", run: () => activateGuidedTarget("ai-analyze") } },
      reports: { title: "Generate a current security view", detail: "Refresh this report after the edge has collected events. Empty results mean no observed data is available, not that synthetic activity was generated.", action: { label: "Refresh report", run: () => activateGuidedTarget("reports-refresh") } },
      billing: { title: "Confirm tenant limits and usage", detail: "Review the selected tenant's observed usage and entitlement before changing plan limits. Marketplace metering is enabled only after AWS fulfillment identifies the customer.", action: { label: "Review billing", run: () => focusGuidedTarget("billing-plan") } },
      profile: { title: "Secure your operator profile", detail: "Set your timezone and notification preferences, then enable the FortressNet authenticator when signed in through Cognito.", action: { label: "Edit profile", run: () => focusGuidedTarget("profile-name") } },
      settings: { title: "Review the platform security baseline", detail: "This screen reports platform controls. Tenant security configuration remains in the tenant-scoped modules to preserve isolation and auditability.", action: { label: "Review platform security", run: () => focusGuidedTarget("platform-security") } }
    };
    guidance = byScreen[active] || null;
  }

  if (!guidance) return null;
  return (
    <aside className="workflow-assistant" aria-label="Guided next step">
      <Sparkles size={19} />
      <div>
        <strong>Next step: {guidance.title}</strong>
        <span>{guidance.detail}</span>
      </div>
      {guidance.action && <button className="secondary compact" type="button" onClick={guidance.action.run}>{guidance.action.label}<ChevronRight size={15} /></button>}
    </aside>
  );
}

function Overview({ range, setRange, token, state, selectedTenantId, setSelectedTenantId, onNavigate, onCreateTenant }) {
  const metrics = buildMetrics(state);

  return (
    <div className="screen">
      {!token && <AccessRequired onNavigate={onNavigate} />}
      <div className="metric-grid">
        {metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}
      </div>
      <div className="dashboard-grid">
        <Panel className="traffic-panel" title="Edge Traffic" action={<Segmented value={range} setValue={setRange} options={["1H", "6H", "24H", "7D", "30D"]} />}>
          <EmptyChart />
        </Panel>
        <Panel title="Tenant Management" action={<TenantSelector tenants={state.tenants} selectedTenantId={selectedTenantId} setSelectedTenantId={setSelectedTenantId} />}>
          <div className="tenant-registration-action"><button className="primary" disabled={!token} onClick={onCreateTenant}><Plus size={16} /> Register tenant</button></div>
        </Panel>
        <Panel title="Platform Readiness" count={state.tenants.length}>
          <ReadinessList token={token} state={state} />
        </Panel>
      </div>
      <div className="table-grid">
        <Panel title="Recent Security Events" action={<button className="link-button" onClick={() => onNavigate("events")}>View event stream <ChevronRight size={14} /></button>}>
          <EmptyTable columns={["Time", "Type", "Severity", "Domain", "Source", "Action"]} message="No security events have been collected." />
        </Panel>
        <Panel title="Domain Health" action={<button className="link-button" onClick={() => onNavigate("domains")}>Manage domains <ChevronRight size={14} /></button>}>
          <DomainTable domains={state.domains} />
        </Panel>
      </div>
      <Panel title="Onboarding">
        <div className="setup-steps">
          {["Create tenant", "Add protected domain", "Verify DNS ownership", "Attach security profile", "Activate edge CNAME"].map((step, index) => (
            <div key={step} className={index === 0 ? "current" : ""}><span>{index + 1}</span>{step}</div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function MetricCard({ metric }) {
  return (
    <article className="metric-card">
      <div className="metric-label">
        <span>{metric.label}</span>
        {metric.label.includes("Cost") && <CircleDollarSign size={16} />}
      </div>
      <div className="metric-value">{metric.value}</div>
      <div className={`metric-delta ${metric.trend}`}>{metric.delta}</div>
      <SparkLine color={metric.color} />
    </article>
  );
}

function SparkLine({ color = "blue" }) {
  return (
    <svg className="spark empty-spark" viewBox="0 0 150 46" preserveAspectRatio="none">
      <line x1="0" x2="150" y1="34" y2="34" className={`stroke-${color}`} strokeWidth="2" strokeDasharray="4 5" />
    </svg>
  );
}

function Panel({ id, title, count, action, className = "", children }) {
  return (
    <section id={id} className={`panel ${className}`} tabIndex={id ? -1 : undefined}>
      <div className="panel-header">
        <h2>{title} {count !== undefined && <span className="count">{count}</span>}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Segmented({ value, setValue, options }) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button key={option} className={option === value ? "selected" : ""} onClick={() => setValue(option)}>{option}</button>
      ))}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="chart-wrap">
      <div className="legend"><span className="legend-blue"></span>Total <span className="legend-green"></span>Allowed <span className="legend-red"></span>Blocked</div>
      <svg className="line-chart" viewBox="0 0 720 300" preserveAspectRatio="none">
        {[0, 1, 2, 3, 4].map((i) => <line key={i} x1="45" x2="705" y1={40 + i * 52} y2={40 + i * 52} />)}
        <line x1="45" x2="705" y1="250" y2="250" className="stroke-blue clean-baseline" />
        <line x1="45" x2="705" y1="250" y2="250" className="stroke-green clean-baseline" />
        <line x1="45" x2="705" y1="250" y2="250" className="stroke-red clean-baseline" />
        {["00:00", "04:00", "08:00", "12:00", "16:00", "20:00"].map((label, i) => (
          <text key={label} x={45 + i * 128} y="284">{label}</text>
        ))}
      </svg>
    </div>
  );
}

function EmptyState({ icon: Icon, title, body }) {
  return (
    <div className="empty-state">
      <Icon size={30} />
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function EmptyTable({ columns, message }) {
  return (
    <table className="data-table clean-table">
      <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
      <tbody>
        <tr>
          <td colSpan={columns.length}>{message}</td>
        </tr>
      </tbody>
    </table>
  );
}

function OnboardingScreen({ token, platform, state, selectedTenantId, setSelectedTenantId, onCreated, setStatus, onNavigate }) {
  const domains = filterByTenant(state.domains, selectedTenantId);
  const origins = filterByTenant(state.origins, selectedTenantId);
  const certificates = filterByTenant(state.certificates, selectedTenantId);
  const deployments = filterByTenant(state.edge_deployments, selectedTenantId);
  const latestDomain = domains[0] || null;
  const domainOrigins = origins.filter((origin) => origin.domain_id === latestDomain?.domain_id);
  const primaryOrigin = domainOrigins[0] || null;
  const latestCertificate = certificates.find((certificate) => certificate.domain_id === latestDomain?.domain_id);
  const latestDeployment = deployments.find((deployment) => deployment.domain_id === latestDomain?.domain_id);
  const tenantWafChangeSets = filterByTenant(state.waf_change_sets, selectedTenantId);
  const tenantApprovers = filterByTenant(state.users, selectedTenantId)
    .filter((user) => (user.roles || []).some((role) => ["tenant_admin", "security_admin"].includes(role)));
  const canApproveTenantChanges = tenantApprovalEligible(platform, selectedTenantId);
  const appliedWafChangeSet = tenantWafChangeSets
    .find((changeSet) => changeSet.domain_id === latestDomain?.domain_id && changeSet.status === "applied" && changeSet.mode === "block");
  const monitorWafChangeSet = tenantWafChangeSets
    .find((changeSet) => changeSet.domain_id === latestDomain?.domain_id && changeSet.status === "applied" && changeSet.mode === "monitor");
  const pendingWafChangeSet = tenantWafChangeSets
    .find((changeSet) => changeSet.mode === "block" && changeSet.status !== "applied" && (!changeSet.domain_id || changeSet.domain_id === latestDomain?.domain_id));
  const edgeReadyForCutover = ["ready_for_cutover", "active"].includes(latestDeployment?.status);
  const ownershipVerified = verifiedDomainStatuses.has(latestDomain?.status);
  const certificatePending = latestCertificate && latestCertificate.status !== "ISSUED";
  const checklist = [
    { step: "Tenant selected", value: selectedTenantId ? "Ready" : "Required", done: Boolean(selectedTenantId) },
    { step: "Domain ownership", value: humanizeWorkflowStatus(latestDomain?.status), done: ownershipVerified },
    { step: "Primary origin", value: humanizeWorkflowStatus(primaryOrigin?.status), done: primaryOrigin?.status === "healthy" },
    { step: "Certificate", value: humanizeWorkflowStatus(latestCertificate?.status), done: latestCertificate?.status === "ISSUED" },
    { step: "Edge deployment", value: humanizeWorkflowStatus(latestDeployment?.status, "Not requested"), done: edgeReadyForCutover },
    { step: "WAF policy", value: appliedWafChangeSet ? "Blocking policy applied" : monitorWafChangeSet ? monitorObservationStatus(monitorWafChangeSet) : humanizeWorkflowStatus(pendingWafChangeSet?.status, "Policy required"), done: Boolean(appliedWafChangeSet) },
    { step: "Traffic DNS", value: latestDomain?.status === "active" ? "Active" : edgeReadyForCutover ? "Awaiting traffic CNAME" : "Blocked by edge deployment", done: latestDomain?.status === "active" }
  ];
  const currentStepIndex = checklist.findIndex((item) => !item.done);
  const verifyOwnership = () => {
    if (latestDomain) verifyDomainDns(latestDomain.domain_id, token, setStatus, onCreated);
  };

  useEffect(() => {
    if (!token || !latestCertificate?.certificate_arn || latestCertificate.status === "ISSUED") return undefined;
    let cancelled = false;
    const reconcile = async () => {
      try {
        const certificate = await reconcileCertificateStatus(latestCertificate.certificate_id, token);
        if (!cancelled && certificate.status !== latestCertificate.status) {
          setStatus({ type: "success", message: `Certificate status: ${certificate.status}.` });
          onCreated();
        }
      } catch {
        // A pending ACM record can be temporarily unavailable; the manual verification remains available.
      }
    };
    reconcile();
    const interval = window.setInterval(reconcile, 45000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [token, latestCertificate?.certificate_id, latestCertificate?.certificate_arn, latestCertificate?.status]);

  return (
    <div className="screen">
      <div className="dashboard-grid onboarding-grid">
        <Panel title="New Protected Site" action={<TenantSelector tenants={state.tenants} selectedTenantId={selectedTenantId} setSelectedTenantId={setSelectedTenantId} />}>
          <DomainCreateForm token={token} tenants={state.tenants} selectedTenantId={selectedTenantId} onCreated={onCreated} setStatus={setStatus} />
        </Panel>
        <Panel title="Go-Live Assistant">
          <OnboardingGuidance
            token={token}
            selectedTenantId={selectedTenantId}
            domain={latestDomain}
            origin={primaryOrigin}
            certificate={latestCertificate}
            deployment={latestDeployment}
            approvers={tenantApprovers}
            canApproveTenantChanges={canApproveTenantChanges}
            actorSubject={platform?.actor?.subject || ""}
            pendingWafChangeSet={pendingWafChangeSet}
            appliedWafChangeSet={appliedWafChangeSet}
            monitorWafChangeSet={monitorWafChangeSet}
            onCreated={onCreated}
            setStatus={setStatus}
            onNavigate={onNavigate}
          />
          <div className="setup-steps vertical">
            {checklist.map(({ step, value, done }, index) => (
              <div key={step} className={done ? "done" : index === currentStepIndex ? "current" : "pending"}><span>{index + 1}</span>{step}<small>{value}</small></div>
            ))}
          </div>
        </Panel>
      </div>
      <Panel title="DNS Instructions" action={latestDomain && !ownershipVerified ? <button className="primary compact" disabled={!token} onClick={verifyOwnership}><RefreshCw size={15} /> Check ownership DNS</button> : certificatePending && latestCertificate?.certificate_arn ? <button className="primary compact" disabled={!token} onClick={() => refreshCertificate(latestCertificate.certificate_id, token, setStatus, onCreated)}><RefreshCw size={15} /> Verify certificate</button> : latestDeployment?.status === "ready_for_cutover" ? <button className="primary compact" disabled={!token} onClick={() => edgeAction(`/api/domains/${latestDomain.domain_id}/verify-cutover`, "PATCH", token, setStatus, onCreated, "Traffic DNS checked.")}><RefreshCw size={15} /> Check traffic DNS</button> : null}>
        <DomainInstructions domain={latestDomain} certificate={latestCertificate} deployment={latestDeployment} />
      </Panel>
    </div>
  );
}

function OnboardingGuidance({ token, selectedTenantId, domain, origin, certificate, deployment, approvers, canApproveTenantChanges, actorSubject, pendingWafChangeSet, appliedWafChangeSet, monitorWafChangeSet, onCreated, setStatus, onNavigate }) {
  let title = "Create or select a tenant";
  let detail = "Select the customer tenant before creating a protected site.";
  let action = null;
  let validationRecord = null;

  if (selectedTenantId && !domain) {
    title = "Register the protected site";
    detail = "Enter the public domain, origin URL, and health path, then start onboarding.";
  } else if (domain && !verifiedDomainStatuses.has(domain.status)) {
    title = "Verify domain ownership";
    detail = "Publish the ownership TXT record shown below in the domain DNS zone, then run the verification.";
    action = { label: "Check DNS", icon: RefreshCw, run: () => verifyDomainDns(domain.domain_id, token, setStatus, onCreated) };
  } else if (domain && (!origin || origin.status !== "healthy")) {
    title = "Confirm the primary origin";
    detail = "Ensure the origin is publicly reachable on its configured health path, then run a health check.";
    action = origin ? { label: "Check origin", icon: Activity, run: () => originHealthCheck(origin.origin_id, token, setStatus, onCreated) } : { label: "Open origins", icon: Layers3, run: () => onNavigate("origins") };
  } else if (domain && certificate?.status !== "ISSUED") {
    const hasValidationRecord = Boolean(certificate?.validation_records?.length);
    const hasCertificateRequest = Boolean(certificate?.certificate_arn);
    title = hasValidationRecord ? "Add the ACM validation record" : "Validate the TLS certificate";
    detail = !hasCertificateRequest
      ? "Domain ownership is verified, but no ACM certificate request is registered yet. Retry the request to obtain the validation CNAME."
      : hasValidationRecord
      ? "1. Create this CNAME at your DNS provider. 2. When it is published, select Verify certificate. ACM can take a few minutes to detect the record."
      : "AWS is preparing the ACM validation CNAME. Refresh the certificate status to retrieve the record, then publish it in the domain DNS zone.";
    validationRecord = hasValidationRecord ? certificate.validation_records[0] : null;
    action = hasCertificateRequest
      ? { label: "Verify certificate", icon: RefreshCw, run: () => refreshCertificate(certificate.certificate_id, token, setStatus, onCreated) }
      : { label: "Retry certificate request", icon: RefreshCw, run: () => verifyDomainDns(domain.domain_id, token, setStatus, onCreated) };
  } else if (domain && !deployment) {
    title = "Request the edge deployment";
    detail = "The origin and certificate are ready. Request the protected CloudFront edge; the request will enter the approval workflow before provisioning.";
    action = { label: "Request edge", icon: Plus, run: () => edgeAction(`/api/domains/${domain.domain_id}/edge-deployment-request`, "POST", token, setStatus, onCreated, "Edge deployment requested.") };
  } else if (deployment?.status === "pending_approval") {
    const activeApprover = approvers.find((user) => user.status === "active");
    const invitedApprover = approvers.find((user) => user.status === "invited");
    const requestedByActor = deployment.requested_by === actorSubject;
    if (!canApproveTenantChanges) {
      title = "Tenant approval required";
      detail = "Platform administrators can review every tenant but do not approve tenant-scoped changes. An active tenant administrator or security administrator for this tenant must complete the approval.";
      action = { label: "Open tenant access", icon: Users, run: () => onNavigate("access") };
    } else if (requestedByActor) {
      title = "Invite an independent approver";
      detail = "You requested this edge deployment, so separation of duties prevents you from approving it. A different active tenant administrator or security administrator must review the request.";
      action = { label: "Open tenant access", icon: Users, run: () => onNavigate("access") };
    } else if (!approvers.length) {
      title = "Invite an independent approver";
      detail = "This edge request needs a different tenant administrator or security administrator. Invite that operator from Access; FortressNet sends the Cognito invitation and keeps this request pending until they review it.";
      action = { label: "Invite approver", icon: Users, run: () => onNavigate("access") };
    } else if (!activeApprover && invitedApprover) {
      title = "Wait for the approver to activate";
      detail = "The independent approver has been invited. They must complete the Cognito invitation, sign in, and configure MFA before they can approve this edge request.";
      action = { label: "Review invitation", icon: Users, run: () => onNavigate("access") };
    } else {
      title = "Approve the edge deployment";
      detail = "A different active tenant administrator or security administrator must review and approve this change. The requester cannot approve their own edge deployment.";
      action = { label: "Approve edge", icon: CheckCircle2, run: () => edgeAction(`/api/edge-deployments/${deployment.deployment_id}/approve`, "POST", token, setStatus, onCreated, "Edge deployment approved.") };
    }
  } else if (deployment?.status === "approved") {
    title = "Provision the edge";
    detail = "The deployment has been approved. Provisioning creates the protected edge and its baseline security controls.";
    action = { label: "Provision edge", icon: Activity, run: () => edgeAction(`/api/edge-deployments/${deployment.deployment_id}/provision`, "POST", token, setStatus, onCreated, "Edge provisioning started.") };
  } else if (deployment?.status === "provisioning") {
    title = "Check edge provisioning";
    detail = "AWS is creating the protected edge. Refresh the deployment status before changing traffic DNS.";
    action = { label: "Refresh edge", icon: RefreshCw, run: () => edgeAction(`/api/edge-deployments/${deployment.deployment_id}/refresh`, "PATCH", token, setStatus, onCreated, "Edge status refreshed.") };
  } else if (deployment && !appliedWafChangeSet) {
    title = "Apply the WAF policy";
    if (!pendingWafChangeSet) {
      detail = "Create and compile a tenant WAF policy, then return here to apply it to this protected edge before traffic cutover.";
      action = { label: "Open policies", icon: Shield, run: () => onNavigate("policies") };
    } else if (pendingWafChangeSet.status === "pending_approval") {
      if (!canApproveTenantChanges) {
        title = "Tenant approval required";
        detail = "This WAF change must be approved by an active tenant administrator or security administrator in the selected tenant. A platform administrator can review the change but cannot approve it.";
        action = { label: "Open tenant access", icon: Users, run: () => onNavigate("access") };
      } else if (pendingWafChangeSet.created_by === actorSubject) {
        title = "Invite an independent approver";
        detail = "You compiled this WAF change, so a different active tenant administrator or security administrator must review and approve it before it can be applied.";
        action = { label: "Open tenant access", icon: Users, run: () => onNavigate("access") };
      } else {
        detail = "The WAF change set requires approval before it can be applied to this edge.";
        action = { label: "Approve WAF", icon: CheckCircle2, run: () => edgeAction(`/api/waf-change-sets/${pendingWafChangeSet.change_set_id}/approve`, "POST", token, setStatus, onCreated, "WAF change set approved.") };
      }
    } else if (pendingWafChangeSet.status === "approved" && pendingWafChangeSet.mode === "block" && !monitorWafChangeSet) {
      title = "Start the 24-hour observation window";
      detail = "The approved policy would block traffic. FortressNet first deploys the same protections in monitor mode, which records matches without blocking requests. After 24 hours, review the observations and apply the approved blocking policy.";
      action = { label: "Start observation", icon: Activity, run: () => edgeAction(`/api/waf-change-sets/${pendingWafChangeSet.change_set_id}/start-monitoring`, "POST", token, setStatus, onCreated, "WAF observation started. Blocking remains disabled for 24 hours.", { domain_id: domain.domain_id }) };
    } else if (pendingWafChangeSet.status === "approved" && pendingWafChangeSet.mode === "block" && monitorWafChangeSet) {
      const remainingHours = monitorObservationRemainingHours(monitorWafChangeSet);
      if (remainingHours > 0) {
        title = "Observe the WAF policy before blocking";
        detail = `The equivalent policy is running in monitor mode. ${remainingHours} hour${remainingHours === 1 ? "" : "s"} remain before blocking can be enabled. Review Security Events for matches; traffic is not blocked during this window.`;
        action = { label: "Review events", icon: ClipboardList, run: () => onNavigate("events") };
      } else {
        title = "Apply the WAF blocking policy";
        detail = "The 24-hour monitor window is complete and the approved policy is ready to enforce at this edge.";
        action = { label: "Apply WAF", icon: Shield, run: () => edgeAction(`/api/waf-change-sets/${pendingWafChangeSet.change_set_id}/apply`, "POST", token, setStatus, onCreated, "WAF blocking policy applied.", { domain_id: domain.domain_id }) };
      }
    } else if (pendingWafChangeSet.status === "approved") {
      detail = "The approved monitor policy is ready to be applied to this edge. It records matches without blocking traffic.";
      action = { label: "Apply monitor policy", icon: Shield, run: () => edgeAction(`/api/waf-change-sets/${pendingWafChangeSet.change_set_id}/apply`, "POST", token, setStatus, onCreated, "WAF monitor policy applied.", { domain_id: domain.domain_id }) };
    } else {
      detail = "Complete the pending WAF change set before changing traffic DNS.";
      action = { label: "Open policies", icon: Shield, run: () => onNavigate("policies") };
    }
  } else if (deployment && domain.status !== "active") {
    title = "Switch traffic to FortressNet";
    detail = "Replace the public CNAME for the protected hostname with the traffic target shown below, then verify the DNS cutover.";
    action = { label: "Check traffic DNS", icon: RefreshCw, run: () => edgeAction(`/api/domains/${domain.domain_id}/verify-cutover`, "PATCH", token, setStatus, onCreated, "Traffic DNS checked.") };
  } else if (domain?.status === "active") {
    title = "Protection is active";
    detail = "The protected hostname is serving through FortressNet with the configured origin, certificate, edge, and WAF policy.";
  }

  const ActionIcon = action?.icon;
  const copyValue = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus({ type: "success", message: `${label} copied to the clipboard.` });
    } catch {
      setStatus({ type: "error", message: "Clipboard access is unavailable. Copy the value manually." });
    }
  };
  return (
    <div className={`onboarding-guidance ${validationRecord ? "has-record" : ""}`}>
      <Activity size={19} />
      <div className="guidance-copy">
        <strong>Next action: {title}</strong>
        <span>{detail}</span>
        {validationRecord && <div className="guidance-dns-record">
          <div><small>CNAME host</small><span><code>{validationRecord.name}</code><button className="guidance-copy-button" type="button" title="Copy CNAME host" aria-label="Copy CNAME host" onClick={() => copyValue(validationRecord.name, "CNAME host")}><Copy size={15} /></button></span></div>
          <div><small>CNAME target</small><span><code>{validationRecord.value}</code><button className="guidance-copy-button" type="button" title="Copy CNAME target" aria-label="Copy CNAME target" onClick={() => copyValue(validationRecord.value, "CNAME target")}><Copy size={15} /></button></span></div>
        </div>}
      </div>
      {action && <button className="primary compact" disabled={!token} onClick={action.run}>{ActionIcon && <ActionIcon size={15} />}{action.label}</button>}
    </div>
  );
}

function DomainsScreen({ token, platform, state, selectedTenantId, setSelectedTenantId, onCreated, setStatus }) {
  const domains = filterByTenant(state.domains, selectedTenantId);
  const deployments = filterByTenant(state.edge_deployments, selectedTenantId);
  return (
    <div className="screen">
      <div className="two-column">
      <Panel title="Domain Onboarding" action={<TenantSelector tenants={state.tenants} selectedTenantId={selectedTenantId} setSelectedTenantId={setSelectedTenantId} />}>
        <DomainCreateForm token={token} tenants={state.tenants} selectedTenantId={selectedTenantId} onCreated={onCreated} setStatus={setStatus} />
      </Panel>
      <Panel title="Domain Inventory">
        <DomainTable domains={domains} token={token} onVerified={onCreated} setStatus={setStatus} />
      </Panel>
      </div>
      <Panel title="Tenant Edge">
        <EdgeDeploymentTable token={token} domains={domains} deployments={deployments} canApproveTenantChanges={tenantApprovalEligible(platform, selectedTenantId)} actorSubject={platform?.actor?.subject || ""} onChanged={onCreated} setStatus={setStatus} />
      </Panel>
    </div>
  );
}

function DnsScreen({ token, state, selectedTenantId, setSelectedTenantId, onCreated, setStatus }) {
  const domains = filterByTenant(state.domains, selectedTenantId);
  const zones = filterByTenant(state.dns_zones, selectedTenantId);
  const [posture, setPosture] = useState(null);
  const createZone = async (domainId, mode) => {
    await edgeAction(`/api/domains/${domainId}/dns-zone`, "POST", token, setStatus, onCreated, "DNS zone workflow created.", { mode });
  };
  const checkPosture = async (domainId) => {
    try {
      const data = await apiRequest(`/api/domains/${domainId}/dns-posture`, token);
      setPosture(data.posture);
      setStatus({ type: "success", message: "DNS posture refreshed." });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    }
  };
  return (
    <div className="screen">
      <Panel id="dns-management" title="DNS Management" action={<TenantSelector tenants={state.tenants} selectedTenantId={selectedTenantId} setSelectedTenantId={setSelectedTenantId} />}>
        {domains.length ? <table className="data-table"><thead><tr><th>Domain</th><th>Mode</th><th>DNSSEC</th><th>Action</th></tr></thead><tbody>{domains.map((domain) => {
          const zone = zones.find((item) => item.domain_id === domain.domain_id);
          return <tr key={domain.domain_id}><td>{domain.domain_name}</td><td>{zone?.mode || "External DNS"}</td><td>{zone?.dnssec_status || "Check posture"}</td><td><span className="button-pair">{!zone && <button className="secondary compact" disabled={!token} onClick={() => createZone(domain.domain_id, "external_guided")}>Guided</button>}{!zone && <button className="secondary compact" disabled={!token} onClick={() => createZone(domain.domain_id, "route53_delegated")}>Delegate Route 53</button>}<button className="secondary compact" disabled={!token} onClick={() => checkPosture(domain.domain_id)}>Posture</button></span></td></tr>;
        })}</tbody></table> : <EmptyTable columns={["Domain", "Mode", "DNSSEC", "Action"]} message="Verify a domain before enabling DNS management." />}
      </Panel>
      <Panel title="DNS & TLS Posture">
        {posture ? <div className="settings-list"><div><Globe2 size={18} /><span>DNSSEC</span><strong>{posture.dnssec_status}</strong></div><div><Shield size={18} /><span>CAA</span><strong>{posture.caa_present ? "Present" : "Missing"}</strong></div><div><Activity size={18} /><span>Origin exposure</span><strong>{posture.origin_ip_exposed ? "Detected" : "Not detected"}</strong></div>{posture.findings.map((finding) => <div key={finding.code}><Bell size={18} /><span>{finding.recommendation}</span><strong>{finding.severity}</strong></div>)}</div> : <EmptyState icon={Globe2} title="No posture check yet" body="Run a posture check for a verified tenant domain." />}
      </Panel>
    </div>
  );
}

function DmarcScreen({ token, state, selectedTenantId, setSelectedTenantId, setStatus }) {
  const [configurations, setConfigurations] = useState([]);
  const [reports, setReports] = useState([]);
  const [domainId, setDomainId] = useState("");
  const [policy, setPolicy] = useState("none");
  const [alignment, setAlignment] = useState("r");
  const [percentage, setPercentage] = useState("100");
  const domains = filterByTenant(state.domains, selectedTenantId).filter((domain) => verifiedDomainStatuses.has(domain.status));
  const load = async () => {
    if (!token) return;
    const query = selectedTenantId ? `?tenant_id=${encodeURIComponent(selectedTenantId)}` : "";
    try {
      const [configurationData, reportData] = await Promise.all([
        apiRequest(`/api/dmarc/configurations${query}`, token),
        apiRequest(`/api/dmarc/reports${query}`, token)
      ]);
      setConfigurations(configurationData.configurations || []);
      setReports(reportData.reports || []);
      setStatus({ type: "success", message: "DMARC configuration and aggregate reports refreshed." });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    }
  };
  useEffect(() => { load(); }, [selectedTenantId, token]);
  useEffect(() => {
    if (!domains.some((domain) => domain.domain_id === domainId)) setDomainId(domains[0]?.domain_id || "");
  }, [domains, domainId]);
  const createConfiguration = async (event) => {
    event.preventDefault();
    try {
      await apiRequest(`/api/domains/${domainId}/dmarc`, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ policy, alignment, percentage: Number(percentage) }) });
      setStatus({ type: "success", message: "DMARC record generated. Publish the displayed TXT record when DNS is external." });
      await load();
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    }
  };
  return (
    <div className="screen">
      <div className="two-column">
        <Panel title="DMARC Policy" action={<TenantSelector tenants={state.tenants} selectedTenantId={selectedTenantId} setSelectedTenantId={setSelectedTenantId} />}>
          {domains.length ? <form className="form-grid" onSubmit={createConfiguration}>
            <label htmlFor="dmarc-domain">Verified domain<select id="dmarc-domain" value={domainId} onChange={(event) => setDomainId(event.target.value)}>{domains.map((domain) => <option key={domain.domain_id} value={domain.domain_id}>{domain.domain_name}</option>)}</select></label>
            <label htmlFor="dmarc-policy">Policy<select id="dmarc-policy" value={policy} onChange={(event) => setPolicy(event.target.value)}><option value="none">Monitor (p=none)</option><option value="quarantine">Quarantine</option><option value="reject">Reject</option></select></label>
            <label htmlFor="dmarc-alignment">Alignment<select id="dmarc-alignment" value={alignment} onChange={(event) => setAlignment(event.target.value)}><option value="r">Relaxed</option><option value="s">Strict</option></select></label>
            <label htmlFor="dmarc-percentage">Policy percentage<input id="dmarc-percentage" type="number" min="1" max="100" value={percentage} onChange={(event) => setPercentage(event.target.value)} /></label>
            <button className="primary" disabled={!token || !domainId}><Shield size={16} /> Generate DMARC policy</button>
          </form> : <EmptyState icon={FileText} title="No verified domain" body="Verify a tenant domain before generating a DMARC policy." />}
        </Panel>
        <Panel title="Aggregate Report Intake">
          <div className="settings-list"><div><FileText size={18} /><span>Receiver</span><strong>reports.fortressnet.app</strong></div><div><Shield size={18} /><span>Processing</span><strong>Encrypted S3 intake</strong></div><div><Activity size={18} /><span>Retention</span><strong>365 days</strong></div></div>
        </Panel>
      </div>
      <Panel title="Published Configurations" action={<button className="secondary compact" disabled={!token} onClick={load}><RefreshCw size={15} /> Refresh</button>}>
        {configurations.length ? <table className="data-table"><thead><tr><th>Domain</th><th>Policy</th><th>Record</th><th>Delivery</th><th>Status</th></tr></thead><tbody>{configurations.map((configuration) => <tr key={configuration.configuration_id}><td>{configuration.domain_name}</td><td>{configuration.policy} / {configuration.alignment}</td><td><code>{configuration.record_name}</code></td><td><code>{configuration.rua}</code></td><td><span className="health pending">{configuration.status}</span></td></tr>)}</tbody></table> : <EmptyTable columns={["Domain", "Policy", "Record", "Delivery", "Status"]} message="No DMARC policy has been created for this tenant." />}
      </Panel>
      <Panel title="Aggregate Reports">
        {reports.length ? <table className="data-table"><thead><tr><th>Domain</th><th>Organization</th><th>Messages</th><th>Disposition</th><th>Received</th></tr></thead><tbody>{reports.map((report) => <tr key={report.report_id}><td>{report.policy_domain || "-"}</td><td>{report.organization || "-"}</td><td>{report.record_count ?? 0}</td><td>{(report.dispositions || []).join(", ") || "-"}</td><td>{report.received_at ? new Date(report.received_at).toLocaleString() : "-"}</td></tr>)}</tbody></table> : <EmptyTable columns={["Domain", "Organization", "Messages", "Disposition", "Received"]} message="Aggregate reports will appear only after a provider sends a valid DMARC report." />}
      </Panel>
    </div>
  );
}

function ApiShieldScreen({ token, state, selectedTenantId, setSelectedTenantId, setStatus }) {
  const [inventory, setInventory] = useState([]);
  const [schemas, setSchemas] = useState([]);
  const [name, setName] = useState("");
  const [documentText, setDocumentText] = useState("");
  const load = async () => {
    if (!token) return;
    const query = selectedTenantId ? `?tenant_id=${encodeURIComponent(selectedTenantId)}` : "";
    try {
      const [inventoryData, schemaData] = await Promise.all([apiRequest(`/api/api-shield/inventory${query}`, token), apiRequest(`/api/api-shield/schemas${query}`, token)]);
      setInventory(inventoryData.inventory || []);
      setSchemas(schemaData.schemas || []);
    } catch (error) { setStatus({ type: "error", message: error.message }); }
  };
  useEffect(() => { load(); }, [selectedTenantId, token]);
  const refreshInventory = async () => {
    try {
      const data = await apiRequest("/api/api-shield/inventory/refresh", token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenant_id: selectedTenantId }) });
      setInventory(data.inventory || []);
      setStatus({ type: "success", message: `Inventory refreshed from ${data.observed_events} observed WAF events.` });
    } catch (error) { setStatus({ type: "error", message: error.message }); }
  };
  const importSchema = async (event) => {
    event.preventDefault();
    try {
      const document = JSON.parse(documentText);
      await apiRequest("/api/api-shield/schemas", token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenant_id: selectedTenantId, name, document }) });
      setName("");
      setDocumentText("");
      setStatus({ type: "success", message: "OpenAPI schema imported in report-only draft mode." });
      await load();
    } catch (error) { setStatus({ type: "error", message: error instanceof SyntaxError ? "openapi_json_invalid" : error.message }); }
  };
  const observeSchema = async (schemaId) => {
    try {
      await apiRequest(`/api/api-shield/schemas/${schemaId}/observe`, token, { method: "POST" });
      setStatus({ type: "success", message: "Schema observation started. Enforcement cannot be requested for 24 hours." });
      await load();
    } catch (error) { setStatus({ type: "error", message: error.message }); }
  };
  const requestEnforcement = async (schemaId) => {
    try {
      await apiRequest(`/api/api-shield/schemas/${schemaId}/enforcement-request`, token, { method: "POST" });
      setStatus({ type: "success", message: "Enforcement review requested. No traffic behavior changed." });
      await load();
    } catch (error) { setStatus({ type: "error", message: error.message }); }
  };
  const hasTenant = Boolean(selectedTenantId);
  return (
    <div className="screen">
      <div className="two-column">
        <Panel title="API Inventory" action={<span className="button-pair"><TenantSelector tenants={state.tenants} selectedTenantId={selectedTenantId} setSelectedTenantId={setSelectedTenantId} /><button className="secondary compact" disabled={!token || !hasTenant} onClick={refreshInventory}><RefreshCw size={15} /> Discover</button></span>}>
          {inventory.length ? <table className="data-table"><thead><tr><th>Method</th><th>Path</th><th>Requests</th><th>Blocked</th><th>Classification</th></tr></thead><tbody>{inventory.map((endpoint) => <tr key={endpoint.endpoint_id}><td>{endpoint.method}</td><td><code>{endpoint.path_template}</code></td><td>{endpoint.observed_requests}</td><td>{endpoint.blocked_requests}</td><td>{endpoint.classification}</td></tr>)}</tbody></table> : <EmptyState icon={Activity} title="No observed API surface" body="Discovery reads real WAF events from a tenant edge; it does not invent endpoints." />}
        </Panel>
        <Panel title="OpenAPI Import">
          <form className="form-grid" onSubmit={importSchema}>
            <label htmlFor="api-schema-name">Schema name<input id="api-schema-name" value={name} onChange={(event) => setName(event.target.value)} maxLength="100" /></label>
            <label htmlFor="api-schema-document">OpenAPI 3.x JSON<textarea id="api-schema-document" rows="8" value={documentText} onChange={(event) => setDocumentText(event.target.value)} spellCheck="false" /></label>
            <button className="primary" disabled={!token || !hasTenant || !name || !documentText}><Plus size={16} /> Import report-only schema</button>
          </form>
        </Panel>
      </div>
      <Panel title="Schema Lifecycle" action={<button className="secondary compact" disabled={!token} onClick={load}><RefreshCw size={15} /> Refresh</button>}>
        {schemas.length ? <table className="data-table"><thead><tr><th>Name</th><th>Version</th><th>Endpoints</th><th>Mode</th><th>Status</th><th>Action</th></tr></thead><tbody>{schemas.map((schema) => <tr key={schema.schema_id}><td>{schema.name}</td><td>{schema.version}</td><td>{schema.endpoint_count}</td><td>{schema.mode}</td><td><span className="health pending">{schema.status}</span></td><td>{schema.status === "draft" || schema.status === "report_only" ? <button className="secondary compact" onClick={() => observeSchema(schema.schema_id)}>Start 24h observation</button> : schema.status === "observing" ? <button className="secondary compact" onClick={() => requestEnforcement(schema.schema_id)}>Request enforcement</button> : <span className="mode-readonly">{schema.status === "enforcement_review" ? "Review pending" : "No action"}</span>}</td></tr>)}</tbody></table> : <EmptyTable columns={["Name", "Version", "Endpoints", "Mode", "Status", "Action"]} message="No OpenAPI schema has been imported for this tenant." />}
      </Panel>
      <Panel title="Enforcement Guardrail">
        <EmptyState icon={Shield} title="No automatic blocking from schema drafts" body="FortressNet records the requested enforcement review, but does not claim full OpenAPI enforcement until the positive model can validate paths, methods, parameters, headers and bodies at the tenant edge." />
      </Panel>
    </div>
  );
}

function OriginsScreen({ token, state, selectedTenantId, setSelectedTenantId, onCreated, setStatus }) {
  const origins = filterByTenant(state.origins, selectedTenantId);
  const pools = filterByTenant(state.origin_pools, selectedTenantId);
  const certificates = filterByTenant(state.certificates, selectedTenantId);
  const domains = filterByTenant(state.domains, selectedTenantId);

  return (
    <div className="screen">
      <div className="two-column">
        <Panel id="origins-inventory" title="Origins" action={<TenantSelector tenants={state.tenants} selectedTenantId={selectedTenantId} setSelectedTenantId={setSelectedTenantId} />}>
          <OriginTable origins={origins} token={token} onChanged={onCreated} setStatus={setStatus} />
        </Panel>
        <Panel title="Add Origin">
          <OriginCreateForm token={token} tenants={state.tenants} domains={domains} selectedTenantId={selectedTenantId} onCreated={onCreated} setStatus={setStatus} />
        </Panel>
      </div>
      <div className="two-column">
        <Panel title="Origin Pools">
          <OriginPoolTable pools={pools} origins={origins} />
        </Panel>
        <Panel title="Failover Configuration">
          <OriginPoolForm token={token} tenants={state.tenants} domains={domains} origins={origins} pools={pools} selectedTenantId={selectedTenantId} onCreated={onCreated} setStatus={setStatus} />
        </Panel>
      </div>
      <Panel title="TLS Certificates">
        <CertificateTable certificates={certificates} token={token} onRefreshed={onCreated} setStatus={setStatus} />
      </Panel>
    </div>
  );
}

function PoliciesScreen({ token, platform, state, selectedTenantId, setSelectedTenantId, onCreated, setStatus }) {
  const policies = filterByTenant(state.policies, selectedTenantId);
  const changeSets = filterByTenant(state.waf_change_sets, selectedTenantId);

  return (
    <div className="screen">
      <div className="split-detail">
        <Panel title="Policies" action={<TenantSelector tenants={state.tenants} selectedTenantId={selectedTenantId} setSelectedTenantId={setSelectedTenantId} />}>
          {policies.length ? (
            <div className="policy-list">
              {policies.map((policy) => (
                <div key={policy.policy_id} className="policy-item">
                  <Shield size={18} />
                  <span><strong>{policy.name}</strong><small>{policy.scope} · {policy.status}</small></span>
                  <em>{policy.mode}</em>
                  <button className="secondary compact" onClick={() => compilePolicy(policy.policy_id, token, setStatus, onCreated)}>Compile</button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Shield} title="No tenant policies yet" body="Create a tenant policy to scope WAF and rate-limit behavior." />
          )}
        </Panel>
        <Panel title="Policy Detail" action={<span className="mode-readonly">AWS managed baseline</span>}>
          <PolicyCreateForm token={token} tenants={state.tenants} selectedTenantId={selectedTenantId} onCreated={onCreated} setStatus={setStatus} />
        </Panel>
      </div>
      <Panel id="waf-change-sets" title="WAF Change Sets">
        <WafChangeSetTable changeSets={changeSets} domains={filterByTenant(state.domains, selectedTenantId)} token={token} canApproveTenantChanges={tenantApprovalEligible(platform, selectedTenantId)} actorSubject={platform?.actor?.subject || ""} onChanged={onCreated} setStatus={setStatus} />
      </Panel>
    </div>
  );
}

function AccessScreen({ token, platform, state, selectedTenantId, setSelectedTenantId, onCreated, setStatus }) {
  const users = selectedTenantId ? filterByTenant(state.users, selectedTenantId) : state.users.filter((user) => user.tenant_id === "platform");

  return (
    <div className="screen split-detail">
      <Panel title={selectedTenantId ? "Users and Roles" : "Platform Owners"} action={<TenantSelector tenants={state.tenants} selectedTenantId={selectedTenantId} setSelectedTenantId={setSelectedTenantId} />}>
        {users.length ? (
          <table className="data-table">
            <thead><tr><th>User</th><th>Status</th><th>Roles</th><th>Scopes</th><th>MFA</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.user_id}>
                  <td><strong>{user.display_name}</strong><small>{user.email}</small></td>
                  <td><span className="health pending">{user.status}</span></td>
                  <td>{(user.roles || []).join(", ")}</td>
                  <td>{(user.scopes || []).slice(0, 4).join(", ") || "none"}</td>
                  <td>{user.mfa_required ? "Required" : "Optional"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState icon={Users} title="No users configured" body="Create users with tenant-scoped roles and granular scopes." />
        )}
      </Panel>
      <Panel title="Invite User">
        <UserCreateForm token={token} platform={platform} tenants={state.tenants} selectedTenantId={selectedTenantId} onCreated={onCreated} setStatus={setStatus} />
      </Panel>
    </div>
  );
}

function IdpScreen({ token, state, selectedTenantId, setSelectedTenantId, onCreated, setStatus }) {
  const connections = filterByTenant(state.idp_connections, selectedTenantId);

  return (
    <div className="screen split-detail">
      <Panel title="External Identity Providers" action={<TenantSelector tenants={state.tenants} selectedTenantId={selectedTenantId} setSelectedTenantId={setSelectedTenantId} />}>
        {connections.length ? (
          <table className="data-table">
            <thead><tr><th>Name</th><th>Protocol</th><th>Status</th><th>Issuer</th><th>Provisioning</th></tr></thead>
            <tbody>
              {connections.map((idp) => (
                <tr key={idp.idp_id}>
                  <td>{idp.name}</td>
                  <td>{idp.protocol?.toUpperCase()}</td>
                  <td><span className="health pending">{idp.status}</span></td>
                  <td>{idp.issuer_url || idp.metadata_url || "pending"}</td>
                  <td>{idp.auto_provisioning ? "Enabled" : "Disabled"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState icon={Link2} title="No external IdP connected" body="Configure OIDC or SAML metadata per tenant." />
        )}
      </Panel>
      <Panel title="Add IdP Connection">
        <IdpCreateForm token={token} tenants={state.tenants} selectedTenantId={selectedTenantId} onCreated={onCreated} setStatus={setStatus} />
      </Panel>
    </div>
  );
}

function ZtnaScreen({ token, state, selectedTenantId, setSelectedTenantId, onCreated, setStatus }) {
  const applications = filterByTenant(state.ztna_applications, selectedTenantId);
  const connections = filterByTenant(state.idp_connections, selectedTenantId).filter((connection) => connection.status === "active");
  const [name, setName] = useState("");
  const [protocol, setProtocol] = useState("https");
  const [privateHostname, setPrivateHostname] = useState("");
  const [idpConnectionId, setIdpConnectionId] = useState("");
  const [devicePostureRequired, setDevicePostureRequired] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    await createResource("/api/ztna/applications", token, {
      tenant_id: selectedTenantId,
      name,
      protocol,
      private_hostname: privateHostname,
      idp_connection_id: idpConnectionId,
      device_posture_required: devicePostureRequired
    }, "Private application registered in design state.", setStatus, () => {
      setName("");
      setPrivateHostname("");
      setIdpConnectionId("");
      setDevicePostureRequired(false);
      onCreated();
    });
  };

  return (
    <div className="screen">
      <Panel id="ztna-applications" title="Private Applications" action={<TenantSelector tenants={state.tenants} selectedTenantId={selectedTenantId} setSelectedTenantId={setSelectedTenantId} />}>
        {applications.length ? <table className="data-table"><thead><tr><th>Application</th><th>Protocol</th><th>Private target</th><th>Identity</th><th>Posture</th><th>Status</th></tr></thead><tbody>{applications.map((application) => <tr key={application.application_id}><td>{application.name}</td><td>{application.protocol.toUpperCase()}</td><td>{application.private_hostname}</td><td>{application.idp_connection_id ? "External IdP" : "Pending"}</td><td>{application.device_posture_required ? "Required" : "Optional"}</td><td><span className="health pending">{application.status}</span></td></tr>)}</tbody></table> : <EmptyState icon={LockKeyhole} title="No private applications" body="Register an application before creating its access endpoint." />}
      </Panel>
      <Panel title="Register Private Application">
        {!state.tenants.length ? <EmptyState icon={Users} title="Create a tenant first" body="Private applications are isolated by tenant." /> : <form className="policy-editor" onSubmit={submit}>
          <div><label htmlFor="ztna-name">Application name</label><input id="ztna-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Operations console" /></div>
          <div><label htmlFor="ztna-protocol">Protocol</label><select id="ztna-protocol" value={protocol} onChange={(event) => setProtocol(event.target.value)}><option value="https">HTTPS</option><option value="ssh">SSH</option><option value="rdp">RDP</option><option value="tcp">TCP</option></select></div>
          <div><label htmlFor="ztna-hostname">Private hostname or IP</label><input id="ztna-hostname" value={privateHostname} onChange={(event) => setPrivateHostname(event.target.value)} placeholder="admin.internal.example" /></div>
          <div><label htmlFor="ztna-idp">External IdP</label><select id="ztna-idp" value={idpConnectionId} onChange={(event) => setIdpConnectionId(event.target.value)}><option value="">Configure later</option>{connections.map((connection) => <option key={connection.connection_id} value={connection.connection_id}>{connection.name}</option>)}</select></div>
          <div className="policy-scope-picker"><label>Device posture</label><div className="scope-picker"><label><input type="checkbox" checked={devicePostureRequired} onChange={(event) => setDevicePostureRequired(event.target.checked)} /> Require a posture policy</label></div></div>
          <button className="primary" disabled={!token || !selectedTenantId || !name || !privateHostname}><Plus size={16} /> Register application</button>
        </form>}
      </Panel>
    </div>
  );
}

function ApiKeysScreen({ token, platform, state, selectedTenantId, setSelectedTenantId, onCreated, setStatus }) {
  const apiKeys = filterByTenant(state.api_keys, selectedTenantId);
  const [newKey, setNewKey] = useState("");

  const handleCreated = (value) => {
    setNewKey(value || "");
    onCreated();
  };

  return (
    <div className="screen split-detail">
      <Panel id="api-keys-inventory" title="API Keys" action={<TenantSelector tenants={state.tenants} selectedTenantId={selectedTenantId} setSelectedTenantId={setSelectedTenantId} />}>
        {newKey && (
          <div className="secret-once">
            <strong>Copy this key now. It will not be shown again.</strong>
            <code>{newKey}</code>
          </div>
        )}
        {apiKeys.length ? (
          <table className="data-table">
            <thead><tr><th>Name</th><th>Prefix</th><th>Status</th><th>Scopes</th><th>Last used</th></tr></thead>
            <tbody>
              {apiKeys.map((apiKey) => (
                <tr key={apiKey.key_id}>
                  <td>{apiKey.name}</td>
                  <td><code>{apiKey.key_prefix}</code></td>
                  <td><span className="health pending">{apiKey.status}</span></td>
                  <td>{(apiKey.scopes || []).join(", ")}</td>
                  <td>{apiKey.last_used_at || "never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState icon={KeyRound} title="No API keys" body="Create scoped keys for automation and tenant integrations." />
        )}
      </Panel>
      <Panel title="Create API Key">
        <ApiKeyCreateForm token={token} platform={platform} tenants={state.tenants} selectedTenantId={selectedTenantId} onCreated={handleCreated} setStatus={setStatus} />
      </Panel>
    </div>
  );
}

function EventsScreen({ token, selectedTenantId, setStatus }) {
  const [events, setEvents] = useState([]);
  const load = () => loadOperationalData(`/api/events${selectedTenantId ? `?tenant_id=${encodeURIComponent(selectedTenantId)}` : ""}`, token, "events", setEvents, setStatus);
  return (
    <div className="screen">
      <Panel id="security-events" title="Security Event Stream" action={<button id="events-refresh" className="secondary compact" disabled={!token} onClick={load}><RefreshCw size={15} /> Refresh</button>}>
        {events.length ? <SecurityEventTable events={events} /> : <EmptyTable columns={["Time", "Rule", "Method", "Path", "Country", "Action"]} message="No security events have been collected from tenant WAF logs." />}
      </Panel>
    </div>
  );
}

function AiScreen({ token, selectedTenantId, setStatus }) {
  const [findings, setFindings] = useState([]);
  const analyze = async () => {
    try {
      const data = await apiRequest("/api/ai/analyze", token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenant_id: selectedTenantId }) });
      setFindings(data.findings || []);
      setStatus({ type: "success", message: `Read-only analysis completed for ${data.analyzed_events} events.` });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    }
  };
  return (
    <div className="screen ai-screen">
      <Panel id="ai-analysis" title="AI Security Analyst" action={<button id="ai-analyze" className="secondary compact" disabled={!token || !selectedTenantId} onClick={analyze}><Sparkles size={15} /> Analyze</button>}>
        {findings.length ? <table className="data-table"><thead><tr><th>Severity</th><th>Finding</th><th>Evidence</th><th>Recommendation</th></tr></thead><tbody>{findings.map((finding) => <tr key={finding.finding_id}><td><span className="health pending">{finding.severity}</span></td><td>{finding.summary}</td><td>{finding.evidence_count}</td><td>{finding.recommendation}</td></tr>)}</tbody></table> : <EmptyState icon={Sparkles} title="AI Analyst is ready" body="Findings appear only after analysis of real tenant WAF events." />}
      </Panel>
      <Panel title="Recommended Change Request">
        <EmptyState icon={ClipboardList} title="No recommendations pending" body="The analyst will create reviewable recommendations without applying enforcement changes automatically." />
      </Panel>
    </div>
  );
}

function ReportsScreen({ token, selectedTenantId, setStatus }) {
  const [reports, setReports] = useState([]);
  const load = () => loadOperationalData(`/api/reports${selectedTenantId ? `?tenant_id=${encodeURIComponent(selectedTenantId)}` : ""}`, token, "reports", setReports, setStatus);
  return (
    <div className="screen">
      <Panel id="security-report" title="Security Report" action={<button id="reports-refresh" className="secondary compact" disabled={!token} onClick={load}><RefreshCw size={15} /> Refresh</button>}>
        <div className="report-grid">
          {(reports.length ? reports : [{ report_id: "empty", source: "Waiting for tenant WAF logs", total_events: 0, blocked_events: 0, allowed_events: 0 }]).map((report) => (
            <div className="report-card" key={report.report_id}><BarChart3 size={32} /><p>{report.source}</p><strong>{report.total_events} events</strong><small>{report.blocked_events} blocked · {report.allowed_events} allowed</small></div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function BillingScreen({ token, state, selectedTenantId, setSelectedTenantId, onChanged, setStatus }) {
  const [summary, setSummary] = useState(null);
  const [marketplace, setMarketplace] = useState(null);
  const [plan, setPlan] = useState("");
  const load = async () => {
    if (!selectedTenantId || !token) return;
    try {
      const data = await apiRequest(`/api/billing/summary?tenant_id=${encodeURIComponent(selectedTenantId)}`, token);
      setSummary(data);
      setPlan(data.entitlement?.plan || "pilot");
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    }
  };
  useEffect(() => { load(); }, [selectedTenantId, token]);
  useEffect(() => {
    if (!token) return;
    apiRequest("/api/marketplace/status", token).then(setMarketplace).catch(() => setMarketplace(null));
  }, [token]);
  const updatePlan = async () => {
    try {
      await apiRequest(`/api/tenants/${selectedTenantId}/entitlement`, token, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }) });
      setStatus({ type: "success", message: "Plan limits updated." });
      await load();
      onChanged();
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    }
  };
  const usageRows = summary ? [
    ["Domains", summary.usage.domains, summary.entitlement.limits.domains],
    ["Users", summary.usage.users, summary.entitlement.limits.users],
    ["Active API keys", summary.usage.api_keys, summary.entitlement.limits.api_keys],
    ["External IdPs", summary.usage.idp_connections, summary.entitlement.limits.idp_connections],
    ["Managed DNS zones", summary.usage.dns_zones, summary.entitlement.limits.dns_zones],
    ["Policies", summary.usage.policies, summary.entitlement.limits.policies]
  ] : [];

  return (
    <div className="screen billing-grid">
      <Panel id="billing-plan" title="Current Plan" action={<TenantSelector tenants={state.tenants} selectedTenantId={selectedTenantId} setSelectedTenantId={setSelectedTenantId} />}>
        <div className="plan-box">
          {summary ? <><span>{summary.entitlement.plan_label} · {summary.entitlement.billing_status}</span><strong>{summary.entitlement.source}</strong><p>Limits are enforced by the control plane. Marketplace metering is enabled only after product fulfillment identifies the customer.</p></> : <><span>No tenant selected</span><p>Select a tenant to view its real entitlement and observed usage.</p></>}
        </div>
      </Panel>
      <Panel title="Usage This Month">
        <div className="usage-list">
          {usageRows.length ? usageRows.map(([label, current, limit]) => <div key={label}><span>{label} {current} / {limit}</span><div><i style={{ width: `${Math.min(100, Math.round((current / Math.max(1, limit)) * 100))}%` }}></i></div></div>) : <span className="mode-readonly">No observed tenant usage.</span>}
        </div>
      </Panel>
      <Panel title="Marketplace">
        <div className="marketplace-box">
          <CircleDollarSign size={30} />
          <h3>{marketplace?.enabled ? "Marketplace metering ready" : "Marketplace activation pending"}</h3>
          <p>Observed WAF events: {summary?.usage.observed_waf_requests ?? "not available"}. Blocked events: {summary?.usage.blocked_waf_requests ?? "not available"}.</p>
          <p>{marketplace?.enabled ? "The product code is held in the encrypted platform configuration. Usage submission remains restricted to platform billing operators." : "Create and publish the AWS Marketplace SaaS listing, then store its product code in the encrypted platform configuration."}</p>
          {summary && <div className="button-pair"><select className="compact-select" value={plan} onChange={(event) => setPlan(event.target.value)}><option value="pilot">Pilot</option><option value="business">Business</option><option value="enterprise">Enterprise</option></select><button className="secondary compact" onClick={updatePlan}>Update limits</button></div>}
        </div>
      </Panel>
    </div>
  );
}

function SettingsScreen({ platform, token, authMode }) {
  return (
    <div className="screen settings-grid">
      <Panel id="platform-security" title="Platform Security">
        <div className="settings-list">
          <div><KeyRound size={18} /><span>KMS key</span><strong>Provisioned</strong></div>
          <div><LockKeyhole size={18} /><span>Authentication</span><strong>Session required</strong></div>
          <div><Activity size={18} /><span>Management API</span><strong>{token ? "Protected" : "Unavailable"}</strong></div>
          <div><Globe2 size={18} /><span>DNS</span><strong>fortressnet.app active</strong></div>
        </div>
      </Panel>
    </div>
  );
}

function ProfileScreen({ token, accessToken, authMode, onMfaEnrolled, setStatus }) {
  const [profile, setProfile] = useState({
    display_name: "",
    email: "",
    timezone: "UTC",
    locale: "en-US",
    notification_email: true,
    notification_security: true
  });
  const [totpSecret, setTotpSecret] = useState("");
  const [totpQrCode, setTotpQrCode] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const timezoneOptions = useMemo(() => {
    const timezone = profile.timezone || "UTC";
    return profileTimezoneOptions.includes(timezone) ? profileTimezoneOptions : [...profileTimezoneOptions, timezone];
  }, [profile.timezone]);

  useEffect(() => {
    if (!token) return;
    apiRequest("/api/profile", token)
      .then((data) => setProfile((current) => ({ ...current, ...(data.profile || {}) })))
      .catch((error) => setStatus({ type: "error", message: error.message }));
  }, [token, setStatus]);

  const submit = async (event) => {
    event.preventDefault();
    try {
      const data = await apiRequest("/api/profile", token, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile)
      });
      setProfile(data.profile);
      setStatus({ type: "success", message: "Profile updated." });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    }
  };

  const beginTotpEnrollment = async () => {
    if (authMode !== "cognito" || !accessToken) {
      setStatus({ type: "error", message: "Sign in with Cognito before configuring multi-factor authentication." });
      return;
    }
    try {
      const data = await apiRequest("/api/profile/mfa/totp", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: accessToken })
      });
      const account = profile.email || "FortressNet user";
      const uri = `otpauth://totp/${encodeURIComponent(`FortressNet:${account}`)}?secret=${encodeURIComponent(data.secret_code)}&issuer=FortressNet&algorithm=SHA1&digits=6&period=30`;
      const qrCode = await QRCode.toDataURL(uri, { errorCorrectionLevel: "M", margin: 1, width: 224 });
      setTotpSecret(data.secret_code);
      setTotpQrCode(qrCode);
      setTotpCode("");
      setStatus({ type: "success", message: "Authenticator enrollment started. Scan the FortressNet QR code and enter the code to confirm." });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    }
  };

  const verifyTotpEnrollment = async (event) => {
    event.preventDefault();
    try {
      await apiRequest("/api/profile/mfa/totp/verify", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: accessToken, code: totpCode })
      });
      setTotpSecret("");
      setTotpQrCode("");
      setTotpCode("");
      setProfile((current) => ({ ...current, mfa_enrolled_at: new Date().toISOString() }));
      setStatus({ type: "success", message: "FortressNet authenticator verified and enabled." });
      onMfaEnrolled?.();
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    }
  };

  return (
    <div className="screen settings-grid">
      <Panel title="Personal Profile">
        <form className="form-grid" onSubmit={submit}>
          <label htmlFor="profile-name">Display name<input id="profile-name" value={profile.display_name || ""} onChange={(event) => setProfile({ ...profile, display_name: event.target.value })} /></label>
          <label htmlFor="profile-email">Email<input id="profile-email" value={profile.email || ""} readOnly aria-readonly="true" /></label>
          <label htmlFor="profile-timezone">Timezone<select id="profile-timezone" value={profile.timezone || "UTC"} onChange={(event) => setProfile({ ...profile, timezone: event.target.value })}>{timezoneOptions.map((timezone) => <option key={timezone} value={timezone}>{profileTimezoneOptions.includes(timezone) ? timezone : `${timezone} (legacy)`}</option>)}</select></label>
          <label htmlFor="profile-locale">Locale<select id="profile-locale" value={profile.locale || "en-US"} onChange={(event) => setProfile({ ...profile, locale: event.target.value })}>{profileLocaleOptions.map((locale) => <option key={locale.value} value={locale.value}>{locale.label}</option>)}</select></label>
          <label className="check-row"><input type="checkbox" checked={profile.notification_email !== false} onChange={(event) => setProfile({ ...profile, notification_email: event.target.checked })} /> Email notifications</label>
          <label className="check-row"><input type="checkbox" checked={profile.notification_security !== false} onChange={(event) => setProfile({ ...profile, notification_security: event.target.checked })} /> Security notifications</label>
          <button className="primary" disabled={!token}><CheckCircle2 size={16} /> Save profile</button>
        </form>
      </Panel>
      <Panel title="Session Context">
        <div className="settings-list">
          <div><Users size={18} /><span>Actor</span><strong>{authMode === "cognito" ? "Cognito" : "Recovery/API"}</strong></div>
          <div><LockKeyhole size={18} /><span>Profile storage</span><strong>DynamoDB</strong></div>
          <div><Bell size={18} /><span>Notification preference</span><strong>{profile.notification_security === false ? "Limited" : "Security on"}</strong></div>
        </div>
      </Panel>
      <Panel title="Multi-Factor Authentication">
        <div className="settings-list">
          <div><LockKeyhole size={18} /><span>Authenticator</span><strong>{profile.mfa_enrolled_at ? "Enabled" : "Not configured"}</strong></div>
          <div><Shield size={18} /><span>Issuer</span><strong>FortressNet</strong></div>
        </div>
        {!totpQrCode ? (
          <button className="primary" type="button" disabled={!token || authMode !== "cognito" || !accessToken} onClick={beginTotpEnrollment}><KeyRound size={16} /> Configure authenticator</button>
        ) : (
          <form className="form-grid" onSubmit={verifyTotpEnrollment}>
            <img className="totp-qr" src={totpQrCode} alt="FortressNet authenticator QR code" />
            <label htmlFor="totp-secret">Manual key<input id="totp-secret" value={totpSecret} readOnly /></label>
            <label htmlFor="totp-code">Verification code<input id="totp-code" inputMode="numeric" autoComplete="one-time-code" maxLength="6" value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, ""))} required /></label>
            <button className="primary" type="submit" disabled={totpCode.length !== 6 || !accessToken}><CheckCircle2 size={16} /> Verify authenticator</button>
          </form>
        )}
      </Panel>
    </div>
  );
}

function TenantRegistrationWizard({ token, setStatus, onClose, onCreated }) {
  const [step, setStep] = useState(0);
  const [technicalSameAsPrimary, setTechnicalSameAsPrimary] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    plan: "pilot",
    company: { legal_name: "", country: "", tax_id: "", website: "", industry: "", address_line_1: "", city: "", postal_code: "" },
    primary_contact: { full_name: "", email: "", job_title: "", phone: "" },
    technical_contact: { full_name: "", email: "", job_title: "", phone: "" },
    commercial: { estimated_domains: "1", expected_traffic_tier: "unknown", use_case: "" },
    opportunity_authorized: false
  });
  const update = (section, field, value) => setForm((current) => ({ ...current, [section]: { ...current[section], [field]: value } }));
  const updateTopLevel = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const validateStep = () => {
    if (step === 0 && (!form.name.trim() || !form.company.legal_name.trim() || !form.company.country)) return "Complete the tenant, legal entity and country fields.";
    if (step === 1 && (!form.primary_contact.full_name.trim() || !form.primary_contact.email.trim() || (!technicalSameAsPrimary && (!form.technical_contact.full_name.trim() || !form.technical_contact.email.trim())))) return "Add a primary and technical contact with valid email addresses.";
    if (step === 2 && (!form.commercial.estimated_domains || !form.opportunity_authorized)) return "Confirm the expected scope and authorization before registering the tenant.";
    return "";
  };
  const next = () => {
    const validationError = validateStep();
    if (validationError) return setError(validationError);
    setError("");
    setStep((current) => Math.min(current + 1, 2));
  };
  const submit = async (event) => {
    event.preventDefault();
    const validationError = validateStep();
    if (validationError) return setError(validationError);
    const technicalContact = technicalSameAsPrimary ? { ...form.primary_contact } : form.technical_contact;
    try {
      setSubmitting(true);
      const data = await apiRequest("/api/tenants", token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, registration: { company: form.company, primary_contact: form.primary_contact, technical_contact: technicalContact, commercial: form.commercial, opportunity_authorized: form.opportunity_authorized } }) });
      setStatus({ type: "success", message: "Tenant registration created." });
      onCreated(data.tenant);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };
  const steps = ["Organization", "Contacts", "Scope"];
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose(); }}>
      <section className="tenant-wizard" role="dialog" aria-modal="true" aria-labelledby="tenant-wizard-title">
        <header className="tenant-wizard-header"><div><p>NEW TENANT</p><h2 id="tenant-wizard-title">Tenant registration</h2></div><button className="icon-button bordered" type="button" title="Close tenant registration" disabled={submitting} onClick={onClose}><X size={18} /></button></header>
        <div className="wizard-stepper" aria-label={`Step ${step + 1} of 3`}>{steps.map((label, index) => <div key={label} className={index === step ? "current" : index < step ? "complete" : ""}><span>{index + 1}</span>{label}</div>)}</div>
        <form onSubmit={submit}>
          {step === 0 && <div className="wizard-fields">
            <label htmlFor="tenant-registration-name">Tenant name<input id="tenant-registration-name" value={form.name} onChange={(event) => updateTopLevel("name", event.target.value)} required /></label>
            <label htmlFor="tenant-legal-name">Legal entity<input id="tenant-legal-name" value={form.company.legal_name} onChange={(event) => update("company", "legal_name", event.target.value)} required /></label>
            <label htmlFor="tenant-country">Country<select id="tenant-country" value={form.company.country} onChange={(event) => update("company", "country", event.target.value)} required><option value="">Select country</option>{tenantCountryOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label htmlFor="tenant-tax-id">Tax ID<input id="tenant-tax-id" value={form.company.tax_id} onChange={(event) => update("company", "tax_id", event.target.value)} /></label>
            <label htmlFor="tenant-website">Website<input id="tenant-website" type="url" inputMode="url" placeholder="https://" value={form.company.website} onChange={(event) => update("company", "website", event.target.value)} /></label>
            <label htmlFor="tenant-industry">Industry<input id="tenant-industry" value={form.company.industry} onChange={(event) => update("company", "industry", event.target.value)} /></label>
            <label htmlFor="tenant-address">Address<input id="tenant-address" value={form.company.address_line_1} onChange={(event) => update("company", "address_line_1", event.target.value)} /></label>
            <label htmlFor="tenant-city">City<input id="tenant-city" value={form.company.city} onChange={(event) => update("company", "city", event.target.value)} /></label>
            <label htmlFor="tenant-postal-code">Postal code<input id="tenant-postal-code" value={form.company.postal_code} onChange={(event) => update("company", "postal_code", event.target.value)} /></label>
          </div>}
          {step === 1 && <div className="wizard-fields">
            <h3>Primary contact</h3>
            <label htmlFor="tenant-primary-name">Full name<input id="tenant-primary-name" value={form.primary_contact.full_name} onChange={(event) => update("primary_contact", "full_name", event.target.value)} required /></label>
            <label htmlFor="tenant-primary-email">Email<input id="tenant-primary-email" type="email" value={form.primary_contact.email} onChange={(event) => update("primary_contact", "email", event.target.value)} required /></label>
            <label htmlFor="tenant-primary-title">Job title<input id="tenant-primary-title" value={form.primary_contact.job_title} onChange={(event) => update("primary_contact", "job_title", event.target.value)} /></label>
            <label htmlFor="tenant-primary-phone">Phone<input id="tenant-primary-phone" type="tel" value={form.primary_contact.phone} onChange={(event) => update("primary_contact", "phone", event.target.value)} /></label>
            <label className="check-row wizard-wide"><input type="checkbox" checked={technicalSameAsPrimary} onChange={(event) => setTechnicalSameAsPrimary(event.target.checked)} /> Technical contact is the primary contact</label>
            {!technicalSameAsPrimary && <><h3 className="wizard-wide">Technical contact</h3><label htmlFor="tenant-technical-name">Full name<input id="tenant-technical-name" value={form.technical_contact.full_name} onChange={(event) => update("technical_contact", "full_name", event.target.value)} required /></label><label htmlFor="tenant-technical-email">Email<input id="tenant-technical-email" type="email" value={form.technical_contact.email} onChange={(event) => update("technical_contact", "email", event.target.value)} required /></label><label htmlFor="tenant-technical-title">Job title<input id="tenant-technical-title" value={form.technical_contact.job_title} onChange={(event) => update("technical_contact", "job_title", event.target.value)} /></label><label htmlFor="tenant-technical-phone">Phone<input id="tenant-technical-phone" type="tel" value={form.technical_contact.phone} onChange={(event) => update("technical_contact", "phone", event.target.value)} /></label></>}
          </div>}
          {step === 2 && <div className="wizard-fields">
            <label htmlFor="tenant-plan">Requested plan<select id="tenant-plan" value={form.plan} onChange={(event) => updateTopLevel("plan", event.target.value)}><option value="pilot">Pilot</option><option value="business">Business</option><option value="enterprise">Enterprise</option></select></label>
            <label htmlFor="tenant-estimated-domains">Expected protected domains<input id="tenant-estimated-domains" type="number" min="1" max="10000" value={form.commercial.estimated_domains} onChange={(event) => update("commercial", "estimated_domains", event.target.value)} required /></label>
            <label htmlFor="tenant-traffic-tier">Expected monthly traffic<select id="tenant-traffic-tier" value={form.commercial.expected_traffic_tier} onChange={(event) => update("commercial", "expected_traffic_tier", event.target.value)}><option value="unknown">Unknown</option><option value="under_1m">Under 1M requests</option><option value="1m_to_10m">1M to 10M requests</option><option value="10m_to_100m">10M to 100M requests</option><option value="over_100m">Over 100M requests</option></select></label>
            <label className="wizard-wide" htmlFor="tenant-use-case">Security use case<textarea id="tenant-use-case" rows="5" value={form.commercial.use_case} onChange={(event) => update("commercial", "use_case", event.target.value)} /></label>
            <label className="check-row wizard-wide"><input type="checkbox" checked={form.opportunity_authorized} onChange={(event) => updateTopLevel("opportunity_authorized", event.target.checked)} /> I confirm this data is authorized for tenant registration and future opportunity records.</label>
          </div>}
          {error && <div className="wizard-error" role="alert">{error}</div>}
          <footer className="tenant-wizard-footer">{step > 0 ? <button className="secondary" type="button" disabled={submitting} onClick={() => { setError(""); setStep((current) => current - 1); }}><ChevronLeft size={16} /> Back</button> : <span />}{step < 2 ? <button className="primary" type="button" onClick={next}>Continue <ChevronRight size={16} /></button> : <button className="primary" type="submit" disabled={submitting}>{submitting ? "Registering" : "Create tenant"} <CheckCircle2 size={16} /></button>}</footer>
        </form>
      </section>
    </div>
  );
}

function UserCreateForm({ token, platform, tenants, selectedTenantId, onCreated, setStatus }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("tenant_admin");

  const submit = async (event) => {
    event.preventDefault();
    await createResource("/api/users", token, {
      tenant_id: selectedTenantId || "platform",
      display_name: displayName,
      email,
      roles: [role],
      scopes: []
    }, "User created.", setStatus, () => {
      setDisplayName("");
      setEmail("");
      onCreated();
    });
  };

  if (!tenants.length) {
    return <EmptyState icon={Users} title="Create a tenant first" body="Tenant users require a tenant context." />;
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      <label htmlFor="user-name">Display name<input id="user-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Jane Admin" /></label>
      <label htmlFor="user-email">Email<input id="user-email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="jane@example.com" /></label>
      <label htmlFor="user-role">Role<select id="user-role" value={role} onChange={(event) => setRole(event.target.value)}>{(platform?.roles || []).filter((item) => item !== "platform_owner").map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <button className="primary" disabled={!token || !selectedTenantId || !displayName || !email}><Plus size={16} /> Create user</button>
    </form>
  );
}

function IdpCreateForm({ token, tenants, selectedTenantId, onCreated, setStatus }) {
  const [name, setName] = useState("");
  const [protocol, setProtocol] = useState("oidc");
  const [issuerUrl, setIssuerUrl] = useState("");
  const [metadataUrl, setMetadataUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [defaultRole, setDefaultRole] = useState("read_only");

  const submit = async (event) => {
    event.preventDefault();
    await createResource("/api/idp-connections", token, {
      tenant_id: selectedTenantId,
      name,
      protocol,
      issuer_url: issuerUrl,
      metadata_url: metadataUrl,
      client_id: clientId,
      client_secret: clientSecret,
      default_role: defaultRole
    }, "Identity provider connection saved.", setStatus, () => {
      setName("");
      setIssuerUrl("");
      setMetadataUrl("");
      setClientId("");
      setClientSecret("");
      onCreated();
    });
  };

  if (!tenants.length) {
    return <EmptyState icon={Users} title="Create a tenant first" body="External IdPs are configured per tenant." />;
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      <label htmlFor="idp-name">Name<input id="idp-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Okta workforce" /></label>
      <label htmlFor="idp-protocol">Protocol<select id="idp-protocol" value={protocol} onChange={(event) => setProtocol(event.target.value)}><option value="oidc">OIDC</option><option value="saml">SAML</option></select></label>
      <label htmlFor="idp-issuer">Issuer URL<input id="idp-issuer" value={issuerUrl} onChange={(event) => setIssuerUrl(event.target.value)} placeholder="https://idp.example.com/oauth2/default" /></label>
      <label htmlFor="idp-metadata">Metadata URL<input id="idp-metadata" value={metadataUrl} onChange={(event) => setMetadataUrl(event.target.value)} placeholder="https://idp.example.com/metadata" /></label>
      <label htmlFor="idp-client">Client ID<input id="idp-client" value={clientId} onChange={(event) => setClientId(event.target.value)} /></label>
      {protocol === "oidc" && <label htmlFor="idp-secret">Client secret<input id="idp-secret" type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} autoComplete="new-password" /></label>}
      <label htmlFor="idp-role">Default role<select id="idp-role" value={defaultRole} onChange={(event) => setDefaultRole(event.target.value)}><option value="read_only">Read only</option><option value="security_analyst">Security analyst</option></select></label>
      <button className="primary" disabled={!token || !selectedTenantId || !name}><Plus size={16} /> Save IdP</button>
    </form>
  );
}

function ApiKeyCreateForm({ token, platform, tenants, selectedTenantId, onCreated, setStatus }) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState(["tenant:read", "domain:read"]);

  const toggleScope = (scope) => {
    setScopes((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]);
  };

  const submit = async (event) => {
    event.preventDefault();
    try {
      const data = await apiRequest("/api/api-keys", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: selectedTenantId, name, scopes })
      });
      setStatus({ type: "success", message: "API key created." });
      setName("");
      onCreated(data.api_key_value);
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    }
  };

  if (!tenants.length) {
    return <EmptyState icon={Users} title="Create a tenant first" body="API keys must be scoped to a tenant." />;
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      <label htmlFor="api-key-name">Key name<input id="api-key-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="CI deployment integration" /></label>
      <div className="scope-picker">
        {(platform?.scopes || []).map((scope) => (
          <label key={scope}><input type="checkbox" checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} /> {scope}</label>
        ))}
      </div>
      <button className="primary" disabled={!token || !selectedTenantId || !name || !scopes.length}><KeyRound size={16} /> Create key</button>
    </form>
  );
}

function DomainCreateForm({ token, tenants, selectedTenantId, onCreated, setStatus }) {
  const [domainName, setDomainName] = useState("");
  const [originUrl, setOriginUrl] = useState("");
  const [healthPath, setHealthPath] = useState("/");

  const submit = async (event) => {
    event.preventDefault();
    await createResource("/api/domain-onboarding", token, {
      tenant_id: selectedTenantId,
      domain_name: domainName,
      origin_url: originUrl,
      health_path: healthPath
    }, "Domain onboarding package created.", setStatus, () => {
      setDomainName("");
      setOriginUrl("");
      setHealthPath("/");
      onCreated();
    });
  };

  if (!tenants.length) {
    return <EmptyState icon={Users} title="Create a tenant first" body="Domains must be attached to a tenant before DNS verification can start." />;
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      <label htmlFor="protected-domain">Protected domain<input id="protected-domain" value={domainName} onChange={(event) => setDomainName(event.target.value)} placeholder="www.customer.com" /></label>
      <label htmlFor="origin-url">Origin URL<input id="origin-url" value={originUrl} onChange={(event) => setOriginUrl(event.target.value)} placeholder="https://origin.customer.com" /></label>
      <label htmlFor="health-path">Health path<input id="health-path" value={healthPath} onChange={(event) => setHealthPath(event.target.value)} placeholder="/health" /></label>
      <button className="primary" disabled={!token || !selectedTenantId || !domainName || !originUrl}><Plus size={16} /> Start onboarding</button>
    </form>
  );
}

function OriginCreateForm({ token, tenants, domains, selectedTenantId, onCreated, setStatus }) {
  const [domainId, setDomainId] = useState("");
  const [name, setName] = useState("");
  const [originUrl, setOriginUrl] = useState("");
  const [healthPath, setHealthPath] = useState("/");

  useEffect(() => {
    if (!domains.some((domain) => domain.domain_id === domainId)) setDomainId(domains[0]?.domain_id || "");
  }, [domains, domainId]);

  const submit = async (event) => {
    event.preventDefault();
    await createResource("/api/origins", token, {
      tenant_id: selectedTenantId,
      domain_id: domainId,
      name,
      origin_url: originUrl,
      health_path: healthPath
    }, "Origin added. Run a health check before adding it to a failover pool.", setStatus, () => {
      setName("");
      setOriginUrl("");
      setHealthPath("/");
      onCreated();
    });
  };

  if (!tenants.length) return <EmptyState icon={Users} title="Create a tenant first" body="Origins are always attached to a protected tenant domain." />;
  if (!domains.length) return <EmptyState icon={Globe2} title="Create a protected site first" body="Add an origin only after selecting the tenant domain it will serve." />;

  return (
    <form className="form-grid" onSubmit={submit}>
      <label htmlFor="origin-domain">Domain<select id="origin-domain" value={domainId} onChange={(event) => setDomainId(event.target.value)}>{domains.map((domain) => <option key={domain.domain_id} value={domain.domain_id}>{domain.domain_name}</option>)}</select></label>
      <label htmlFor="additional-origin-name">Origin name<input id="additional-origin-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="secondary" /></label>
      <label htmlFor="additional-origin-url">Origin URL<input id="additional-origin-url" value={originUrl} onChange={(event) => setOriginUrl(event.target.value)} placeholder="https://secondary.customer.com" /></label>
      <label htmlFor="additional-origin-health-path">Health path<input id="additional-origin-health-path" value={healthPath} onChange={(event) => setHealthPath(event.target.value)} placeholder="/health" /></label>
      <button className="primary" disabled={!token || !domainId || !originUrl}><Plus size={16} /> Add origin</button>
    </form>
  );
}

function OriginPoolForm({ token, tenants, domains, origins, pools, selectedTenantId, onCreated, setStatus }) {
  const [domainId, setDomainId] = useState("");
  const [name, setName] = useState("primary-pool");
  const [originIds, setOriginIds] = useState([]);
  const [failoverEnabled, setFailoverEnabled] = useState(false);
  const domainOrigins = useMemo(() => origins.filter((origin) => origin.domain_id === domainId), [origins, domainId]);
  const existingPool = useMemo(() => pools.find((pool) => pool.domain_id === domainId) || null, [pools, domainId]);

  useEffect(() => {
    if (!domains.some((domain) => domain.domain_id === domainId)) setDomainId(domains[0]?.domain_id || "");
  }, [domains, domainId]);

  useEffect(() => {
    if (!domainId) return;
    setName(existingPool?.name || "primary-pool");
    setOriginIds(existingPool?.origin_ids || domainOrigins.slice(0, 1).map((origin) => origin.origin_id));
    setFailoverEnabled(existingPool?.failover_enabled === true);
  }, [domainId, existingPool?.pool_id, existingPool?.name, existingPool?.failover_enabled, existingPool?.origin_ids, domainOrigins]);

  const toggleOrigin = (originId) => {
    setOriginIds((current) => {
      const next = current.includes(originId) ? current.filter((item) => item !== originId) : current.length < 2 ? [...current, originId] : current;
      setFailoverEnabled(next.length === 2);
      return next;
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    try {
      const payload = { tenant_id: selectedTenantId, domain_id: domainId, name, origin_ids: originIds, strategy: "priority", failover_enabled: failoverEnabled };
      await apiRequest(existingPool ? `/api/origin-pools/${existingPool.pool_id}` : "/api/origin-pools", token, {
        method: existingPool ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      setStatus({ type: "success", message: failoverEnabled ? "Failover pool saved. CloudFront will use it for the next edge provisioning." : "Origin pool saved." });
      onCreated();
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    }
  };

  if (!tenants.length) return <EmptyState icon={Users} title="Create a tenant first" body="Origin pools are scoped to a tenant domain." />;
  if (!domains.length) return <EmptyState icon={Globe2} title="Create a protected site first" body="A pool can be configured before the tenant edge is requested." />;

  return (
    <form className="form-grid" onSubmit={submit}>
      <label htmlFor="origin-pool-domain">Domain<select id="origin-pool-domain" value={domainId} onChange={(event) => setDomainId(event.target.value)}>{domains.map((domain) => <option key={domain.domain_id} value={domain.domain_id}>{domain.domain_name}</option>)}</select></label>
      <label htmlFor="origin-pool-name">Pool name<input id="origin-pool-name" value={name} onChange={(event) => setName(event.target.value)} /></label>
      <div className="scope-picker">
        {domainOrigins.map((origin) => <label key={origin.origin_id}><input type="checkbox" checked={originIds.includes(origin.origin_id)} onChange={() => toggleOrigin(origin.origin_id)} /> {origin.name} - {origin.status}</label>)}
      </div>
      <label className="check-row"><input type="checkbox" checked={failoverEnabled} disabled={originIds.length !== 2} onChange={(event) => setFailoverEnabled(event.target.checked)} /> Enable primary-to-secondary failover</label>
      <button className="primary" disabled={!token || !domainId || !name || !originIds.length || (failoverEnabled && originIds.length !== 2) || (!failoverEnabled && originIds.length !== 1)}><Layers3 size={16} /> Save pool</button>
    </form>
  );
}

function PolicyCreateForm({ token, tenants, selectedTenantId, onCreated, setStatus }) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState("monitor");
  const [rateLimit, setRateLimit] = useState("2000");
  const [rateLimitPath, setRateLimitPath] = useState("");
  const [rateLimitMethods, setRateLimitMethods] = useState([]);
  const [rateLimitCountries, setRateLimitCountries] = useState([]);
  const [managedProtections, setManagedProtections] = useState([]);
  const [blockedAsns, setBlockedAsns] = useState("");
  const [blockedHeaderName, setBlockedHeaderName] = useState("");
  const [blockedHeaderValues, setBlockedHeaderValues] = useState("");
  const [allowedIpCidrs, setAllowedIpCidrs] = useState("");
  const [blockedIpCidrs, setBlockedIpCidrs] = useState("");

  const toggleMethod = (method) => {
    setRateLimitMethods((current) => current.includes(method) ? current.filter((item) => item !== method) : [...current, method]);
  };

  const selectCountries = (event) => {
    setRateLimitCountries(Array.from(event.target.selectedOptions, (option) => option.value));
  };

  const toggleManagedProtection = (protection) => {
    setManagedProtections((current) => current.includes(protection) ? current.filter((item) => item !== protection) : [...current, protection]);
  };

  const submit = async (event) => {
    event.preventDefault();
    await createResource("/api/policies", token, {
      tenant_id: selectedTenantId,
      name,
      mode,
      scope: "all_domains",
      rate_limit: Number(rateLimit),
      rate_limit_path: rateLimitPath,
      rate_limit_methods: rateLimitMethods,
      rate_limit_countries: rateLimitCountries,
      managed_protections: managedProtections,
      blocked_asns: blockedAsns,
      blocked_header_name: blockedHeaderName,
      blocked_header_values: blockedHeaderValues,
      allowed_ip_cidrs: allowedIpCidrs,
      blocked_ip_cidrs: blockedIpCidrs
    }, "Policy draft created.", setStatus, () => {
      setName("");
      setRateLimit("2000");
      setRateLimitPath("");
      setRateLimitMethods([]);
      setRateLimitCountries([]);
      setManagedProtections([]);
      setBlockedAsns("");
      setBlockedHeaderName("");
      setBlockedHeaderValues("");
      setAllowedIpCidrs("");
      setBlockedIpCidrs("");
      onCreated();
    });
  };

  if (!tenants.length) {
    return <EmptyState icon={Users} title="Create a tenant first" body="Tenant-scoped policies become available after tenant creation." />;
  }

  return (
    <form className="policy-editor" onSubmit={submit}>
      <div><label htmlFor="policy-name">Policy name</label><input id="policy-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="OWASP managed defaults" /></div>
      <div><label htmlFor="policy-mode">Mode</label><select id="policy-mode" value={mode} onChange={(event) => setMode(event.target.value)}><option value="monitor">Monitor first</option><option value="block">Block after observation</option></select></div>
      <div><label htmlFor="policy-rate-limit">Requests per 5 minutes per IP</label><input id="policy-rate-limit" type="number" min="100" max="2000000" step="1" value={rateLimit} onChange={(event) => setRateLimit(event.target.value)} required /></div>
      <div><label htmlFor="policy-rate-path">Path prefix</label><input id="policy-rate-path" value={rateLimitPath} onChange={(event) => setRateLimitPath(event.target.value)} placeholder="/login" /></div>
      <div className="policy-scope-picker"><label>HTTP methods</label><div className="scope-picker">{rateLimitMethodOptions.map((method) => <label key={method}><input type="checkbox" checked={rateLimitMethods.includes(method)} onChange={() => toggleMethod(method)} /> {method}</label>)}</div></div>
      <div><label htmlFor="policy-rate-countries">Countries</label><select id="policy-rate-countries" multiple value={rateLimitCountries} onChange={selectCountries}>{rateLimitCountryOptions.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></div>
      <div className="policy-scope-picker"><label>Managed protections</label><div className="scope-picker"><label><input type="checkbox" checked={managedProtections.includes("ip_reputation")} onChange={() => toggleManagedProtection("ip_reputation")} /> IP reputation</label><label><input type="checkbox" checked={managedProtections.includes("anonymous_ip")} onChange={() => toggleManagedProtection("anonymous_ip")} /> Anonymous IP</label></div></div>
      <div><label htmlFor="policy-blocked-asns">Blocked ASNs</label><input id="policy-blocked-asns" value={blockedAsns} onChange={(event) => setBlockedAsns(event.target.value)} placeholder="12345, 64496" /></div>
      <div><label htmlFor="policy-blocked-header-name">Blocked request header</label><input id="policy-blocked-header-name" value={blockedHeaderName} onChange={(event) => setBlockedHeaderName(event.target.value)} placeholder="x-forwarded-host" /></div>
      <div><label htmlFor="policy-blocked-header-values">Blocked header values</label><input id="policy-blocked-header-values" value={blockedHeaderValues} onChange={(event) => setBlockedHeaderValues(event.target.value)} placeholder="invalid.example, unknown.example" /></div>
      <div><label htmlFor="policy-allowed-cidrs">Allowed source CIDRs</label><textarea id="policy-allowed-cidrs" value={allowedIpCidrs} onChange={(event) => setAllowedIpCidrs(event.target.value)} placeholder="203.0.113.0/24\n2001:db8::/32" /></div>
      <div><label htmlFor="policy-blocked-cidrs">Blocked source CIDRs</label><textarea id="policy-blocked-cidrs" value={blockedIpCidrs} onChange={(event) => setBlockedIpCidrs(event.target.value)} placeholder="198.51.100.0/24" /></div>
      <pre>{`tenant_id: ${selectedTenantId || "pending"}\nscope: all_domains\nenforcement: ${mode}\nrate_limit: ${rateLimit || "invalid"} per 5 minutes per IP\npath: ${rateLimitPath || "all paths"}\nmanaged: ${managedProtections.length ? managedProtections.join(", ") : "baseline only"}\nASNs: ${blockedAsns || "none"}\nsource lists: ${allowedIpCidrs || blockedIpCidrs ? "configured" : "none"}\napproval_required: true`}</pre>
      <button className="primary" disabled={!token || !selectedTenantId || !name || Number(rateLimit) < 100 || Number(rateLimit) > 2000000}><Plus size={16} /> Create policy</button>
    </form>
  );
}

function DomainTable({ domains, token = "", onVerified = null, setStatus = null }) {
  if (!domains.length) {
    return <EmptyTable columns={["Domain", "Status", "Requests", "Blocked", "WAF Matches", "DNS"]} message="No protected domains are configured." />;
  }

  return (
    <table className="data-table">
      <thead><tr><th>Domain</th><th>Status</th><th>Requests</th><th>Blocked</th><th>DNS</th><th>Action</th></tr></thead>
      <tbody>
        {domains.map((domain) => (
          <tr key={domain.domain_id}>
            <td>{domain.domain_name}</td>
            <td><span className="health pending">{domain.status}</span></td>
            <td>{domain.requests || 0}</td>
            <td>{domain.blocked || 0}</td>
            <td><small>{domain.verification_name}</small></td>
            <td><button className="secondary compact" disabled={!token} onClick={() => verifyDomainDns(domain.domain_id, token, setStatus, onVerified)}>Check DNS</button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DomainInstructions({ domain, certificate, deployment }) {
  if (!domain) {
    return <EmptyState icon={Globe2} title="No onboarding started" body="Create a protected site to receive DNS ownership and CNAME instructions." />;
  }

  const ownershipPending = !verifiedDomainStatuses.has(domain.status);

  return (
    <div className="instructions-grid">
      {ownershipPending && <div>
        <strong>Ownership TXT</strong>
        <code>{domain.verification_name}</code>
        <code>{domain.verification_value}</code>
      </div>}
      {certificate?.validation_records?.map((record) => (
        <div key={record.name}>
          <strong>ACM validation CNAME</strong>
          <code>{record.name}</code>
          <code>{record.value}</code>
        </div>
      ))}
      {deployment?.distribution_domain_name && (
        <div>
          <strong>Traffic CNAME</strong>
          <code>{domain.domain_name}</code>
          <code>{deployment.distribution_domain_name}</code>
        </div>
      )}
      <div>
        <strong>Current step</strong>
        <span className="health pending">{humanizeWorkflowStatus(domain.onboarding_step || domain.status)}</span>
        {domain.dns_last_checked_at && <small>Last DNS check: {new Date(domain.dns_last_checked_at).toLocaleString()}</small>}
        {domain.dns_last_error && <small className="danger-text">{domain.dns_last_error}</small>}
      </div>
    </div>
  );
}

function OriginTable({ origins, token = "", onChanged = null, setStatus = null }) {
  if (!origins.length) {
    return <EmptyTable columns={["Name", "Origin", "Health", "Path"]} message="No origins are configured." />;
  }

  return (
    <table className="data-table">
      <thead><tr><th>Name</th><th>Origin</th><th>Health</th><th>Path</th><th>Action</th></tr></thead>
      <tbody>
        {origins.map((origin) => (
          <tr key={origin.origin_id}>
            <td>{origin.name}</td>
            <td><small>{origin.origin_url}</small></td>
            <td><span className="health pending">{origin.status}</span></td>
            <td>{origin.health_path}</td>
            <td><button className="secondary compact" disabled={!token} onClick={() => originHealthCheck(origin.origin_id, token, setStatus, onChanged)}>Check</button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OriginPoolTable({ pools, origins }) {
  if (!pools.length) {
    return <EmptyTable columns={["Pool", "Routing", "Origins", "Status"]} message="No origin pools are configured." />;
  }

  return (
    <table className="data-table">
      <thead><tr><th>Pool</th><th>Routing</th><th>Origins</th><th>Status</th></tr></thead>
      <tbody>
        {pools.map((pool) => (
          <tr key={pool.pool_id}>
            <td>{pool.name}</td>
            <td>{pool.failover_enabled ? "Primary -> secondary failover" : pool.strategy}</td>
            <td>{(pool.origin_ids || []).map((originId) => origins.find((origin) => origin.origin_id === originId)?.name || originId).join(" -> ")}</td>
            <td><span className="health pending">{pool.status}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CertificateTable({ certificates, token = "", onRefreshed = null, setStatus = null }) {
  if (!certificates.length) {
    return <EmptyTable columns={["Domain", "Provider", "Region", "Status", "Validation", "Action"]} message="No certificate requests are tracked." />;
  }

  return (
    <table className="data-table">
      <thead><tr><th>Domain</th><th>Provider</th><th>Region</th><th>Status</th><th>Validation</th><th>Action</th></tr></thead>
      <tbody>
        {certificates.map((certificate) => (
          <tr key={certificate.certificate_id}>
            <td>{certificate.domain_name}</td>
            <td>{certificate.provider}</td>
            <td>{certificate.region}</td>
            <td><span className="health pending">{certificate.status}</span></td>
            <td><small>{certificate.validation_records?.length ? "DNS record ready" : "Awaiting ownership check"}</small></td>
            <td><button className="secondary compact" disabled={!token || !certificate.certificate_arn} onClick={() => refreshCertificate(certificate.certificate_id, token, setStatus, onRefreshed)}>Refresh</button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function WafChangeSetTable({ changeSets, domains = [], token = "", canApproveTenantChanges = false, actorSubject = "", onChanged = null, setStatus = null }) {
  const [domainId, setDomainId] = useState("");
  useEffect(() => {
    if (!domains.some((domain) => domain.domain_id === domainId)) setDomainId(domains.length === 1 ? domains[0].domain_id : "");
  }, [domains, domainId]);
  if (!changeSets.length) {
    return <EmptyTable columns={["Created", "Policy", "Mode", "Status", "Rules", "Action"]} message="No WAF change sets have been compiled." />;
  }

  return (
    <table className="data-table">
      <thead><tr><th>Created</th><th>Policy</th><th>Mode</th><th>Status</th><th>Rules</th><th>Target</th><th>Action</th></tr></thead>
      <tbody>
        {changeSets.map((changeSet) => (
          <tr key={changeSet.change_set_id}>
            <td>{changeSet.created_at}</td>
            <td><code>{changeSet.policy_id}</code></td>
            <td>{changeSet.mode}</td>
            <td><span className="health pending">{changeSet.status}</span></td>
            <td>{(changeSet.rules || []).length}</td>
            <td><select className="compact-select" value={domainId} onChange={(event) => setDomainId(event.target.value)} disabled={!domains.length}><option value="">Select domain</option>{domains.map((domain) => <option key={domain.domain_id} value={domain.domain_id}>{domain.domain_name}</option>)}</select></td>
            <td><WafAction changeSet={changeSet} changeSets={changeSets} domainId={domainId} token={token} canApproveTenantChanges={canApproveTenantChanges} actorSubject={actorSubject} onChanged={onChanged} setStatus={setStatus} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EdgeDeploymentTable({ token, domains, deployments, canApproveTenantChanges = false, actorSubject = "", onChanged, setStatus }) {
  const byDomain = new Map(deployments.map((deployment) => [deployment.domain_id, deployment]));
  if (!domains.length) return <EmptyTable columns={["Domain", "Edge", "Target", "Action"]} message="Create a domain and issue its certificate before requesting a tenant edge." />;
  return (
    <table className="data-table">
      <thead><tr><th>Domain</th><th>Edge</th><th>Traffic target</th><th>Action</th></tr></thead>
      <tbody>{domains.map((domain) => {
        const deployment = byDomain.get(domain.domain_id);
        return <tr key={domain.domain_id}>
          <td>{domain.domain_name}</td>
          <td><span className="health pending">{deployment?.status || "not_requested"}</span></td>
          <td><small>{deployment?.distribution_domain_name || "Awaiting provision"}</small></td>
          <td><EdgeAction domain={domain} deployment={deployment} token={token} canApproveTenantChanges={canApproveTenantChanges} actorSubject={actorSubject} onChanged={onChanged} setStatus={setStatus} /></td>
        </tr>;
      })}</tbody>
    </table>
  );
}

function EdgeAction({ domain, deployment, token, canApproveTenantChanges, actorSubject, onChanged, setStatus }) {
  if (!deployment) return <button className="secondary compact" disabled={!token} onClick={() => edgeAction(`/api/domains/${domain.domain_id}/edge-deployment-request`, "POST", token, setStatus, onChanged, "Edge deployment requested.")}>Request edge</button>;
  if (deployment.status === "pending_approval") {
    if (!canApproveTenantChanges) return <span className="mode-readonly">Tenant approval required</span>;
    if (deployment.requested_by === actorSubject) return <span className="mode-readonly">Independent approval required</span>;
    return <button className="secondary compact" disabled={!token} onClick={() => edgeAction(`/api/edge-deployments/${deployment.deployment_id}/approve`, "POST", token, setStatus, onChanged, "Edge deployment approved.")}>Review & approve</button>;
  }
  if (deployment.status === "approved") return <button className="secondary compact" disabled={!token} onClick={() => edgeAction(`/api/edge-deployments/${deployment.deployment_id}/provision`, "POST", token, setStatus, onChanged, "Edge provisioning started.")}>Provision</button>;
  if (deployment.status === "provisioning") return <button className="secondary compact" disabled={!token} onClick={() => edgeAction(`/api/edge-deployments/${deployment.deployment_id}/refresh`, "PATCH", token, setStatus, onChanged, "Edge status refreshed.")}>Refresh</button>;
  if (deployment.status === "ready_for_cutover") return <span className="button-pair"><button className="secondary compact" disabled={!token} onClick={() => originVerification(deployment.deployment_id, token, setStatus)}>Origin header</button><button className="secondary compact" disabled={!token} onClick={() => edgeAction(`/api/domains/${domain.domain_id}/verify-cutover`, "PATCH", token, setStatus, onChanged, "Traffic DNS checked.")}>Check DNS</button></span>;
  return <span className="mode-readonly">{deployment.status}</span>;
}

function WafAction({ changeSet, changeSets, domainId, token, canApproveTenantChanges, actorSubject, onChanged, setStatus }) {
  if (changeSet.status === "pending_approval") {
    if (!canApproveTenantChanges) return <span className="mode-readonly">Tenant approval required</span>;
    if (changeSet.created_by === actorSubject) return <span className="mode-readonly">Independent approval required</span>;
    return <button className="secondary compact" disabled={!token} onClick={() => edgeAction(`/api/waf-change-sets/${changeSet.change_set_id}/approve`, "POST", token, setStatus, onChanged, "WAF change set approved.")}>Approve</button>;
  }
  if (changeSet.status === "approved" && changeSet.mode === "block") {
    const monitorChangeSet = changeSets.find((item) => item.domain_id === domainId && item.status === "applied" && item.mode === "monitor");
    if (!monitorChangeSet) return <button className="secondary compact" disabled={!token || !domainId} onClick={() => edgeAction(`/api/waf-change-sets/${changeSet.change_set_id}/start-monitoring`, "POST", token, setStatus, onChanged, "WAF observation started. Blocking remains disabled for 24 hours.", { domain_id: domainId })}>Start observation</button>;
    if (monitorObservationRemainingHours(monitorChangeSet) > 0) return <span className="mode-readonly">Observing {monitorObservationRemainingHours(monitorChangeSet)}h</span>;
  }
  if (changeSet.status === "approved") return <button className="secondary compact" disabled={!token || !domainId} onClick={() => edgeAction(`/api/waf-change-sets/${changeSet.change_set_id}/apply`, "POST", token, setStatus, onChanged, "WAF change set applied.", { domain_id: domainId })}>Apply</button>;
  if (changeSet.status === "applied") return <button className="secondary compact" disabled={!token || !domainId} onClick={() => edgeAction(`/api/waf-change-sets/${changeSet.change_set_id}/rollback`, "POST", token, setStatus, onChanged, "WAF rollback applied.", { domain_id: domainId })}>Rollback</button>;
  return <span className="mode-readonly">{changeSet.status}</span>;
}

function SecurityEventTable({ events }) {
  return <table className="data-table"><thead><tr><th>Time</th><th>Rule</th><th>Method</th><th>Path</th><th>Country</th><th>Action</th></tr></thead><tbody>{events.map((event) => <tr key={event.event_id}><td>{new Date(event.timestamp).toISOString()}</td><td>{event.rule_id || "-"}</td><td>{event.method}</td><td>{event.uri}</td><td>{event.country}</td><td><span className="health pending">{event.action}</span></td></tr>)}</tbody></table>;
}

function TenantSelector({ tenants, selectedTenantId, setSelectedTenantId }) {
  if (!tenants.length) return <span className="mode-readonly">No tenants</span>;

  return (
    <select className="compact-select" value={selectedTenantId} onChange={(event) => setSelectedTenantId(event.target.value)}>
      {tenants.map((tenant) => <option key={tenant.tenant_id} value={tenant.tenant_id}>{tenant.name}</option>)}
    </select>
  );
}

function ReadinessList({ token, state }) {
  const items = [
    ["Management token", token ? "Configured" : "Required"],
    ["Tenants", String(state.tenants.length)],
    ["Domains", String(state.domains.length)],
    ["Policies", String(state.policies.length)]
  ];

  return (
    <div className="settings-list compact">
      {items.map(([label, value]) => (
        <div key={label}><CheckCircle2 size={18} /><span>{label}</span><strong>{value}</strong></div>
      ))}
    </div>
  );
}

function AccessRequired({ onNavigate }) {
  return (
    <div className="access-banner">
      <KeyRound size={20} />
      <span>Sign in with Cognito to manage tenants, domains and policies. Platform recovery access remains in Settings.</span>
      <button className="secondary" onClick={() => onNavigate("settings")}>Open settings</button>
    </div>
  );
}

function StatusBanner({ status }) {
  return <div className={`status-banner ${status.type}`}>{status.message}</div>;
}

function buildMetrics(state) {
  const requests = sum(state.domains, "requests");
  const blocked = sum(state.domains, "blocked");
  const wafMatches = sum(state.domains, "waf_matches");
  return [
    { label: "Tenants", value: String(state.tenants.length), delta: "Management records", trend: "neutral", color: "blue" },
    { label: "Protected Domains", value: String(state.domains.length), delta: "Configured in DynamoDB", trend: "neutral", color: "green" },
    { label: "Policies", value: String(state.policies.length), delta: "Tenant-scoped drafts", trend: "neutral", color: "orange" },
    { label: "Protected Requests", value: String(requests), delta: "Waiting for traffic", trend: "neutral", color: "blue" },
    { label: "Blocked Requests", value: String(blocked), delta: "No security events", trend: "neutral", color: "red" },
    { label: "WAF Matches", value: String(wafMatches), delta: "Rules ready", trend: "neutral", color: "orange" }
  ];
}

async function loadState(token, setState, setStatus, setSelectedTenantId, onMfaRequired) {
  try {
    const data = await apiRequest("/api/management/state", token);
    setState({ ...emptyState, ...data });
    setSelectedTenantId((current) => current || data.tenants?.[0]?.tenant_id || "");
    setStatus({ type: "success", message: "Management state loaded." });
  } catch (error) {
    if (error.message === "mfa_enrollment_required") {
      onMfaRequired?.();
      setStatus({ type: "warning", message: "Configure and verify your FortressNet authenticator to unlock management access." });
      return;
    }
    setStatus({ type: "error", message: error.message });
  }
}

async function createResource(path, token, payload, successMessage, setStatus, onSuccess) {
  try {
    await apiRequest(path, token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    setStatus({ type: "success", message: successMessage });
    onSuccess();
  } catch (error) {
    setStatus({ type: "error", message: error.message });
  }
}

async function verifyDomainDns(domainId, token, setStatus, onVerified) {
  try {
    const data = await apiRequest(`/api/domains/${domainId}/verify-dns`, token, { method: "PATCH" });
    setStatus?.({ type: data.verified ? "success" : "warning", message: data.verified ? "DNS ownership verified." : "DNS record not found yet." });
    onVerified?.();
  } catch (error) {
    setStatus?.({ type: "error", message: error.message });
  }
}

async function refreshCertificate(certificateId, token, setStatus, onRefreshed) {
  try {
    const data = await apiRequest(`/api/certificates/${certificateId}/refresh`, token, { method: "PATCH" });
    setStatus?.({ type: "success", message: `Certificate status: ${data.certificate.status}.` });
    onRefreshed?.();
  } catch (error) {
    setStatus?.({ type: "error", message: error.message });
  }
}

async function reconcileCertificateStatus(certificateId, token) {
  const data = await apiRequest(`/api/certificates/${certificateId}/status`, token);
  return data.certificate;
}

async function originHealthCheck(originId, token, setStatus, onChanged) {
  await edgeAction(`/api/origins/${originId}/health-check`, "PATCH", token, setStatus, onChanged, "Origin health checked.");
}

async function originVerification(deploymentId, token, setStatus) {
  try {
    const data = await apiRequest(`/api/edge-deployments/${deploymentId}/origin-verification`, token);
    const header = `${data.origin_verification.header_name}: ${data.origin_verification.header_value}`;
    await navigator.clipboard.writeText(header);
    setStatus?.({ type: "success", message: "Origin verification header copied to the clipboard." });
  } catch (error) {
    setStatus?.({ type: "error", message: error.message });
  }
}

async function edgeAction(path, method, token, setStatus, onChanged, successMessage, body = null) {
  try {
    await apiRequest(path, token, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    setStatus?.({ type: "success", message: successMessage });
    onChanged?.();
  } catch (error) {
    setStatus?.({ type: "error", message: friendlyWorkflowError(error.message) });
  }
}

function friendlyWorkflowError(message) {
  if (message === "separation_of_duties_required") {
    return "A different active tenant administrator or security administrator must approve this request. Invite an approver from Access, then have them sign in and review the edge deployment.";
  }
  if (message === "mfa_enrollment_required") {
    return "Multi-factor authentication must be configured before this security-sensitive action can be completed.";
  }
  if (message === "monitor_observation_window_required") {
    return "The blocking policy cannot be applied yet. Start or complete the 24-hour monitor observation window first; FortressNet will enable Apply WAF when it is safe to proceed.";
  }
  if (message === "tenant_approval_scope_required") {
    return "This approval must be completed by an active tenant administrator or security administrator for the selected tenant. Platform administrators can review tenant changes but cannot approve them.";
  }
  return message;
}

function monitorObservationRemainingHours(changeSet) {
  const startedAt = Date.parse(changeSet?.applied_at || "");
  if (!Number.isFinite(startedAt)) return 24;
  return Math.max(0, Math.ceil((24 * 60 * 60 * 1000 - (Date.now() - startedAt)) / (60 * 60 * 1000)));
}

function monitorObservationStatus(changeSet) {
  const remainingHours = monitorObservationRemainingHours(changeSet);
  return remainingHours > 0 ? `Observing in monitor mode (${remainingHours}h remaining)` : "Observation complete";
}

async function loadOperationalData(path, token, key, setValue, setStatus) {
  try {
    const data = await apiRequest(path, token);
    setValue(Array.isArray(data[key]) ? data[key] : []);
    setStatus?.({ type: "success", message: `${key.replaceAll("_", " ")} refreshed.` });
  } catch (error) {
    setStatus?.({ type: "error", message: error.message });
  }
}

async function compilePolicy(policyId, token, setStatus, onCreated) {
  try {
    await apiRequest(`/api/policies/${policyId}/compile`, token, { method: "POST" });
    setStatus({ type: "success", message: "WAF change set compiled and waiting for approval." });
    onCreated();
  } catch (error) {
    setStatus({ type: "error", message: error.message });
  }
}

async function apiRequest(path, token, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
  return data;
}

async function startCognitoLogin(platform) {
  if (!platform?.cognito_hosted_ui_url || !platform?.cognito_app_client_id) throw new Error("Cognito login is not configured yet.");
  const state = crypto.randomUUID();
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)));
  const challengeBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  sessionStorage.setItem("fortressnet_oidc_state", state);
  sessionStorage.setItem("fortressnet_oidc_verifier", verifier);
  const loginUrl = new URL(`${platform.cognito_hosted_ui_url}/login`);
  loginUrl.searchParams.set("client_id", platform.cognito_app_client_id);
  loginUrl.searchParams.set("response_type", "code");
  loginUrl.searchParams.set("scope", "openid email profile aws.cognito.signin.user.admin");
  loginUrl.searchParams.set("redirect_uri", `${window.location.origin}/auth/callback`);
  loginUrl.searchParams.set("state", state);
  loginUrl.searchParams.set("code_challenge_method", "S256");
  loginUrl.searchParams.set("code_challenge", base64Url(new Uint8Array(challengeBytes)));
  window.location.assign(loginUrl.toString());
}

async function completeCognitoCallback(platform) {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  const expectedState = sessionStorage.getItem("fortressnet_oidc_state");
  const verifier = sessionStorage.getItem("fortressnet_oidc_verifier");
  sessionStorage.removeItem("fortressnet_oidc_state");
  sessionStorage.removeItem("fortressnet_oidc_verifier");
  if (!code || !state || state !== expectedState || !verifier) throw new Error("Invalid Cognito authorization response.");
  const response = await fetch(`${platform.cognito_hosted_ui_url}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: platform.cognito_app_client_id,
      code,
      redirect_uri: `${window.location.origin}/auth/callback`,
      code_verifier: verifier
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.id_token || !payload.access_token) throw new Error(payload.error_description || "Cognito token exchange failed.");
  return payload;
}

function base64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function filterByTenant(items, selectedTenantId) {
  if (!selectedTenantId) return items;
  return items.filter((item) => item.tenant_id === selectedTenantId);
}

function tenantApprovalEligible(platform, tenantId) {
  const actor = platform?.actor;
  return Boolean(
    tenantId &&
    !platform?.is_platform_actor &&
    actor?.tenant_id === tenantId &&
    (actor?.roles || []).some((role) => ["tenant_admin", "security_admin"].includes(role))
  );
}

function humanizeWorkflowStatus(status, fallback = "Pending") {
  if (!status) return fallback;
  return workflowStatusLabels[status] || String(status).replaceAll("_", " ");
}

function sum(items, key) {
  return items.reduce((total, item) => total + Number(item[key] || 0), 0);
}

createRoot(document.getElementById("root")).render(<App />);
