import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  FileText,
  Filter,
  Gauge,
  Globe2,
  Home,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  Sparkles,
  TerminalSquare,
  Users,
  Zap
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
  { label: "Protected Requests", value: "23.7M", delta: "+18.6%", trend: "up", color: "blue", data: [32, 34, 31, 35, 36, 34, 38, 37, 42, 46, 41, 40, 38] },
  { label: "Blocked Requests", value: "312.6K", delta: "+24.3%", trend: "risk", color: "red", data: [18, 22, 21, 20, 27, 32, 33, 29, 35, 30, 26, 28, 25] },
  { label: "WAF Matches", value: "428.1K", delta: "+15.7%", trend: "up", color: "orange", data: [25, 29, 26, 31, 28, 35, 33, 37, 32, 40, 36, 39, 34] },
  { label: "Bot Score Avg", value: "28", delta: "-5", trend: "good", color: "green", data: [34, 32, 33, 31, 30, 29, 28, 27, 27, 26, 28, 27, 26] },
  { label: "Latency p95", value: "142 ms", delta: "-12 ms", trend: "good", color: "blue", data: [27, 30, 28, 33, 35, 37, 34, 31, 29, 28, 30, 31, 33] },
  { label: "Est. Monthly Cost", value: "$18,420", delta: "-8.7%", trend: "good", color: "green", data: [42, 41, 39, 38, 37, 36, 35, 33, 32, 31, 30, 29, 28] }
];

const events = [
  { time: "12:55:23", type: "SQL Injection", severity: "High", domain: "api.acme-payments.com", source: "203.0.113.45", country: "US", action: "Blocked" },
  { time: "12:54:11", type: "XSS Attempt", severity: "Medium", domain: "www.acme-payments.com", source: "198.51.100.23", country: "US", action: "Blocked" },
  { time: "12:53:47", type: "Bad Bot", severity: "Medium", domain: "static.acme-payments.com", source: "45.76.201.88", country: "DE", action: "Challenged" },
  { time: "12:52:02", type: "API Abuse", severity: "Medium", domain: "api.acme-payments.com", source: "203.0.113.9", country: "SG", action: "Rate Limited" },
  { time: "12:51:18", type: "LFI Attempt", severity: "Low", domain: "www.acme-payments.com", source: "192.0.2.77", country: "GB", action: "Blocked" },
  { time: "12:50:44", type: "Credential Stuffing", severity: "High", domain: "login.acme-payments.com", source: "185.199.108.12", country: "NL", action: "Challenged" }
];

const domains = [
  { domain: "www.acme-payments.com", status: "Healthy", requests: "8.7M", blocked: "74.2K", waf: "102.1K", latency: "118 ms" },
  { domain: "api.acme-payments.com", status: "Healthy", requests: "6.2M", blocked: "98.7K", waf: "156.3K", latency: "142 ms" },
  { domain: "login.acme-payments.com", status: "Healthy", requests: "1.8M", blocked: "12.3K", waf: "24.8K", latency: "96 ms" },
  { domain: "static.acme-payments.com", status: "Healthy", requests: "5.1M", blocked: "4.1K", waf: "7.6K", latency: "87 ms" },
  { domain: "billing.acme-payments.com", status: "Degraded", requests: "1.1M", blocked: "9.8K", waf: "14.3K", latency: "215 ms" }
];

const incidents = [
  { sev: "High", title: "SQLi Attack Detected", domain: "api.acme-payments.com", firstSeen: "12:41 PM", status: "Ongoing" },
  { sev: "Medium", title: "Credential Stuffing", domain: "login.acme-payments.com", firstSeen: "12:05 PM", status: "Ongoing" },
  { sev: "Medium", title: "API Rate Limit Exceeded", domain: "api.acme-payments.com", firstSeen: "11:32 AM", status: "Ongoing" }
];

const policies = [
  { name: "OWASP Managed Rules", scope: "All domains", mode: "Block", matches: "284.2K", updated: "2h ago" },
  { name: "Login Abuse Protection", scope: "login.acme-payments.com", mode: "Challenge", matches: "33.6K", updated: "1d ago" },
  { name: "API Token Rate Limit", scope: "/v1/*", mode: "Throttle", matches: "51.8K", updated: "3d ago" },
  { name: "High Risk ASN Blocklist", scope: "API + Login", mode: "Log only", matches: "11.2K", updated: "5d ago" }
];

