import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, onSessionExpired, type RecordItem, type UserItem, type ActivityItem, type KPIStats, type AuditVerificationResult, type BackupItem } from "./api.ts";
import { useGreeting } from "./greeting.ts";
import { useSessionTimeout, isSessionInactive, recordUserActivity } from "./sessionTimeout.ts";

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
  | "menu"
  | "collapse-left"
  | "collapse-right"
  | "panel-left-close"
  | "panel-left-open"
  | "clock";

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    records: <><path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M7 8h10M7 12h10M7 16h7" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    activity: <><path d="M3 12h4l3-8 4 16 3-8h4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.16.37.38.7.67.97.3.27.69.42 1.09.43H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z" /></>,
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
    "panel-left-close": <><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /><path d="m16 15-3-3 3-3" /></>,
    "panel-left-open": <><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /><path d="m14 9 3 3-3 3" /></>,
    "collapse-left": <><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /><path d="m16 15-3-3 3-3" /></>,
    "collapse-right": <><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /><path d="m14 9 3 3-3 3" /></>,
    clock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
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
  return (
    <div className={`logo-lockup ${light ? "light" : ""}`}>
      <div className="seal" aria-hidden="true"><Icon name="shield" size={22} /></div>
      <div className="logo-text"><strong>AODS</strong><span>Adoption Office Database System</span></div>
    </div>
  );
}

