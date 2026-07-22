import React, { useEffect, useMemo, useState } from "react";
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
  { id: "domains", label: "Domains", icon: Globe2 },
  { id: "policies", label: "Policies", icon: Shield },
  { id: "events", label: "Events", icon: ClipboardList },
  { id: "ai", label: "AI Analyst", icon: Sparkles, badge: "Beta" },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "settings", label: "Settings", icon: Settings }
];

const emptyState = {
  tenants: [],
  domains: [],
  policies: [],
  entitlements: []
};

function App() {
  const [active, setActive] = useState("overview");
  const [range, setRange] = useState("24H");
  const [environment, setEnvironment] = useState("Production");
  const [platform, setPlatform] = useState(null);
  const [token, setToken] = useState(() => sessionStorage.getItem("fortressnet_admin_token") || "");
  const [state, setState] = useState(emptyState);
  const [selectedTenantId, setSelectedTenantId] = useState("");
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
    loadState(token, setState, setStatus, setSelectedTenantId);
  }, [token]);

  const persistToken = (value) => {
    const clean = value.trim();
    setToken(clean);
    if (clean) {
      sessionStorage.setItem("fortressnet_admin_token", clean);
      loadState(clean, setState, setStatus, setSelectedTenantId);
    } else {
      sessionStorage.removeItem("fortressnet_admin_token");
      setState(emptyState);
      setSelectedTenantId("");
    }
  };

  const reload = () => {
    if (!token) {
      setStatus({ type: "warning", message: "Management token required." });
      return;
    }
    loadState(token, setState, setStatus, setSelectedTenantId);
  };

  return (
    <div className="app-shell">
      <Sidebar active={active} onNavigate={setActive} selectedTenant={selectedTenant} />
      <main className="main">
        <Topbar environment={environment} setEnvironment={setEnvironment} />
        <section className="content">
          <PageHeader active={active} pageTitle={pageTitle} onNavigate={setActive} onReload={reload} />
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
          {active === "events" && <EventsScreen />}
          {active === "ai" && <AiScreen />}
          {active === "reports" && <ReportsScreen />}
          {active === "billing" && <BillingScreen state={state} />}
          {active === "settings" && <SettingsScreen platform={platform} token={token} onTokenSave={persistToken} />}
        </section>
      </main>
    </div>
  );
}

function Sidebar({ active, onNavigate, selectedTenant }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><Shield size={22} fill="currentColor" /></div>
        <span>FortressNet</span>
      </div>
      <div className="tenant-label">Tenant</div>
      <button className="tenant-button">
        <Users size={16} />
        <span>{selectedTenant?.name || "No tenant selected"}</span>
        <ChevronDown size={15} />
      </button>
      <nav className="nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={`nav-item ${active === item.id ? "active" : ""}`} onClick={() => onNavigate(item.id)}>
              <Icon size={18} />
              <span>{item.label}</span>
              {item.badge && <small>{item.badge}</small>}
            </button>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <button className="collapse"><ChevronRight size={15} /> Collapse</button>
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

function Topbar({ environment, setEnvironment }) {
  return (
    <header className="topbar">
      <button className="env-select" onClick={() => setEnvironment(environment === "Production" ? "Staging" : "Production")}>
        <span className="status-dot green"></span>
        <span><small>Environment</small>{environment}</span>
        <ChevronDown size={16} />
      </button>
      <div className="search">
        <Search size={17} />
        <input aria-label="Search" placeholder="Search tenants, domains, policies, events..." />
        <kbd>/</kbd>
      </div>
      <button className="date-button"><CalendarDays size={16} /> Live window</button>
      <button className="icon-button"><Bell size={18} /></button>
      <div className="user">
        <span>FN</span>
        <div><strong>Console</strong><small>Management mode</small></div>
        <ChevronDown size={15} />
      </div>
    </header>
  );
}

function PageHeader({ active, pageTitle, onNavigate, onReload }) {
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
        <button className="secondary" onClick={() => onNavigate("overview")}><Plus size={16} /> Create tenant</button>
        <button className="secondary" onClick={onReload}><RefreshCw size={16} /> Sync</button>
        <button className="icon-button bordered"><MoreHorizontal size={18} /></button>
      </div>
    </div>
  );
}