const aiFindings = [
  { title: "Credential stuffing campaign", confidence: 91, impact: "High", summary: "344 unique IPs are rotating user agents against login endpoints with low human interaction signals." },
  { title: "SQLi spike from AS13335", confidence: 87, impact: "High", summary: "Unusual SQLi patterns increased 4.8x against /v1/transactions over the last two hours." },
  { title: "Possible false positive", confidence: 74, impact: "Medium", summary: "A new mobile app version is triggering API schema mismatch events on /v1/cards." }
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
          {active === "overview" && <Overview range={range} setRange={setRange} />}
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
        <span>Acme Payments</span>
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
            <strong>Edge Status</strong>
            <p>Operational</p>
          </div>
        </div>
        <div className="version">Version v2026.07.21</div>
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
        <input aria-label="Search" placeholder="Search domains, IPs, policies, events..." />
        <kbd>⌘K</kbd>
      </div>
      <button className="date-button"><CalendarDays size={16} /> Jul 21, 2026 00:00 - Jul 21, 2026 23:59</button>
      <button className="icon-button"><Bell size={18} /><span className="badge-dot">12</span></button>
      <div className="user">
        <span>JD</span>
        <div><strong>Jane Doe</strong><small>Admin</small></div>
        <ChevronDown size={15} />
      </div>
    </header>
  );
}

function PageHeader({ active, pageTitle }) {
  const subtitle = active === "overview"
    ? "Tenant ID: acme-payments-01 · 29 Domains · 7 Data Centers · 2,341 Active Rules"
    : "Acme Payments · Production · Managed SaaS tenant";
  return (
    <div className="page-header">
      <div>
        <h1>{active === "overview" ? "Acme Payments" : pageTitle}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="header-actions">
        <button className="secondary"><Plus size={16} /> Add Widget</button>
        <button className="secondary"><RefreshCw size={16} /> Sync</button>
        <button className="icon-button bordered"><MoreHorizontal size={18} /></button>
      </div>
    </div>
  );
}

function Overview({ range, setRange }) {
  return (
    <div className="screen">
      <div className="metric-grid">
        {metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}
      </div>
      <div className="dashboard-grid">
        <Panel className="traffic-panel" title="Edge Traffic" action={<Segmented value={range} setValue={setRange} options={["1H", "6H", "24H", "7D", "30D"]} />}>
          <LineChart />
        </Panel>
        <Panel title="Threat Distribution" action={<button className="tiny">Top Threats <ChevronDown size={14} /></button>}>
          <ThreatDistribution />
        </Panel>
        <Panel title="Active Incidents" count="3">
          <IncidentList />
        </Panel>
      </div>
      <div className="table-grid">
        <Panel title="Recent Security Events" action={<button className="link-button">View all events <ChevronRight size={14} /></button>}>
          <EventsTable compact />
        </Panel>
        <Panel title="Domain Health" action={<button className="link-button">View all domains <ChevronRight size={14} /></button>}>
          <DomainTable compact />
        </Panel>
      </div>
      <AiRecommendation />
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
      <div className={`metric-delta ${metric.trend}`}>{metric.delta} <span>vs previous period</span></div>
      <SparkLine data={metric.data} color={metric.color} />
    </article>
  );
}

function SparkLine({ data, color = "blue" }) {
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 150;
    const y = 42 - ((value - Math.min(...data)) / (Math.max(...data) - Math.min(...data) || 1)) * 30;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg className="spark" viewBox="0 0 150 46" preserveAspectRatio="none">
      <polyline points={points} className={`stroke-${color}`} fill="none" strokeWidth="2" />
    </svg>
  );
}

