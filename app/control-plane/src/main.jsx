import React, { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { createRoot } from "react-dom/client";
import {
  Activity,
  BarChart3,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
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
  Users
} from "lucide-react";
import "./styles.css";

const navItems = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "onboarding", label: "Onboarding", icon: CheckCircle2 },
  { id: "domains", label: "Domains", icon: Globe2 },
  { id: "dns", label: "DNS & TLS", icon: Globe2 },
  { id: "origins", label: "Origins", icon: Layers3 },
  { id: "policies", label: "Policies", icon: Shield },
  { id: "access", label: "Access", icon: Users },
  { id: "idp", label: "External IdP", icon: Link2 },
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
  ai_findings: []
};

function App() {
  const [active, setActive] = useState("overview");
  const [range, setRange] = useState("24H");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [platform, setPlatform] = useState(null);
  const [token, setToken] = useState(() => sessionStorage.getItem("fortressnet_auth_token") || sessionStorage.getItem("fortressnet_admin_token") || "");
  const [accessToken, setAccessToken] = useState(() => sessionStorage.getItem("fortressnet_access_token") || "");
  const [authMode, setAuthMode] = useState(() => sessionStorage.getItem("fortressnet_auth_mode") || "");
  const [state, setState] = useState(emptyState);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [tenantCreateRequest, setTenantCreateRequest] = useState(0);
  const [status, setStatus] = useState({ type: "idle", message: "" });
  const pageTitle = navItems.find((item) => item.id === active)?.label ?? "Overview";

  const selectedTenant = useMemo(
    () => state.tenants.find((tenant) => tenant.tenant_id === selectedTenantId) || null,
    [state.tenants, selectedTenantId]
  );

  useEffect(() => {
    fetch("/api/platform")
      .then((response) => response.json())
      .then(setPlatform)
      .catch(() => setPlatform({ management_ready: false }));
  }, []);

  useEffect(() => {
    if (!token) return;
    loadState(token, setState, setStatus, setSelectedTenantId, () => setActive("profile"));
  }, [token]);

  useEffect(() => {
    if (!platform || window.location.pathname !== "/auth/callback") return;
    completeCognitoCallback(platform)
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
  }, [platform]);

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
    }
  };

  const reload = () => {
    if (!token) {
      setStatus({ type: "warning", message: "Management token required." });
      return;
    }
    loadState(token, setState, setStatus, setSelectedTenantId, () => setActive("profile"));
  };

  const signIn = () => startCognitoLogin(platform).catch((error) => setStatus({ type: "error", message: error.message }));
  const openTenantCreate = () => {
    setActive("overview");
    setTenantCreateRequest((current) => current + 1);
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
    if (platform?.cognito_hosted_ui_url && platform?.cognito_app_client_id) {
      const logoutUrl = new URL(`${platform.cognito_hosted_ui_url}/logout`);
      logoutUrl.searchParams.set("client_id", platform.cognito_app_client_id);
      logoutUrl.searchParams.set("logout_uri", `${window.location.origin}/logout`);
      window.location.assign(logoutUrl.toString());
    }
  };

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <Sidebar active={active} onNavigate={setActive} selectedTenant={selectedTenant} tenants={state.tenants} selectedTenantId={selectedTenantId} setSelectedTenantId={setSelectedTenantId} collapsed={sidebarCollapsed} onCollapse={() => setSidebarCollapsed((current) => !current)} />
      <main className="main">
        <Topbar authenticated={Boolean(token)} authMode={authMode} onSignIn={signIn} onSignOut={signOut} onOpenProfile={() => setActive("profile")} onNavigate={setActive} onSearch={searchConsole} />
        <section className="content">
          <PageHeader active={active} pageTitle={pageTitle} onNavigate={setActive} onReload={reload} onCreateTenant={openTenantCreate} />
          {status.message && <StatusBanner status={status} />}
          {active === "overview" && (
            <Overview
              range={range}
              setRange={setRange}
              token={token}
              state={state}
              selectedTenantId={selectedTenantId}
              setSelectedTenantId={setSelectedTenantId}
              onNavigate={setActive}
              onCreated={reload}
              setStatus={setStatus}
              tenantCreateRequest={tenantCreateRequest}
            />
          )}
          {active === "onboarding" && (
            <OnboardingScreen
              token={token}
              state={state}
              selectedTenantId={selectedTenantId}
              setSelectedTenantId={setSelectedTenantId}
              onCreated={reload}
              setStatus={setStatus}
            />
          )}
          {active === "domains" && (
            <DomainsScreen
              token={token}
              state={state}
              selectedTenantId={selectedTenantId}
              setSelectedTenantId={setSelectedTenantId}
              onCreated={reload}
              setStatus={setStatus}
            />
          )}
          {active === "dns" && <DnsScreen token={token} state={state} selectedTenantId={selectedTenantId} setSelectedTenantId={setSelectedTenantId} onCreated={reload} setStatus={setStatus} />}
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
              state={state}
              selectedTenantId={selectedTenantId}
              setSelectedTenantId={setSelectedTenantId}
              onCreated={reload}
              setStatus={setStatus}
            />
          )}
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
          {active === "settings" && <SettingsScreen platform={platform} token={token} authMode={authMode} onTokenSave={persistToken} />}
        </section>
      </main>
    </div>
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
      <button className="tenant-button" disabled={!tenants.length} onClick={() => setTenantMenuOpen((current) => !current)} aria-label="Select tenant" title="Select tenant" aria-expanded={tenantMenuOpen} aria-haspopup="menu">
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
  const title = active === "overview" ? "FortressNet Console" : pageTitle;
  const subtitle = active === "overview"
    ? "SaaS multi-tenant edge security control plane"
    : "Manage tenants, domains, policies and platform readiness";

  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="header-actions">
        <button className="secondary" onClick={onCreateTenant}><Plus size={16} /> Create tenant</button>
        <button className="secondary" onClick={onReload}><RefreshCw size={16} /> Sync</button>
        <button className="icon-button bordered" title="Open onboarding" onClick={() => onNavigate("onboarding")}><MoreHorizontal size={18} /></button>
      </div>
    </div>
  );
}

