import React, { useState } from "react";
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

const metrics = [
  { label: "Protected Requests", value: "0", delta: "Waiting for traffic", trend: "neutral", color: "blue" },
  { label: "Blocked Requests", value: "0", delta: "No security events", trend: "neutral", color: "red" },
  { label: "WAF Matches", value: "0", delta: "Rules ready", trend: "neutral", color: "orange" },
  { label: "Bot Score Avg", value: "-", delta: "No requests yet", trend: "neutral", color: "green" },
  { label: "Latency p95", value: "-", delta: "No edge samples", trend: "neutral", color: "blue" },
  { label: "Est. Monthly Cost", value: "$0", delta: "Usage metering idle", trend: "neutral", color: "green" }
];

const setupSteps = [
  "Create or select tenant",
  "Add first protected domain",
  "Verify DNS ownership",
  "Attach security profile",
  "Activate edge CNAME"
];

function App() {
  const [active, setActive] = useState("overview");
  const [range, setRange] = useState("24H");
  const [environment, setEnvironment] = useState("Production");
  const pageTitle = navItems.find((item) => item.id === active)?.label ?? "Overview";

  return (
    <div className="app-shell">
      <Sidebar active={active} onNavigate={setActive} />
      <main className="main">
        <Topbar environment={environment} setEnvironment={setEnvironment} />
        <section className="content">
          <PageHeader active={active} pageTitle={pageTitle} />
          {active === "overview" && <Overview range={range} setRange={setRange} onNavigate={setActive} />}
          {active === "domains" && <DomainsScreen />}
          {active === "policies" && <PoliciesScreen />}
          {active === "events" && <EventsScreen />}
          {active === "ai" && <AiScreen />}
          {active === "reports" && <ReportsScreen />}
          {active === "billing" && <BillingScreen />}
          {active === "settings" && <SettingsScreen />}
        </section>
      </main>
    </div>
  );
}

function Sidebar({ active, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><Shield size={22} fill="currentColor" /></div>
        <span>FortressNet</span>
      </div>
      <div className="tenant-label">Tenant</div>
      <button className="tenant-button">
        <Users size={16} />
        <span>No tenant selected</span>
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
        <div><strong>Console</strong><small>Not signed in</small></div>
        <ChevronDown size={15} />
      </div>
    </header>
  );
}

function PageHeader({ active, pageTitle }) {
  const title = active === "overview" ? "FortressNet Console" : pageTitle;
  const subtitle = active === "overview"
    ? "SaaS multi-tenant edge security platform - no customer data loaded"
    : "Clean deployment - connect a tenant to start collecting data";

  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="header-actions">
        <button className="secondary"><Plus size={16} /> Create tenant</button>
        <button className="secondary"><RefreshCw size={16} /> Sync</button>
        <button className="icon-button bordered"><MoreHorizontal size={18} /></button>
      </div>
    </div>
  );
}

function Overview({ range, setRange, onNavigate }) {
  return (
    <div className="screen">
      <div className="metric-grid">
        {metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}
      </div>
      <div className="dashboard-grid">
        <Panel className="traffic-panel" title="Edge Traffic" action={<Segmented value={range} setValue={setRange} options={["1H", "6H", "24H", "7D", "30D"]} />}>
          <EmptyChart />
        </Panel>
        <Panel title="Threat Distribution" action={<button className="tiny">No tenant <ChevronDown size={14} /></button>}>
          <EmptyState icon={Shield} title="No threats recorded" body="Threat data appears after a tenant activates its first protected domain." />
        </Panel>
        <Panel title="Active Incidents" count="0">
          <EmptyState icon={CheckCircle2} title="No active incidents" body="Incident detection is ready and will stay empty until real traffic is inspected." />
        </Panel>
      </div>
      <div className="table-grid">
        <Panel title="Recent Security Events" action={<button className="link-button">View event stream <ChevronRight size={14} /></button>}>
          <EmptyTable columns={["Time", "Type", "Severity", "Domain", "Source", "Action"]} message="No security events have been collected." />
        </Panel>
        <Panel title="Domain Health" action={<button className="link-button" onClick={() => onNavigate("domains")}>Add first domain <ChevronRight size={14} /></button>}>
          <EmptyTable columns={["Domain", "Status", "Requests", "Blocked", "WAF Matches", "Latency p95"]} message="No protected domains are configured." />
        </Panel>
      </div>
      <Panel title="Onboarding">
        <div className="setup-steps">
          {setupSteps.map((step, index) => (
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

function DomainsScreen() {
  return (
    <div className="screen two-column">
      <Panel title="Domain Onboarding" action={<button className="primary"><Plus size={16} /> Add domain</button>}>
        <div className="setup-steps vertical">
          {setupSteps.slice(1).map((step, index) => (
            <div key={step} className={index === 0 ? "current" : ""}><span>{index + 1}</span>{step}</div>
          ))}
        </div>
      </Panel>
      <Panel title="Domain Inventory">
        <EmptyTable columns={["Domain", "Status", "Requests", "Blocked", "WAF Matches", "Latency p95"]} message="No protected domains are configured." />
      </Panel>
    </div>
  );
}

function PoliciesScreen() {
  return (
    <div className="screen split-detail">
      <Panel title="Policies" action={<button className="primary"><Plus size={16} /> New policy</button>}>
        <EmptyState icon={Shield} title="No tenant policies yet" body="Managed AWS WAF defaults are provisioned. Tenant-specific policies appear after domain onboarding." />
      </Panel>
      <Panel title="Policy Detail" action={<button className="secondary"><TerminalSquare size={16} /> View template</button>}>
        <div className="policy-editor">
          <div><label>Mode</label><input value="No tenant selected" readOnly /></div>
          <div><label>Scope</label><input value="Not configured" readOnly /></div>
          <pre>{`tenant_id: pending\nscope: no_domains\nenforcement: managed_defaults\napproval_required: true`}</pre>
        </div>
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

function BillingScreen() {
  return (
    <div className="screen billing-grid">
      <Panel title="Current Plan">
        <div className="plan-box">
          <span>No subscription selected</span>
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

function SettingsScreen() {
  return (
    <div className="screen settings-grid">
      <Panel title="Platform Security">
        <div className="settings-list">
          <div><KeyRound size={18} /><span>KMS key</span><strong>Provisioned</strong></div>
          <div><LockKeyhole size={18} /><span>Authentication</span><strong>Cognito ready</strong></div>
          <div><Activity size={18} /><span>Audit logs</span><strong>Enabled</strong></div>
          <div><Globe2 size={18} /><span>DNS</span><strong>app.fortressnet.app active</strong></div>
        </div>
      </Panel>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
