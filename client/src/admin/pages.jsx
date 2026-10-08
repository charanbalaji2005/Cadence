import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Users, Download, ShieldAlert, Radio, ScrollText, FileBarChart, Eye, UserX, UserCheck, Trash2, LogOut, Pencil, KeyRound, Github, Mail,
  ExternalLink, MonitorSmartphone, Trophy, Keyboard, ArrowLeft, ShieldCheck, Flame, Chrome
} from 'lucide-react';
import Avatar from '../components/Avatar.jsx';
import { useUI } from '../context/UIContext.jsx';
import { useAdmin, useQuery, useUrlFilters, aget, apost, adelete, apatch, num, pct, dateTime, ago, dateOnly, timeOnly, countryName, flag, tz } from './lib.js';
import { PageHead, Card, Kpi, DataTable, Pager, FilterBar, SearchBox, Select, RangePicker, DateFilter, Tabs, Status, Severity, Role, UserCell, Confirm, Facts, CopyButton, Loadable, Empty, Skeleton } from './ui.jsx';
import { LineChart, ChartCard, BarList } from './charts.jsx';

/* ---------- shared ---------- */

/** Range state kept in the URL; returns params for analytics endpoints. */
export function useRange(defaultRange = '30d') {
  const [sp, setSp] = useSearchParams();
  const range = sp.get('range') || defaultRange, from = sp.get('from') || '', to = sp.get('to') || '';
  const set = ({ range: r, from: f, to: t }) => {
    const next = new URLSearchParams(sp);
    r === defaultRange ? next.delete('range') : next.set('range', r);
    f ? next.set('from', f) : next.delete('from');
    t ? next.set('to', t) : next.delete('to');
    setSp(next, { replace: true });
  };
  const ready = range !== 'custom' || (from && to);
  return { range, from, to, set, params: ready ? { range, from: from || undefined, to: to ? `${to}T23:59:59` : undefined, tz: tz() } : null };
}
const device = r => [r.device, r.browser && `${r.browser}${r.os ? ` on ${r.os}` : ''}`].filter(Boolean).join(' · ') || '—';
const where = r => (r.country ? `${flag(r.country)} ${countryName(r.country)}` : '');

/* ---------- dashboard ---------- */

export function Dashboard() {
  const { can } = useAdmin();
  const R = useRange('30d');
  const opts = { enabled: !!R.params };
  const ov = useQuery('/analytics/overview', R.params || {}, { ...opts, poll: 60000 });
  const growth = useQuery('/analytics/users', R.params || {}, opts);
  const visits = useQuery('/analytics/visitors', R.params || {}, opts);
  const act = useQuery('/analytics/activity', R.params || {}, opts);
  const traffic = useQuery('/analytics/traffic', R.params || {}, opts);
  const ret = useQuery('/analytics/retention', {}, opts);
  const k = ov.data?.kpis;
  const quick = [
    ['users.view', '/admin/users', Users, 'View users'], ['export.manage', '/admin/export', Download, 'Export data'],
    ['security.view', '/admin/security', ShieldAlert, 'View security'], ['visitors.view', '/admin/visitors/live', Radio, 'Live visitors'],
    ['audit.view', '/admin/audit', ScrollText, 'Audit logs'], ['reports.manage', '/admin/reports', FileBarChart, 'Generate report']
  ].filter(q => can(q[0]));
  return (
    <>
      <PageHead kicker="Overview" title="Dashboard" sub="Every number here comes straight from Cadence's database and event logs." actions={<RangePicker {...R} onChange={R.set} />} />
      {ov.error && !ov.data && <Card><Loadable q={ov}>{() => null}</Loadable></Card>}
      <div className="adm-kpis">
        <Kpi label="Total users" k={k?.totalUsers} />
        <Kpi label="Active users" k={k?.activeUsers} />
        <Kpi label="New users today" k={k?.newToday} />
        <Kpi label="New this week" k={k?.newWeek} />
        <Kpi label="New this month" k={k?.newMonth} />
        <Kpi label="Online now" k={k?.online} />
        <Kpi label="Visitors" k={k?.visitors} />
        <Kpi label="Visitors today" k={k?.visitorsToday} />
        <Kpi label="Page views" k={k?.pageViews} />
        <Kpi label="Failed logins" k={k?.failedLogins} goodWhenUp={false} />
        <Kpi label="Suspended accounts" k={k?.suspended} goodWhenUp={false} />
        <Kpi label="System errors" k={k?.errors} goodWhenUp={false} />
      </div>
      {quick.length > 0 && (
        <nav className="adm-quick" aria-label="Quick actions">
          {quick.map(([, to, Icon, label]) => <Link key={to} to={to} className="btn outline sm"><Icon size="1em" />{label}</Link>)}
        </nav>
      )}
      <div className="adm-grid-2">
        <Loadable q={growth}>{g => (
          <ChartCard title="User growth" aside={<span className="adm-muted">{num(g.signups.reduce((a, b) => a + b, 0))} new</span>} table={{ keys: g.keys, unit: g.unit, series: [{ name: 'New users', values: g.signups }, { name: 'Total users', values: g.total }] }}>
            <LineChart label="New users per period" keys={g.keys} unit={g.unit} series={[{ name: 'New users', values: g.signups }]} area />
          </ChartCard>
        )}</Loadable>
        <Loadable q={visits}>{v => {
          const s = [{ name: 'Unique visitors', values: v.series.visitors, total: v.current.visitors }, { name: 'Sessions', values: v.series.sessions, total: v.current.sessions }, { name: 'Page views', values: v.series.pageViews, total: v.current.pageViews }];
          return <ChartCard title="Visitors" table={{ keys: v.keys, unit: v.unit, series: s }}><LineChart label="Visitors, sessions and page views" keys={v.keys} unit={v.unit} series={s} /></ChartCard>;
        }}</Loadable>
        <Loadable q={act}>{a => {
          const s = [
            { name: 'Logins', values: a.series.logins }, { name: 'Sign-ups', values: a.series.signups }, { name: 'Typing tests', values: a.series.tests },
            { name: 'Races', values: a.series.races }, { name: 'Sessions', values: a.series.sessions }
          ].map(x => ({ ...x, total: x.values.reduce((p, c) => p + c, 0) }));
          return <ChartCard title="User activity" table={{ keys: a.keys, unit: a.unit, series: s }}><LineChart label="Logins, sign-ups, tests, races and sessions" keys={a.keys} unit={a.unit} series={s} /></ChartCard>;
        }}</Loadable>
        <Loadable q={visits}>{v => {
          const s = [{ name: 'New visitors', values: v.series.new, total: v.current.newSessions }, { name: 'Returning visitors', values: v.series.returning, total: v.current.returningSessions }];
          return <ChartCard title="New vs returning" table={{ keys: v.keys, unit: v.unit, series: s }}><LineChart label="New and returning visits" keys={v.keys} unit={v.unit} series={s} /></ChartCard>;
        }}</Loadable>
        <Card title="Retention" aside={<Link className="adm-link" to="/admin/analytics/retention">Cohorts</Link>}>
          <Loadable q={ret}>{r => (
            <div className="adm-stat-row">
              {[['Day 1', r.overall.d1, r.definitions.d1], ['Day 7', r.overall.d7, r.definitions.d7], ['Day 30', r.overall.d30, r.definitions.d30]].map(([l, v, d]) => (
                <div key={l} className="adm-stat" title={d}><span>{l}</span><strong>{v == null ? '—' : pct(v)}</strong><small>{v == null ? 'Not enough data yet' : d}</small></div>
              ))}
            </div>
          )}</Loadable>
        </Card>
        <Card title="Traffic sources" aside={<Link className="adm-link" to="/admin/analytics/traffic">Details</Link>}>
          <Loadable q={traffic}>{t => <BarList rows={t.sources.map(s => ({ label: s.source[0].toUpperCase() + s.source.slice(1), value: s.sessions }))} />}</Loadable>
        </Card>
      </div>
    </>
  );
}