function Panel({ title, count, action, className = "", children }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-header">
        <h2>{title} {count && <span className="count">{count}</span>}</h2>
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

function LineChart() {
  const total = [66, 55, 61, 58, 64, 59, 68, 90, 72, 78, 62, 67, 58, 71, 80, 64, 76, 82, 58, 68];
  const allowed = [45, 38, 43, 40, 42, 39, 48, 56, 46, 50, 38, 42, 37, 45, 51, 40, 48, 50, 39, 47];
  const blocked = [8, 5, 6, 6, 5, 7, 6, 7, 5, 7, 6, 5, 7, 8, 6, 5, 7, 8, 5, 7];
  return (
    <div className="chart-wrap">
      <div className="legend"><span className="legend-blue"></span>Total <span className="legend-green"></span>Allowed <span className="legend-red"></span>Blocked</div>
      <svg className="line-chart" viewBox="0 0 720 300" preserveAspectRatio="none">
        {[0, 1, 2, 3, 4].map((i) => <line key={i} x1="45" x2="705" y1={40 + i * 52} y2={40 + i * 52} />)}
        <Path values={total} className="stroke-blue" />
        <Path values={allowed} className="stroke-green" />
        <Path values={blocked} className="stroke-red" />
        {["00:00", "04:00", "08:00", "12:00", "16:00", "20:00"].map((label, i) => (
          <text key={label} x={45 + i * 128} y="284">{label}</text>
        ))}
      </svg>
    </div>
  );
}

function Path({ values, className }) {
  const max = 95;
  const min = 0;
  const points = values.map((v, i) => `${45 + (i / (values.length - 1)) * 660},${250 - ((v - min) / (max - min)) * 210}`).join(" ");
  return <polyline points={points} className={className} fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />;
}

function ThreatDistribution() {
  const items = [
    ["SQL Injection", "82,341", "red"],
    ["Cross-Site Scripting", "71,204", "orange"],
    ["LFI / RFI", "45,112", "yellow"],
    ["Bad Bots", "38,765", "green"],
    ["API Abuse", "33,981", "blue"],
    ["Credential Stuffing", "27,665", "indigo"],
    ["Other", "128,188", "gray"]
  ];
  return (
    <div className="threats">
      <div className="donut"></div>
      <div className="threat-list">
        {items.map(([label, value, color]) => (
          <div key={label}><span className={`swatch ${color}`}></span><span>{label}</span><strong>{value}</strong></div>
        ))}
        <footer><span>Total</span><strong>427,256</strong></footer>
      </div>
    </div>
  );
}

function IncidentList() {
  return (
    <div className="incident-list">
      {incidents.map((incident) => (
        <article key={incident.title}>
          <div className={`sev ${incident.sev.toLowerCase()}`}>{incident.sev}</div>
          <h3>{incident.title}</h3>
          <p>{incident.domain}</p>
          <small>First seen: {incident.firstSeen}</small>
          <span>{incident.status}</span>
        </article>
      ))}
      <button className="link-button">View all incidents <ChevronRight size={14} /></button>
    </div>
  );
}

function EventsTable({ compact = false }) {
  return (
    <table className="data-table">
      <thead><tr><th>Time</th><th>Type</th><th>Severity</th><th>Domain</th><th>Source</th><th>Action</th></tr></thead>
      <tbody>
        {(compact ? events.slice(0, 5) : events).map((event) => (
          <tr key={`${event.time}-${event.type}`}>
            <td>{event.time}</td>
            <td>{event.type}</td>
            <td><Severity value={event.severity} /></td>
            <td>{event.domain}</td>
            <td>{event.source} <span className="flag">{event.country}</span></td>
            <td><span className={`action ${event.action.toLowerCase().replace(" ", "-")}`}>{event.action}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DomainTable({ compact = false }) {
  return (
    <table className="data-table">
      <thead><tr><th>Domain</th><th>Status</th><th>Requests</th><th>Blocked</th><th>WAF Matches</th><th>Latency p95</th></tr></thead>
      <tbody>
        {(compact ? domains : [...domains, { domain: "admin.acme-payments.com", status: "Pending DNS", requests: "0", blocked: "0", waf: "0", latency: "-" }]).map((row) => (
          <tr key={row.domain}>
            <td>{row.domain}</td>
            <td><Health value={row.status} /></td>
            <td>{row.requests}</td>
            <td>{row.blocked}</td>
            <td>{row.waf}</td>
            <td className={row.status === "Degraded" ? "danger-text" : ""}>{row.latency}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Severity({ value }) {
  return <span className={`severity ${value.toLowerCase()}`}>{value}</span>;
}

function Health({ value }) {
  const healthy = value === "Healthy";
  const pending = value === "Pending DNS";
  return <span className={`health ${healthy ? "healthy" : pending ? "pending" : "degraded"}`}>{healthy ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}{value}</span>;
}

function AiRecommendation() {
  return (
    <Panel title="AI Analyst" action={<span className="beta">Beta</span>}>
      <div className="ai-recommendation">
        <Sparkles size={22} />
        <div>
          <p><strong>Anomaly detected:</strong> Unusual increase in SQLi attempts targeting <a>/v1/transactions</a> from AS13335 over the last 2 hours.</p>
          <p><strong>Recommendation:</strong> Enable stricter SQLi rule set for <a>api.acme-payments.com</a> and add a temporary ASN rate limit.</p>
          <button className="link-button">View analysis <ChevronRight size={14} /></button>
        </div>
        <aside>
          <label>Confidence</label>
          <div className="confidence"><span style={{ width: "87%" }}></span></div>
          <strong>87%</strong>
        </aside>
      </div>
    </Panel>
  );
}

function DomainsScreen() {
  return (
    <div className="screen two-column">
      <Panel title="Domain Onboarding" action={<button className="primary"><Plus size={16} /> Add domain</button>}>
        <div className="onboarding">
          {["Verify ownership", "Issue ACM certificate", "Provision CloudFront", "Attach WAF", "Activate CNAME"].map((step, i) => (
            <div key={step} className={i < 4 ? "done" : "current"}><span>{i + 1}</span>{step}</div>
          ))}
        </div>
        <div className="dns-box">
          <strong>CNAME target</strong>
          <code>tenant-acme.edge.fortressnet.app</code>
          <strong>TXT verification</strong>
          <code>_fortressnet-verify.api.acme-payments.com = fn-7e92c4</code>
        </div>
      </Panel>
      <Panel title="Domain Inventory">
        <DomainTable />
      </Panel>
    </div>
  );
}

function PoliciesScreen() {
  return (
    <div className="screen split-detail">
      <Panel title="Policies" action={<button className="primary"><Plus size={16} /> New policy</button>}>
        <div className="policy-list">
          {policies.map((policy, i) => (
            <button key={policy.name} className={i === 0 ? "selected" : ""}>
              <ShieldAlert size={18} />
              <span><strong>{policy.name}</strong><small>{policy.scope}</small></span>
              <em>{policy.mode}</em>
            </button>
          ))}
        </div>
      </Panel>
      <Panel title="Policy Detail" action={<button className="secondary"><TerminalSquare size={16} /> View YAML</button>}>
        <div className="policy-editor">
          <div><label>Mode</label><select><option>Block</option><option>Challenge</option><option>Log only</option></select></div>
          <div><label>Scope</label><input value="All production domains" readOnly /></div>
          <div><label>Ruleset</label><input value="AWSManagedRulesCommonRuleSet + FortressNet SQLi hardening" readOnly /></div>
          <pre>{`action: block\nscope: all_domains\nrulesets:\n  - owasp-core\n  - aws-common\nexplainability: enabled\nsampling: 100%`}</pre>
        </div>
      </Panel>
    </div>
  );
}

function EventsScreen() {
  return (
    <div className="screen">
      <div className="toolbar-row">
        <button className="secondary"><Filter size={16} /> Severity</button>
        <button className="secondary"><Globe2 size={16} /> Domain</button>
        <button className="secondary"><Bot size={16} /> Bot score</button>
        <button className="primary"><RefreshCw size={16} /> Refresh stream</button>
      </div>
      <Panel title="Security Event Stream">
        <EventsTable />
      </Panel>
    </div>
  );
}

function AiScreen() {
  return (
    <div className="screen ai-screen">
      <Panel title="AI Security Analyst" action={<span className="mode-readonly">Read-only mode</span>}>
        <div className="findings-grid">
          {aiFindings.map((finding) => (
            <article className="finding" key={finding.title}>
              <div><Sparkles size={18} /><Severity value={finding.impact} /></div>
              <h3>{finding.title}</h3>
              <p>{finding.summary}</p>
              <footer><span>Confidence</span><strong>{finding.confidence}%</strong></footer>
            </article>
          ))}
        </div>
      </Panel>
      <Panel title="Recommended Change Request">
        <div className="change-request">
          <h3>Enable stricter SQLi inspection for `/v1/transactions`</h3>
          <p>AI Analyst found a 4.8x increase in SQLi payloads from hosting ASNs. The suggested policy change requires admin approval.</p>
          <div className="approval-actions">
            <button className="secondary">Reject</button>
            <button className="primary">Approve draft</button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function ReportsScreen() {
  return (
    <div className="screen report-grid">
      {[
        ["Operational Report", "Latency, availability, origin errors, bandwidth and cost."],
        ["Security Report", "Incidents, attack trends, blocked requests and rule impact."],
        ["Executive Report", "Risk reduction, monthly trend and business-level summary."],
        ["Compliance Export", "Evidence packages for audits and tenant reporting."]
      ].map(([title, body]) => (
        <Panel key={title} title={title}>
          <div className="report-card"><BarChart3 size={32} /><p>{body}</p><button className="secondary">Generate PDF</button></div>
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
          <span>Business</span>
          <strong>$999 / month</strong>
          <p>Includes 100M protected requests, 10 domains, 30-day retention and AI summaries.</p>
        </div>
      </Panel>
      <Panel title="Usage This Month">
        <div className="usage-list">
          {["Protected requests 23.7M / 100M", "Bandwidth 1.4 TB / 5 TB", "AI analysis units 1,842 / 5,000", "Log retention 30 days"].map((item) => <div key={item}><span>{item}</span><div><i></i></div></div>)}
        </div>
      </Panel>
      <Panel title="Marketplace">
        <div className="marketplace-box">
          <CircleDollarSign size={30} />
          <h3>AWS Marketplace connected</h3>
          <p>Entitlements synced 18 minutes ago. Usage metering is reported hourly.</p>
        </div>
      </Panel>
    </div>
  );
}

function SettingsScreen() {
  return (
    <div className="screen settings-grid">
      <Panel title="Tenant Security">
        <div className="settings-list">
          <div><KeyRound size={18} /><span>KMS key</span><strong>Shared SaaS managed</strong></div>
          <div><LockKeyhole size={18} /><span>SSO</span><strong>OIDC enabled</strong></div>
          <div><Activity size={18} /><span>Audit logs</span><strong>365 days</strong></div>
          <div><Gauge size={18} /><span>Policy approval</span><strong>Required for block rules</strong></div>
        </div>
      </Panel>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
