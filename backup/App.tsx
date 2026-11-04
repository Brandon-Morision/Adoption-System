import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { api, type RecordItem, type UserItem, type ActivityItem, type KPIStats } from "./api.ts";

type Page =
  | "dashboard"
  | "records"
  | "search"
  | "add"
  | "details"
  | "edit"
  | "print"
  | "reports"
  | "users"
  | "activity"
  | "settings";

type IconName =
  | "grid"
  | "records"
  | "search"
  | "plus"
  | "chart"
  | "users"
  | "activity"
  | "settings"
  | "logout"
  | "bell"
  | "chevron"
  | "eye"
  | "edit"
  | "print"
  | "more"
  | "lock"
  | "shield"
  | "calendar"
  | "arrow"
  | "check"
  | "download"
  | "filter"
  | "copy"
  | "archive"
  | "menu";

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    records: <><path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M7 8h10M7 12h10M7 16h7" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    activity: <><path d="M3 12h4l3-8 4 16 3-8h4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.16.37.38.7.67.97.3.27.69.42 1.09.43H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3M21 19V5a2 2 0 0 0-2-2h-6" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
    print: <><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v7H6z" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    download: <><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></>,
    filter: <path d="M3 5h18l-7 8v6l-4 2v-8Z" />,
    copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
    archive: <><path d="M3 6h18M5 6v15h14V6M3 3h18v3H3zM9 10h6" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  };
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const pageTitles: Record<Page, string> = {
  dashboard: "Dashboard", records: "Adoption Records", search: "Search Records", add: "Add New Record",
  details: "Adoption Record", edit: "Edit Adoption Record", print: "Print Record", reports: "Reports",
  users: "User Management", activity: "Activity Log", settings: "Settings",
};

function Button({ children, kind = "primary", icon, onClick, type = "button", disabled = false }: { children: ReactNode; kind?: "primary" | "secondary" | "ghost" | "danger"; icon?: IconName; onClick?: () => void; type?: "button" | "submit"; disabled?: boolean }) {
  return <button className={`button ${kind}`} onClick={onClick} type={type} disabled={disabled}>{icon && <Icon name={icon} size={16} />}{children}</button>;
}

function Field({ label, required, hint, error, children, wide = false }: { label: string; required?: boolean; hint?: string; error?: string; children: ReactNode; wide?: boolean }) {
  return <label className={`field ${wide ? "wide" : ""}`}><span className="label">{label}{required && <span className="required">Required</span>}</span>{children}{hint && <span className="hint">{hint}</span>}{error && <span className="field-error">{error}</span>}</label>;
}

function Logo({ light = false }: { light?: boolean }) {
  return <div className={`logo-lockup ${light ? "light" : ""}`}><div className="seal"><Icon name="shield" size={22} /></div><div><strong>AODS</strong><span>Adoption Office Database System</span></div></div>;
}

function Login({ onLogin }: { onLogin: (user: UserItem) => void }) {
  const [empId, setEmpId] = useState("ADM-001");
  const [password, setPassword] = useState("countyrecords");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const user = await api.login(empId, password);
      onLogin(user);
    } catch (err: any) {
      setError(err.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return <main className="login-page">
    <section className="login-brand">
      <Logo light />
      <div className="brand-message">
        <div className="eyebrow light-text">County Government · Authorized System</div>
        <h1>Adoption Office<br />Database System</h1>
        <p>Secure digital management of county adoption records.</p>
        <div className="security-line"><Icon name="shield" /><span>Confidential government records<br /><small>Protected access for authorized personnel</small></span></div>
      </div>
      <div className="brand-footer">AODS · County Adoption Office</div>
    </section>
    <section className="login-form-side">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="mobile-logo"><Logo /></div>
        <div className="eyebrow">Secure employee access</div>
        <h2>Welcome back</h2>
        <p className="muted">Sign in to access the Adoption Office Database System.</p>
        {error && <div style={{ color: "#bb3d43", background: "#fff0f0", padding: "8px 12px", borderRadius: "6px", fontSize: "11px", marginBottom: "14px" }}>{error}</div>}
        <Field label="Employee ID / Username">
          <input value={empId} onChange={e => setEmpId(e.target.value)} aria-label="Employee ID or username" required />
        </Field>
        <Field label="Password">
          <div className="input-with-action">
            <input type={show ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} aria-label="Password" required />
            <button type="button" onClick={() => setShow(!show)} aria-label="Show password"><Icon name="eye" /></button>
          </div>
        </Field>
        <div className="form-meta"><label className="check"><input type="checkbox" defaultChecked /> Remember me</label><button type="button" className="text-button">Forgot password?</button></div>
        <Button type="submit" disabled={loading}>{loading ? "Signing in..." : "Sign In"} <Icon name="arrow" size={16} /></Button>
        <div className="secure-note"><Icon name="lock" size={16} /><span><strong>Authorized personnel only.</strong> Adoption records are confidential.</span></div>
      </form>
      <footer>County Adoption Office <span>•</span> Adoption Office Database System</footer>
    </section>
  </main>;
}

function Sidebar({ page, go, logout, open, close, currentUser }: { page: Page; go: (p: Page) => void; logout: () => void; open: boolean; close: () => void; currentUser: UserItem | null }) {
  const nav = [
    { group: "Overview", items: [{ id: "dashboard" as Page, label: "Dashboard", icon: "grid" as IconName }] },
    { group: "Records", items: [
      { id: "records" as Page, label: "All Adoption Records", icon: "records" as IconName },
      { id: "search" as Page, label: "Search Records", icon: "search" as IconName },
      { id: "add" as Page, label: "Add New Record", icon: "plus" as IconName },
    ]},
    { group: "Insights", items: [{ id: "reports" as Page, label: "Reports", icon: "chart" as IconName }] },
    { group: "Administration", items: [
      { id: "users" as Page, label: "User Management", icon: "users" as IconName },
      { id: "activity" as Page, label: "Activity Log", icon: "activity" as IconName },
    ]},
  ];
  const navigate = (p: Page) => { go(p); close(); };
  const initials = currentUser ? currentUser.name.split(" ").map(n => n[0]).join("") : "JM";

  return <>
    {open && <button className="sidebar-scrim" onClick={close} aria-label="Close navigation" />}
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="sidebar-logo"><Logo light /></div>
      <nav>{nav.map(section => <div className="nav-section" key={section.group}><div className="nav-label">{section.group}</div>{section.items.map(item => <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => navigate(item.id)}><Icon name={item.icon} /><span>{item.label}</span>{page === item.id && <span className="active-mark" />}</button>)}</div>)}</nav>
      <div className="sidebar-bottom">
        <button className={page === "settings" ? "active" : ""} onClick={() => navigate("settings")}><Icon name="settings" /><span>Settings</span></button>
        <div className="user-rail">
          <div className="avatar">{initials}</div>
          <div><strong>{currentUser?.name || "Jane Mwangi"}</strong><span>{currentUser?.role || "Administrator"}</span></div>
          <button onClick={logout} title="Log out"><Icon name="logout" /></button>
        </div>
      </div>
    </aside>
  </>;
}