function Overview({ range, setRange, token, state, selectedTenantId, setSelectedTenantId, onNavigate, onCreated, setStatus }) {
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
          <TenantCreateForm token={token} onCreated={onCreated} setStatus={setStatus} />
        </Panel>
        <Panel title="Platform Readiness" count={state.tenants.length}>
          <ReadinessList token={token} state={state} />
        </Panel>
      </div>
      <div className="table-grid">
        <Panel title="Recent Security Events" action={<button className="link-button">View event stream <ChevronRight size={14} /></button>}>
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

function DomainsScreen({ token, state, selectedTenantId, setSelectedTenantId, onCreated, setStatus }) {
  return (
    <div className="screen two-column">
      <Panel title="Domain Onboarding" action={<TenantSelector tenants={state.tenants} selectedTenantId={selectedTenantId} setSelectedTenantId={setSelectedTenantId} />}>
        <DomainCreateForm token={token} tenants={state.tenants} selectedTenantId={selectedTenantId} onCreated={onCreated} setStatus={setStatus} />
      </Panel>
      <Panel title="Domain Inventory">
        <DomainTable domains={filterByTenant(state.domains, selectedTenantId)} />
      </Panel>
    </div>
  );
}

function PoliciesScreen({ token, state, selectedTenantId, setSelectedTenantId, onCreated, setStatus }) {
  const policies = filterByTenant(state.policies, selectedTenantId);

  return (
    <div className="screen split-detail">
      <Panel title="Policies" action={<TenantSelector tenants={state.tenants} selectedTenantId={selectedTenantId} setSelectedTenantId={setSelectedTenantId} />}>
        {policies.length ? (
          <div className="policy-list">
            {policies.map((policy) => (
              <button key={policy.policy_id} className="selected">
                <Shield size={18} />
                <span><strong>{policy.name}</strong><small>{policy.scope}</small></span>
                <em>{policy.mode}</em>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState icon={Shield} title="No tenant policies yet" body="Create a tenant policy to scope WAF and rate-limit behavior." />
        )}
      </Panel>
      <Panel title="Policy Detail" action={<button className="secondary"><TerminalSquare size={16} /> Managed defaults</button>}>
        <PolicyCreateForm token={token} tenants={state.tenants} selectedTenantId={selectedTenantId} onCreated={onCreated} setStatus={setStatus} />
      </Panel>
    </div>
  );
}

function EventsScreen() {
  return (
    <div className="screen">
      <Panel title="Security Event Stream">
        <EmptyTable columns={["Time", "Type", "Severity", "Domain", "Source", "Action"]} message="No security events have been collected." />
      </Panel>
    </div>
  );
}

function AiScreen() {
  return (
    <div className="screen ai-screen">
      <Panel title="AI Security Analyst" action={<span className="mode-readonly">Read-only mode</span>}>
        <EmptyState icon={Sparkles} title="AI Analyst is ready" body="Findings will appear only after real tenant events and traffic are available." />
      </Panel>
      <Panel title="Recommended Change Request">
        <EmptyState icon={ClipboardList} title="No recommendations pending" body="The analyst will create reviewable recommendations without applying enforcement changes automatically." />
      </Panel>
    </div>
  );
}

function ReportsScreen() {
  const reports = [
    ["Operational Report", "No operational samples available."],
    ["Security Report", "No tenant security events available."],
    ["Executive Report", "No tenant reporting period available."],
    ["Compliance Export", "No evidence package generated."]
  ];
  return (
    <div className="screen report-grid">
      {reports.map(([title, body]) => (
        <Panel key={title} title={title}>
          <div className="report-card"><BarChart3 size={32} /><p>{body}</p><button className="secondary">Generate after onboarding</button></div>
        </Panel>
      ))}
    </div>
  );
}

function BillingScreen({ state }) {
  return (
    <div className="screen billing-grid">
      <Panel title="Current Plan">
        <div className="plan-box">
          <span>{state.entitlements.length ? "Entitlement connected" : "No subscription selected"}</span>
          <strong>$0 / month</strong>
          <p>Billing starts when a tenant subscription or AWS Marketplace entitlement is connected.</p>
        </div>
      </Panel>
      <Panel title="Usage This Month">
        <div className="usage-list">
          {["Protected requests 0", "Bandwidth 0 GB", "AI analysis units 0", "Log retention not started"].map((item) => <div key={item}><span>{item}</span><div><i style={{ width: "0%" }}></i></div></div>)}
        </div>
      </Panel>
      <Panel title="Marketplace">
        <div className="marketplace-box">
          <CircleDollarSign size={30} />
          <h3>Marketplace not connected</h3>
          <p>Entitlements will sync after the SaaS contract fulfillment flow is enabled.</p>
        </div>
      </Panel>
    </div>
  );
}

function SettingsScreen({ platform, token, onTokenSave }) {
  const [draftToken, setDraftToken] = useState(token);

  return (
    <div className="screen settings-grid">
      <Panel title="Management Access">
        <div className="management-card">
          <KeyRound size={22} />
          <div>
            <h3>Bootstrap admin token</h3>
            <p>Used for initial tenant and domain management until Cognito login is wired into the console.</p>
          </div>
          <div className="token-input">
            <input value={draftToken} type="password" placeholder="Paste bootstrap token" onChange={(event) => setDraftToken(event.target.value)} />
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

function TenantCreateForm({ token, onCreated, setStatus }) {
  const [name, setName] = useState("");
  const [plan, setPlan] = useState("pilot");

  const submit = async (event) => {
    event.preventDefault();
    await createResource("/api/tenants", token, { name, plan }, "Tenant created.", setStatus, () => {
      setName("");
      onCreated();
    });
  };

  return (
    <form className="form-grid" onSubmit={submit}>
      <label>Tenant name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Customer or business unit" /></label>
      <label>Plan<select value={plan} onChange={(event) => setPlan(event.target.value)}><option value="pilot">Pilot</option><option value="business">Business</option><option value="enterprise">Enterprise</option></select></label>
      <button className="primary" disabled={!token || !name}><Plus size={16} /> Create tenant</button>
    </form>
  );
}

function DomainCreateForm({ token, tenants, selectedTenantId, onCreated, setStatus }) {
  const [domainName, setDomainName] = useState("");
  const [originUrl, setOriginUrl] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    await createResource("/api/domains", token, {
      tenant_id: selectedTenantId,
      domain_name: domainName,
      origin_url: originUrl
    }, "Domain onboarding created.", setStatus, () => {
      setDomainName("");
      setOriginUrl("");
      onCreated();
    });
  };

  if (!tenants.length) {
    return <EmptyState icon={Users} title="Create a tenant first" body="Domains must be attached to a tenant before DNS verification can start." />;
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      <label>Protected domain<input value={domainName} onChange={(event) => setDomainName(event.target.value)} placeholder="www.customer.com" /></label>
      <label>Origin URL<input value={originUrl} onChange={(event) => setOriginUrl(event.target.value)} placeholder="https://origin.customer.com" /></label>
      <button className="primary" disabled={!token || !selectedTenantId || !domainName}><Plus size={16} /> Add domain</button>
    </form>
  );
}

function PolicyCreateForm({ token, tenants, selectedTenantId, onCreated, setStatus }) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState("managed_defaults");

  const submit = async (event) => {
    event.preventDefault();
    await createResource("/api/policies", token, {
      tenant_id: selectedTenantId,
      name,
      mode,
      scope: "all_domains"
    }, "Policy draft created.", setStatus, () => {
      setName("");
      onCreated();
    });
  };

  if (!tenants.length) {
    return <EmptyState icon={Users} title="Create a tenant first" body="Tenant-scoped policies become available after tenant creation." />;
  }

  return (
    <form className="policy-editor" onSubmit={submit}>
      <div><label>Policy name</label><input value={name} onChange={(event) => setName(event.target.value)} placeholder="OWASP managed defaults" /></div>
      <div><label>Mode</label><select value={mode} onChange={(event) => setMode(event.target.value)}><option value="managed_defaults">Managed defaults</option><option value="count">Count only</option><option value="block">Block</option></select></div>
      <pre>{`tenant_id: ${selectedTenantId || "pending"}\nscope: all_domains\nenforcement: ${mode}\napproval_required: true`}</pre>
      <button className="primary" disabled={!token || !selectedTenantId || !name}><Plus size={16} /> Create policy</button>
    </form>
  );
}

function DomainTable({ domains }) {
  if (!domains.length) {
    return <EmptyTable columns={["Domain", "Status", "Requests", "Blocked", "WAF Matches", "DNS"]} message="No protected domains are configured." />;
  }

  return (
    <table className="data-table">
      <thead><tr><th>Domain</th><th>Status</th><th>Requests</th><th>Blocked</th><th>WAF Matches</th><th>DNS</th></tr></thead>
      <tbody>
        {domains.map((domain) => (
          <tr key={domain.domain_id}>
            <td>{domain.domain_name}</td>
            <td><span className="health pending">{domain.status}</span></td>
            <td>{domain.requests || 0}</td>
            <td>{domain.blocked || 0}</td>
            <td>{domain.waf_matches || 0}</td>
            <td>{domain.verification_name}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
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
      <span>Management API is protected. Add the bootstrap admin token in Settings to manage tenants, domains and policies.</span>
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

async function loadState(token, setState, setStatus, setSelectedTenantId) {
  try {
    const data = await apiRequest("/api/management/state", token);
    setState({ ...emptyState, ...data });
    setSelectedTenantId((current) => current || data.tenants?.[0]?.tenant_id || "");
    setStatus({ type: "success", message: "Management state loaded." });
  } catch (error) {
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

function filterByTenant(items, selectedTenantId) {
  if (!selectedTenantId) return items;
  return items.filter((item) => item.tenant_id === selectedTenantId);
}

function sum(items, key) {
  return items.reduce((total, item) => total + Number(item[key] || 0), 0);
}

createRoot(document.getElementById("root")).render(<App />);
