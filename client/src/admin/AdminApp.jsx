import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard, Users, UserCheck, UserPlus, UserX, Trash2, LogIn, MonitorSmartphone, ShieldX, Github, Radio, BarChart3, FileText,
  Share2, Activity, ScrollText, ShieldAlert, Swords, TrendingUp, Gauge, Repeat, Smartphone, Globe2, Download, FileBarChart, Database,
  Server, Cable, HardDrive, Bug, UserCog, Lock, SlidersHorizontal, Bell, Search, Menu, X, ArrowLeft, Palette, Check, CheckCheck, ShieldOff, GraduationCap
} from 'lucide-react';
import Logo from '../components/Logo.jsx';
import Avatar from '../components/Avatar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useUI, useOverlay } from '../context/UIContext.jsx';
import { AdminCtx, aget, apost, useQuery, useDarkTheme, ago } from './lib.js';
import { Role, Severity } from './ui.jsx';
import * as P from './pages.jsx';
import * as Q from './pages2.jsx';
import { SrmapPage, SrmapBindingDetail } from './srmap.jsx';
import BroadcastPage from './BroadcastPage.jsx';
import './admin.css';

const NAV = [
  ['Overview', [['/admin', LayoutDashboard, 'Dashboard', 'dashboard.view', true]]],
  ['Communications', [
    ['/admin/broadcasts', Bell, 'Cadence Mail & Alerts', 'admin.access', true]
  ]],
  ['Users', [
    ['/admin/users', Users, 'All users', 'users.view', true], ['/admin/users?view=active', UserCheck, 'Active users', 'users.view'],
    ['/admin/users?view=new', UserPlus, 'New users', 'users.view'], ['/admin/users?view=suspended', UserX, 'Suspended users', 'users.view'],
    ['/admin/users?view=deleted', Trash2, 'Deleted users', 'users.view']
  ]],
  ['Authentication', [
    ['/admin/authentication/logins', LogIn, 'Login activity', 'security.view'], ['/admin/authentication/sessions', MonitorSmartphone, 'Sessions', 'sessions.manage'],
    ['/admin/authentication/failed', ShieldX, 'Failed logins', 'security.view'], ['/admin/authentication/oauth', Github, 'OAuth accounts', 'users.view'],
    ['/admin/authentication/srmap', GraduationCap, 'Connect SRM AP', 'srmap.view']
  ]],
  ['Visitors', [
    ['/admin/visitors/live', Radio, 'Live visitors', 'visitors.view'], ['/admin/visitors', BarChart3, 'Visitor analytics', 'visitors.view', true],
    ['/admin/analytics/pages', FileText, 'Page views', 'analytics.view'], ['/admin/analytics/traffic', Share2, 'Traffic sources', 'analytics.view']
  ]],
  ['Activity', [
    ['/admin/activity', Activity, 'User activity', 'activity.view'], ['/admin/audit', ScrollText, 'Audit logs', 'audit.view'],
    ['/admin/security', ShieldAlert, 'Security events', 'security.view', false, 'security'], ['/admin/competitions', Swords, 'Competitions', 'competitions.manage']
  ]],
  ['Analytics', [
    ['/admin/analytics/users', TrendingUp, 'User analytics', 'analytics.view'], ['/admin/analytics/engagement', Gauge, 'Engagement', 'analytics.view'],
    ['/admin/analytics/retention', Repeat, 'Retention', 'analytics.view'], ['/admin/analytics/devices', Smartphone, 'Devices', 'analytics.view'],
    ['/admin/analytics/geography', Globe2, 'Geography', 'analytics.view']
  ]],
  ['Data', [
    ['/admin/export', Download, 'Export data', 'export.manage'], ['/admin/reports', FileBarChart, 'Reports', 'reports.manage'],
    ['/admin/data', Database, 'Data management', 'settings.retention']
  ]],
  ['System', [
    ['/admin/system', Server, 'System health', 'system.view', true], ['/admin/system?tab=api', Cable, 'API health', 'system.view'],
    ['/admin/system?tab=database', HardDrive, 'Database health', 'system.view'], ['/admin/system/errors', Bug, 'Error logs', 'errors.manage', false, 'errors']
  ]],
  ['Settings', [
    ['/admin/settings/profile', UserCog, 'Admin profile', 'admin.access'], ['/admin/settings/security', Lock, 'Security settings', 'admin.access'],
    ['/admin/settings', SlidersHorizontal, 'Application settings', 'admin.access', true]
  ]]
];