function Login({
  onLogin,
  sessionExpiredMessage,
  onClearExpiredMessage
}: {
  onLogin: (user: UserItem) => void;
  sessionExpiredMessage?: string;
  onClearExpiredMessage?: () => void;
}) {
  const [empId, setEmpId] = useState("ADM-001");
  const [password, setPassword] = useState("countyrecords");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    if (onClearExpiredMessage) onClearExpiredMessage();
    try {
      const user = await api.login(empId, password);
      onLogin(user);
    } catch (err: any) {
      setError(err.message || "Invalid employee credentials.");
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
        {sessionExpiredMessage && (
          <div
            style={{
              color: "#92400e",
              background: "#fef3c7",
              padding: "11px 14px",
              borderRadius: "6px",
              fontSize: "12.5px",
              marginBottom: "16px",
              border: "1px solid #fde68a",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontWeight: 500
            }}
            role="alert"
          >
            <Icon name="clock" size={17} />
            <span>{sessionExpiredMessage}</span>
          </div>
        )}
        {error && <div style={{ color: "#bb3d43", background: "#fff0f0", padding: "10px 12px", borderRadius: "6px", fontSize: "12px", marginBottom: "16px", border: "1px solid #f8d7da" }}>{error}</div>}
        <Field label="Employee ID / Username" required>
          <input value={empId} onChange={e => setEmpId(e.target.value)} aria-label="Employee ID or username" required />
        </Field>
        <Field label="Password" required>
          <div className="input-with-action">
            <input type={show ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} aria-label="Password" required />
            <button type="button" onClick={() => setShow(!show)} aria-label="Show password"><Icon name="eye" /></button>
          </div>
        </Field>
        <div className="form-meta"><label className="check"><input type="checkbox" defaultChecked /> Remember session</label><span className="text-muted" style={{ fontSize: "11px", color: "var(--subtle)" }}>Encrypted PBKDF2 Token</span></div>
        <Button type="submit" disabled={loading}>{loading ? "Verifying..." : "Sign In"} <Icon name="arrow" size={16} /></Button>
        <div className="secure-note"><Icon name="lock" size={16} /><span><strong>Authorized personnel only.</strong> All system access is cryptographically audited and subject to county compliance.</span></div>
      </form>
      <footer>County Adoption Office <span>•</span> Adoption Office Database System</footer>
    </section>
  </main>;
}

function Sidebar({
  page,
  go,
  logout,
  open,
  close,
  currentUser,
  collapsed,
  onToggleCollapse
}: {
  page: Page;
  go: (p: Page) => void;
  logout: () => void;
  open: boolean;
  close: () => void;
  currentUser: UserItem | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const isAdmin = currentUser?.role === "Administrator";

  const nav = [
    { group: "Overview", items: [{ id: "dashboard" as Page, label: "Dashboard", icon: "grid" as IconName }] },
    { group: "Records", items: [
      { id: "records" as Page, label: "All Adoption Records", icon: "records" as IconName },
      { id: "search" as Page, label: "Search Records", icon: "search" as IconName },
      { id: "add" as Page, label: "Add New Record", icon: "plus" as IconName },
    ]},
    { group: "Insights", items: [{ id: "reports" as Page, label: "Reports", icon: "chart" as IconName }] },
    ...(isAdmin ? [{
      group: "Administration", items: [
        { id: "users" as Page, label: "User Management", icon: "users" as IconName },
        { id: "activity" as Page, label: "Activity Log", icon: "activity" as IconName },
      ]
    }] : []),
  ];

  const navigate = (p: Page) => { go(p); close(); };
  const initials = currentUser ? currentUser.name.split(" ").map(n => n[0]).join("") : "JM";

  return <>
    {open && <button className="sidebar-scrim" onClick={close} aria-label="Close navigation" />}
    <aside id="app-sidebar" className={`sidebar ${open ? "open" : ""} ${collapsed ? "collapsed" : ""}`} aria-label="Main Navigation">
      <div className="sidebar-logo">
        <Logo light />
        <button
          type="button"
          className="collapse-toggle-btn"
          onClick={onToggleCollapse}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          aria-controls="app-sidebar"
        >
          <Icon name={collapsed ? "panel-left-open" : "panel-left-close"} size={16} />
          <span className="sidebar-tooltip" role="tooltip">{collapsed ? "Expand sidebar" : "Collapse sidebar"}</span>
        </button>
      </div>
      <nav aria-label="Sidebar Navigation">
        {nav.map(section => (
          <div className="nav-section" key={section.group}>
            <div className="nav-label">{section.group}</div>
            {section.items.map(item => (
              <button
                type="button"
                key={item.id}
                className={`nav-item ${page === item.id ? "active" : ""}`}
                onClick={() => navigate(item.id)}
                aria-current={page === item.id ? "page" : undefined}
                aria-label={item.label}
              >
                <span className="nav-item-icon" aria-hidden="true">
                  <Icon name={item.icon} />
                </span>
                <span className="nav-item-label">{item.label}</span>
                {page === item.id && <span className="active-mark" aria-hidden="true" />}
                <span className="sidebar-tooltip" role="tooltip">{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <button
          type="button"
          className={`nav-item ${page === "settings" ? "active" : ""}`}
          onClick={() => navigate("settings")}
          aria-current={page === "settings" ? "page" : undefined}
          aria-label="Settings"
        >
          <span className="nav-item-icon" aria-hidden="true">
            <Icon name="settings" />
          </span>
          <span className="nav-item-label">Settings</span>
          {page === "settings" && <span className="active-mark" aria-hidden="true" />}
          <span className="sidebar-tooltip" role="tooltip">Settings</span>
        </button>
        <div className="user-rail">
          <div className="avatar" title={`${currentUser?.name || "Jane Mwangi"} (${currentUser?.role || "Administrator"})`} aria-hidden="true">{initials}</div>
          <div className="user-details">
            <strong>{currentUser?.name || "Jane Mwangi"}</strong>
            <span>{currentUser?.role || "Administrator"}</span>
          </div>
          <button type="button" className="logout-btn" onClick={logout} title="Log out" aria-label="Log out">
            <Icon name="logout" />
            <span className="sidebar-tooltip" role="tooltip">Log Out</span>
          </button>
        </div>
      </div>
    </aside>
  </>;
}

function Header({
  page,
  go,
  toggleMenu,
  records,
  onSelectRecord,
  currentUser,
  onLogout
}: {
  page: Page;
  go: (p: Page) => void;
  toggleMenu: () => void;
  records: RecordItem[];
  onSelectRecord: (r: RecordItem) => void;
  currentUser: UserItem | null;
  onLogout: () => void;
}) {
  const [query, setQuery] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(2);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const showResults = query.trim().length > 1;
  const initials = currentUser ? currentUser.name.split(" ").map(n => n[0]).join("") : "JM";

  // Global keyboard shortcuts: Ctrl+K or Cmd+K to focus search; Escape to close dropdowns
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "Escape") {
        setNotificationsOpen(false);
        setProfileOpen(false);
        setQuery("");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".header-dropdown-container") && !target.closest(".global-search")) {
        setNotificationsOpen(false);
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  return <header className="topbar">
    <div className="header-title">
      <button className="menu-button" onClick={toggleMenu} aria-label="Open menu"><Icon name="menu" /></button>
      <div><span>County Adoption Office</span><strong>{pageTitles[page]}</strong></div>
    </div>
    <div className="global-search">
      <Icon name="search" size={17} />
      <input
        ref={searchInputRef}
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search records (Ctrl+K)..."
        aria-label="Global search"
      />
      <kbd title="Press Ctrl+K or ⌘K to search">⌘ K</kbd>
      {showResults && <div className="search-popover">
        <div className="popover-label">Records matching “{query}”</div>
        {records.filter(r => r.name.toLowerCase().includes(query.toLowerCase()) || r.no.includes(query)).slice(0, 3).map(r => (
          <button key={r.no} onClick={() => { setQuery(""); onSelectRecord(r); go("details"); }}>
            <div className="result-icon"><Icon name="records" /></div>
            <div><strong>{r.name}</strong><span>Entry #{r.no} · Adoption: {r.adoption}</span></div>
            <Icon name="chevron" size={16} />
          </button>
        ))}
        {!records.some(r => r.name.toLowerCase().includes(query.toLowerCase()) || r.no.includes(query)) && (
          <div className="no-mini-results">No matching records. Press Enter for advanced search.</div>
        )}
        <button className="all-results" onClick={() => { setQuery(""); go("search"); }}>View all search results <Icon name="arrow" size={15} /></button>
      </div>}
    </div>
    <div className="header-actions">
      {/* Notifications Dropdown */}
      <div className="header-dropdown-container">
        <button
          className="notification"
          onClick={() => { setNotificationsOpen(!notificationsOpen); setProfileOpen(false); }}
          aria-label="System notifications"
          title="System notifications"
        >
          <Icon name="bell" />
          {unreadNotifications > 0 && <span className="unread-dot" />}
        </button>
        {notificationsOpen && (
          <div className="header-dropdown-menu notification-dropdown">
            <div className="notification-header">
              <h3>System Notifications {unreadNotifications > 0 ? `(${unreadNotifications} unread)` : ""}</h3>
              {unreadNotifications > 0 && (
                <button onClick={() => setUnreadNotifications(0)}>Mark all read</button>
              )}
            </div>
            <div className="notification-list">
              <div className="notification-item" onClick={() => { setNotificationsOpen(false); go("activity"); }}>
                <div className="notification-icon-wrap"><Icon name="shield" size={15} /></div>
                <div>
                  <strong>Cryptographic Audit Verified</strong>
                  <p>SHA-256 tamper-evident hash chaining passed without discrepancies.</p>
                  <time>System active</time>
                </div>
              </div>
              <div className="notification-item" onClick={() => { setNotificationsOpen(false); go("settings"); }}>
                <div className="notification-icon-wrap"><Icon name="records" size={15} /></div>
                <div>
                  <strong>SQLite Live Database Active</strong>
                  <p>Continuous WAL journaling and point-in-time snapshot service online.</p>
                  <time>Live</time>
                </div>
              </div>
              <div className="notification-item" onClick={() => { setNotificationsOpen(false); go("settings"); }}>
                <div className="notification-icon-wrap"><Icon name="lock" size={15} /></div>
                <div>
                  <strong>Authentication Guard Active</strong>
                  <p>Encrypted session active with automatic 8-hour timeout policy.</p>
                  <time>Policy enforced</time>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* User Profile Dropdown */}
      <div className="header-dropdown-container">
        <button
          className="header-user-btn"
          onClick={() => { setProfileOpen(!profileOpen); setNotificationsOpen(false); }}
          aria-label="User profile options"
        >
          <div className="avatar">{initials}</div>
          <div><strong>{currentUser?.name || "Jane Mwangi"}</strong><span>{currentUser?.role || "Administrator"}</span></div>
          <Icon name="chevron" size={14} />
        </button>
        {profileOpen && (
          <div className="header-dropdown-menu">
            <div className="dropdown-header">
              <strong>{currentUser?.name || "Jane Mwangi"}</strong>
              <span>{currentUser?.employee_id || "ADM-001"} · {currentUser?.role || "Administrator"}</span>
            </div>
            <div className="dropdown-body">
              <button className="dropdown-item" onClick={() => { setProfileOpen(false); go("settings"); }}>
                <Icon name="settings" size={15} /> Account Settings
              </button>
              {currentUser?.role === "Administrator" && (
                <button className="dropdown-item" onClick={() => { setProfileOpen(false); go("activity"); }}>
                  <Icon name="activity" size={15} /> Activity Log
                </button>
              )}
              <hr />
              <button className="dropdown-item danger-item" onClick={() => { setProfileOpen(false); onLogout(); }}>
                <Icon name="logout" size={15} /> Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  </header>;
}

function KpiCard({ label, value, trend, icon }: { label: string; value: string; trend: string; icon: IconName }) {
  return <div className="kpi-card"><div className="kpi-top"><div className="kpi-icon"><Icon name={icon} /></div><span className="positive">{trend}</span></div><strong className="kpi-value">{value}</strong><span>{label}</span></div>;
}

function Dashboard({
  go,
  records,
  onSelectRecord,
  kpiStats,
  activityList,
  onPrintRecord,
  onToast,
  currentUser
}: {
  go: (p: Page) => void;
  records: RecordItem[];
  onSelectRecord: (r: RecordItem) => void;
  kpiStats: KPIStats | null;
  activityList: ActivityItem[];
  onPrintRecord?: (r: RecordItem) => void;
  onToast?: (msg: string) => void;
  currentUser?: UserItem | null;
}) {
  const greeting = useGreeting();
  const displayName = currentUser?.name || "Administrator";
  const actions = [
    { title: "Add New Record", desc: "Enter a new adoption record", icon: "plus" as IconName, page: "add" as Page },
    { title: "Search Records", desc: "Find an existing child record", icon: "search" as IconName, page: "search" as Page },
    { title: "View All Records", desc: "Browse the complete register", icon: "records" as IconName, page: "records" as Page },
    { title: "Reports", desc: "View records statistics", icon: "chart" as IconName, page: "reports" as Page },
  ];

  return <div>
    <div className="welcome-row"><div><div className="eyebrow">Verified & Secure Government Register</div><h1>{greeting}, {displayName}</h1><p>Manage and retrieve county adoption records securely.</p></div><div className="confidential-chip"><Icon name="shield" size={16} /> Confidential Government Records</div></div>
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
        <RecordTable
          data={records.slice(0, 4)}
          compact
          onOpen={onSelectRecord}
          onArchive={() => {}}
          onEdit={(r) => { onSelectRecord(r); go("edit"); }}
          onPrint={onPrintRecord}
          onToast={onToast}
        />
      </section>
      <section className="panel activity-panel">
        <div className="panel-head"><div><h2>Recent Activity</h2><p>Latest verified audit trail events</p></div></div>
        <div className="activity-list">
          {activityList.slice(0, 4).map((item) => <div className="activity-item" key={item.id}><div className="activity-icon"><Icon name={item.action.includes("Create") ? "plus" : item.action.includes("Update") ? "edit" : item.action.includes("Login") ? "lock" : "eye"} size={15} /></div><div><strong>{item.description}</strong><span>{item.record_no} · {item.user_name}</span></div><time>{item.timestamp.split(",")[1] || item.timestamp}</time></div>)}
        </div>
        <button className="panel-link" onClick={() => go("activity")}>View complete activity log</button>
      </section>
    </div>
  </div>;
}

function RecordTable({
  data,
  compact = false,
  onOpen,
  onEdit,
  onPrint,
  onArchive,
  onToast
}: {
  data: RecordItem[];
  compact?: boolean;
  onOpen: (r: RecordItem) => void;
  onEdit?: (r: RecordItem) => void;
  onPrint?: (r: RecordItem) => void;
  onArchive?: (no: string) => void;
  onToast?: (msg: string) => void;
}) {
  const [menu, setMenu] = useState<string | null>(null);

  // Close row menu on click outside or Escape
  useEffect(() => {
    const handleClose = (e: MouseEvent | KeyboardEvent) => {
      if ("key" in e && (e as KeyboardEvent).key === "Escape") {
        setMenu(null);
      } else if ("target" in e && !(e.target as HTMLElement).closest(".action-cell")) {
        setMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClose);
    document.addEventListener("keydown", handleClose);
    return () => {
      document.removeEventListener("mousedown", handleClose);
      document.removeEventListener("keydown", handleClose);
    };
  }, []);

  return <div className="table-wrap"><table className={`data-table ${compact ? "compact" : ""}`}><thead><tr><th>Entry No. <span>↕</span></th><th>Child Name <span>↕</span></th><th>Date of Birth</th>{!compact && <th>Country</th>}<th>Sex</th><th>Adopters</th><th>Date of Adoption</th>{!compact && <th>Court</th>}<th>Date Entered</th><th aria-label="Actions" /></tr></thead><tbody>{data.map(r => <tr key={r.no} onClick={() => onOpen(r)}><td><strong className="entry-no">#{r.no}</strong></td><td><strong>{r.name}</strong></td><td>{r.dob}</td>{!compact && <td>{r.country}</td>}<td><span className={`sex-dot ${r.sex.toLowerCase()}`} />{r.sex}</td><td className="truncate">{r.adopters}</td><td>{r.adoption}</td>{!compact && <td><span className="court-tag">{r.court}</span></td>}<td>{r.entered}</td><td className="action-cell"><button onClick={(e) => { e.stopPropagation(); setMenu(menu === r.no ? null : r.no); }} aria-label="Record actions"><Icon name="more" /></button>{menu === r.no && <div className="row-menu" onClick={e => e.stopPropagation()}><button onClick={() => { setMenu(null); onOpen(r); }}><Icon name="eye" /> View Record</button><button onClick={() => { setMenu(null); onEdit?.(r); }}><Icon name="edit" /> Edit Record</button><button onClick={() => { setMenu(null); if (onPrint) onPrint(r); else onOpen(r); }}><Icon name="print" /> Print Record</button><button onClick={() => { navigator.clipboard?.writeText(r.no); setMenu(null); onToast?.(`Entry #${r.no} copied to clipboard`); }}><Icon name="copy" /> Copy Entry Number</button><hr /><button className="danger-item" onClick={() => { setMenu(null); onArchive?.(r.no); }}><Icon name="archive" /> Archive Record</button></div>}</td></tr>)}</tbody></table></div>;
}

function PageIntro({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return <div className="page-intro"><div><div className="breadcrumb">Home <span>/</span> {title}</div><h1>{title}</h1><p>{subtitle}</p></div>{children && <div className="page-actions">{children}</div>}</div>;
}

function RecordsPage({
  go,
  records,
  onSelectRecord,
  onArchive,
  onPrintRecord,
  onToast
}: {
  go: (p: Page) => void;
  records: RecordItem[];
  onSelectRecord: (r: RecordItem) => void;
  onArchive: (no: string) => void;
  onPrintRecord?: (r: RecordItem) => void;
  onToast?: (msg: string) => void;
}) {
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
    <div className="table-meta"><span><strong>{filtered.length || "No"}</strong> records found</span><span>SQLite persistent database</span></div>
    {filtered.length ? (
      <RecordTable
        data={filtered}
        onOpen={onSelectRecord}
        onEdit={(r) => { onSelectRecord(r); go("edit"); }}
        onPrint={onPrintRecord}
        onArchive={onArchive}
        onToast={onToast}
      />
    ) : (
      <EmptyState onAction={clearFilters} />
    )}
    <div className="pagination"><span>Showing 1–{filtered.length} of {records.length} records</span><div><button disabled>Previous</button><button className="current">1</button><button disabled>Next</button></div></div></section></>;
}

function EmptyState({ onAction }: { onAction: () => void }) {
  return <div className="empty-state"><div><Icon name="search" size={28} /></div><h3>No adoption records found</h3><p>Try changing your search terms or clearing one or more filters.</p><Button kind="secondary" onClick={onAction}>Clear Search</Button></div>;
}

function SearchPage({
  go,
  records,
  onSelectRecord,
  onPrintRecord,
  onArchive,
  onToast
}: {
  go: (p: Page) => void;
  records: RecordItem[];
  onSelectRecord: (r: RecordItem) => void;
  onPrintRecord?: (r: RecordItem) => void;
  onArchive?: (no: string) => void;
  onToast?: (msg: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  // Advanced filters state
  const [advEntryNo, setAdvEntryNo] = useState("");
  const [advChildName, setAdvChildName] = useState("");
  const [advDob, setAdvDob] = useState("");
  const [advCountry, setAdvCountry] = useState("");
  const [advSex, setAdvSex] = useState("");
  const [advAdopter, setAdvAdopter] = useState("");
  const [advAdoptionDate, setAdvAdoptionDate] = useState("");
  const [advCourt, setAdvCourt] = useState("");

  const handleClear = () => {
    setQuery("");
    setAdvEntryNo("");
    setAdvChildName("");
    setAdvDob("");
    setAdvCountry("");
    setAdvSex("");
    setAdvAdopter("");
    setAdvAdoptionDate("");
    setAdvCourt("");
    setSearched(false);
  };

  const results = useMemo(() => {
    return records.filter(r => {
      const q = query.trim().toLowerCase();
      const matchQuery = !q || `${r.no} ${r.name} ${r.adopters} ${r.court} ${r.country}`.toLowerCase().includes(q);
      const matchEntry = !advEntryNo.trim() || r.no.includes(advEntryNo.trim());
      const matchName = !advChildName.trim() || r.name.toLowerCase().includes(advChildName.trim().toLowerCase());
      const matchDob = !advDob || r.dob.includes(advDob);
      const matchCountry = !advCountry || r.country === advCountry;
      const matchSex = !advSex || r.sex === advSex;
      const matchAdopter = !advAdopter.trim() || r.adopters.toLowerCase().includes(advAdopter.trim().toLowerCase());
      const matchAdoption = !advAdoptionDate || r.adoption.includes(advAdoptionDate);
      const matchCourt = !advCourt || r.court === advCourt;
      return matchQuery && matchEntry && matchName && matchDob && matchCountry && matchSex && matchAdopter && matchAdoption && matchCourt;
    });
  }, [records, query, advEntryNo, advChildName, advDob, advCountry, advSex, advAdopter, advAdoptionDate, advCourt]);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSearched(true);
  };

  return <><PageIntro title="Search Records" subtitle="Find an adoption record quickly using any known detail." />
    <section className="search-hero panel">
      <div className="search-title">
        <div className="search-emblem"><Icon name="search" /></div>
        <div><h2>Search the adoption register</h2><p>Search by child name, entry number, adopter name, court or other record details.</p></div>
      </div>
      <form onSubmit={handleSearchSubmit}>
        <div className="hero-search">
          <Icon name="search" size={20} />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setSearched(false); }}
            placeholder="Search adoption records..."
            autoFocus
          />
          <Button type="submit">Search Records</Button>
        </div>
      </form>
      <button className="advanced-toggle" onClick={() => setAdvanced(!advanced)}>
        <Icon name="filter" size={16} /> Advanced Search <span>{advanced ? "−" : "+"}</span>
      </button>
      {advanced && (
        <div className="advanced-grid">
          <Field label="Entry Number">
            <input placeholder="e.g. 001248" value={advEntryNo} onChange={e => { setAdvEntryNo(e.target.value); setSearched(true); }} />
          </Field>
          <Field label="Child Name">
            <input placeholder="Enter full or partial name" value={advChildName} onChange={e => { setAdvChildName(e.target.value); setSearched(true); }} />
          </Field>
          <Field label="Date of Birth">
            <input type="date" value={advDob} onChange={e => { setAdvDob(e.target.value); setSearched(true); }} />
          </Field>
          <Field label="Country of Birth">
            <select value={advCountry} onChange={e => { setAdvCountry(e.target.value); setSearched(true); }}>
              <option value="">Select country</option>
              <option value="Kenya">Kenya</option>
              <option value="Uganda">Uganda</option>
              <option value="Tanzania">Tanzania</option>
            </select>
          </Field>
          <Field label="Sex">
            <select value={advSex} onChange={e => { setAdvSex(e.target.value); setSearched(true); }}>
              <option value="">Any</option>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
            </select>
          </Field>
          <Field label="Adopter Name">
            <input placeholder="Enter adopter name" value={advAdopter} onChange={e => { setAdvAdopter(e.target.value); setSearched(true); }} />
          </Field>
          <Field label="Date of Adoption">
            <input type="date" value={advAdoptionDate} onChange={e => { setAdvAdoptionDate(e.target.value); setSearched(true); }} />
          </Field>
          <Field label="Court">
            <select value={advCourt} onChange={e => { setAdvCourt(e.target.value); setSearched(true); }}>
              <option value="">Any court</option>
              <option value="High Court">High Court</option>
              <option value="Children’s Court">Children’s Court</option>
            </select>
          </Field>
        </div>
      )}
    </section>
    {!searched && (
      <div className="search-prompt">
        <div><Icon name="records" size={30} /></div>
        <h3>Begin your search</h3>
        <p>Enter a name, entry number, or other record detail above. You can combine filters for more precise results.</p>
      </div>
    )}
    {searched && (
      <section className="panel search-results">
        <div className="panel-head">
          <div><h2>Search Results</h2><p>{results.length} matching records found</p></div>
          <Button kind="ghost" onClick={handleClear}>Clear Search</Button>
        </div>
        {results.length ? (
          <RecordTable
            data={results}
            onOpen={onSelectRecord}
            onEdit={(r) => { onSelectRecord(r); go("edit"); }}
            onPrint={onPrintRecord}
            onArchive={onArchive}
            onToast={onToast}
          />
        ) : (
          <EmptyState onAction={handleClear} />
        )}
      </section>
    )}
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
    </form><aside className="form-help"><div className="help-card"><Icon name="shield" /><h3>Confidential record</h3><p>Verify all information against the official adoption order before saving.</p></div><div className="progress-card"><strong>Record sections</strong>{["Child Information", "Adopter Information", "Adoption / Court", "Registry Information"].map((s, i) => <div key={s}><span>{i + 1}</span>{s}</div>)}</div><div className="session-note"><Icon name="lock" size={15} /> Your session is authenticated with token verification.</div></aside></div></>;
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

function Reports({ onToast }: { onToast?: (msg: string) => void }) {
  const [year, setYear] = useState("2026");
  const [sex, setSex] = useState("All children");
  const [generated, setGenerated] = useState(false);
  const [annualSex, setAnnualSex] = useState<{ year: string; female: number; male: number }[]>([]);

  useEffect(() => {
    api.getAnnualSex().then(data => setAnnualSex(data)).catch(() => {});
  }, []);

  const selected = annualSex.find(item => item.year === year) || { year: "2026", female: 151, male: 143 };
  const reportTotal = sex === "Female" ? selected.female : sex === "Male" ? selected.male : selected.female + selected.male;

  const handleExportCSV = () => {
    const header = "Year,Sex Category,Female Records,Male Records,Category Total\n";
    const femaleVal = sex === "Male" ? 0 : selected.female;
    const maleVal = sex === "Female" ? 0 : selected.male;
    const totalVal = sex === "Female" ? selected.female : sex === "Male" ? selected.male : (selected.female + selected.male);
    const row = `${selected.year},"${sex}",${femaleVal},${maleVal},${totalVal}\n`;
    
    const historicalHeader = "\nHistorical Annual Breakdown\nYear,Female,Male,Total Records\n";
    const historicalRows = annualSex.map(a => `${a.year},${a.female},${a.male},${a.female + a.male}`).join("\n");

    const csvData = header + row + historicalHeader + historicalRows;
    const blob = new Blob([csvData], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `AODS_Adoption_Report_${year}_${sex.replace(/\s+/g, "_")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onToast?.(`Downloaded adoption report CSV for ${year}`);
  };

  const handleExportAllReports = () => {
    const header = "Year,Female,Male,Total Records\n";
    const rows = annualSex.map(a => `${a.year},${a.female},${a.male},${a.female + a.male}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `AODS_Annual_Adoption_Statistics_${new Date().getFullYear()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onToast?.("Downloaded complete annual statistics CSV");
  };

  return <><PageIntro title="Reports" subtitle="Generate annual reports and review records held in the county adoption register.">
    <Button kind="secondary" icon="download" onClick={handleExportAllReports}>Export Report (CSV)</Button>
    <Button icon="print" onClick={() => window.print()}>Print</Button>
  </PageIntro>
    <section className="panel report-generator">
      <div className="report-generator-copy"><div className="report-generator-icon"><Icon name="chart" /></div><div><h2>Generate Annual Sex Report</h2><p>Create a report for a selected year, filtered by the sex of the child.</p></div></div>
      <div className="report-controls">
        <label><span>Report Year</span><select value={year} onChange={e => { setYear(e.target.value); setGenerated(false); }}>{annualSex.map(item => <option key={item.year}>{item.year}</option>)}</select></label>
        <label><span>Sex of Child</span><select value={sex} onChange={e => { setSex(e.target.value); setGenerated(false); }}><option>All children</option><option>Female</option><option>Male</option></select></label>
        <Button icon="chart" onClick={() => setGenerated(true)}>Generate Report</Button>
      </div>
      {generated && <div className="generated-report">
        <div><Icon name="check" /><span>Report generated</span></div>
        <p><strong>{reportTotal}</strong> {sex.toLowerCase()} adoption records were entered in <strong>{year}</strong>.</p>
        <div>
          <Button kind="secondary" icon="download" onClick={handleExportCSV}>Export CSV</Button>
          <Button kind="secondary" icon="print" onClick={() => window.print()}>Print Report</Button>
        </div>
      </div>}
    </section>
    <div className="report-kpis"><KpiCard label="Total Adoption Records" value="1,248" trend="+8.2% this year" icon="records" /><KpiCard label="Records Added This Year" value="294" trend="24% of total" icon="calendar" /><KpiCard label="Records Added This Month" value="36" trend="+12 vs last month" icon="plus" /><KpiCard label="Female / Male" value="51% / 49%" trend="Balanced distribution" icon="users" /></div>
    <div className="report-grid">
      <section className="panel chart-card wide-chart"><div className="panel-head"><div><h2>Annual Records by Sex of Child</h2><p>Female and male adoption records entered each year</p></div><div className="sex-chart-legend"><span><i />Female</span><span><i />Male</span></div></div><div className="grouped-chart">{annualSex.map(item => <div className="year-group" key={item.year}><div className="bars"><i className="female-bar" style={{height: `${item.female / 2}px`}}><span>{item.female}</span></i><i className="male-bar" style={{height: `${item.male / 2}px`}}><span>{item.male}</span></i></div><small>{item.year}</small></div>)}</div></section>
      <section className="panel chart-card"><div className="panel-head"><div><h2>Records by Country</h2><p>Country of birth</p></div></div>{[["Kenya","78%",78],["Uganda","9%",9],["Tanzania","7%",7],["Other","6%",6]].map(([l,v,w]) => <div className="metric-bar" key={l as string}><div><span>{l}</span><strong>{v}</strong></div><i><b style={{width: `${w}%`}} /></i></div>)}</section><section className="panel chart-card"><div className="panel-head"><div><h2>Records by Court</h2><p>Order issuing court</p></div></div><div className="donut-row"><div className="donut"><span>1,248<small>Total</small></span></div><div className="legend"><span><i /> High Court <strong>742</strong></span><span><i /> Children’s Court <strong>421</strong></span><span><i /> Other <strong>85</strong></span></div></div></section></div></>;
}

function Users({ userList, onRefresh }: { userList: UserItem[]; onRefresh: () => void }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [name, setName] = useState("");
  const [empId, setEmpId] = useState("");
  const [role, setRole] = useState("Employee");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return userList;
    const q = userSearch.toLowerCase();
    return userList.filter(u =>
      u.name.toLowerCase().includes(q) ||
      u.employee_id.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q) ||
      (u.email && u.email.toLowerCase().includes(q))
    );
  }, [userList, userSearch]);

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api.createUser({
        name,
        employee_id: empId,
        role,
        email,
        password: password || "countyrecords"
      });
      setShowAddModal(false);
      setName("");
      setEmpId("");
      setEmail("");
      setPassword("");
      onRefresh();
    } catch (err: any) {
      setError(err.message || "Failed to create user");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (user: UserItem) => {
    const newStatus = user.status === "Active" ? "Inactive" : "Active";
    if (confirm(`Change status of ${user.name} (${user.employee_id}) to ${newStatus}?`)) {
      try {
        await api.updateUser(user.employee_id, { status: newStatus });
        onRefresh();
      } catch (err: any) {
        alert(err.message || "Failed to update user status");
      }
    }
  };

  return <><PageIntro title="User Management" subtitle="Manage employee access to confidential adoption records."><Button icon="plus" onClick={() => setShowAddModal(true)}>Add User</Button></PageIntro>
    <section className="panel records-panel">
      <div className="records-toolbar">
        <div className="large-search">
          <Icon name="search" />
          <input
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
            placeholder="Search by employee name, ID or role..."
            aria-label="Search users"
          />
        </div>
      </div>
      <div className="table-meta"><span><strong>{filteredUsers.length}</strong> employees found ({userList.length} total)</span><span>Administrator Role-Based Access Control</span></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Employee Name</th><th>Employee ID</th><th>Role</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead><tbody>{filteredUsers.map(u => <tr key={u.employee_id}><td><div className="person-cell"><span>{u.name.split(" ").map(n=>n[0]).join("")}</span><strong>{u.name}</strong></div></td><td><strong>{u.employee_id}</strong></td><td><span className="role-badge">{u.role}</span></td><td><span className={`user-status ${u.status.toLowerCase()}`}><i />{u.status}</span></td><td>{u.last_login || "Recent"}</td><td><button className="text-button" onClick={() => handleToggleStatus(u)}>{u.status === "Active" ? "Deactivate" : "Activate"}</button></td></tr>)}</tbody></table></div>
    </section>

    {showAddModal && (
      <div className="modal-backdrop">
        <div className="modal" style={{ textAlign: "left" }}>
          <div className="modal-icon"><Icon name="users" size={24} /></div>
          <h2 style={{ textAlign: "center" }}>Add Authorized Employee</h2>
          {error && <div style={{ color: "#bb3d43", background: "#fff0f0", padding: "8px 12px", borderRadius: "6px", fontSize: "11px", marginBottom: "14px" }}>{error}</div>}
          <form onSubmit={handleCreateUser} style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "14px" }}>
            <Field label="Full Name" required><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Mary Wambui" required /></Field>
            <Field label="Employee ID" required><input value={empId} onChange={e => setEmpId(e.target.value.toUpperCase())} placeholder="e.g. EMP-045" required /></Field>
            <Field label="Role" required>
              <select value={role} onChange={e => setRole(e.target.value)}>
                <option value="Employee">Employee (Records & Search)</option>
                <option value="Administrator">Administrator (Full Access)</option>
              </select>
            </Field>
            <Field label="Email Address"><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="employee@county.gov" /></Field>
            <Field label="Initial Password (min 8 characters)" required><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Minimum 8 characters" required /></Field>
            <div className="modal-actions" style={{ marginTop: "16px" }}>
              <Button kind="ghost" onClick={() => setShowAddModal(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Create User"}</Button>
            </div>
          </form>
        </div>
      </div>
    )}
  </>;
}

function ActivityLog({ activityList, onVerifyAudit, onToast }: { activityList: ActivityItem[]; onVerifyAudit: () => void; onToast?: (msg: string) => void }) {
  const [verification, setVerification] = useState<AuditVerificationResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  const runVerification = async () => {
    setVerifying(true);
    try {
      const result = await api.verifyAudit();
      setVerification(result);
      onToast?.(result.valid ? "Audit hash chain verified: 100% intact" : "Warning: Discrepancy detected in audit chain");
    } catch (err: any) {
      alert(err.message || "Failed to verify audit log");
    } finally {
      setVerifying(false);
    }
  };

  const handleExportActivityCSV = () => {
    const header = "Event ID,Timestamp,Responsible Officer,Action,Record Number,Audit Description\n";
    const rows = activityList.map(a => 
      `"${a.id}","${a.timestamp}","${a.user_name.replace(/"/g, '""')}","${a.action}","${a.record_no}","${a.description.replace(/"/g, '""')}"`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `AODS_Activity_Audit_Log_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onToast?.("Downloaded activity audit log CSV");
  };

  return <><PageIntro title="Activity Log" subtitle="Review cryptographic audit trail of all access and modifications.">
    <div style={{ display: "flex", gap: "8px" }}>
      <Button kind="secondary" icon="shield" onClick={runVerification} disabled={verifying}>
        {verifying ? "Verifying Chain..." : "Verify Audit Integrity"}
      </Button>
      <Button kind="secondary" icon="download" onClick={handleExportActivityCSV}>Export Log (CSV)</Button>
    </div>
  </PageIntro>

  {verification && (
    <div style={{
      marginBottom: "16px",
      padding: "14px 18px",
      borderRadius: "8px",
      background: verification.valid ? "#e8f6f0" : "#fff0f0",
      border: `1px solid ${verification.valid ? "#16845b" : "#bb3d43"}`,
      display: "flex",
      alignItems: "center",
      gap: "12px",
      color: verification.valid ? "#16845b" : "#bb3d43"
    }}>
      <Icon name={verification.valid ? "check" : "shield"} size={22} />
      <div>
        <strong>{verification.valid ? "Tamper-Evident Hash Chain Intact" : "Tampering Detected"}</strong>
        <p style={{ margin: 0, fontSize: "11px", color: "var(--text)" }}>
          {verification.valid
            ? `Cryptographic SHA-256 verification passed across ${verification.totalChecked} sequential entries without discrepancies.`
            : `Hash chain verification failed: ${verification.error}`}
        </p>
      </div>
    </div>
  )}

  <section className="panel records-panel">
    <div className="audit-callout"><Icon name="shield" /><div><strong>Cryptographic SHA-256 Hash Chaining</strong><span>Every access event and record alteration is hashed and linked to the prior entry in SQLite.</span></div></div>
    <div className="table-wrap"><table className="data-table"><thead><tr><th>Date & Time</th><th>User</th><th>Action</th><th>Record</th><th>Description</th></tr></thead><tbody>{activityList.map(a => <tr key={a.id}><td>{a.timestamp}</td><td><strong>{a.user_name}</strong></td><td><span className="activity-badge">{a.action}</span></td><td><strong className="entry-no">{a.record_no}</strong></td><td>{a.description}</td></tr>)}</tbody></table></div>
    <div className="pagination"><span>Showing 1–{activityList.length} of {activityList.length} activities</span><div><button disabled>Previous</button><button className="current">1</button><button disabled>Next</button></div></div>
  </section></>;
}

function Settings({ currentUser, onBackupCreated, onToast }: { currentUser: UserItem | null; onBackupCreated: () => void; onToast?: (msg: string) => void }) {
  const [activeTab, setActiveTab] = useState<"account" | "security">("account");
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [backupMsg, setBackupMsg] = useState("");
  const isAdmin = currentUser?.role === "Administrator";

  useEffect(() => {
    if (isAdmin) {
      api.getBackups().then(data => setBackups(data)).catch(() => {});
    }
  }, [isAdmin]);

  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    setBackupMsg("");
    try {
      const b = await api.createBackup();
      const msg = `Backup created successfully: ${b.filename} (${Math.round(b.sizeBytes / 1024)} KB, SHA-256 verified)`;
      setBackupMsg(msg);
      onToast?.("Verified database backup snapshot created");
      api.getBackups().then(data => setBackups(data));
      onBackupCreated();
    } catch (err: any) {
      alert(err.message || "Failed to create database backup.");
    } finally {
      setCreatingBackup(false);
    }
  };

  return <><PageIntro title="Settings" subtitle="Manage your account, security and application preferences." /><div className="settings-layout"><nav className="settings-nav">
    <button className={activeTab === "account" ? "active" : ""} onClick={() => setActiveTab("account")}><Icon name="users" />Account</button>
    <button className={activeTab === "security" ? "active" : ""} onClick={() => setActiveTab("security")}><Icon name="lock" />Security & Backups</button>
    <div><Icon name="shield" /><p><strong>Secure session</strong><span>Database: SQLite (live WAL mode)</span></p></div>
  </nav><main className="settings-main panel">
    {activeTab === "account" && (
      <>
        <div className="settings-heading"><h2>Account Information</h2><p>Your authenticated employee profile.</p></div>
        <div className="profile-row">
          <div className="large-avatar">{currentUser ? currentUser.name.split(" ").map(n=>n[0]).join("") : "JM"}</div>
          <div><strong>{currentUser?.name || "Jane Mwangi"}</strong><span>{currentUser?.role || "Administrator"} · {currentUser?.employee_id || "ADM-001"}</span></div>
        </div>
        <div className="settings-form">
          <Field label="Full Name"><input defaultValue={currentUser?.name || "Jane Mwangi"} readOnly /></Field>
          <Field label="Employee ID"><input defaultValue={currentUser?.employee_id || "ADM-001"} readOnly /></Field>
          <Field label="Email Address" wide><input defaultValue={currentUser?.email || "jane.mwangi@county.gov"} readOnly /></Field>
        </div>
      </>
    )}

    {activeTab === "security" && isAdmin && (
      <>
        <div className="settings-heading"><h2>Database Backup & Disaster Recovery</h2><p>Generate cryptographic SHA-256 verified snapshots of the adoption records register.</p></div>
        {backupMsg && <div style={{ color: "#16845b", background: "#e8f6f0", padding: "10px 14px", borderRadius: "6px", fontSize: "11px", marginBottom: "14px" }}>{backupMsg}</div>}
        <div style={{ marginBottom: "18px" }}>
          <Button kind="secondary" icon="shield" onClick={handleCreateBackup} disabled={creatingBackup}>
            {creatingBackup ? "Creating Snapshot..." : "Create Verified Database Backup"}
          </Button>
        </div>
        {backups.length > 0 && (
          <div style={{ fontSize: "11px", color: "var(--text)" }}>
            <strong>Existing Verified Backups:</strong>
            <ul style={{ paddingLeft: "18px", marginTop: "8px" }}>
              {backups.slice(0, 4).map(b => (
                <li key={b.filename} style={{ marginBottom: "6px" }}>
                  <code>{b.filename}</code> — {Math.round(b.sizeBytes / 1024)} KB · {b.createdAt.split("T")[0]}
                </li>
              ))}
            </ul>
          </div>
        )}
      </>
    )}

    <div className={`settings-heading ${activeTab === "account" ? "divided" : ""}`}>
      <h2>Session & Cryptographic Security</h2>
      <p>County records security standards and session timeouts.</p>
    </div>
    <div className="security-setting">
      <div>
        <Icon name="lock" />
        <p><strong>Password Encryption</strong><span>PBKDF2 SHA-512 with 100,000 iterations & 128-bit salt</span></p>
      </div>
      <span className="status-badge"><Icon name="check" size={12} /> Active</span>
    </div>
    <div className="security-setting">
      <div>
        <Icon name="shield" />
        <p><strong>Audit Trail Protection</strong><span>Cryptographic SHA-256 hash chaining on all modifications</span></p>
      </div>
      <span className="status-badge"><Icon name="check" size={12} /> Enforced</span>
    </div>
    <div className="security-setting">
      <div>
        <Icon name="activity" />
        <p><strong>Automatic session timeout</strong><span>Bearer token expires after 8 hours of inactivity</span></p>
      </div>
      <select defaultValue="8 hours" disabled><option>8 hours</option></select>
    </div>
  </main></div></>;
}

function ConfirmModal({ mode, close, save, entryNo }: { mode: "add" | "edit"; close: () => void; save: () => void; entryNo: string }) {
  return <div className="modal-backdrop"><div className="modal"><div className="modal-icon"><Icon name="shield" size={24} /></div><h2>{mode === "add" ? "Save adoption record?" : "Save changes to this record?"}</h2><p>{mode === "add" ? "Please confirm that the information entered is accurate before saving this record." : "Your changes will be saved to the database and added to the secure activity log."}</p><div className="modal-summary"><span>Entry Number<strong>#{entryNo}</strong></span><span>Record Status<strong>Registered</strong></span></div><div className="modal-actions"><Button kind="ghost" onClick={close}>Cancel</Button><Button icon="check" onClick={save}>{mode === "add" ? "Confirm & Save" : "Save Changes"}</Button></div></div></div>;
}

function PasswordRotationModal({
  currentUser,
  onSuccess,
  onLogout
}: {
  currentUser: UserItem;
  onSuccess: () => void;
  onLogout: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!currentPassword) {
      setError("Please enter your current password.");
      return;
    }
    if (newPassword.length < 12) {
      setError("New password must be at least 12 characters long. Passphrases are strongly recommended.");
      return;
    }
    if (newPassword === "countyrecords") {
      setError("You cannot reuse the default system setup password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to update password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 9999 }}>
      <div className="modal" style={{ maxWidth: 480, textAlign: "left" }}>
        <div className="modal-icon" style={{ background: "#fee2e2", color: "#dc2626", margin: "0 auto 16px" }}>
          <Icon name="lock" size={24} />
        </div>
        <h2 style={{ textAlign: "center", marginBottom: 8 }}>Password Update Required</h2>
        <p style={{ textAlign: "center", marginBottom: 16 }}>
          Your account is currently using an initial setup password. In accordance with County Information Security Policy, you must set a secure personal password before accessing adoption records.
        </p>

        {error && (
          <div style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: "0.85rem",
            marginBottom: 14
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Current Password" required>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              autoFocus
              required
            />
          </Field>
          <Field label="New Password" required hint="Minimum 12 characters (e.g. four random words or secure passphrase)">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new secure password or passphrase (min. 12 chars)"
              required
            />
          </Field>
          <Field label="Confirm New Password" required>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              required
            />
          </Field>
          <div className="modal-actions" style={{ marginTop: 12 }}>
            <Button kind="ghost" icon="logout" onClick={onLogout}>
              Log Out
            </Button>
            <Button kind="primary" icon="check" type="submit" disabled={loading}>
              {loading ? "Updating..." : "Update Password & Continue"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [page, setPage] = useState<Page>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [toast, setToast] = useState("");

  // Persistent sidebar collapse state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("aods_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const handleToggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem("aods_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 4200);
  };

  const [records, setRecords] = useState<RecordItem[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<RecordItem | null>(null);
  const [kpiStats, setKpiStats] = useState<KPIStats | null>(null);
  const [userList, setUserList] = useState<UserItem[]>([]);
  const [activityList, setActivityList] = useState<ActivityItem[]>([]);
  const [currentUser, setCurrentUser] = useState<UserItem | null>(null);
  const [pendingFormData, setPendingFormData] = useState<Partial<RecordItem> | null>(null);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string>("");

  const handleSessionExpired = useCallback((msg?: string) => {
    setLoggedIn(false);
    setCurrentUser(null);
    setSessionExpiredMessage(msg || "Your session expired due to inactivity. Please log in again.");
    setPage("dashboard");
  }, []);

  // Hook up user interaction listeners and 15-minute inactivity tracker
  useSessionTimeout({
    enabled: loggedIn,
    onExpired: handleSessionExpired
  });

  // Listen to 401 session expiration from API calls
  useEffect(() => {
    return onSessionExpired((msg) => {
      handleSessionExpired(msg);
    });
  }, [handleSessionExpired]);

  // Close mobile drawer on Escape key
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  const loadData = async (userOverride?: UserItem | null) => {
    const activeUser = userOverride !== undefined ? userOverride : currentUser;
    try {
      const [recs, kpis, acts] = await Promise.all([
        api.getRecords(),
        api.getKPIs(),
        api.getActivity()
      ]);
      setRecords(recs);
      if (recs.length > 0 && !selectedRecord) {
        setSelectedRecord(recs[0]);
      }
      setKpiStats(kpis);
      setActivityList(acts);

      // Only Administrators can fetch user list
      if (activeUser?.role === "Administrator") {
        try {
          const users = await api.getUsers();
          setUserList(users);
        } catch {
          // not permitted if non-admin
        }
      }
    } catch (err: any) {
      console.error("Error loading data from API:", err);
      if (err.message && (err.message.includes("Authentication required") || err.message.includes("inactivity"))) {
        setLoggedIn(false);
        setCurrentUser(null);
      }
    }
  };

  // Restore authenticated session on initial mount if not inactive
  useEffect(() => {
    if (isSessionInactive()) {
      setLoggedIn(false);
      setCurrentUser(null);
      setSessionExpiredMessage("Your session expired due to inactivity. Please log in again.");
      return;
    }

    api.getMe().then(user => {
      if (user) {
        recordUserActivity(false);
        setCurrentUser(user);
        setLoggedIn(true);
        loadData(user);
      }
    }).catch((err: any) => {
      setLoggedIn(false);
      setCurrentUser(null);
      if (err?.code === "SESSION_EXPIRED" || (err?.message && err.message.includes("inactivity"))) {
        setSessionExpiredMessage("Your session expired due to inactivity. Please log in again.");
      }
    });
  }, []);

  const handleSelectRecord = (r: RecordItem) => {
    setSelectedRecord(r);
  };

  const handlePrintRecord = (r: RecordItem) => {
    setSelectedRecord(r);
    setPage("print");
  };

  const handleArchive = async (no: string) => {
    if (confirm(`Are you sure you want to archive record #${no}?`)) {
      try {
        await api.archiveRecord(no);
        await loadData();
        showToast(`Record #${no} archived successfully.`);
      } catch (err: any) {
        alert(err.message || "Failed to archive record");
      }
    }
  };

  const handleLogout = async () => {
    try {
      localStorage.setItem("AODS_SESSION_STATE", "logged_out");
    } catch {}
    await api.logout();
    setLoggedIn(false);
    setCurrentUser(null);
    setSessionExpiredMessage("");
    setPage("dashboard");
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
        const updatePayload = {
          ...pendingFormData,
          version: selectedRecord?.version
        };
        saved = await api.updateRecord(selectedRecord?.no || pendingFormData.no!, updatePayload);
      }
      await loadData();
      setSelectedRecord(saved);
      setPage("details");
      showToast(mode === "add" ? "Adoption record saved successfully." : "Record updated successfully.");
    } catch (err: any) {
      if (err.status === 409) {
        await loadData();
      }
      alert(err.message || "Failed to save record");
    } finally {
      setPendingFormData(null);
    }
  };

  const content = useMemo(() => {
    switch (page) {
      case "dashboard":
        return (
          <Dashboard
            go={setPage}
            records={records}
            onSelectRecord={(r) => { handleSelectRecord(r); setPage("details"); }}
            kpiStats={kpiStats}
            activityList={activityList}
            onPrintRecord={handlePrintRecord}
            onToast={showToast}
            currentUser={currentUser}
          />
        );
      case "records":
        return (
          <RecordsPage
            go={setPage}
            records={records}
            onSelectRecord={(r) => { handleSelectRecord(r); setPage("details"); }}
            onArchive={handleArchive}
            onPrintRecord={handlePrintRecord}
            onToast={showToast}
          />
        );
      case "search":
        return (
          <SearchPage
            go={setPage}
            records={records}
            onSelectRecord={(r) => { handleSelectRecord(r); setPage("details"); }}
            onPrintRecord={handlePrintRecord}
            onArchive={handleArchive}
            onToast={showToast}
          />
        );
      case "add":
        return <RecordForm mode="add" go={setPage} initialData={null} nextEntryNo={nextEntryNo} confirm={(data) => { setPendingFormData(data); setModal("add"); }} />;
      case "details":
        return <Details go={setPage} record={selectedRecord} />;
      case "edit":
        return <RecordForm mode="edit" go={setPage} initialData={selectedRecord} nextEntryNo={nextEntryNo} confirm={(data) => { setPendingFormData(data); setModal("edit"); }} />;
      case "print":
        return <PrintRecord go={setPage} record={selectedRecord} />;
      case "reports":
        return <Reports onToast={showToast} />;
      case "users":
        return <Users userList={userList} onRefresh={() => loadData()} />;
      case "activity":
        return <ActivityLog activityList={activityList} onVerifyAudit={() => loadData()} onToast={showToast} />;
      case "settings":
        return <Settings currentUser={currentUser} onBackupCreated={() => loadData()} onToast={showToast} />;
    }
  }, [page, records, selectedRecord, kpiStats, userList, activityList, currentUser, nextEntryNo]);

  if (!loggedIn) {
    return (
      <Login
        onLogin={(user) => {
          recordUserActivity(true);
          setSessionExpiredMessage("");
          setCurrentUser(user);
          setLoggedIn(true);
          loadData(user);
        }}
        sessionExpiredMessage={sessionExpiredMessage}
        onClearExpiredMessage={() => setSessionExpiredMessage("")}
      />
    );
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <Sidebar
        page={page}
        go={setPage}
        logout={handleLogout}
        open={menuOpen}
        close={() => setMenuOpen(false)}
        currentUser={currentUser}
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
      />
      <div className="app-main">
        {page !== "print" && (
          <Header
            page={page}
            go={setPage}
            toggleMenu={() => setMenuOpen(!menuOpen)}
            records={records}
            onSelectRecord={handleSelectRecord}
            currentUser={currentUser}
            onLogout={handleLogout}
          />
        )}
        <main className={page === "print" ? "print-page" : "page-content"}>
          {content}
        </main>
        {page !== "print" && (
          <div className="confidential-footer">
            <Icon name="lock" size={13} /> Confidential Government Records · Authorized personnel only
            <span>Session: 15m idle timeout · 8h max</span>
          </div>
        )}
      </div>
      {modal && (
        <ConfirmModal
          mode={modal}
          close={() => { setModal(null); setPendingFormData(null); }}
          save={saveConfirmed}
          entryNo={pendingFormData?.no || selectedRecord?.no || nextEntryNo}
        />
      )}
      {currentUser?.mustChangePassword && (
        <PasswordRotationModal
          currentUser={currentUser}
          onSuccess={() => {
            setCurrentUser({ ...currentUser, mustChangePassword: false });
            showToast("Password updated successfully. System access granted.");
          }}
          onLogout={handleLogout}
        />
      )}
      {toast && (
        <div className="toast">
          <div><Icon name="check" /></div>
          <p><strong>{toast}</strong><span>County Adoption Records System</span></p>
          <button onClick={() => setPage("details")}>View Record</button>
        </div>
      )}
    </div>
  );
}