function Overview({ range, setRange, token, state, selectedTenantId, setSelectedTenantId, onNavigate, onCreated, setStatus, tenantCreateRequest }) {
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
          <TenantCreateForm token={token} onCreated={onCreated} setStatus={setStatus} focusRequest={tenantCreateRequest} />
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

function Panel({ title, count, action, className = "", children }) {
  return (
    <section className={`panel ${className}`}>
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

function OnboardingScreen({ token, state, selectedTenantId, setSelectedTenantId, onCreated, setStatus }) {
  const domains = filterByTenant(state.domains, selectedTenantId);
  const origins = filterByTenant(state.origins, selectedTenantId);
  const certificates = filterByTenant(state.certificates, selectedTenantId);
  const deployments = filterByTenant(state.edge_deployments, selectedTenantId);
  const latestDomain = domains[0] || null;

  return (
    <div className="screen">
      <div className="dashboard-grid onboarding-grid">
        <Panel title="New Protected Site" action={<TenantSelector tenants={state.tenants} selectedTenantId={selectedTenantId} setSelectedTenantId={setSelectedTenantId} />}>
          <DomainCreateForm token={token} tenants={state.tenants} selectedTenantId={selectedTenantId} onCreated={onCreated} setStatus={setStatus} />
        </Panel>
        <Panel title="Go-Live Checklist">
          <div className="setup-steps vertical">
            {[
              ["Tenant selected", selectedTenantId ? "Ready" : "Required"],
              ["Domain record", latestDomain ? latestDomain.status : "Pending"],
              ["Primary origin", origins.length ? origins[0].status : "Pending"],
              ["Certificate", certificates.length ? certificates[0].status : "Pending"],
              ["WAF policy", filterByTenant(state.waf_change_sets, selectedTenantId).length ? "Compiled" : "Pending"]
            ].map(([step, value], index) => (
              <div key={step} className={index === 0 && !latestDomain ? "current" : ""}><span>{index + 1}</span>{step}<small>{value}</small></div>
            ))}
          </div>
        </Panel>
      </div>
      <Panel title="DNS Instructions">
        <DomainInstructions domain={latestDomain} certificate={certificates.find((certificate) => certificate.domain_id === latestDomain?.domain_id)} deployment={deployments.find((deployment) => deployment.domain_id === latestDomain?.domain_id)} />
      </Panel>
    </div>
  );
}

function DomainsScreen({ token, state, selectedTenantId, setSelectedTenantId, onCreated, setStatus }) {
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
        <EdgeDeploymentTable token={token} domains={domains} deployments={deployments} onChanged={onCreated} setStatus={setStatus} />
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
      <Panel title="DNS Management" action={<TenantSelector tenants={state.tenants} selectedTenantId={selectedTenantId} setSelectedTenantId={setSelectedTenantId} />}>
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

function OriginsScreen({ token, state, selectedTenantId, setSelectedTenantId, onCreated, setStatus }) {
  const origins = filterByTenant(state.origins, selectedTenantId);
  const pools = filterByTenant(state.origin_pools, selectedTenantId);
  const certificates = filterByTenant(state.certificates, selectedTenantId);
  const domains = filterByTenant(state.domains, selectedTenantId);

  return (
    <div className="screen">
      <div className="two-column">
        <Panel title="Origins" action={<TenantSelector tenants={state.tenants} selectedTenantId={selectedTenantId} setSelectedTenantId={setSelectedTenantId} />}>
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

function PoliciesScreen({ token, state, selectedTenantId, setSelectedTenantId, onCreated, setStatus }) {
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
      <Panel title="WAF Change Sets">
        <WafChangeSetTable changeSets={changeSets} domains={filterByTenant(state.domains, selectedTenantId)} token={token} onChanged={onCreated} setStatus={setStatus} />
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

function ApiKeysScreen({ token, platform, state, selectedTenantId, setSelectedTenantId, onCreated, setStatus }) {
  const apiKeys = filterByTenant(state.api_keys, selectedTenantId);
  const [newKey, setNewKey] = useState("");

  const handleCreated = (value) => {
    setNewKey(value || "");
    onCreated();
  };

  return (
    <div className="screen split-detail">
      <Panel title="API Keys" action={<TenantSelector tenants={state.tenants} selectedTenantId={selectedTenantId} setSelectedTenantId={setSelectedTenantId} />}>
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
      <Panel title="Security Event Stream" action={<button className="secondary compact" disabled={!token} onClick={load}><RefreshCw size={15} /> Refresh</button>}>
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
      <Panel title="AI Security Analyst" action={<button className="secondary compact" disabled={!token || !selectedTenantId} onClick={analyze}><Sparkles size={15} /> Analyze</button>}>
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
      <Panel title="Security Report" action={<button className="secondary compact" disabled={!token} onClick={load}><RefreshCw size={15} /> Refresh</button>}>
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
      <Panel title="Current Plan" action={<TenantSelector tenants={state.tenants} selectedTenantId={selectedTenantId} setSelectedTenantId={setSelectedTenantId} />}>
        <div className="plan-box">
          {summary ? <><span>{summary.entitlement.plan_label} · {summary.entitlement.billing_status}</span><strong>{summary.entitlement.source}</strong><p>Limits are enforced by the control plane. Marketplace fulfillment is not connected yet.</p></> : <><span>No tenant selected</span><p>Select a tenant to view its real entitlement and observed usage.</p></>}
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
          <h3>{summary?.entitlement.source === "aws_marketplace" ? "Marketplace entitlement" : "Direct pilot entitlement"}</h3>
          <p>Observed WAF events: {summary?.usage.observed_waf_requests ?? "not available"}. Blocked events: {summary?.usage.blocked_waf_requests ?? "not available"}.</p>
          {summary && <div className="button-pair"><select className="compact-select" value={plan} onChange={(event) => setPlan(event.target.value)}><option value="pilot">Pilot</option><option value="business">Business</option><option value="enterprise">Enterprise</option></select><button className="secondary compact" onClick={updatePlan}>Update limits</button></div>}
        </div>
      </Panel>
    </div>
  );
}

function SettingsScreen({ platform, token, authMode, onTokenSave }) {
  const [draftToken, setDraftToken] = useState(authMode === "bootstrap" ? token : "");

  return (
    <div className="screen settings-grid">
      <Panel title="Management Access">
        <div className="management-card">
          <KeyRound size={22} />
          <div>
            <h3>Recovery access token</h3>
            <p>Reserved for controlled platform recovery. Normal console access uses Cognito.</p>
          </div>
          <div className="token-input">
            <label className="sr-only" htmlFor="management-token">Management token</label>
            <input id="management-token" value={draftToken} type="password" autoComplete="off" placeholder="Paste bootstrap token" onChange={(event) => setDraftToken(event.target.value)} />
            <button className="primary" onClick={() => onTokenSave(draftToken)}>Save</button>
          </div>
        </div>
      </Panel>
      <Panel title="Platform Security">
        <div className="settings-list">
          <div><KeyRound size={18} /><span>KMS key</span><strong>Provisioned</strong></div>
          <div><LockKeyhole size={18} /><span>Authentication</span><strong>{platform?.cognito_user_pool_id ? "Cognito ready" : "Pending"}</strong></div>
          <div><Activity size={18} /><span>Management API</span><strong>{platform?.management_ready ? "Protected" : "Pending token"}</strong></div>
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

function TenantCreateForm({ token, onCreated, setStatus, focusRequest }) {
  const [name, setName] = useState("");
  const [plan, setPlan] = useState("pilot");
  const nameInputRef = useRef(null);

  useEffect(() => {
    if (focusRequest > 0) nameInputRef.current?.focus();
  }, [focusRequest]);

  const submit = async (event) => {
    event.preventDefault();
    await createResource("/api/tenants", token, { name, plan }, "Tenant created.", setStatus, () => {
      setName("");
      onCreated();
    });
  };

  return (
    <form className="form-grid" onSubmit={submit}>
      <label htmlFor="tenant-name">Tenant name<input ref={nameInputRef} id="tenant-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Customer or business unit" /></label>
      <label htmlFor="tenant-plan">Plan<select id="tenant-plan" value={plan} onChange={(event) => setPlan(event.target.value)}><option value="pilot">Pilot</option><option value="business">Business</option><option value="enterprise">Enterprise</option></select></label>
      <button className="primary" disabled={!token || !name}><Plus size={16} /> Create tenant</button>
    </form>
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

  const toggleMethod = (method) => {
    setRateLimitMethods((current) => current.includes(method) ? current.filter((item) => item !== method) : [...current, method]);
  };

  const selectCountries = (event) => {
    setRateLimitCountries(Array.from(event.target.selectedOptions, (option) => option.value));
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
      rate_limit_countries: rateLimitCountries
    }, "Policy draft created.", setStatus, () => {
      setName("");
      setRateLimit("2000");
      setRateLimitPath("");
      setRateLimitMethods([]);
      setRateLimitCountries([]);
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
      <pre>{`tenant_id: ${selectedTenantId || "pending"}\nscope: all_domains\nenforcement: ${mode}\nrate_limit: ${rateLimit || "invalid"} per 5 minutes per IP\npath: ${rateLimitPath || "all paths"}\nmethods: ${rateLimitMethods.length ? rateLimitMethods.join(", ") : "all methods"}\ncountries: ${rateLimitCountries.length ? rateLimitCountries.join(", ") : "all countries"}\napproval_required: true`}</pre>
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

  return (
    <div className="instructions-grid">
      <div>
        <strong>Ownership TXT</strong>
        <code>{domain.verification_name}</code>
        <code>{domain.verification_value}</code>
      </div>
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
        <span className="health pending">{domain.onboarding_step || domain.status}</span>
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

function WafChangeSetTable({ changeSets, domains = [], token = "", onChanged = null, setStatus = null }) {
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
            <td><WafAction changeSet={changeSet} domainId={domainId} token={token} onChanged={onChanged} setStatus={setStatus} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EdgeDeploymentTable({ token, domains, deployments, onChanged, setStatus }) {
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
          <td><EdgeAction domain={domain} deployment={deployment} token={token} onChanged={onChanged} setStatus={setStatus} /></td>
        </tr>;
      })}</tbody>
    </table>
  );
}

function EdgeAction({ domain, deployment, token, onChanged, setStatus }) {
  if (!deployment) return <button className="secondary compact" disabled={!token} onClick={() => edgeAction(`/api/domains/${domain.domain_id}/edge-deployment-request`, "POST", token, setStatus, onChanged, "Edge deployment requested.")}>Request edge</button>;
  if (deployment.status === "pending_approval") return <button className="secondary compact" disabled={!token} onClick={() => edgeAction(`/api/edge-deployments/${deployment.deployment_id}/approve`, "POST", token, setStatus, onChanged, "Edge deployment approved.")}>Approve</button>;
  if (deployment.status === "approved") return <button className="secondary compact" disabled={!token} onClick={() => edgeAction(`/api/edge-deployments/${deployment.deployment_id}/provision`, "POST", token, setStatus, onChanged, "Edge provisioning started.")}>Provision</button>;
  if (deployment.status === "provisioning") return <button className="secondary compact" disabled={!token} onClick={() => edgeAction(`/api/edge-deployments/${deployment.deployment_id}/refresh`, "PATCH", token, setStatus, onChanged, "Edge status refreshed.")}>Refresh</button>;
  if (deployment.status === "ready_for_cutover") return <span className="button-pair"><button className="secondary compact" disabled={!token} onClick={() => originVerification(deployment.deployment_id, token, setStatus)}>Origin header</button><button className="secondary compact" disabled={!token} onClick={() => edgeAction(`/api/domains/${domain.domain_id}/verify-cutover`, "PATCH", token, setStatus, onChanged, "Traffic DNS checked.")}>Check DNS</button></span>;
  return <span className="mode-readonly">{deployment.status}</span>;
}

function WafAction({ changeSet, domainId, token, onChanged, setStatus }) {
  if (changeSet.status === "pending_approval") return <button className="secondary compact" disabled={!token} onClick={() => edgeAction(`/api/waf-change-sets/${changeSet.change_set_id}/approve`, "POST", token, setStatus, onChanged, "WAF change set approved.")}>Approve</button>;
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
    setStatus?.({ type: "error", message: error.message });
  }
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

function sum(items, key) {
  return items.reduce((total, item) => total + Number(item[key] || 0), 0);
}

createRoot(document.getElementById("root")).render(<App />);