/** Is this nav item the current page? Query-string views (e.g. ?view=suspended) count as separate items. */
function isActive(to, loc, exact) {
  const [path, query] = to.split('?');
  const cur = new URLSearchParams(loc.search);
  if (query) { const [k, v] = query.split('='); return loc.pathname === path && cur.get(k) === v; }
  if (exact) return loc.pathname === path && !cur.get('view') && !cur.get('tab');
  return loc.pathname === path || loc.pathname.startsWith(`${path}/`);
}

function Sidebar({ me, open, onClose }) {
  const loc = useLocation();
  const perms = new Set(me.permissions);
  return (
    <>
      <AnimatePresence>{open && <motion.div className="adm-scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} aria-hidden="true" />}</AnimatePresence>
      <aside className={`adm-side${open ? ' open' : ''}`} aria-label="Admin navigation">
        <div className="adm-brand">
          <Link to="/admin" onClick={onClose}><Logo size={28} /><span><strong>cadence</strong><small>admin</small></span></Link>
          <button type="button" className="icon-btn adm-side-close" aria-label="Close menu" onClick={onClose}><X size="1em" /></button>
        </div>
        <nav>
          {NAV.map(([section, items]) => {
            const visible = items.filter(i => perms.has(i[3]));
            if (!visible.length) return null;
            return (
              <div className="adm-nav-group" key={section}>
                <h3>{section}</h3>
                <ul>
                  {visible.map(([to, Icon, label, , exact, badge]) => {
                    const active = isActive(to, loc, exact);
                    const n = badge ? me.badges?.[badge] : 0;
                    return (
                      <li key={to}>
                        <Link to={to} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} onClick={onClose}>
                          <Icon size="1em" aria-hidden="true" /><span>{label}</span>
                          {n > 0 && <span className="adm-nav-badge" aria-label={`${n} open`}>{n > 99 ? '99+' : n}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
        <Link className="adm-back" to="/"><ArrowLeft size="1em" />Back to Cadence</Link>
      </aside>
    </>
  );
}

function GlobalSearch() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRes(null); return undefined; }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => aget('/search', { q: term }, { signal: ctrl.signal }).then(setRes).catch(() => {}).finally(() => setLoading(false)), 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);
  useEffect(() => {
    if (!open) return undefined;
    const close = e => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const go = to => { setOpen(false); setQ(''); nav(to); };
  const groups = res ? [
    ['Users', res.users.map(u => ({ key: u.id, to: `/admin/users/${u.id}`, title: u.username, sub: `${u.email} · ${u.role}${u.status !== 'active' ? ` · ${u.status}` : ''}`, avatar: u }))],
    ['Sessions', res.sessions.map(s => ({ key: s.id, to: `/admin/authentication/sessions?user=${s.user?.username || ''}`, title: `Session ${s.id.slice(0, 8)}…`, sub: `${s.user?.username || ''} · ${s.browser} on ${s.device} · ${s.status}` }))],
    ['Security', res.security.map(s => ({ key: s.id, to: '/admin/security', title: s.title, sub: `${s.severity} · ${ago(s.at)}` }))],
    ['Audit log', res.audit.map(a => ({ key: a.id, to: `/admin/audit?action=${a.action}`, title: a.action.replace(/_/g, ' ').toLowerCase(), sub: `#${a.seq} · ${a.actor} → ${a.target || '—'}` }))],
    ['Activity', res.activity.map(a => ({ key: a.id, to: `/admin/activity?type=${a.type}`, title: a.type.replace(/_/g, ' ').toLowerCase(), sub: `${a.username || '—'} · ${ago(a.at)}` }))]
  ].filter(([, items]) => items.length) : [];
  return (
    <div className="adm-gsearch" ref={box}>
      <label>
        <Search size="1em" aria-hidden="true" />
        <span className="sr">Search users, emails, sessions, audit and security events</span>
        <input type="search" placeholder="Search users, emails, IDs, events…" value={q} onFocus={() => setOpen(true)} onChange={e => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); e.stopPropagation(); } }} aria-expanded={open && q.trim().length >= 2} aria-controls="adm-gsearch-results" />
      </label>
      {open && q.trim().length >= 2 && (
        <div className="adm-gsearch-panel" id="adm-gsearch-results" role="listbox">
          {loading && !res && <p className="adm-gsearch-msg">Searching…</p>}
          {res && !groups.length && <p className="adm-gsearch-msg">No matches for "{q.trim()}".</p>}
          {groups.map(([title, items]) => (
            <div key={title}>
              <h4>{title}</h4>
              {items.map(it => (
                <button type="button" role="option" key={it.key} onClick={() => go(it.to)}>
                  {it.avatar && <Avatar name={it.avatar.username} url={it.avatar.avatar} size="sm" />}
                  <span><strong>{it.title}</strong><small>{it.sub}</small></span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Notifications({ onChanged }) {
  const [open, setOpen] = useState(false);
  const q = useQuery('/notifications', {}, { poll: 30000 });
  const box = useRef(null);
  useOverlay('adm-notifs', open, () => setOpen(false));
  useEffect(() => {
    if (!open) return undefined;
    const close = e => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const act = async (path, body) => { await apost(path, body).catch(() => {}); q.refresh(); onChanged(); };
  const unread = q.data?.unread || 0;
  return (
    <div className="adm-notifs" ref={box}>
      <button type="button" className={`icon-btn${open ? ' active' : ''}`} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <Bell size="1.05em" />{unread > 0 && <span className="adm-bell-count" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="adm-notif-panel" role="dialog" aria-label="Admin notifications" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
            <header>
              <strong>Notifications</strong>
              <span className="spacer" />
              <button type="button" className="btn ghost sm" disabled={!unread} onClick={() => act('/notifications/read', { all: true })}><CheckCheck size="1em" />Mark all read</button>
              <button type="button" className="btn ghost sm" disabled={!q.data?.items.length} onClick={() => act('/notifications/clear', { all: true })}>Clear</button>
            </header>
            {!q.data ? <p className="adm-gsearch-msg">Loading…</p> : !q.data.items.length ? <p className="adm-gsearch-msg">You're all caught up.</p> : (
              <ul>
                {q.data.items.map(n => (
                  <li key={n.id} className={n.read ? 'read' : ''}>
                    <Severity value={n.severity} />
                    <div>
                      {n.link ? <Link to={n.link} onClick={() => { setOpen(false); if (!n.read) act('/notifications/read', { ids: [n.id] }); }}>{n.title}</Link> : <span>{n.title}</span>}
                      {n.body && <small>{n.body}</small>}
                      <time dateTime={n.createdAt}>{ago(n.createdAt)}</time>
                    </div>
                    {!n.read && <button type="button" className="icon-btn" aria-label="Mark as read" title="Mark as read" onClick={() => act('/notifications/read', { ids: [n.id] })}><Check size="1em" /></button>}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NoAccess({ onUnlocked }) {
  const auth = useAuth();
  const ui = useUI();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleUnlock = async e => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError('');
    try {
      await apost('/claim', { password: password.trim() });
      ui.toast('Admin privileges granted! Welcome to the Cadence Admin Panel.');
      await auth.refresh?.();
      onUnlocked?.();
    } catch (err) {
      setError(err.message || 'Invalid admin password. Check server/.env');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="adm-denied">
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '3.75rem',
        height: '3.75rem',
        borderRadius: '50%',
        background: 'rgba(239, 68, 68, 0.12)',
        color: 'var(--crit, #ef4444)',
        marginBottom: '0.4rem'
      }}>
        <Lock size="1.8rem" aria-hidden="true" />
      </div>
      <h1 style={{ margin: '0.2rem 0' }}>Admin Authorization Required</h1>
      <p style={{ maxWidth: '440px', margin: '0 0 1rem' }}>
        The Cadence admin dashboard is restricted. Enter your server <code>ADMIN_PASSWORD</code> configured in <code>.env</code> to {auth.user ? 'elevate your account to Super Admin' : 'sign in directly as Super Admin'}.
      </p>

      {auth.user ? (
        <div style={{
          fontSize: '0.82rem',
          color: 'var(--sub)',
          marginBottom: '1rem',
          padding: '0.35rem 0.8rem',
          background: 'var(--glass, rgba(255,255,255,0.05))',
          borderRadius: '999px',
          border: '1px solid var(--hairline, rgba(255,255,255,0.1))'
        }}>
          Current Account: <strong>{auth.user.username}</strong> ({auth.user.role || 'USER'})
        </div>
      ) : (
        <div style={{
          fontSize: '0.82rem',
          color: 'var(--sub)',
          marginBottom: '1rem',
          padding: '0.35rem 0.8rem',
          background: 'var(--glass, rgba(255,255,255,0.05))',
          borderRadius: '999px',
          border: '1px solid var(--hairline, rgba(255,255,255,0.1))'
        }}>
          Account Status: <strong>Not Signed In</strong>
        </div>
      )}

      <form onSubmit={handleUnlock} style={{ width: '100%', maxWidth: '340px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Enter ADMIN_PASSWORD..."
          value={password}
          onChange={e => setPassword(e.target.value)}
          disabled={loading}
          style={{
            width: '100%',
            padding: '0.65rem 0.85rem',
            borderRadius: '8px',
            border: '1px solid var(--hairline, rgba(255,255,255,0.15))',
            background: 'var(--bg-card, rgba(0,0,0,0.25))',
            color: 'var(--text, #fff)',
            fontSize: '0.9rem',
            outline: 'none',
            boxSizing: 'border-box'
          }}
          required
        />

        {error && (
          <div style={{
            color: 'var(--crit, #ef4444)',
            fontSize: '0.82rem',
            textAlign: 'center',
            padding: '0.45rem 0.6rem',
            background: 'rgba(239,68,68,0.12)',
            borderRadius: '6px'
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          className="btn primary"
          disabled={loading || !password.trim()}
          style={{ width: '100%', justifyContent: 'center', padding: '0.65rem' }}
        >
          {loading ? 'Authenticating...' : 'Unlock Admin Panel'}
        </button>

        {!auth.user && (
          <Link className="btn ghost" to="/login" style={{ width: '100%', justifyContent: 'center' }}>
            Log in with existing account
          </Link>
        )}

        <Link className="btn outline" to="/" style={{ width: '100%', justifyContent: 'center', marginTop: '0.2rem' }}>
          Back to Cadence
        </Link>
      </form>
    </div>
  );
}

export default function AdminApp() {
  const auth = useAuth();
  const ui = useUI();
  const loc = useLocation();
  const dark = useDarkTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [me, setMe] = useState(null);
  const [denied, setDenied] = useState(false);

  const loadMe = useCallback(async () => {
    try { setMe(await aget('/me')); setDenied(false); }
    catch (err) { if (err.status === 401 || err.status === 403) setDenied(true); }
  }, []);
  useEffect(() => { if (auth.user && auth.user.role !== 'USER') loadMe(); }, [auth.user, loadMe]);
  useEffect(() => { const t = setInterval(() => { if (!document.hidden && auth.user?.role !== 'USER') loadMe(); }, 30000); return () => clearInterval(t); }, [loadMe, auth.user]);
  useEffect(() => { setMenuOpen(false); }, [loc.pathname, loc.search]);
  useEffect(() => { document.title = 'Cadence admin'; return () => { document.title = 'Cadence'; }; }, []);

  const handleUnlocked = useCallback(async () => {
    setDenied(false);
    await loadMe();
  }, [loadMe]);

  const ctx = useMemo(() => me && ({ me, can: p => me.permissions.includes(p), refreshMe: loadMe }), [me, loadMe]);
  // Pages the role can't use say so plainly (the API would refuse them anyway).
  const gate = (perm, el) => (me?.permissions.includes(perm) ? el : <div className="adm-denied"><ShieldOff size="2rem" aria-hidden="true" /><h1>Not available for your role</h1><p>Ask a super admin if you need access to this page.</p><Link className="btn outline" to="/admin">Back to the dashboard</Link></div>);

  if (!auth.ready) return <div className="adm-boot"><div className="spinner" role="status" aria-label="Loading" /></div>;
  if (!auth.user || auth.user.role === 'USER' || denied) return <div className={`adm${dark ? ' viz-dark' : ''}`}><NoAccess onUnlocked={handleUnlocked} /></div>;
  if (!ctx) return <div className="adm-boot"><div className="spinner" role="status" aria-label="Loading admin panel" /></div>;

  return (
    <AdminCtx.Provider value={ctx}>
      <div className={`adm${dark ? ' viz-dark' : ''}`}>
        <a className="adm-skip" href="#adm-main">Skip to content</a>
        <Sidebar me={me} open={menuOpen} onClose={() => setMenuOpen(false)} />
        <div className="adm-body">
          <header className="adm-top">
            <button type="button" className="icon-btn adm-burger" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size="1.1em" /></button>
            <GlobalSearch />
            <span className="spacer" />
            {auth.maintenance?.maintenanceMode && (
              <Link
                to="/admin/settings"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.3rem 0.65rem',
                  borderRadius: '999px',
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  color: '#fbbf24',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  textDecoration: 'none',
                  marginRight: '0.5rem'
                }}
                title="Maintenance mode is active for public visitors"
              >
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fbbf24', boxShadow: '0 0 6px #fbbf24' }} />
                <span>Maintenance ON</span>
              </Link>
            )}
            <button type="button" className="icon-btn" aria-label="Change theme" title="Theme" onClick={ui.openThemePicker}><Palette size="1em" /></button>
            <Notifications onChanged={loadMe} />
            <Link className="adm-me" to="/admin/settings/profile" aria-label="Your admin profile">
              <Avatar name={me.user.username} url={me.user.avatar} size="sm" />
              <span><strong>{me.user.username}</strong><Role value={me.user.role} /></span>
            </Link>
          </header>
          <main id="adm-main" className="adm-main" tabIndex={-1}>
            <Routes>
              <Route path="/admin" element={gate('dashboard.view', <P.Dashboard />)} />
              <Route path="/admin/broadcasts" element={gate('admin.access', <BroadcastPage />)} />
              <Route path="/admin/users" element={gate('users.view', <P.UsersPage />)} />
              <Route path="/admin/users/:id" element={gate('users.view', <P.UserDetail />)} />
              <Route path="/admin/authentication/logins" element={gate('security.view', <P.LoginsPage />)} />
              <Route path="/admin/authentication/sessions" element={gate('sessions.manage', <P.SessionsPage />)} />
              <Route path="/admin/authentication/failed" element={gate('security.view', <P.FailedLoginsPage />)} />
              <Route path="/admin/authentication/oauth" element={gate('users.view', <P.OAuthPage />)} />
              <Route path="/admin/authentication/srmap" element={gate('srmap.view', <SrmapPage />)} />
              <Route path="/admin/authentication/srmap/:id" element={gate('srmap.view', <SrmapBindingDetail />)} />
              <Route path="/admin/authentication" element={<Navigate to="/admin/authentication/logins" replace />} />
              <Route path="/admin/security" element={gate('security.view', <P.SecurityPage />)} />
              <Route path="/admin/visitors/live" element={gate('visitors.view', <Q.LiveVisitors />)} />
              <Route path="/admin/visitors" element={gate('visitors.view', <Q.VisitorAnalytics />)} />
              <Route path="/admin/analytics/pages" element={gate('analytics.view', <Q.PagesAnalytics />)} />
              <Route path="/admin/analytics/traffic" element={gate('analytics.view', <Q.TrafficAnalytics />)} />
              <Route path="/admin/analytics/users" element={gate('analytics.view', <Q.UserAnalytics />)} />
              <Route path="/admin/analytics/engagement" element={gate('analytics.view', <Q.EngagementAnalytics />)} />
              <Route path="/admin/analytics/retention" element={gate('analytics.view', <Q.RetentionAnalytics />)} />
              <Route path="/admin/analytics/devices" element={gate('analytics.view', <Q.DeviceAnalytics />)} />
              <Route path="/admin/analytics/geography" element={gate('analytics.view', <Q.GeographyAnalytics />)} />
              <Route path="/admin/analytics" element={<Navigate to="/admin/analytics/users" replace />} />
              <Route path="/admin/activity" element={gate('activity.view', <Q.ActivityPage />)} />
              <Route path="/admin/audit" element={gate('audit.view', <Q.AuditPage />)} />
              <Route path="/admin/competitions" element={gate('competitions.manage', <Q.CompetitionsPage />)} />
              <Route path="/admin/export" element={gate('export.manage', <Q.ExportPage />)} />
              <Route path="/admin/reports" element={gate('reports.manage', <Q.ReportsPage />)} />
              <Route path="/admin/reports/:id" element={gate('reports.manage', <Q.ReportView />)} />
              <Route path="/admin/data" element={gate('settings.retention', <Q.DataPage />)} />
              <Route path="/admin/system" element={gate('system.view', <Q.SystemPage />)} />
              <Route path="/admin/system/errors" element={gate('errors.manage', <Q.ErrorsPage />)} />
              <Route path="/admin/settings" element={<Q.SettingsPage section="application" />} />
              <Route path="/admin/settings/security" element={<Q.SettingsPage section="security" />} />
              <Route path="/admin/settings/profile" element={<Q.ProfilePage />} />
              <Route path="*" element={<div className="adm-denied"><h1>Page not found</h1><p>That admin page doesn't exist.</p><Link className="btn outline" to="/admin">Go to the dashboard</Link></div>} />
            </Routes>
          </main>
        </div>
      </div>
    </AdminCtx.Provider>
  );
}