function Header({ page, go, toggleMenu, records, onSelectRecord, currentUser }: { page: Page; go: (p: Page) => void; toggleMenu: () => void; records: RecordItem[]; onSelectRecord: (r: RecordItem) => void; currentUser: UserItem | null }) {
  const [query, setQuery] = useState("");
  const showResults = query.trim().length > 1;
  const initials = currentUser ? currentUser.name.split(" ").map(n => n[0]).join("") : "JM";

  return <header className="topbar">
    <div className="header-title"><button className="menu-button" onClick={toggleMenu}><Icon name="menu" /></button><div><span>County Adoption Office</span><strong>{pageTitles[page]}</strong></div></div>
    <div className="global-search">
      <Icon name="search" size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search records..." aria-label="Global search" /><kbd>⌘ K</kbd>
      {showResults && <div className="search-popover">
        <div className="popover-label">Records matching “{query}”</div>
        {records.filter(r => r.name.toLowerCase().includes(query.toLowerCase()) || r.no.includes(query)).slice(0, 3).map(r => <button key={r.no} onClick={() => { setQuery(""); onSelectRecord(r); go("details"); }}><div className="result-icon"><Icon name="records" /></div><div><strong>{r.name}</strong><span>Entry #{r.no} · Adoption: {r.adoption}</span></div><Icon name="chevron" size={16} /></button>)}
        {!records.some(r => r.name.toLowerCase().includes(query.toLowerCase()) || r.no.includes(query)) && <div className="no-mini-results">No matching records. Press Enter for advanced search.</div>}
        <button className="all-results" onClick={() => go("search")}>View all search results <Icon name="arrow" size={15} /></button>
      </div>}
    </div>
    <div className="header-actions">
      <button className="notification"><Icon name="bell" /><span /></button>
      <div className="header-user">
        <div className="avatar">{initials}</div>
        <div><strong>{currentUser?.name || "Jane Mwangi"}</strong><span>{currentUser?.role || "Administrator"}</span></div>
        <Icon name="chevron" size={14} />
      </div>
    </div>
  </header>;
}

function KpiCard({ label, value, trend, icon }: { label: string; value: string; trend: string; icon: IconName }) {
  return <div className="kpi-card"><div className="kpi-top"><div className="kpi-icon"><Icon name={icon} /></div><span className="positive">{trend}</span></div><strong className="kpi-value">{value}</strong><span>{label}</span></div>;
}

function Dashboard({ go, records, onSelectRecord, kpiStats, activityList }: { go: (p: Page) => void; records: RecordItem[]; onSelectRecord: (r: RecordItem) => void; kpiStats: KPIStats | null; activityList: ActivityItem[] }) {
  const actions = [
    { title: "Add New Record", desc: "Enter a new adoption record", icon: "plus" as IconName, page: "add" as Page },
    { title: "Search Records", desc: "Find an existing child record", icon: "search" as IconName, page: "search" as Page },
    { title: "View All Records", desc: "Browse the complete register", icon: "records" as IconName, page: "records" as Page },
    { title: "Reports", desc: "View records statistics", icon: "chart" as IconName, page: "reports" as Page },
  ];

  return <div>
    <div className="welcome-row"><div><div className="eyebrow">Monday, 5 October 2026</div><h1>Good morning, Administrator</h1><p>Manage and retrieve county adoption records securely.</p></div><div className="confidential-chip"><Icon name="shield" size={16} /> Confidential Government Records</div></div>
    <div className="kpi-grid">
      <KpiCard label="Total Adoption Records" value={kpiStats?.totalRecords || `${records.length}`} trend="+8.2% this year" icon="records" />
      <KpiCard label="Records Added This Month" value={`${kpiStats?.addedThisMonth || 36}`} trend="+12 from Sep" icon="plus" />
      <KpiCard label="Records Updated This Month" value={`${kpiStats?.updatedThisMonth || 84}`} trend="6 today" icon="edit" />
      <KpiCard label="Recent Entries" value={`${kpiStats?.recentEntries || records.length}`} trend="Last 7 days" icon="calendar" />
    </div>
    <section className="content-section"><div className="section-heading"><div><h2>Quick Actions</h2><p>Common records management tasks</p></div></div><div className="action-grid">{actions.map(a => <button className="action-card" onClick={() => go(a.page)} key={a.title}><div className="action-icon"><Icon name={a.icon} /></div><div><strong>{a.title}</strong><span>{a.desc}</span></div><Icon name="chevron" size={17} /></button>)}</div></section>
    <div className="dashboard-bottom">
      <section className="panel recent-panel">
        <div className="panel-head"><div><h2>Recently Added Records</h2><p>Latest entries in the register</p></div><button className="text-button" onClick={() => go("records")}>View all records <Icon name="arrow" size={15} /></button></div>
        <RecordTable data={records.slice(0, 4)} compact onOpen={onSelectRecord} onArchive={() => {}} onEdit={(r) => { onSelectRecord(r); go("edit"); }} />
      </section>
      <section className="panel activity-panel">
        <div className="panel-head"><div><h2>Recent Activity</h2><p>Latest system audit events</p></div></div>
        <div className="activity-list">
          {activityList.slice(0, 4).map((item) => <div className="activity-item" key={item.id}><div className="activity-icon"><Icon name={item.action.includes("Create") ? "plus" : item.action.includes("Update") ? "edit" : item.action.includes("Login") ? "lock" : "eye"} size={15} /></div><div><strong>{item.description}</strong><span>{item.record_no} · {item.user_name}</span></div><time>{item.timestamp.split(",")[1] || item.timestamp}</time></div>)}
        </div>
        <button className="panel-link" onClick={() => go("activity")}>View complete activity log</button>
      </section>
    </div>
  </div>;
}

function RecordTable({ data, compact = false, onOpen, onEdit, onArchive }: { data: RecordItem[]; compact?: boolean; onOpen: (r: RecordItem) => void; onEdit?: (r: RecordItem) => void; onArchive?: (no: string) => void }) {
  const [menu, setMenu] = useState<string | null>(null);

  return <div className="table-wrap"><table className={`data-table ${compact ? "compact" : ""}`}><thead><tr><th>Entry No. <span>↕</span></th><th>Child Name <span>↕</span></th><th>Date of Birth</th>{!compact && <th>Country</th>}<th>Sex</th><th>Adopters</th><th>Date of Adoption</th>{!compact && <th>Court</th>}<th>Date Entered</th><th aria-label="Actions" /></tr></thead><tbody>{data.map(r => <tr key={r.no} onClick={() => onOpen(r)}><td><strong className="entry-no">#{r.no}</strong></td><td><strong>{r.name}</strong></td><td>{r.dob}</td>{!compact && <td>{r.country}</td>}<td><span className={`sex-dot ${r.sex.toLowerCase()}`} />{r.sex}</td><td className="truncate">{r.adopters}</td><td>{r.adoption}</td>{!compact && <td><span className="court-tag">{r.court}</span></td>}<td>{r.entered}</td><td className="action-cell"><button onClick={(e) => { e.stopPropagation(); setMenu(menu === r.no ? null : r.no); }} aria-label="Record actions"><Icon name="more" /></button>{menu === r.no && <div className="row-menu" onClick={e => e.stopPropagation()}><button onClick={() => { setMenu(null); onOpen(r); }}><Icon name="eye" /> View Record</button><button onClick={() => { setMenu(null); onEdit?.(r); }}><Icon name="edit" /> Edit Record</button><button onClick={() => { setMenu(null); onOpen(r); }}><Icon name="print" /> Print Record</button><button onClick={() => { navigator.clipboard?.writeText(r.no); setMenu(null); }}><Icon name="copy" /> Copy Entry Number</button><hr /><button className="danger-item" onClick={() => { setMenu(null); onArchive?.(r.no); }}><Icon name="archive" /> Archive Record</button></div>}</td></tr>)}</tbody></table></div>;
}

function PageIntro({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return <div className="page-intro"><div><div className="breadcrumb">Home <span>/</span> {title}</div><h1>{title}</h1><p>{subtitle}</p></div>{children && <div className="page-actions">{children}</div>}</div>;
}

function RecordsPage({ go, records, onSelectRecord, onArchive }: { go: (p: Page) => void; records: RecordItem[]; onSelectRecord: (r: RecordItem) => void; onArchive: (no: string) => void }) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(false);
  const [sexFilter, setSexFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [courtFilter, setCourtFilter] = useState("");

  const filtered = useMemo(() => {
    return records.filter(r => {
      const matchQuery = `${r.no} ${r.name} ${r.adopters}`.toLowerCase().includes(query.toLowerCase());
      const matchSex = !sexFilter || r.sex === sexFilter;
      const matchCountry = !countryFilter || r.country === countryFilter;
      const matchCourt = !courtFilter || r.court === courtFilter;
      return matchQuery && matchSex && matchCountry && matchCourt;
    });
  }, [records, query, sexFilter, countryFilter, courtFilter]);

  const clearFilters = () => {
    setQuery("");
    setSexFilter("");
    setCountryFilter("");
    setCourtFilter("");
  };

  return <><PageIntro title="Adoption Records" subtitle="View, search and manage registered adoption records."><Button icon="plus" onClick={() => go("add")}>Add New Record</Button></PageIntro>
    <section className="panel records-panel"><div className="records-toolbar"><div className="large-search"><Icon name="search" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by child name, entry number, adopter name..." /></div><Button kind="secondary" icon="filter" onClick={() => setFilters(!filters)}>Filters {filters ? "−" : "+"}</Button></div>
    {filters && <div className="filter-bar">
      <select value={sexFilter} onChange={e => setSexFilter(e.target.value)}><option value="">Sex: All</option><option value="Female">Female</option><option value="Male">Male</option></select>
      <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}><option value="">Country: All</option><option value="Kenya">Kenya</option><option value="Uganda">Uganda</option><option value="Tanzania">Tanzania</option></select>
      <select value={courtFilter} onChange={e => setCourtFilter(e.target.value)}><option value="">Court: All</option><option value="High Court">High Court</option><option value="Children’s Court">Children’s Court</option></select>
      <button className="text-button" onClick={clearFilters}>Clear filters</button>
    </div>}
    <div className="table-meta"><span><strong>{filtered.length || "No"}</strong> records found</span><span>Live database connection</span></div>
    {filtered.length ? <RecordTable data={filtered} onOpen={onSelectRecord} onEdit={(r) => { onSelectRecord(r); go("edit"); }} onArchive={onArchive} /> : <EmptyState onAction={clearFilters} />}
    <div className="pagination"><span>Showing 1–{filtered.length} of {records.length} records</span><div><button disabled>Previous</button><button className="current">1</button><button>Next</button></div></div></section></>;
}

function EmptyState({ onAction }: { onAction: () => void }) {
  return <div className="empty-state"><div><Icon name="search" size={28} /></div><h3>No adoption records found</h3><p>Try changing your search terms or clearing one or more filters.</p><Button kind="secondary" onClick={onAction}>Clear Search</Button></div>;
}

function SearchPage({ go, records, onSelectRecord }: { go: (p: Page) => void; records: RecordItem[]; onSelectRecord: (r: RecordItem) => void }) {
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  const results = records.filter(r => `${r.no} ${r.name} ${r.adopters} ${r.court} ${r.country}`.toLowerCase().includes(query.toLowerCase()));

  return <><PageIntro title="Search Records" subtitle="Find an adoption record quickly using any known detail." />
    <section className="search-hero panel"><div className="search-title"><div className="search-emblem"><Icon name="search" /></div><div><h2>Search the adoption register</h2><p>Search by child name, entry number, adopter name, court or other record details.</p></div></div>
      <form onSubmit={e => { e.preventDefault(); setSearched(true); }}><div className="hero-search"><Icon name="search" size={20} /><input value={query} onChange={e => { setQuery(e.target.value); setSearched(false); }} placeholder="Search adoption records..." autoFocus /><Button type="submit">Search Records</Button></div></form>
      <button className="advanced-toggle" onClick={() => setAdvanced(!advanced)}><Icon name="filter" size={16} /> Advanced Search <span>{advanced ? "−" : "+"}</span></button>
      {advanced && <div className="advanced-grid">
        <Field label="Entry Number"><input placeholder="e.g. 001248" value={query} onChange={e => setQuery(e.target.value)} /></Field>
        <Field label="Child Name"><input placeholder="Enter full or partial name" value={query} onChange={e => setQuery(e.target.value)} /></Field>
        <Field label="Date of Birth"><input type="date" /></Field>
        <Field label="Country of Birth"><select defaultValue=""><option value="">Select country</option><option>Kenya</option><option>Uganda</option><option>Tanzania</option></select></Field>
        <Field label="Sex"><select defaultValue=""><option value="">Any</option><option>Female</option><option>Male</option></select></Field>
        <Field label="Adopter Name"><input placeholder="Enter adopter name" /></Field>
        <Field label="Date of Adoption"><input type="date" /></Field>
        <Field label="Court"><select defaultValue=""><option value="">Any court</option><option>High Court</option><option>Children’s Court</option></select></Field>
      </div>}
    </section>
    {!searched && <div className="search-prompt"><div><Icon name="records" size={30} /></div><h3>Begin your search</h3><p>Enter a name, entry number, or other record detail above. You can combine filters for more precise results.</p></div>}
    {searched && <section className="panel search-results"><div className="panel-head"><div><h2>Search Results</h2><p>{results.length} matching records for “{query}”</p></div><Button kind="ghost" onClick={() => { setQuery(""); setSearched(false); }}>Clear Search</Button></div>{results.length ? <RecordTable data={results} onOpen={onSelectRecord} /> : <EmptyState onAction={() => { setQuery(""); setSearched(false); }} />}</section>}
  </>;
}

const FormSection = ({ number, title, subtitle, children }: { number: string; title: string; subtitle: string; children: ReactNode }) => <section className="form-section"><div className="form-section-head"><span>{number}</span><div><h2>{title}</h2><p>{subtitle}</p></div></div><div className="form-grid">{children}</div></section>;

function RecordForm({ mode, go, confirm, initialData, nextEntryNo }: { mode: "add" | "edit"; go: (p: Page) => void; confirm: (data: Partial<RecordItem>) => void; initialData: RecordItem | null; nextEntryNo: string }) {
  const editing = mode === "edit";
  const [formData, setFormData] = useState<Partial<RecordItem>>({
    no: editing ? initialData?.no : nextEntryNo,
    name: editing ? initialData?.name : "",
    dob: editing ? initialData?.dob : "",
    country: editing ? initialData?.country : "Kenya",
    sex: editing ? initialData?.sex : "Female",
    adopters: editing ? initialData?.adopters : "",
    adopters_address: editing ? (initialData?.adopters_address || "P.O. Box 1842, Riverside Drive, Nairobi") : "",
    adopters_occupation: editing ? (initialData?.adopters_occupation || "Civil Engineer and Educator") : "",
    adoption: editing ? initialData?.adoption : "",
    court: editing ? initialData?.court : "High Court",
    entered: editing ? initialData?.entered : new Date().toISOString().split("T")[0],
    officer: editing ? (initialData?.officer || "Jane Mwangi") : "Jane Mwangi",
    designation: editing ? (initialData?.designation || "Registrar, County Adoption Office") : "Registrar, County Adoption Office",
    signature: editing ? (initialData?.signature || "J. Mwangi") : "J. Mwangi",
  });

  const handleChange = (field: keyof RecordItem, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return <><PageIntro title={editing ? "Edit Adoption Record" : "Add New Adoption Record"} subtitle={editing ? "Update the registered information below. All changes are recorded in the audit log." : "Enter the details of the adopted child and adoption order."}><div className="draft-status"><span /> {editing ? `Record #${formData.no}` : "New record"}</div></PageIntro>
    <div className="form-layout"><form className="record-form" onSubmit={(e: FormEvent) => { e.preventDefault(); confirm(formData); }}>
      <FormSection number="01" title="Child Information" subtitle="Details as recorded on the official adoption order.">
        <Field label="Entry Number" required hint={editing ? "Entry number cannot be changed" : "Automatically generated by the system"}><div className="input-prefix"><span>#</span><input value={formData.no} readOnly /></div></Field>
        <Field label="Child Full Name" required><input value={formData.name || ""} onChange={e => handleChange("name", e.target.value)} placeholder="Enter name and surname of child" required /></Field>
        <Field label="Date of Birth" required><div className="input-icon"><input type="date" value={formData.dob || ""} onChange={e => handleChange("dob", e.target.value)} required /><Icon name="calendar" size={16} /></div></Field>
        <Field label="Country of Birth" required><select value={formData.country || "Kenya"} onChange={e => handleChange("country", e.target.value)}><option value="Kenya">Kenya</option><option value="Uganda">Uganda</option><option value="Tanzania">Tanzania</option><option value="Other">Other</option></select></Field>
        <Field label="Sex of Child" required wide><div className="radio-group"><label><input type="radio" name="sex" checked={formData.sex === "Female"} onChange={() => handleChange("sex", "Female")} /> Female</label><label><input type="radio" name="sex" checked={formData.sex === "Male"} onChange={() => handleChange("sex", "Male")} /> Male</label></div></Field>
      </FormSection>
      <FormSection number="02" title="Adopter Information" subtitle="Names and current details of the registered adopter or adopters.">
        <Field label="Adopter(s) Full Name" required wide><input value={formData.adopters || ""} onChange={e => handleChange("adopters", e.target.value)} placeholder="e.g. John Kamau and Mary Kamau" required /></Field>
        <Field label="Address of Adopter(s)" required wide><textarea value={formData.adopters_address || ""} onChange={e => handleChange("adopters_address", e.target.value)} placeholder="Enter residential or postal address..." rows={3} required /></Field>
        <Field label="Occupation of Adopter(s)" required wide><input value={formData.adopters_occupation || ""} onChange={e => handleChange("adopters_occupation", e.target.value)} placeholder="Enter occupation..." required /></Field>
      </FormSection>
      <FormSection number="03" title="Adoption / Court Information" subtitle="Information from the final adoption order.">
        <Field label="Date of Adoption" required><div className="input-icon"><input type="date" value={formData.adoption || ""} onChange={e => handleChange("adoption", e.target.value)} required /><Icon name="calendar" size={16} /></div></Field>
        <Field label="Court" required><select value={formData.court || "High Court"} onChange={e => handleChange("court", e.target.value)}><option value="High Court">High Court</option><option value="Children’s Court">Children’s Court</option><option value="Other">Other</option></select></Field>
      </FormSection>
      <FormSection number="04" title="Registry Information" subtitle="Official entry and attestation details.">
        <Field label="Date Details Were Entered" required><input type="date" value={formData.entered || ""} onChange={e => handleChange("entered", e.target.value)} required /></Field>
        <Field label="Officer Name" required><input value={formData.officer || "Jane Mwangi"} onChange={e => handleChange("officer", e.target.value)} required /></Field>
        <Field label="Designation"><input value={formData.designation || "Registrar, County Adoption Office"} onChange={e => handleChange("designation", e.target.value)} /></Field>
        <Field label="Officer / Registrar General Attestation" required><div className="signature-box"><span className="signature-script">{formData.signature || "J. Mwangi"}</span><small>Authorized officer signature</small></div></Field>
      </FormSection>
      <div className="form-footer"><div><Icon name="shield" size={17} /><span>All changes are securely saved to the database and logged for audit.</span></div><div><Button kind="ghost" onClick={() => go(editing ? "details" : "dashboard")}>Cancel</Button><Button type="submit" icon="check">{editing ? "Save Changes" : "Save Record"}</Button></div></div>
    </form><aside className="form-help"><div className="help-card"><Icon name="shield" /><h3>Confidential record</h3><p>Verify all information against the official adoption order before saving.</p></div><div className="progress-card"><strong>Record sections</strong>{["Child Information", "Adopter Information", "Adoption / Court", "Registry Information"].map((s, i) => <div key={s}><span>{i + 1}</span>{s}</div>)}</div><div className="session-note"><Icon name="lock" size={15} /> Your session is securely authenticated.</div></aside></div></>;
}

function Details({ go, record }: { go: (p: Page) => void; record: RecordItem | null }) {
  if (!record) {
    return <div className="panel" style={{ padding: "40px", textAlign: "center" }}><h3>No record selected</h3><Button onClick={() => go("records")}>View All Records</Button></div>;
  }

  const monogram = record.name.split(" ").map(n => n[0]).join("").slice(0, 2);
  const detailSections = [
    ["Child Information", [["Entry Number", `#${record.no}`], ["Date of Birth", record.dob], ["Country of Birth", record.country], ["Full Name", record.name], ["Sex", record.sex]]],
    ["Adopter Information", [["Adopter(s)", record.adopters], ["Address", record.adopters_address || "P.O. Box 1842, Riverside Drive, Nairobi"], ["Occupation", record.adopters_occupation || "Civil Engineer and Educator"]]],
    ["Adoption Information", [["Date of Adoption", record.adoption], ["Court Which Made the Order", record.court]]],
    ["Registry Information", [["Date Details Were Entered", record.entered], ["Officer / Registrar General", `${record.officer || "Jane Mwangi"} — ${record.designation || "Registrar"}`], ["Attestation / Signature", record.signature || "J. Mwangi"]]],
  ];

  return <><div className="record-titlebar"><button className="back-link" onClick={() => go("records")}>← Back to Records</button><div><div><span className="eyebrow">Official adoption register</span><h1>Adoption Record <em>#{record.no}</em></h1></div><span className="status-badge"><Icon name="check" size={14} /> {record.status}</span></div><div className="page-actions"><Button kind="secondary" icon="print" onClick={() => go("print")}>Print</Button><Button icon="edit" onClick={() => go("edit")}>Edit Record</Button></div></div>
    <div className="record-summary"><div className="record-monogram">{monogram}</div><div className="summary-name"><span>Child Full Name</span><h2>{record.name}</h2><div><span><small>Date of Birth</small>{record.dob}</span><span><small>Sex</small>{record.sex}</span><span><small>Country of Birth</small>{record.country}</span></div></div><div className="summary-seal"><Icon name="shield" size={24} /><span>Verified entry<small>County Adoption Office</small></span></div></div>
    <div className="detail-layout"><main>{detailSections.map((section, i) => <section className="detail-card" key={section[0] as string}><div className="detail-card-head"><div><span>0{i + 1}</span><h2>{section[0] as string}</h2></div>{i < 2 && <button className="text-button" onClick={() => go("edit")}><Icon name="edit" size={14} /> Edit section</button>}</div><dl>{(section[1] as string[][]).map(([label, value]) => <div key={label}><dt>{label}</dt><dd className={label.includes("Signature") ? "signature-value" : ""}>{value}</dd></div>)}</dl></section>)}</main><aside><div className="metadata-card"><h3>Record Metadata</h3><div><span>Status</span><strong className="status-text">{record.status}</strong></div><div><span>Created by</span><strong>{record.officer || "Jane Mwangi"}</strong></div><div><span>Created on</span><strong>{record.created_at || "Official Register"}</strong></div><div><span>Last updated</span><strong>{record.updated_at || "Recent"}</strong></div></div><div className="history-card"><h3>Audit Status</h3><div><span /><p><strong>Protected database entry</strong><small>Stored in SQLite server database</small></p></div><button className="text-button" onClick={() => go("activity")}>View full audit trail</button></div></aside></div>
  </>;
}

function PrintRecord({ go, record }: { go: (p: Page) => void; record: RecordItem | null }) {
  const r = record || {
    no: "001248",
    dob: "14 March 2018",
    country: "Kenya",
    name: "Jane Wanjiku Kamau",
    sex: "Female",
    adopters: "John Kamau and Mary Kamau",
    adopters_address: "P.O. Box 1842, Riverside Drive, Nairobi",
    adopters_occupation: "Civil Engineer and Educator",
    adoption: "21 August 2024",
    court: "High Court",
    entered: "23 August 2024",
    signature: "J. Mwangi",
    officer: "Jane Mwangi",
    designation: "Registrar"
  };

  const rows = [
    ["1. No. of Entry", r.no],
    ["2. Date of Birth of Child", r.dob],
    ["3. Country of Birth of Child", r.country],
    ["4. Name and Surname of Child", r.name],
    ["5. Sex of Child", r.sex],
    ["6. Name and Surname of Adopters", r.adopters],
    ["7. Address of Adopters", r.adopters_address || "P.O. Box 1842, Riverside Drive, Nairobi"],
    ["8. Occupation of Adopters", r.adopters_occupation || "Civil Engineer and Educator"],
    ["9. Date of Adoption", r.adoption],
    ["10. Court Which Made the Order of Adoption", r.court],
    ["11. Date of Entry of Details", r.entered],
    ["12. Signature of Officer / Registrar General to Attest the Entry", r.signature || "J. Mwangi"],
  ];

  return <><div className="print-toolbar"><div><button className="back-link" onClick={() => go("details")}>← Back to Record</button><span>Print preview · A4 portrait</span></div><div><Button kind="secondary" icon="download" onClick={() => window.print()}>Download PDF</Button><Button icon="print" onClick={() => window.print()}>Print Record</Button></div></div><div className="paper"><div className="paper-header"><div className="paper-seal"><Icon name="shield" size={30} /></div><div><strong>COUNTY GOVERNMENT</strong><span>County Adoption Office</span><small>Adoption Office Database System</small></div><div className="paper-ref">Entry No.<strong>{r.no}</strong></div></div><div className="paper-title"><h1>ADOPTION RECORD</h1><p>Official entry in the County Adoption Register</p></div><table><tbody>{rows.map(([label, value]) => <tr key={label}><th>{label}</th><td className={label.startsWith("12") ? "signature-value" : ""}>{value}</td></tr>)}</tbody></table><div className="paper-signoff"><div><span>Officer Name</span><strong>{r.officer || "Jane Mwangi"}</strong></div><div><span>Designation</span><strong>{r.designation || "Registrar"}</strong></div><div><span>Signature</span><strong className="signature-value">{r.signature || "J. Mwangi"}</strong></div><div><span>Date</span><strong>{r.entered}</strong></div></div><div className="confidential-stamp">CONFIDENTIAL — FOR AUTHORIZED OFFICIAL USE ONLY</div><footer>This document contains protected county adoption records. Unauthorized disclosure is prohibited.</footer></div></>;
}

function Reports() {
  const [year, setYear] = useState("2026");
  const [sex, setSex] = useState("All children");
  const [generated, setGenerated] = useState(false);
  const [annualSex, setAnnualSex] = useState<{ year: string; female: number; male: number }[]>([]);

  useEffect(() => {
    api.getAnnualSex().then(data => setAnnualSex(data)).catch(() => {});
  }, []);

  const selected = annualSex.find(item => item.year === year) || { year: "2026", female: 151, male: 143 };
  const reportTotal = sex === "Female" ? selected.female : sex === "Male" ? selected.male : selected.female + selected.male;

  return <><PageIntro title="Reports" subtitle="Generate annual reports and review records held in the county adoption register."><Button kind="secondary" icon="download" onClick={() => window.print()}>Export Report</Button><Button icon="print" onClick={() => window.print()}>Print</Button></PageIntro>
    <section className="panel report-generator">
      <div className="report-generator-copy"><div className="report-generator-icon"><Icon name="chart" /></div><div><h2>Generate Annual Sex Report</h2><p>Create a report for a selected year, filtered by the sex of the child.</p></div></div>
      <div className="report-controls"><label><span>Report Year</span><select value={year} onChange={e => { setYear(e.target.value); setGenerated(false); }}>{annualSex.map(item => <option key={item.year}>{item.year}</option>)}</select></label><label><span>Sex of Child</span><select value={sex} onChange={e => { setSex(e.target.value); setGenerated(false); }}><option>All children</option><option>Female</option><option>Male</option></select></label><Button icon="chart" onClick={() => setGenerated(true)}>Generate Report</Button></div>
      {generated && <div className="generated-report"><div><Icon name="check" /><span>Report generated</span></div><p><strong>{reportTotal}</strong> {sex.toLowerCase()} adoption records were entered in <strong>{year}</strong>.</p><div><Button kind="secondary" icon="download" onClick={() => alert("CSV export downloaded")}>Export CSV</Button><Button kind="secondary" icon="print" onClick={() => window.print()}>Print Report</Button></div></div>}
    </section>
    <div className="report-kpis"><KpiCard label="Total Adoption Records" value="1,248" trend="+8.2% this year" icon="records" /><KpiCard label="Records Added This Year" value="294" trend="24% of total" icon="calendar" /><KpiCard label="Records Added This Month" value="36" trend="+12 vs last month" icon="plus" /><KpiCard label="Female / Male" value="51% / 49%" trend="Balanced distribution" icon="users" /></div>
    <div className="report-grid">
      <section className="panel chart-card wide-chart"><div className="panel-head"><div><h2>Annual Records by Sex of Child</h2><p>Female and male adoption records entered each year</p></div><div className="sex-chart-legend"><span><i />Female</span><span><i />Male</span></div></div><div className="grouped-chart">{annualSex.map(item => <div className="year-group" key={item.year}><div className="bars"><i className="female-bar" style={{height: `${item.female / 2}px`}}><span>{item.female}</span></i><i className="male-bar" style={{height: `${item.male / 2}px`}}><span>{item.male}</span></i></div><small>{item.year}</small></div>)}</div></section>
      <section className="panel chart-card"><div className="panel-head"><div><h2>Records by Country</h2><p>Country of birth</p></div></div>{[["Kenya","78%",78],["Uganda","9%",9],["Tanzania","7%",7],["Other","6%",6]].map(([l,v,w]) => <div className="metric-bar" key={l as string}><div><span>{l}</span><strong>{v}</strong></div><i><b style={{width: `${w}%`}} /></i></div>)}</section><section className="panel chart-card"><div className="panel-head"><div><h2>Records by Court</h2><p>Order issuing court</p></div></div><div className="donut-row"><div className="donut"><span>1,248<small>Total</small></span></div><div className="legend"><span><i /> High Court <strong>742</strong></span><span><i /> Children’s Court <strong>421</strong></span><span><i /> Other <strong>85</strong></span></div></div></section></div></>;
}

function Users({ userList }: { userList: UserItem[] }) {
  return <><PageIntro title="User Management" subtitle="Manage employee access to confidential adoption records."><Button icon="plus">Add User</Button></PageIntro><section className="panel records-panel"><div className="records-toolbar"><div className="large-search"><Icon name="search" /><input placeholder="Search by employee name or ID..." /></div><Button kind="secondary" icon="filter">Filters</Button></div><div className="table-meta"><span><strong>{userList.length}</strong> employees registered</span><span>Administrator access only</span></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Employee Name</th><th>Employee ID</th><th>Role</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead><tbody>{userList.map(u => <tr key={u.employee_id}><td><div className="person-cell"><span>{u.name.split(" ").map(n=>n[0]).join("")}</span><strong>{u.name}</strong></div></td><td><strong>{u.employee_id}</strong></td><td><span className="role-badge">{u.role}</span></td><td><span className={`user-status ${u.status.toLowerCase()}`}><i />{u.status}</span></td><td>{u.last_login || "Recent"}</td><td><button className="text-button">Edit</button><button className="action-dot"><Icon name="more" /></button></td></tr>)}</tbody></table></div></section></>;
}

function ActivityLog({ activityList }: { activityList: ActivityItem[] }) {
  return <><PageIntro title="Activity Log" subtitle="Review important actions performed in this confidential records system."><Button kind="secondary" icon="download" onClick={() => alert("Activity log exported to CSV")}>Export Log</Button></PageIntro><section className="panel records-panel"><div className="audit-callout"><Icon name="shield" /><div><strong>Audit trail protection</strong><span>Activity entries are retained securely in SQLite database and cannot be modified.</span></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Date & Time</th><th>User</th><th>Action</th><th>Record</th><th>Description</th></tr></thead><tbody>{activityList.map(a => <tr key={a.id}><td>{a.timestamp}</td><td><strong>{a.user_name}</strong></td><td><span className="activity-badge">{a.action}</span></td><td><strong className="entry-no">{a.record_no}</strong></td><td>{a.description}</td></tr>)}</tbody></table></div><div className="pagination"><span>Showing 1–{activityList.length} of {activityList.length} activities</span><div><button disabled>Previous</button><button className="current">1</button><button disabled>Next</button></div></div></section></>;
}

function Settings({ currentUser }: { currentUser: UserItem | null }) {
  return <><PageIntro title="Settings" subtitle="Manage your account, security and application preferences." /><div className="settings-layout"><nav className="settings-nav"><button className="active"><Icon name="users" />Account</button><button><Icon name="bell" />Notifications</button><button><Icon name="lock" />Security</button><div><Icon name="shield" /><p><strong>Secure session</strong><span>Database: SQLite (live)</span></p></div></nav><main className="settings-main panel"><div className="settings-heading"><h2>Account Information</h2><p>Update your employee profile details.</p></div><div className="profile-row"><div className="large-avatar">{currentUser ? currentUser.name.split(" ").map(n=>n[0]).join("") : "JM"}</div><div><strong>{currentUser?.name || "Jane Mwangi"}</strong><span>{currentUser?.role || "Administrator"} · {currentUser?.employee_id || "ADM-001"}</span></div><Button kind="secondary">Change Photo</Button></div><div className="settings-form"><Field label="Full Name"><input defaultValue={currentUser?.name || "Jane Mwangi"} /></Field><Field label="Employee ID"><input defaultValue={currentUser?.employee_id || "ADM-001"} readOnly /></Field><Field label="Email Address" wide><input defaultValue={currentUser?.email || "jane.mwangi@county.gov"} /></Field></div><div className="settings-heading divided"><h2>Session & Security</h2><p>Keep your account and access secure.</p></div><div className="security-setting"><div><Icon name="lock" /><p><strong>Password</strong><span>Last changed 42 days ago</span></p></div><Button kind="secondary">Change Password</Button></div><div className="security-setting"><div><Icon name="activity" /><p><strong>Automatic session timeout</strong><span>Sign out after 30 minutes of inactivity</span></p></div><select defaultValue="30 minutes"><option>15 minutes</option><option>30 minutes</option><option>60 minutes</option></select></div><div className="settings-save"><Button onClick={() => alert("Settings saved successfully")}>Save Settings</Button></div></main></div></>;
}

function ConfirmModal({ mode, close, save, entryNo }: { mode: "add" | "edit"; close: () => void; save: () => void; entryNo: string }) {
  return <div className="modal-backdrop"><div className="modal"><div className="modal-icon"><Icon name="shield" size={24} /></div><h2>{mode === "add" ? "Save adoption record?" : "Save changes to this record?"}</h2><p>{mode === "add" ? "Please confirm that the information entered is accurate before saving this record." : "Your changes will be saved to the database and added to the secure activity log."}</p><div className="modal-summary"><span>Entry Number<strong>#{entryNo}</strong></span><span>Record Status<strong>Registered</strong></span></div><div className="modal-actions"><Button kind="ghost" onClick={close}>Cancel</Button><Button icon="check" onClick={save}>{mode === "add" ? "Confirm & Save" : "Save Changes"}</Button></div></div></div>;
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [page, setPage] = useState<Page>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [toast, setToast] = useState("");

  const [records, setRecords] = useState<RecordItem[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<RecordItem | null>(null);
  const [kpiStats, setKpiStats] = useState<KPIStats | null>(null);
  const [userList, setUserList] = useState<UserItem[]>([]);
  const [activityList, setActivityList] = useState<ActivityItem[]>([]);
  const [currentUser, setCurrentUser] = useState<UserItem | null>(null);
  const [pendingFormData, setPendingFormData] = useState<Partial<RecordItem> | null>(null);

  const loadData = async () => {
    try {
      const [recs, kpis, users, acts] = await Promise.all([
        api.getRecords(),
        api.getKPIs(),
        api.getUsers(),
        api.getActivity()
      ]);
      setRecords(recs);
      if (recs.length > 0 && !selectedRecord) {
        setSelectedRecord(recs[0]);
      }
      setKpiStats(kpis);
      setUserList(users);
      setActivityList(acts);
    } catch (err) {
      console.error("Error loading data from API:", err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectRecord = (r: RecordItem) => {
    setSelectedRecord(r);
  };

  const handleArchive = async (no: string) => {
    if (confirm(`Are you sure you want to archive record #${no}?`)) {
      try {
        await api.archiveRecord(no, currentUser?.name || "Jane Mwangi");
        await loadData();
        setToast(`Record #${no} archived successfully.`);
        window.setTimeout(() => setToast(""), 4200);
      } catch (err: any) {
        alert(err.message || "Failed to archive record");
      }
    }
  };

  const nextEntryNo = useMemo(() => {
    if (!records.length) return "001249";
    const maxNum = Math.max(...records.map(r => parseInt(r.no, 10) || 0));
    return (maxNum + 1).toString().padStart(6, "0");
  }, [records]);

  const saveConfirmed = async () => {
    if (!pendingFormData) return;
    const mode = modal;
    setModal(null);
    try {
      let saved: RecordItem;
      if (mode === "add") {
        saved = await api.createRecord(pendingFormData);
      } else {
        saved = await api.updateRecord(selectedRecord?.no || pendingFormData.no!, pendingFormData);
      }
      await loadData();
      setSelectedRecord(saved);
      setPage("details");
      setToast(mode === "add" ? "Adoption record saved successfully." : "Record updated successfully.");
      window.setTimeout(() => setToast(""), 4200);
    } catch (err: any) {
      alert(err.message || "Failed to save record");
    } finally {
      setPendingFormData(null);
    }
  };

  const content = useMemo(() => {
    switch (page) {
      case "dashboard":
        return <Dashboard go={setPage} records={records} onSelectRecord={(r) => { handleSelectRecord(r); setPage("details"); }} kpiStats={kpiStats} activityList={activityList} />;
      case "records":
        return <RecordsPage go={setPage} records={records} onSelectRecord={(r) => { handleSelectRecord(r); setPage("details"); }} onArchive={handleArchive} />;
      case "search":
        return <SearchPage go={setPage} records={records} onSelectRecord={(r) => { handleSelectRecord(r); setPage("details"); }} />;
      case "add":
        return <RecordForm mode="add" go={setPage} initialData={null} nextEntryNo={nextEntryNo} confirm={(data) => { setPendingFormData(data); setModal("add"); }} />;
      case "details":
        return <Details go={setPage} record={selectedRecord} />;
      case "edit":
        return <RecordForm mode="edit" go={setPage} initialData={selectedRecord} nextEntryNo={nextEntryNo} confirm={(data) => { setPendingFormData(data); setModal("edit"); }} />;
      case "print":
        return <PrintRecord go={setPage} record={selectedRecord} />;
      case "reports":
        return <Reports />;
      case "users":
        return <Users userList={userList} />;
      case "activity":
        return <ActivityLog activityList={activityList} />;
      case "settings":
        return <Settings currentUser={currentUser} />;
    }
  }, [page, records, selectedRecord, kpiStats, userList, activityList, currentUser, nextEntryNo]);

  if (!loggedIn) {
    return <Login onLogin={(user) => { setCurrentUser(user); setLoggedIn(true); loadData(); }} />;
  }

  return <div className="app-shell">
    <Sidebar page={page} go={setPage} logout={() => { setLoggedIn(false); setPage("dashboard"); }} open={menuOpen} close={() => setMenuOpen(false)} currentUser={currentUser} />
    <div className="app-main">
      {page !== "print" && <Header page={page} go={setPage} toggleMenu={() => setMenuOpen(!menuOpen)} records={records} onSelectRecord={handleSelectRecord} currentUser={currentUser} />}
      <main className={page === "print" ? "print-page" : "page-content"}>{content}</main>
      {page !== "print" && <div className="confidential-footer"><Icon name="lock" size={13} /> Confidential Government Records · Authorized personnel only <span>Session timeout: 28:42</span></div>}
    </div>
    {modal && <ConfirmModal mode={modal} close={() => { setModal(null); setPendingFormData(null); }} save={saveConfirmed} entryNo={pendingFormData?.no || selectedRecord?.no || nextEntryNo} />}
    {toast && <div className="toast"><div><Icon name="check" /></div><p><strong>{toast}</strong><span>Database synchronized.</span></p><button onClick={() => setPage("details")}>View Record</button></div>}
  </div>;
}