/* ---------- account actions ---------- */

const REASONS = [['spam', 'Spam'], ['abuse', 'Abuse'], ['security', 'Security'], ['policy', 'Policy violation'], ['other', 'Other']];
const ROLE_OPTIONS = ['USER', 'ANALYST', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN'];

/** Every account action with its confirmation. `allowed` comes from the server's user detail (or is inferred in lists). */
export function UserActions({ user, allowed, onDone, compact = false }) {
  const ui = useUI();
  const nav = useNavigate();
  const [dlg, setDlg] = useState(null);
  const [role, setRole] = useState(user.role || 'USER');
  const done = msg => { ui.toast(msg); onDone?.(); };
  const status = user.status || 'active';
  const items = [
    !compact && allowed.moderate && ['rename', Pencil, 'Rename'],
    allowed.moderate && status === 'active' && ['suspend', UserX, 'Suspend'],
    allowed.moderate && status === 'suspended' && ['activate', UserCheck, 'Activate'],
    allowed.delete && status === 'deleted' && ['activate', UserCheck, 'Restore'],
    allowed.revokeSessions && status === 'active' && ['revoke', LogOut, compact ? 'Sign out' : 'Revoke sessions'],
    !compact && allowed.changeRole && status === 'active' && ['role', KeyRound, 'Change role'],
    allowed.delete && status !== 'deleted' && ['delete', Trash2, 'Delete'],
    !compact && allowed.purge && ['purge', Trash2, 'Delete permanently']
  ].filter(Boolean);
  if (!items.length) return compact ? null : <p className="adm-muted">You can't change this account.</p>;
  const label = `${user.username}`;
  return (
    <>
      <div className={`adm-actions${compact ? ' compact' : ''}`}>
        {items.map(([k, Icon, l]) => (
          <button key={k + l} type="button" className={`btn ${compact ? 'ghost sm' : 'outline sm'}${k === 'delete' || k === 'purge' ? ' danger-text' : ''}`} onClick={() => { setRole(user.role || 'USER'); setDlg(k); }} aria-label={`${l} ${label}`} title={l}>
            <Icon size="1em" />{compact ? null : l}
          </button>
        ))}
      </div>
      <Confirm open={dlg === 'suspend'} onClose={() => setDlg(null)} title={`Suspend ${label}?`} danger confirmLabel="Suspend account"
        body={<>Are you sure you want to suspend this account? They'll be signed out everywhere and can't sign in until reactivated.</>}
        reasons={REASONS} note="Note (optional, saved in the audit log)"
        onConfirm={async ({ reason, note }) => { await apost(`/users/${user.id}/suspend`, { reason, note }); done(`${label} suspended`); }} />
      <Confirm open={dlg === 'activate'} onClose={() => setDlg(null)} title={status === 'deleted' ? `Restore ${label}?` : `Activate ${label}?`} confirmLabel={status === 'deleted' ? 'Restore account' : 'Activate account'}
        body="They'll be able to sign in again." onConfirm={async () => { await apost(`/users/${user.id}/activate`); done(`${label} is active again`); }} />
      <Confirm open={dlg === 'revoke'} onClose={() => setDlg(null)} title="Revoke all sessions?" confirmLabel="Revoke sessions" danger
        body={`Revoke all active sessions for ${label}? They'll be signed out on every device.`}
        onConfirm={async () => { const r = await apost(`/users/${user.id}/revoke-sessions`, {}); done(`${r.revoked} session${r.revoked === 1 ? '' : 's'} revoked`); }} />
      <Confirm open={dlg === 'delete'} onClose={() => setDlg(null)} title={`Delete ${label}?`} danger confirmLabel="Delete account" typeToConfirm="DELETE"
        body="The account will be deleted and signed out everywhere. This is a soft delete: an admin can restore it later." note="Reason (optional)"
        onConfirm={async ({ note }) => { await adelete(`/users/${user.id}`, { confirm: 'DELETE', reason: note }); done(`${label} deleted`); }} />
      <Confirm open={dlg === 'purge'} onClose={() => setDlg(null)} title={`Permanently delete ${label}?`} danger confirmLabel="Delete permanently" typeToConfirm="DELETE"
        body="This removes the account, typing history, sessions and friendships for good. It cannot be undone. The audit log keeps a record that it happened."
        onConfirm={async () => { await apost(`/users/${user.id}/purge`, { confirm: 'DELETE' }); ui.toast(`${label} permanently deleted`); nav('/admin/users?view=deleted'); }} />
      <Confirm open={dlg === 'role'} onClose={() => setDlg(null)} title="Change role" confirmLabel="Change role" danger={['ADMIN', 'SUPER_ADMIN'].includes(role)}
        body={<>
          <label className="adm-select block"><span>New role for {label}</span>
            <select value={role} onChange={e => setRole(e.target.value)}>{ROLE_OPTIONS.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}</select>
          </label>
          {['ADMIN', 'SUPER_ADMIN'].includes(role) && role !== user.role && <p className="adm-warn-text">You're granting administrator privileges. Continue?</p>}
        </>}
        onConfirm={async () => { if (role === (user.role || 'USER')) throw new Error('Choose a different role.'); await apost(`/users/${user.id}/role`, { role, confirm: true }); done(`${label} is now ${role.replace('_', ' ')}`); }} />
      <Rename open={dlg === 'rename'} user={user} onClose={() => setDlg(null)} onDone={() => done('Username changed')} />
    </>
  );
}

function Rename({ open, user, onClose, onDone }) {
  const [name, setName] = useState(user.username);
  return (
    <Confirm open={open} onClose={onClose} title={`Rename ${user.username}`} confirmLabel="Save username"
      body={<label className="adm-select block"><span>New username</span><input className="adm-input" defaultValue={user.username} onChange={e => setName(e.target.value)} maxLength={20} autoFocus /></label>}
      onConfirm={async () => { await apatch(`/users/${user.id}`, { username: name }); onDone(); }} />
  );
}

/* ---------- users ---------- */

const VIEWS = [['all', 'All'], ['active', 'Active'], ['new', 'New'], ['suspended', 'Suspended'], ['deleted', 'Deleted'], ['admins', 'Staff']];

export function UsersPage() {
  const { can, me } = useAdmin();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const F = useUrlFilters(sp, setSp, { view: 'all', sort: 'createdAt', dir: 'desc', page: '1' });
  const q = useQuery('/users', { ...F.all, limit: 25 });
  const counts = q.data?.counts;
  const rank = { USER: 0, ANALYST: 1, MODERATOR: 2, ADMIN: 3, SUPER_ADMIN: 4 };
  const allowedFor = u => {
    const lower = rank[u.role] < rank[me.user.role] && u.id !== me.user.id;
    return { moderate: can('users.moderate') && lower, delete: can('users.delete') && lower, revokeSessions: can('sessions.manage') && lower };
  };
  const title = { all: 'All users', active: 'Active users', new: 'New users', suspended: 'Suspended users', deleted: 'Deleted users', admins: 'Staff accounts' }[F.get('view')] || 'Users';
  return (
    <>
      <PageHead kicker="Users" title={title} sub={F.get('view') === 'active' ? 'Signed in or active in the last 30 days.' : F.get('view') === 'new' ? 'Joined in the last 7 days.' : 'Search, filter and manage every Cadence account.'} />
      <Tabs label="User views" value={F.get('view')} onChange={v => F.set({ view: v })} items={VIEWS.map(([v, l]) => [v, l, counts?.[v === 'admins' ? 'admins' : v]])} />
      <FilterBar active={F.active - (F.get('view') !== 'all' ? 1 : 0)} onClear={() => F.clear(['view'])}>
        <SearchBox value={F.get('q')} onChange={v => F.set({ q: v })} placeholder="Username, email or user ID" />
        <Select label="Role" value={F.get('role')} onChange={v => F.set({ role: v })} options={[['', 'Any role'], ...ROLE_OPTIONS.map(r => [r, r.replace('_', ' ')])]} />
        <Select label="Status" value={F.get('status')} onChange={v => F.set({ status: v })} options={[['', 'Any status'], ['active', 'Active'], ['suspended', 'Suspended'], ['deleted', 'Deleted']]} />
        <Select label="Sign-in" value={F.get('provider')} onChange={v => F.set({ provider: v })} options={[['', 'Any provider'], ['email', 'Email'], ['github', 'GitHub'], ['google', 'Google']]} />
        <DateFilter from={F.get('from')} to={F.get('to')} onChange={d => F.set(d)} />
      </FilterBar>
      <Card pad={false}>
        <DataTable q={q} caption={title} sort={F.get('sort')} dir={F.get('dir')} onSort={(s, d) => F.set({ sort: s, dir: d })} onRow={u => nav(`/admin/users/${u.id}`)}
          empty={F.active ? 'No users match these filters.' : 'No users yet.'}
          columns={[
            { key: 'user', label: 'User', sort: 'usernameNormalized', render: u => <UserCell user={u} sub={u.email} /> },
            { key: 'id', label: 'User ID', hideSm: true, hideMd: true, render: u => <span className="adm-mono">{u.id.slice(-8)}<CopyButton value={u.id} label="Copy user ID" /></span> },
            { key: 'provider', label: 'Sign-in', hideSm: true, render: u => <span className="adm-providers">{u.providers.includes('github') && <Github size="1em" aria-label="GitHub" />}{u.providers.includes('google') && <Chrome size="1em" aria-label="Google" />}{u.provider === 'email' && <Mail size="1em" aria-label="Email" />}{u.githubLogin && <small>@{u.githubLogin}</small>}</span> },
            { key: 'status', label: 'Status', render: u => <Status value={u.status} /> },
            { key: 'role', label: 'Role', render: u => <Role value={u.role} /> },
            { key: 'createdAt', label: 'Created', sort: 'createdAt', hideSm: true, render: u => <time dateTime={u.createdAt} title={dateTime(u.createdAt)}>{dateOnly(u.createdAt)}</time> },
            { key: 'lastLoginAt', label: 'Last login', sort: 'lastLoginAt', hideSm: true, hideMd: true, render: u => <span title={dateTime(u.lastLoginAt)}>{ago(u.lastLoginAt)}</span> },
            { key: 'lastActiveAt', label: 'Last activity', sort: 'lastActiveAt', render: u => <span title={dateTime(u.lastActiveAt)}>{ago(u.lastActiveAt)}</span> },
            { key: 'sessions', label: 'Sessions', align: 'right', hideSm: true, render: u => num(u.sessions) },
            { key: 'actions', label: <span className="sr">Actions</span>, render: u => <span className="adm-row-actions"><Link className="btn ghost sm" to={`/admin/users/${u.id}`} aria-label={`View ${u.username}`}><Eye size="1em" /></Link><UserActions compact user={u} allowed={allowedFor(u)} onDone={q.refresh} /></span> }
          ]} />
        <Pager data={q.data} onPage={p => F.set({ page: String(p) })} />
      </Card>
    </>
  );
}

const TIMELINE_LABEL = {
  signup: 'Created an account', login: 'Signed in', failed: 'Failed sign-in attempt', logout: 'Signed out', revoked: 'Session revoked', blocked: 'Blocked sign-in (account not active)',
  PROFILE_UPDATED: 'Updated profile', SETTINGS_CHANGED: 'Changed settings', FRIEND_REQUEST: 'Sent a friend request', FRIEND_ACCEPTED: 'Accepted a friend',
  ROOM_CREATED: 'Created a typing room', ROOM_JOINED: 'Joined a typing room', ROOM_LEFT: 'Left a typing room', GAME_STARTED: 'Started a race', GAME_FINISHED: 'Finished a race',
  ACCOUNT_SUSPENDED: 'Account suspended', ACCOUNT_ACTIVATED: 'Account activated', ADMIN_ACTION: 'Admin action', SECURITY_EVENT: 'Security event', ACCOUNT_DELETED: 'Deleted their account'
};
function timelineText(i) {
  if (i.label) return i.label;
  const base = TIMELINE_LABEL[i.type] || i.type.replace(/_/g, ' ').toLowerCase();
  const m = i.metadata || {};
  if (i.kind === 'auth') return `${base}${m.provider ? ` with ${m.provider}` : ''}${m.reason ? ` (${m.reason.replace(/_/g, ' ')})` : ''}`;
  if (i.type === 'ADMIN_ACTION' && m) return `Admin ${String(i.metadata?.to ? `changed role to ${m.to}` : 'action')}`;
  if (m.code) return `${base} ${m.code}${m.rank ? `, placed ${m.rank} of ${m.players}` : ''}`;
  if (m.reason) return `${base}: ${m.reason}`;
  return base;
}

function Timeline({ userId }) {
  const [pages, setPages] = useState([]);
  const [cursor, setCursor] = useState(null);
  const first = useQuery(`/users/${userId}/timeline`, { limit: 30 });
  const [loadingMore, setLoadingMore] = useState(false);
  const items = [...(first.data?.items || []), ...pages];
  const next = pages.length ? cursor : first.data?.nextBefore;
  const more = async () => {
    setLoadingMore(true);
    try { const r = await aget(`/users/${userId}/timeline`, { limit: 30, before: next }); setPages(p => [...p, ...r.items]); setCursor(r.nextBefore); }
    finally { setLoadingMore(false); }
  };
  const groups = useMemo(() => {
    const out = [];
    const today = new Date().toDateString(), yest = new Date(Date.now() - 864e5).toDateString();
    for (const it of items) {
      const d = new Date(it.at).toDateString();
      const label = d === today ? 'Today' : d === yest ? 'Yesterday' : dateOnly(it.at);
      if (!out.length || out[out.length - 1].label !== label) out.push({ label, items: [] });
      out[out.length - 1].items.push(it);
    }
    return out;
  }, [items]);
  return (
    <Loadable q={first}>{() => !items.length ? <Empty title="No activity recorded yet." /> : (
      <div className="adm-timeline">
        {groups.map(g => (
          <section key={g.label}>
            <h3>{g.label}</h3>
            <ol>
              {g.items.map((i, n) => (
                <li key={`${i.at}-${n}`} className={i.result === 'failure' ? 'fail' : i.kind}>
                  <time dateTime={i.at}>{timeOnly(i.at)}</time>
                  <span>{timelineText(i)}{i.kind === 'test' && i.metadata && <small>{i.metadata.wpm} wpm · {i.metadata.acc}%</small>}{i.kind === 'auth' && i.metadata?.device && <small>{i.metadata.browser} · {i.metadata.device}{i.metadata.country ? ` · ${i.metadata.country}` : ''}</small>}{i.byAdmin && <small>by an admin</small>}</span>
                </li>
              ))}
            </ol>
          </section>
        ))}
        {next && <button type="button" className="btn outline sm" onClick={more} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load older activity'}</button>}
      </div>
    )}</Loadable>
  );
}

export function UserDetail() {
  const { id } = useParams();
  const ui = useUI();
  const q = useQuery(`/users/${id}`);
  const reduce = useReducedMotion();
  const [revoke, setRevoke] = useState(null);
  return (
    <Loadable q={q} skeleton={<><Skeleton h="5rem" /><div className="adm-grid-2" style={{ marginTop: '1rem' }}><Skeleton h="14rem" /><Skeleton h="14rem" /></div></>}>{d => {
      const u = d.user, a = d.authentication;
      return (
        <motion.div initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <Link to="/admin/users" className="adm-backlink"><ArrowLeft size="1em" />Users</Link>
          <header className="adm-profile">
            <Avatar name={u.username} url={u.avatar} size="lg" />
            <div className="adm-profile-main">
              <h1>{u.username} <Role value={u.role} /> <Status value={u.status} /></h1>
              <p>{u.email} · <span className="adm-mono">{u.id}</span><CopyButton value={u.id} label="Copy user ID" /></p>
              {u.suspension && <p className="adm-warn-text">Suspended {ago(u.suspension.at)} for {u.suspension.reason}{u.suspension.note ? `: ${u.suspension.note}` : ''}</p>}
            </div>
            <UserActions user={u} allowed={d.allowed} onDone={q.refresh} />
          </header>
          <div className="adm-grid-3">
            <Card title="Profile">
              <Facts items={[
                ['Joined', dateTime(u.createdAt)], ['Last updated', dateTime(u.updatedAt)], ['Last login', u.lastLoginAt ? `${dateTime(u.lastLoginAt)} (${ago(u.lastLoginAt)})` : 'Never'],
                ['Last activity', u.lastActiveAt ? ago(u.lastActiveAt) : 'Never'], ['Signed up from', u.signupCountry ? `${flag(u.signupCountry)} ${countryName(u.signupCountry)} (approx.)` : 'Unknown'],
                ['Onboarding', u.profileCompleted ? 'Completed' : 'Username not chosen yet']
              ]} />
            </Card>
            <Card title="Authentication">
              <ul className="adm-auth-list">
                <li><Mail size="1em" aria-hidden="true" /><div><strong>Email and password</strong><small>{a.email.connected ? `Connected${a.email.lastAuth ? ` · last used ${ago(a.email.lastAuth)}` : ''}` : 'Not set up'}</small></div>{a.email.connected && <Status value="active" />}</li>
                <li><Github size="1em" aria-hidden="true" /><div><strong>GitHub{a.github.login ? ` @${a.github.login}` : ''}</strong>
                  <small>{a.github.connected ? <>Account ID {a.github.accountId} · connected {dateOnly(a.github.connectedAt)}{a.github.lastAuth ? ` · last used ${ago(a.github.lastAuth)}` : ''}</> : 'Not connected'}</small></div>
                  {a.github.profileUrl ? <a className="icon-btn" href={a.github.profileUrl} target="_blank" rel="noopener noreferrer" aria-label="Open GitHub profile"><ExternalLink size="1em" /></a> : a.github.connected ? <Status value="active" /> : null}</li>
                <li><Chrome size="1em" aria-hidden="true" /><div><strong>Google</strong><small>{a.google.connected ? `Account ${a.google.accountId} · connected ${dateOnly(a.google.connectedAt)}${a.google.lastAuth ? ` · last used ${ago(a.google.lastAuth)}` : ''}` : 'Not connected'}</small></div>{a.google.connected && <Status value="active" />}</li>
              </ul>
              <p className="adm-fine">OAuth access tokens are never stored or shown.</p>
            </Card>
            <Card title="Typing">
              <div className="adm-stat-row">
                <div className="adm-stat"><span><Keyboard size="1em" /> Tests</span><strong>{num(d.stats.tests)}</strong></div>
                <div className="adm-stat"><span><Flame size="1em" /> Best</span><strong>{d.stats.best ? `${Math.round(d.stats.best.wpm)}` : '—'}</strong><small>{d.stats.best ? `wpm · ${d.stats.best.mode} ${d.stats.best.mode2}` : 'No valid results'}</small></div>
                <div className="adm-stat"><span><Trophy size="1em" /> Races</span><strong>{num(d.stats.races)}</strong><small>{num(d.stats.wins)} won · {num(d.stats.friends)} friends</small></div>
              </div>
            </Card>
          </div>
          <Card title="Sessions" aside={d.allowed.revokeSessions && d.sessions.some(s => s.status === 'active') && <button type="button" className="btn outline sm" onClick={() => setRevoke('all')}><LogOut size="1em" />Revoke all</button>} pad={false}>
            <DataTable rows={d.sessions} empty="No sessions." dense columns={[
              { key: 'id', label: 'Session', render: s => <span className="adm-mono">{s.id.slice(-8)}</span> },
              { key: 'dev', label: 'Device', render: s => <span><MonitorSmartphone size="1em" aria-hidden="true" /> {device(s)}</span> },
              { key: 'ip', label: 'IP / location', hideSm: true, render: s => <span>{s.ip || '—'}{s.country && <small className="adm-muted"> {where(s)}</small>}</span> },
              { key: 'created', label: 'Created', hideSm: true, render: s => dateTime(s.createdAt) },
              { key: 'last', label: 'Last active', render: s => ago(s.lastActiveAt) },
              { key: 'exp', label: 'Expires', hideSm: true, render: s => (s.status === 'revoked' ? `Revoked ${ago(s.revokedAt)}${s.revokedReason ? ` (${s.revokedReason})` : ''}` : dateTime(s.expiresAt)) },
              { key: 'status', label: 'Status', render: s => <Status value={s.status} /> },
              { key: 'a', label: <span className="sr">Actions</span>, render: s => s.status === 'active' && d.allowed.revokeSessions ? <button type="button" className="btn ghost sm" onClick={() => setRevoke(s.id)}>Revoke</button> : null }
            ]} />
          </Card>
          <div className="adm-grid-2">
            <Card title="Security" aside={<span className="adm-muted">{d.security.failedLast24h} failed sign-ins in 24 h</span>}>
              {!d.security.events.length ? <Empty icon={ShieldCheck} title="No security events." /> : (
                <ul className="adm-events">{d.security.events.map(e => <li key={e.id}><Severity value={e.severity} /><span>{e.title}<small>{e.count > 1 ? `${e.count} times · ` : ''}{ago(e.lastSeenAt)}{e.acknowledged ? ' · acknowledged' : ''}</small></span></li>)}</ul>
              )}
            </Card>
            <Card title="Sign-in history" pad={false}>
              <DataTable rows={d.logins} dense empty="No sign-ins recorded." columns={[
                { key: 't', label: 'When', render: l => <span title={dateTime(l.createdAt)}>{ago(l.createdAt)}</span> },
                { key: 'type', label: 'Event', render: l => <span className={l.success ? '' : 'adm-bad'}>{TIMELINE_LABEL[l.type] || l.type}{l.reason ? ` · ${l.reason.replace(/_/g, ' ')}` : ''}</span> },
                { key: 'p', label: 'Provider', hideSm: true, render: l => l.provider || '—' },
                { key: 'd', label: 'Device', hideSm: true, render: l => device(l) },
                { key: 'ip', label: 'IP', hideSm: true, render: l => l.ip || '—' },
                { key: 'risk', label: 'Risk', render: l => (l.risk !== 'normal' ? <Severity value={l.risk} /> : null) }
              ]} />
            </Card>
          </div>
          <Card title="Activity timeline"><Timeline userId={u.id} /></Card>
          <Confirm open={!!revoke} onClose={() => setRevoke(null)} danger confirmLabel="Revoke"
            title={revoke === 'all' ? 'Revoke all sessions?' : 'Revoke this session?'} body={revoke === 'all' ? `Revoke all active sessions for ${u.username}? They'll be signed out on every device.` : 'That device will be signed out immediately.'}
            onConfirm={async () => { const r = await apost(`/users/${u.id}/revoke-sessions`, revoke === 'all' ? {} : { sessionId: revoke }); ui.toast(`${r.revoked} session${r.revoked === 1 ? '' : 's'} revoked`); q.refresh(); }} />
        </motion.div>
      );
    }}</Loadable>
  );
}

/* ---------- authentication ---------- */

export function LoginsPage() {
  const [sp, setSp] = useSearchParams();
  const F = useUrlFilters(sp, setSp, { page: '1' });
  const R = useRange('7d');
  const stats = useQuery('/logins/stats', R.params || {}, { enabled: !!R.params });
  const q = useQuery('/logins', { ...F.all, limit: 30 });
  return (
    <>
      <PageHead kicker="Authentication" title="Login activity" sub="Every sign-up, sign-in, failure and sign-out." actions={<RangePicker {...R} onChange={R.set} />} />
      <div className="adm-grid-2">
        <Loadable q={stats}>{s => {
          const series = [{ name: 'Successful logins', values: s.logins, total: s.totals.logins }, { name: 'Failed attempts', values: s.failed, total: s.totals.failed }, { name: 'Sign-ups', values: s.signups, total: s.totals.signups }];
          return <ChartCard title="Login volume" table={{ keys: s.keys, unit: s.unit, series }}><LineChart label="Login volume" keys={s.keys} unit={s.unit} series={series} /></ChartCard>;
        }}</Loadable>
        <Loadable q={stats}>{s => (
          <ChartCard title="Login success rate" aside={<strong>{s.totals.successRate == null ? '—' : pct(s.totals.successRate, 1)}</strong>} table={{ keys: s.keys, unit: s.unit, series: [{ name: 'Success rate', values: s.successRate }], percent: true }}>
            <LineChart label="Share of sign-in attempts that succeeded" keys={s.keys} unit={s.unit} series={[{ name: 'Success rate', values: s.successRate }]} percent />
          </ChartCard>
        )}</Loadable>
      </div>
      <FilterBar active={F.active} onClear={() => F.clear()}>
        <SearchBox value={F.get('q')} onChange={v => F.set({ q: v })} placeholder="Exact email, username or IP" />
        <Select label="Event" value={F.get('type')} onChange={v => F.set({ type: v })} options={[['', 'Any event'], ['login', 'Sign-in'], ['failed', 'Failed'], ['signup', 'Sign-up'], ['logout', 'Sign-out'], ['revoked', 'Revoked'], ['blocked', 'Blocked']]} />
        <Select label="Result" value={F.get('success')} onChange={v => F.set({ success: v })} options={[['', 'Any result'], ['true', 'Successful'], ['false', 'Failed']]} />
        <Select label="Provider" value={F.get('provider')} onChange={v => F.set({ provider: v })} options={[['', 'Any provider'], ['email', 'Email'], ['github', 'GitHub'], ['google', 'Google']]} />
        <Select label="Device" value={F.get('device')} onChange={v => F.set({ device: v })} options={[['', 'Any device'], 'Desktop', 'Mobile', 'Tablet']} />
        <Select label="Risk" value={F.get('risk')} onChange={v => F.set({ risk: v })} options={[['', 'Any risk'], ['normal', 'Normal'], ['suspicious', 'Suspicious'], ['critical', 'Critical']]} />
        <DateFilter from={F.get('from')} to={F.get('to')} onChange={d => F.set(d)} />
      </FilterBar>
      <Card pad={false}>
        <DataTable q={q} caption="Login events" empty="No login activity found." columns={[
          { key: 'at', label: 'Time', render: l => <span title={dateTime(l.at)}>{dateTime(l.at)}</span> },
          { key: 'user', label: 'User', render: l => (l.user ? <UserCell user={{ id: l.user.id, username: l.user.username }} sub={l.identifier} /> : <span className="adm-muted">{l.identifier || 'Unknown'}</span>) },
          { key: 'type', label: 'Event', render: l => <span className={l.success ? '' : 'adm-bad'}>{TIMELINE_LABEL[l.type] || l.type}{l.reason ? <small> · {l.reason.replace(/_/g, ' ')}</small> : null}</span> },
          { key: 'result', label: 'Result', render: l => <Status value={l.success ? 'success' : 'failure'} /> },
          { key: 'provider', label: 'Provider', hideSm: true, render: l => l.provider || '—' },
          { key: 'device', label: 'Device', hideSm: true, render: l => device(l) },
          { key: 'ip', label: 'IP / location', hideSm: true, render: l => <span>{l.ip || '—'} <small className="adm-muted">{where(l)}</small></span> },
          { key: 'session', label: 'Session', hideSm: true, hideMd: true, render: l => (l.session ? <span className="adm-mono">{l.session}{l.endedAt && <small className="adm-muted"> · ended {ago(l.endedAt)}</small>}</span> : '—') },
          { key: 'risk', label: 'Risk', render: l => (l.risk !== 'normal' ? <Severity value={l.risk} /> : <span className="adm-muted">—</span>) }
        ]} />
        <Pager data={q.data} onPage={p => F.set({ page: String(p) })} />
      </Card>
    </>
  );
}

export function SessionsPage() {
  const ui = useUI();
  const [sp, setSp] = useSearchParams();
  const F = useUrlFilters(sp, setSp, { status: 'active', page: '1' });
  const q = useQuery('/sessions', { ...F.all, limit: 30 });
  const [revoke, setRevoke] = useState(null);
  return (
    <>
      <PageHead kicker="Authentication" title="Sessions" sub="Signed-in devices across all accounts. Revoking a session signs that device out immediately." />
      <Tabs label="Session status" value={F.get('status')} onChange={v => F.set({ status: v })} items={[['active', 'Active'], ['revoked', 'Revoked'], ['expired', 'Expired'], ['all', 'All']]} />
      <FilterBar active={F.active - (F.get('status') !== 'active' ? 1 : 0)} onClear={() => F.clear(['status'])}>
        <SearchBox value={F.get('user')} onChange={v => F.set({ user: v })} placeholder="Username or user ID" label="User" />
        <Select label="Device" value={F.get('device')} onChange={v => F.set({ device: v })} options={[['', 'Any device'], 'Desktop', 'Mobile', 'Tablet']} />
        <Select label="Browser" value={F.get('browser')} onChange={v => F.set({ browser: v })} options={[['', 'Any browser'], 'Chrome', 'Edge', 'Firefox', 'Safari', 'Opera', 'Samsung Internet', 'Other']} />
        <DateFilter from={F.get('from')} to={F.get('to')} onChange={d => F.set(d)} />
      </FilterBar>
      <Card pad={false}>
        <DataTable q={q} caption="Sessions" empty="No sessions match." columns={[
          { key: 'user', label: 'User', render: s => <UserCell user={s.user} sub={s.current ? 'This is you, here' : s.provider || undefined} /> },
          { key: 'device', label: 'Device', render: s => device(s) },
          { key: 'ip', label: 'IP / location', hideSm: true, render: s => <span>{s.ip || '—'} <small className="adm-muted">{where(s)}</small></span> },
          { key: 'created', label: 'Created', hideSm: true, render: s => dateTime(s.createdAt) },
          { key: 'last', label: 'Last active', render: s => <span title={dateTime(s.lastActiveAt)}>{ago(s.lastActiveAt)}</span> },
          { key: 'exp', label: 'Expires', hideSm: true, render: s => dateTime(s.expiresAt) },
          { key: 'status', label: 'Status', render: s => <span><Status value={s.status} />{s.revokedReason && <small className="adm-muted"> {s.revokedReason}</small>}</span> },
          { key: 'a', label: <span className="sr">Actions</span>, render: s => (s.status === 'active' ? <button type="button" className="btn ghost sm" onClick={() => setRevoke(s)}>Revoke</button> : null) }
        ]} />
        <Pager data={q.data} onPage={p => F.set({ page: String(p) })} />
      </Card>
      <Confirm open={!!revoke} onClose={() => setRevoke(null)} danger confirmLabel="Revoke session" title="Revoke this session?"
        body={revoke?.current ? 'This is your current session: you will be signed out.' : `${revoke?.user?.username || 'This user'} will be signed out on ${revoke ? device(revoke) : ''}.`}
        onConfirm={async () => { await apost(`/sessions/${revoke.id}/revoke`); ui.toast('Session revoked'); if (revoke.current) window.location.href = '/login'; else q.refresh(); }} />
    </>
  );
}

export function FailedLoginsPage() {
  const R = useRange('7d');
  const q = useQuery('/security/failed', R.params || {}, { enabled: !!R.params, poll: 60000 });
  return (
    <>
      <PageHead kicker="Authentication" title="Failed logins" sub="Failed sign-ins grouped by account and by IP address. Patterns are flagged; nobody is blocked automatically." actions={<RangePicker {...R} onChange={R.set} />} />
      <Loadable q={q}>{d => (
        <>
          <div className="adm-kpis small">
            <div className="adm-kpi"><span className="adm-kpi-label">Failed attempts</span><strong className="adm-kpi-value">{num(d.total)}</strong></div>
            <div className="adm-kpi"><span className="adm-kpi-label">Accounts targeted</span><strong className="adm-kpi-value">{num(d.byAccount.length)}</strong></div>
            <div className="adm-kpi"><span className="adm-kpi-label">Source IPs</span><strong className="adm-kpi-value">{num(d.byIp.length)}</strong></div>
            <div className="adm-kpi"><span className="adm-kpi-label">Flagged accounts</span><strong className="adm-kpi-value">{num(d.byAccount.filter(a => a.risk !== 'normal').length)}</strong></div>
          </div>
          <div className="adm-grid-2">
            <Card title="By account" pad={false}>
              <DataTable rows={d.byAccount} rowKey={r => r.identifier + r.last} dense empty="No failed sign-ins." columns={[
                { key: 'id', label: 'Account', render: r => (r.user ? <UserCell user={r.user} sub={r.identifier} /> : <span>{r.identifier}<small className="adm-muted"> · no such account</small></span>) },
                { key: 'n', label: 'Attempts', align: 'right', render: r => num(r.attempts) },
                { key: 'ips', label: 'IPs', align: 'right', hideSm: true, render: r => num(r.ips) },
                { key: 'reason', label: 'Reason', hideSm: true, render: r => r.reasons.map(x => x.replace(/_/g, ' ')).join(', ') },
                { key: 'last', label: 'Last', render: r => ago(r.last) },
                { key: 'risk', label: 'Status', render: r => <Severity value={r.risk} /> }
              ]} />
            </Card>
            <Card title="By IP address" pad={false}>
              <DataTable rows={d.byIp} rowKey={r => r.ip} dense empty="No failed sign-ins." columns={[
                { key: 'ip', label: 'IP', render: r => <span className="adm-mono">{r.ip}</span> },
                { key: 'n', label: 'Attempts', align: 'right', render: r => num(r.attempts) },
                { key: 'acc', label: 'Accounts', align: 'right', render: r => num(r.accounts) },
                { key: 'dev', label: 'Device', hideSm: true, render: r => device(r) },
                { key: 'last', label: 'Last', render: r => ago(r.last) },
                { key: 'risk', label: 'Status', render: r => <Severity value={r.risk} /> }
              ]} />
            </Card>
          </div>
          <p className="adm-fine">Unknown emails are counted through a one-way hash and shown masked; the address itself is never stored.</p>
        </>
      )}</Loadable>
    </>
  );
}

export function OAuthPage() {
  const [sp, setSp] = useSearchParams();
  const F = useUrlFilters(sp, setSp, { provider: 'all', page: '1' });
  const q = useQuery('/oauth', { ...F.all, provider: F.get('provider') === 'all' ? '' : F.get('provider'), limit: 30 });
  return (
    <>
      <PageHead kicker="Authentication" title="OAuth accounts" sub="Connected GitHub and Google accounts. Only public profile identifiers are kept; access tokens are never stored." />
      <Tabs label="Provider" value={F.get('provider')} onChange={v => F.set({ provider: v })} items={[['all', 'All'], ['github', 'GitHub'], ['google', 'Google']]} />
      <FilterBar active={F.get('q') ? 1 : 0} onClear={() => F.set({ q: '' })}><SearchBox value={F.get('q')} onChange={v => F.set({ q: v })} placeholder="Username or GitHub login" /></FilterBar>
      <Card pad={false}>
        <DataTable q={q} rowKey={r => r.user.id} empty="No connected accounts." columns={[
          { key: 'u', label: 'User', render: r => <UserCell user={r.user} sub={`Signed up with ${r.primary}`} /> },
          { key: 'gh', label: 'GitHub', render: r => (r.github ? <span>{r.github.login ? <a href={`https://github.com/${r.github.login}`} target="_blank" rel="noopener noreferrer" className="adm-link"><Github size="1em" /> @{r.github.login}</a> : <><Github size="1em" /> connected</>}<small className="adm-muted"> · ID {r.github.accountId}</small></span> : <span className="adm-muted">—</span>) },
          { key: 'ghc', label: 'GitHub connected', hideSm: true, render: r => (r.github ? dateOnly(r.github.connectedAt) : '—') },
          { key: 'ghl', label: 'Last GitHub sign-in', hideSm: true, render: r => (r.github ? ago(r.github.lastAuth) : '—') },
          { key: 'g', label: 'Google', render: r => (r.google ? <span><Chrome size="1em" /> <span className="adm-mono">{r.google.accountId}</span></span> : <span className="adm-muted">—</span>) },
          { key: 'gl', label: 'Last Google sign-in', hideSm: true, render: r => (r.google ? ago(r.google.lastAuth) : '—') },
          { key: 's', label: 'Status', render: r => <Status value={r.user.status} /> }
        ]} />
        <Pager data={q.data} onPage={p => F.set({ page: String(p) })} />
      </Card>
    </>
  );
}

export function SecurityPage() {
  const ui = useUI();
  const { refreshMe } = useAdmin();
  const [sp, setSp] = useSearchParams();
  const F = useUrlFilters(sp, setSp, { state: 'open', page: '1' });
  const q = useQuery('/security', { ...F.all, state: F.get('state') === 'all' ? '' : F.get('state'), limit: 30 }, { poll: 30000 });
  const ack = async e => { await apost(`/security/${e.id}/ack`); ui.toast('Acknowledged'); q.refresh(); refreshMe(); };
  const open = q.data?.open;
  return (
    <>
      <PageHead kicker="Activity" title="Security events" sub="Detected patterns: repeated failures, one IP trying many accounts, unusual sign-ins and denied admin access. Signals are flagged for review, never acted on automatically." />
      <div className="adm-kpis small">
        {['critical', 'suspicious', 'normal'].map(s => <button key={s} type="button" className={`adm-kpi as-button${F.get('severity') === s ? ' on' : ''}`} onClick={() => F.set({ severity: F.get('severity') === s ? '' : s })} aria-pressed={F.get('severity') === s}><span className="adm-kpi-label"><Severity value={s} /></span><strong className="adm-kpi-value">{open ? num(open[s]) : '—'}</strong><span className="adm-kpi-compare">open</span></button>)}
      </div>
      <Tabs label="State" value={F.get('state')} onChange={v => F.set({ state: v })} items={[['open', 'Open'], ['acknowledged', 'Acknowledged'], ['all', 'All']]} />
      <FilterBar active={F.active - (F.get('state') !== 'open' ? 1 : 0)} onClear={() => F.clear(['state'])}>
        <Select label="Type" value={F.get('type')} onChange={v => F.set({ type: v })} options={[['', 'Any type'], ...(q.data?.types || []).map(t => [t, t.replace(/_/g, ' ')])]} />
        <SearchBox value={F.get('user')} onChange={v => F.set({ user: v })} placeholder="Username" label="User" />
        <DateFilter from={F.get('from')} to={F.get('to')} onChange={d => F.set(d)} />
      </FilterBar>
      <Card pad={false}>
        <DataTable q={q} caption="Security events" empty="No security events." columns={[
          { key: 'sev', label: 'Severity', render: e => <Severity value={e.severity} /> },
          { key: 'title', label: 'Event', render: e => <span>{e.title}<small className="adm-muted"> · {e.type.replace(/_/g, ' ')}</small></span> },
          { key: 'count', label: 'Count', align: 'right', render: e => num(e.count) },
          { key: 'user', label: 'User', hideSm: true, render: e => (e.user ? <UserCell user={e.user} /> : e.identifier || '—') },
          { key: 'ip', label: 'IP', hideSm: true, render: e => <span className="adm-mono">{e.ip || '—'}</span> },
          { key: 'first', label: 'First seen', hideSm: true, render: e => dateTime(e.createdAt) },
          { key: 'last', label: 'Last seen', render: e => ago(e.lastSeenAt) },
          { key: 'a', label: <span className="sr">Actions</span>, render: e => (e.acknowledged ? <small className="adm-muted">by {e.acknowledged.by}</small> : <button type="button" className="btn ghost sm" onClick={() => ack(e)}>Acknowledge</button>) }
        ]} />
        <Pager data={q.data} onPage={p => F.set({ page: String(p) })} />
      </Card>
    </>
  );
}

