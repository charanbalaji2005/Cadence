import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Radio, Download, FileBarChart, ShieldCheck, ShieldAlert, Play, Printer, Server, Cable, HardDrive, Cpu, Bug, CircleCheck, Swords, LogOut, Save, RotateCw, Gauge, Zap } from 'lucide-react';
import { useUI } from '../context/UIContext.jsx';
import { useAdmin, useQuery, useUrlFilters, aget, apost, aput, num, dec, pct, dateTime, ago, dateOnly, duration, bytes, countryName, flag, routeLabel, download, tz } from './lib.js';
import { PageHead, Card, DataTable, Pager, FilterBar, SearchBox, Select, RangePicker, DateFilter, Tabs, Status, Severity, UserCell, Confirm, Facts, Loadable, Empty, Kpi } from './ui.jsx';
import { LineChart, ChartCard, BarList, CohortTable } from './charts.jsx';
import { useRange } from './pages.jsx';

const device = r => [r.device, r.browser && `${r.browser}${r.os ? ` on ${r.os}` : ''}`].filter(Boolean).join(' · ') || '—';
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
const change = c => (c == null ? <span className="adm-muted">new</span> : <span className={`adm-delta ${c > 0 ? 'up' : c < 0 ? 'down' : 'flat'}`}>{c > 0 ? '+' : ''}{c}%</span>);
const statCard = (label, value, sub) => <div className="adm-kpi"><span className="adm-kpi-label">{label}</span><strong className="adm-kpi-value">{value}</strong>{sub && <span className="adm-kpi-compare">{sub}</span>}</div>;

  
export function TrafficManagerCard() {
  const ui = useUI();
  const q = useQuery('/traffic', {}, { poll: 4000 });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [threshold, setThreshold] = useState(300);
  const [concurrent, setConcurrent] = useState(60);

  const simulate = async () => {
    setBusy(true);
    try {
      await apost('/traffic/simulate', { count: 350 });
      ui.toast('Simulated sudden traffic spike of 350 req/min! Auto surge governor engaged.');
      q.reload();
    } catch (err) {
      ui.toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const setMode = async mode => {
    try {
      await aput('/traffic', { mode });
      ui.toast(`Traffic manager mode updated to: ${mode}`);
      q.reload();
    } catch (err) {
      ui.toast(err.message);
    }
  };

  const saveConfig = async () => {
    setBusy(true);
    try {
      await aput('/traffic', {
        surgeThresholdRpm: Number(threshold),
        maxConcurrent: Number(concurrent)
      });
      ui.toast('Traffic manager thresholds saved!');
      setEditing(false);
      q.reload();
    } catch (err) {
      ui.toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Auto Traffic Manager & Surge Governor"
      aside={
        <button
          type="button"
          className="btn outline sm"
          disabled={busy}
          onClick={simulate}
          title="Inject simulated requests to test automated queue/surge response"
        >
          ⚡ Test Surge Spike
        </button>
      }
    >
      <Loadable q={q}>{t => {
        const isSurge = t.status === 'SURGE';
        const isCrit = t.status === 'CRITICAL';
        const statusColor = isCrit ? '#ef4444' : isSurge ? '#f59e0b' : '#10b981';

        return (
          <div>
            {/* Status Bar */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.85rem 1rem',
              borderRadius: '12px',
              background: isCrit ? 'rgba(239, 68, 68, 0.12)' : isSurge ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.1)',
              border: `1px solid ${statusColor}44`,
              marginBottom: '1rem',
              gap: '0.75rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <span style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: statusColor,
                  boxShadow: `0 0 10px ${statusColor}`,
                  display: 'inline-block'
                }} />
                <div>
                  <strong style={{ color: statusColor, fontSize: '0.92rem' }}>
                    STATUS: {t.status}
                  </strong>
                  <div style={{ fontSize: '0.78rem', color: 'var(--sub)' }}>
                    {isCrit
                      ? 'Critical load! Virtual waiting room is actively buffering incoming visitors.'
                      : isSurge
                      ? 'Elevated surge detected. Auto rate governor is protecting backend connections.'
                      : 'All systems normal. Auto surge detection is standing by.'}
                  </div>
                </div>
              </div>

              {/* Mode toggles */}
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button
                  type="button"
                  className={`btn sm ${t.config.mode === 'auto' ? 'primary' : 'outline'}`}
                  onClick={() => setMode('auto')}
                  title="Automatically engage surge mode when threshold is crossed"
                >
                  Auto
                </button>
                <button
                  type="button"
                  className={`btn sm ${t.config.mode === 'always_on' ? 'primary' : 'outline'}`}
                  onClick={() => setMode('always_on')}
                  title="Force surge mode on to verify queue behavior"
                >
                  Surge (Force)
                </button>
                <button
                  type="button"
                  className={`btn sm ${t.config.mode === 'disabled' ? 'primary' : 'outline'}`}
                  onClick={() => setMode('disabled')}
                  title="Disable auto traffic management"
                >
                  Off
                </button>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="adm-kpis small" style={{ marginBottom: '1rem' }}>
              <div className="adm-kpi">
                <span className="adm-kpi-label">Requests / Min (RPM)</span>
                <strong className="adm-kpi-value" style={{ color: t.rpm > t.config.surgeThresholdRpm ? '#f59e0b' : 'inherit' }}>
                  {num(t.rpm)}
                </strong>
                <span className="adm-kpi-compare">Threshold: {num(t.config.surgeThresholdRpm)} RPM</span>
              </div>
              <div className="adm-kpi">
                <span className="adm-kpi-label">Peak Velocity</span>
                <strong className="adm-kpi-value">{t.peakRps}</strong>
                <span className="adm-kpi-compare">Req / second</span>
              </div>
              <div className="adm-kpi">
                <span className="adm-kpi-label">In-Flight Concurrency</span>
                <strong className="adm-kpi-value">{num(t.inFlightRequests)}</strong>
                <span className="adm-kpi-compare">Limit: {num(t.config.maxConcurrent)}</span>
              </div>
              <div className="adm-kpi">
                <span className="adm-kpi-label">Surge Events Mitigated</span>
                <strong className="adm-kpi-value">{num(t.totalSurgeEvents)}</strong>
                <span className="adm-kpi-compare">Queued: {num(t.totalQueuedRequests)}</span>
              </div>
            </div>

            {/* Threshold Configuration Drawer */}
            <div style={{
              background: 'var(--glass, rgba(255,255,255,0.03))',
              border: '1px solid var(--hairline, rgba(255,255,255,0.08))',
              borderRadius: '12px',
              padding: '0.85rem 1rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: editing ? '0.75rem' : 0 }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--sub)' }}>
                  Auto Surge Limits: <strong>{t.config.surgeThresholdRpm} RPM</strong> / <strong>{t.config.maxConcurrent} Concurrent</strong>
                </span>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => {
                    setThreshold(t.config.surgeThresholdRpm);
                    setConcurrent(t.config.maxConcurrent);
                    setEditing(!editing);
                  }}
                >
                  {editing ? 'Cancel' : 'Edit Limits'}
                </button>
              </div>

              {editing && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginTop: '0.5rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--sub)', display: 'block', marginBottom: '0.2rem' }}>
                      Surge Trigger (RPM)
                    </label>
                    <input
                      type="number"
                      className="adm-input"
                      style={{ width: '130px', padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                      value={threshold}
                      onChange={e => setThreshold(e.target.value)}
                      min={20}
                      max={5000}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--sub)', display: 'block', marginBottom: '0.2rem' }}>
                      Max In-Flight Concurrency
                    </label>
                    <input
                      type="number"
                      className="adm-input"
                      style={{ width: '130px', padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                      value={concurrent}
                      onChange={e => setConcurrent(e.target.value)}
                      min={10}
                      max={500}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn primary sm"
                    disabled={busy}
                    onClick={saveConfig}
                  >
                    Save Limits
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      }}</Loadable>
    </Card>
  );
}

/* ---------- visitors ---------- */

export function LiveVisitors() {
  const q = useQuery('/visitors/live', {}, { poll: 5000 });
  const reduce = useReducedMotion();
  return (
    <>
      <PageHead kicker="Visitors" title="Live visitors & Traffic Manager" sub="People on Cadence right now, with automated traffic surge protection and real-time load governor." />
      <TrafficManagerCard />
      <Loadable q={q}>{d => (
        <>
          <div className="adm-kpis small">
            {statCard(<><span className="adm-live"><span /></span> Online now</>, num(d.online.visitors))}
            {statCard('Signed in', num(d.online.users))}
            {statCard('Anonymous', num(d.online.anonymous))}
          </div>
          <div className="adm-grid-2 wide-left">
            <Card title="Visitors" pad={false}>
              {!d.visitors.length ? <Empty icon={Radio} title="No visitors currently online." /> : (
                <ul className="adm-live-list">
                  <AnimatePresence initial={false}>
                    {d.visitors.map(v => (
                      <motion.li key={v.sid} layout={!reduce} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <span className={`adm-dot${v.idleSeconds < 75 ? ' on' : ''}`} aria-label={v.idleSeconds < 75 ? 'active' : 'idle'} />
                        <span className="adm-live-who">{v.userId ? <UserCell user={{ id: v.userId, username: v.username }} /> : <span>Anonymous <small className="adm-mono">{v.vid.slice(0, 8)}</small></span>}</span>
                        <span className="adm-live-page">{routeLabel(v.route)}</span>
                        <span className="adm-live-dev hide-sm">{device(v)}{v.country && ` · ${flag(v.country)}`}</span>
                        <span className="adm-live-time" title={`Started ${dateTime(v.startedAt)}`}>{duration(v.durationSeconds)}</span>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </Card>
            <Card title="Current pages"><BarList rows={d.byRoute.map(r => ({ label: routeLabel(r.route), value: r.n }))} valueLabel="visitors" empty="Nobody is browsing right now." /></Card>
          </div>
        </>
      )}</Loadable>
    </>
  );
}

export function VisitorAnalytics() {
  const R = useRange('30d');
  const v = useQuery('/analytics/visitors', R.params || {}, { enabled: !!R.params });
  const [sp, setSp] = useSearchParams();
  const F = useUrlFilters(sp, setSp, { page: '1', range: '30d' });
  const list = useQuery('/visitors/sessions', { page: F.get('page'), device: F.get('device'), source: F.get('source'), kind: F.get('kind'), returning: F.get('returning'), limit: 25 });
  return (
    <>
      <PageHead kicker="Visitors" title="Visitor analytics" sub="Visits from the first-party tracker: no cookies, no fingerprinting, and browsers sending Do Not Track or Global Privacy Control are not counted." actions={<RangePicker {...R} onChange={R.set} />} />
      <Loadable q={v}>{d => {
        const c = d.current, p = d.previous, k = (cur, prev) => ({ value: cur, previous: prev, change: prev ? Math.round(((cur - prev) / prev) * 1000) / 10 : cur ? null : 0, compare: 'vs previous period' });
        const s1 = [{ name: 'Unique visitors', values: d.series.visitors, total: c.visitors }, { name: 'Sessions', values: d.series.sessions, total: c.sessions }, { name: 'Page views', values: d.series.pageViews, total: c.pageViews }];
        const s2 = [{ name: 'New', values: d.series.new, total: c.newSessions }, { name: 'Returning', values: d.series.returning, total: c.returningSessions }];
        return (
          <>
            <div className="adm-kpis">
              <Kpi label="Unique visitors" k={k(c.visitors, p.visitors)} />
              <Kpi label="Sessions" k={k(c.sessions, p.sessions)} />
              <Kpi label="Page views" k={k(c.pageViews, p.pageViews)} />
              <Kpi label="Pages per session" k={k(c.pagesPerSession, p.pagesPerSession)} format={x => dec(x, 2)} />
              <Kpi label="Avg. session" k={k(c.avgSessionSeconds, p.avgSessionSeconds)} format={duration} />
              <Kpi label="Bounce rate" k={k(c.bounceRate, p.bounceRate)} format={x => pct(x)} goodWhenUp={false} />
            </div>
            <div className="adm-grid-2">
              <ChartCard title="Traffic" table={{ keys: d.keys, unit: d.unit, series: s1 }}><LineChart label="Visitors, sessions and page views" keys={d.keys} unit={d.unit} series={s1} /></ChartCard>
              <ChartCard title="New vs returning sessions" table={{ keys: d.keys, unit: d.unit, series: s2 }}><LineChart label="New and returning sessions" keys={d.keys} unit={d.unit} series={s2} /></ChartCard>
            </div>
          </>
        );
      }}</Loadable>
      <Card title="Recent visits" pad={false}>
        <FilterBar active={['device', 'source', 'kind', 'returning'].filter(x => F.get(x)).length} onClear={() => F.set({ device: '', source: '', kind: '', returning: '' })}>
          <Select label="Visitor" value={F.get('kind')} onChange={x => F.set({ kind: x })} options={[['', 'Everyone'], ['users', 'Signed in'], ['anonymous', 'Anonymous']]} />
          <Select label="Type" value={F.get('returning')} onChange={x => F.set({ returning: x })} options={[['', 'New and returning'], ['false', 'New'], ['true', 'Returning']]} />
          <Select label="Device" value={F.get('device')} onChange={x => F.set({ device: x })} options={[['', 'Any device'], 'Desktop', 'Mobile', 'Tablet']} />
          <Select label="Source" value={F.get('source')} onChange={x => F.set({ source: x })} options={[['', 'Any source'], ...['direct', 'search', 'social', 'referral', 'email', 'other'].map(x => [x, cap(x)])]} />
        </FilterBar>
        <DataTable q={list} empty="No visits recorded yet." columns={[
          { key: 'who', label: 'Visitor', render: x => (x.user ? <UserCell user={x.user} /> : <span>Anonymous <small className="adm-mono">{x.visitor}</small></span>) },
          { key: 'start', label: 'Started', render: x => <span title={dateTime(x.startedAt)}>{ago(x.startedAt)}</span> },
          { key: 'dur', label: 'Duration', align: 'right', render: x => duration(x.durationSeconds) },
          { key: 'pages', label: 'Pages', align: 'right', render: x => num(x.pages) },
          { key: 'path', label: 'Entry → exit', hideSm: true, render: x => `${routeLabel(x.entry)} → ${routeLabel(x.exit)}` },
          { key: 'src', label: 'Source', render: x => <span>{cap(x.source)}{x.referrer && <small className="adm-muted"> · {x.referrer}</small>}</span> },
          { key: 'dev', label: 'Device', hideSm: true, render: x => device(x) },
          { key: 'geo', label: 'Country', hideSm: true, render: x => (x.country ? `${flag(x.country)} ${x.country}` : '—') },
          { key: 'ret', label: 'Type', hideSm: true, render: x => (x.returning ? 'Returning' : 'New') }
        ]} />
        <Pager data={list.data} onPage={p => F.set({ page: String(p) })} />
      </Card>
    </>
  );
}

export function PagesAnalytics() {
  const R = useRange('30d');
  const q = useQuery('/analytics/pages', R.params || {}, { enabled: !!R.params });
  return (
    <>
      <PageHead kicker="Visitors" title="Page views" sub="Every Cadence route, compared with the previous period of the same length. Room codes and query strings are never stored." actions={<RangePicker {...R} onChange={R.set} />} />
      <Loadable q={q}>{d => (
        <>
          <Card title="Top pages"><BarList rows={d.pages.map(p => ({ label: routeLabel(p.route), sub: p.route, value: p.views }))} valueLabel="views" /></Card>
          <Card pad={false}>
            <DataTable rows={d.pages} rowKey={p => p.route} caption="Page analytics" empty="No page views in this period." columns={[
              { key: 'route', label: 'Page', render: p => <span>{routeLabel(p.route)}<small className="adm-muted adm-mono"> {p.route}</small></span> },
              { key: 'views', label: 'Views', align: 'right', render: p => num(p.views) },
              { key: 'chg', label: 'vs previous', align: 'right', render: p => change(p.change) },
              { key: 'vis', label: 'Unique visitors', align: 'right', render: p => num(p.visitors) },
              { key: 'avg', label: 'Avg. time', align: 'right', render: p => (p.avgSeconds ? duration(p.avgSeconds) : '—') },
              { key: 'ent', label: 'Entrances', align: 'right', hideSm: true, render: p => num(p.entries) },
              { key: 'bounce', label: 'Bounce rate', align: 'right', hideSm: true, render: p => (p.bounceRate == null ? '—' : pct(p.bounceRate)) },
              { key: 'exit', label: 'Exit rate', align: 'right', hideSm: true, render: p => pct(p.exitRate) }
            ]} />
          </Card>
        </>
      )}</Loadable>
    </>
  );
}

const SOURCE_LABEL = { direct: 'Direct', search: 'Search', social: 'Social', referral: 'Referral', email: 'Email', other: 'Other' };
export function TrafficAnalytics() {
  const R = useRange('30d');
  const q = useQuery('/analytics/traffic', R.params || {}, { enabled: !!R.params });
  return (
    <>
      <PageHead kicker="Visitors" title="Traffic sources" sub="Where visits start: the referring site's host and utm tags only, never full URLs." actions={<RangePicker {...R} onChange={R.set} />} />
      <Loadable q={q}>{d => {
        const series = d.sources.filter(s => s.sessions).map(s => ({ name: SOURCE_LABEL[s.source], values: d.series[s.source], total: s.sessions }));
        return (
          <>
            <div className="adm-grid-2">
              <Card title="Sessions by source"><BarList rows={d.sources.map(s => ({ label: SOURCE_LABEL[s.source], value: s.sessions }))} /></Card>
              <Card title="Top referrers"><BarList rows={d.referrers.map(r => ({ label: r.host, value: r.sessions }))} empty="No referring sites in this period." /></Card>
            </div>
            {series.length > 0 && <ChartCard title="Sources over time" table={{ keys: d.keys, unit: d.unit, series }}><LineChart label="Sessions by traffic source" keys={d.keys} unit={d.unit} series={series} /></ChartCard>}
            <Card pad={false}>
              <DataTable rows={d.sources} rowKey={s => s.source} columns={[
                { key: 's', label: 'Source', render: s => SOURCE_LABEL[s.source] },
                { key: 'n', label: 'Sessions', align: 'right', render: s => num(s.sessions) },
                { key: 'v', label: 'Visitors', align: 'right', render: s => num(s.visitors) },
                { key: 'p', label: 'Previous period', align: 'right', render: s => num(s.previous) },
                { key: 'c', label: 'Change', align: 'right', render: s => change(s.change) }
              ]} />
            </Card>
          </>
        );
      }}</Loadable>
    </>
  );
}

/* ---------- analytics ---------- */

export function UserAnalytics() {
  const R = useRange('90d');
  const g = useQuery('/analytics/users', R.params || {}, { enabled: !!R.params });
  const a = useQuery('/analytics/activity', R.params || {}, { enabled: !!R.params });
  return (
    <>
      <PageHead kicker="Analytics" title="User analytics" sub="Growth and what people do on Cadence." actions={<RangePicker {...R} onChange={R.set} />} />
      <div className="adm-grid-2">
        <Loadable q={g}>{d => (
          <ChartCard title="New users" aside={<span className="adm-muted">{num(d.signups.reduce((x, y) => x + y, 0))} in period</span>} table={{ keys: d.keys, unit: d.unit, series: [{ name: 'New users', values: d.signups }] }}>
            <LineChart label="New users" keys={d.keys} unit={d.unit} series={[{ name: 'New users', values: d.signups }]} area />
          </ChartCard>
        )}</Loadable>
        <Loadable q={g}>{d => (
          <ChartCard title="Total users" aside={<strong>{num(d.total[d.total.length - 1])}</strong>} table={{ keys: d.keys, unit: d.unit, series: [{ name: 'Total users', values: d.total }] }}>
            <LineChart label="Total users over time" keys={d.keys} unit={d.unit} series={[{ name: 'Total users', values: d.total }]} area />
          </ChartCard>
        )}</Loadable>
      </div>
      <Loadable q={a}>{d => {
        const s = [{ name: 'Logins', values: d.series.logins }, { name: 'Sign-ups', values: d.series.signups }, { name: 'Typing tests', values: d.series.tests }, { name: 'Races', values: d.series.races }, { name: 'Page views', values: d.series.pageViews }, { name: 'Sessions', values: d.series.sessions }].map(x => ({ ...x, total: x.values.reduce((p, c) => p + c, 0) }));
        return <ChartCard title="Activity" table={{ keys: d.keys, unit: d.unit, series: s }}><LineChart label="User activity over time" keys={d.keys} unit={d.unit} series={s} height={260} /></ChartCard>;
      }}</Loadable>
    </>
  );
}

export function EngagementAnalytics() {
  const R = useRange('30d');
  const q = useQuery('/analytics/engagement', R.params || {}, { enabled: !!R.params });
  return (
    <>
      <PageHead kicker="Analytics" title="Engagement" sub="Active users are those who visited while signed in, completed a typing test or signed in." actions={<RangePicker {...R} onChange={R.set} presets={[['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['1y', '1 year'], ['custom', 'Custom']]} />} />
      <Loadable q={q}>{d => {
        const s = d.summary;
        return (
          <>
            <div className="adm-kpis">
              {statCard('Avg. daily active', dec(s.avgDau))}
              {statCard('Weekly active', num(s.wau), 'last 7 days')}
              {statCard('Monthly active', num(s.mau), 'last 30 days')}
              {statCard('Stickiness', pct(s.stickiness), 'daily ÷ monthly active')}
              {statCard('Typing tests', num(s.tests), `${dec(s.testsPerActiveUser)} per active user`)}
              {statCard('Races finished', num(s.racesFinished))}
              {statCard('Avg. session', duration(s.avgSessionSeconds))}
              {statCard('Pages per session', dec(s.pagesPerSession, 2))}
            </div>
            <div className="adm-grid-2">
              <ChartCard title="Daily active users" table={{ keys: d.keys, unit: 'day', series: [{ name: 'Active users', values: d.dau }] }}><LineChart label="Daily active users" keys={d.keys} unit="day" series={[{ name: 'Active users', values: d.dau }]} area /></ChartCard>
              <ChartCard title="Typing tests per day" table={{ keys: d.keys, unit: 'day', series: [{ name: 'Tests', values: d.tests }] }}><LineChart label="Typing tests per day" keys={d.keys} unit="day" series={[{ name: 'Tests', values: d.tests }]} area /></ChartCard>
            </div>
          </>
        );
      }}</Loadable>
    </>
  );
}

export function RetentionAnalytics() {
  const q = useQuery('/analytics/retention');
  return (
    <>
      <PageHead kicker="Analytics" title="Retention" sub="Weekly signup cohorts and how many came back. A cell stays empty until enough time has passed to measure it." />
      <Loadable q={q}>{d => (
        <>
          <div className="adm-kpis small">
            {[['Day 1', d.overall.d1, d.definitions.d1], ['Day 7', d.overall.d7, d.definitions.d7], ['Day 30', d.overall.d30, d.definitions.d30]].map(([l, v, def]) => statCard(`${l} retention`, v == null ? '—' : pct(v), v == null ? 'Not enough data yet' : def))}
          </div>
          <Card title="Cohorts">{d.cohorts.length ? <CohortTable cohorts={d.cohorts} /> : <Empty title="No sign-ups in the last 8 weeks." />}</Card>
        </>
      )}</Loadable>
    </>
  );
}

export function DeviceAnalytics() {
  const R = useRange('30d');
  const q = useQuery('/analytics/devices', R.params || {}, { enabled: !!R.params });
  const rows = list => list.map(x => ({ label: x.name, value: x.sessions, sub: `${num(x.visitors)} visitors` }));
  return (
    <>
      <PageHead kicker="Analytics" title="Devices" sub="Read from the browser's user agent only. No fingerprinting." actions={<RangePicker {...R} onChange={R.set} />} />
      <Loadable q={q}>{d => (
        <div className="adm-grid-2">
          <Card title="Device type"><BarList rows={rows(d.device)} /></Card>
          <Card title="Operating system"><BarList rows={rows(d.os)} /></Card>
          <Card title="Browser"><BarList rows={rows(d.browser)} /></Card>
          <Card title="Screen width"><BarList rows={rows(d.screen).map(r => ({ ...r, label: `${r.label} px` }))} /></Card>
        </div>
      )}</Loadable>
    </>
  );
}

export function GeographyAnalytics() {
  const R = useRange('30d');
  const q = useQuery('/analytics/geography', R.params || {}, { enabled: !!R.params });
  const label = c => <>{flag(c)} {countryName(c)}</>;
  return (
    <>
      <PageHead kicker="Analytics" title="Geography" sub="Country level only." actions={<RangePicker {...R} onChange={R.set} />} />
      <Loadable q={q}>{d => (
        <>
          <p className="adm-note">{d.note}</p>
          <div className="adm-grid-3">
            <Card title="Visitors by country"><BarList rows={d.countries.filter(c => c.visitors).map(c => ({ key: c.country, label: label(c.country), value: c.visitors }))} valueLabel="visitors" /></Card>
            <Card title="Users by country"><BarList rows={d.countries.filter(c => c.users).sort((a, b) => b.users - a.users).map(c => ({ key: c.country, label: label(c.country), value: c.users }))} valueLabel="users" empty="No user countries recorded yet." /></Card>
            <Card title="Sign-ins by country"><BarList rows={d.countries.filter(c => c.logins).sort((a, b) => b.logins - a.logins).map(c => ({ key: c.country, label: label(c.country), value: c.logins }))} valueLabel="sign-ins" /></Card>
          </div>
          <Card pad={false}>
            <DataTable rows={d.countries} rowKey={c => c.country || 'unknown'} empty="No data in this period." columns={[
              { key: 'c', label: 'Country', render: c => label(c.country) },
              { key: 'v', label: 'Visitors', align: 'right', render: c => num(c.visitors) },
              { key: 's', label: 'Sessions', align: 'right', render: c => num(c.sessions) },
              { key: 'u', label: 'Users (all time)', align: 'right', render: c => num(c.users) },
              { key: 'l', label: 'Sign-ins', align: 'right', render: c => num(c.logins) }
            ]} />
          </Card>
        </>
      )}</Loadable>
    </>
  );
}

/* ---------- activity & audit ---------- */

export function ActivityPage() {
  const [sp, setSp] = useSearchParams();
  const F = useUrlFilters(sp, setSp, { page: '1' });
  const q = useQuery('/activity', { ...F.all, limit: 40 }, { poll: 30000 });
  const types = q.data?.types || [];
  return (
    <>
      <PageHead kicker="Activity" title="User activity" sub="A chronological feed of what users did, and what admins did to their accounts." />
      <FilterBar active={F.active} onClear={() => F.clear()}>
        <Select label="Event" value={F.get('type')} onChange={v => F.set({ type: v })} options={[['', 'Any event'], ...types.map(t => [t, t.replace(/_/g, ' ').toLowerCase()])]} />
        <SearchBox value={F.get('user')} onChange={v => F.set({ user: v })} placeholder="Username or user ID" label="User" />
        <Select label="Result" value={F.get('result')} onChange={v => F.set({ result: v })} options={[['', 'Any result'], ['success', 'Success'], ['failure', 'Failure']]} />
        <DateFilter from={F.get('from')} to={F.get('to')} onChange={d => F.set(d)} />
      </FilterBar>
      <Card pad={false}>
        <DataTable q={q} caption="Activity feed" empty="No activity found." columns={[
          { key: 'at', label: 'Time', render: a => <span title={dateTime(a.at)}>{dateTime(a.at)}</span> },
          { key: 'actor', label: 'Actor', render: a => (a.actor ? <UserCell user={a.actor} sub="admin" /> : <UserCell user={a.user} />) },
          { key: 'type', label: 'Action', render: a => <span className="adm-mono small">{a.type}</span> },
          { key: 'target', label: 'Target', render: a => (a.actor && a.user ? <UserCell user={a.user} /> : a.metadata?.code ? `Room ${a.metadata.code}` : a.metadata?.to || a.target || '—') },
          { key: 'meta', label: 'Details', hideSm: true, render: a => <span className="adm-meta">{Object.entries(a.metadata || {}).filter(([k]) => k !== 'code').map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ') || '—'}</span> },
          { key: 'res', label: 'Result', render: a => <Status value={a.result} /> }
        ]} />
        <Pager data={q.data} onPage={p => F.set({ page: String(p) })} />
      </Card>
    </>
  );
}

export function AuditPage() {
  const ui = useUI();
  const [sp, setSp] = useSearchParams();
  const F = useUrlFilters(sp, setSp, { page: '1' });
  const q = useQuery('/audit', { ...F.all, limit: 40 });
  const [verify, setVerify] = useState(null);
  const [busy, setBusy] = useState(false);
  const check = async () => { setBusy(true); try { setVerify(await aget('/audit/verify')); q.refresh(); } catch (err) { ui.toast(err.message); } finally { setBusy(false); } };
  return (
    <>
      <PageHead kicker="Activity" title="Audit log" sub="Every administrative action. Records are append-only and hash-chained: editing or removing one breaks verification."
        actions={<button type="button" className="btn outline sm" onClick={check} disabled={busy}>{busy ? <RotateCw size="1em" className="adm-spin" /> : <ShieldCheck size="1em" />}Verify integrity</button>} />
      {verify && (
        <div className={`adm-banner ${verify.ok ? 'ok' : 'bad'}`} role="status">
          {verify.ok ? <ShieldCheck size="1.1em" /> : <ShieldAlert size="1.1em" />}
          {verify.ok ? `All ${num(verify.checked)} records verified. The log is intact.` : `Integrity check failed at record #${verify.brokenAt}: ${verify.problem}`}
        </div>
      )}
      <FilterBar active={F.active} onClear={() => F.clear()}>
        <Select label="Action" value={F.get('action')} onChange={v => F.set({ action: v })} options={[['', 'Any action'], ...(q.data?.actions || []).map(a => [a, a.replace(/_/g, ' ').toLowerCase()])]} />
        <SearchBox value={F.get('actor')} onChange={v => F.set({ actor: v })} placeholder="Admin username" label="Admin" />
        <SearchBox value={F.get('target')} onChange={v => F.set({ target: v })} placeholder="Target (username or ID)" label="Target" />
        <DateFilter from={F.get('from')} to={F.get('to')} onChange={d => F.set(d)} />
      </FilterBar>
      <Card pad={false}>
        <DataTable q={q} caption="Audit log" empty="No audit records yet." columns={[
          { key: 'seq', label: '#', render: a => <span className="adm-mono">{a.seq}</span> },
          { key: 'at', label: 'Time', render: a => dateTime(a.at) },
          { key: 'actor', label: 'Admin', render: a => a.actor },
          { key: 'action', label: 'Action', render: a => <span className="adm-mono small">{a.action}</span> },
          { key: 'target', label: 'Target', render: a => (a.targetType === 'user' && a.targetId ? <Link className="adm-link" to={`/admin/users/${a.targetId}`}>{a.target || a.targetId}</Link> : a.target || a.targetId || '—') },
          { key: 'reason', label: 'Reason / details', hideSm: true, render: a => <span className="adm-meta">{[a.reason, Object.entries(a.metadata || {}).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')].filter(Boolean).join(' — ') || '—'}</span> },
          { key: 'ip', label: 'IP', hideSm: true, hideMd: true, render: a => <span className="adm-mono small">{a.ip || '—'}</span> },
          { key: 'hash', label: 'Hash', hideSm: true, hideMd: true, render: a => <span className="adm-mono small" title="First 16 characters of this record's SHA-256">{a.hash}</span> }
        ]} />
        <Pager data={q.data} onPage={p => F.set({ page: String(p) })} />
      </Card>
    </>
  );
}

export function CompetitionsPage() {
  const ui = useUI();
  const live = useQuery('/competitions/live', {}, { poll: 5000 });
  const [sp, setSp] = useSearchParams();
  const F = useUrlFilters(sp, setSp, { page: '1' });
  const past = useQuery('/competitions', { ...F.all, limit: 20 });
  const [close, setClose] = useState(null);
  const [open, setOpen] = useState(null);
  return (
    <>
      <PageHead kicker="Activity" title="Competitions" sub="Live typing rooms (from memory) and finished races (from the database)." />
      <Card title={<><span className="adm-live"><span /></span> Live rooms</>} pad={false}>
        <Loadable q={live}>{d => !d.rooms.length ? <Empty icon={Swords} title="No active rooms right now." /> : (
          <DataTable rows={d.rooms} rowKey={r => r.code} columns={[
            { key: 'code', label: 'Room', render: r => <span className="adm-mono">{r.code}</span> },
            { key: 'status', label: 'Status', render: r => <Status value={r.status} /> },
            { key: 'host', label: 'Host', render: r => r.host || '—' },
            { key: 'mode', label: 'Race', render: r => `${r.settings.mode} ${r.settings.mode === 'time' ? `${r.settings.time}s` : r.settings.mode === 'words' ? r.settings.words : ''}` },
            { key: 'players', label: 'Players', render: r => <span className="adm-meta">{r.players.filter(p => !p.left).map(p => `${p.username}${r.status !== 'WAITING' ? ` ${p.wpm} wpm ${Math.round(p.progress)}%` : ''}${p.connected ? '' : ' (offline)'}`).join(', ')}</span> },
            { key: 'dc', label: 'Disconnects', align: 'right', hideSm: true, render: r => num(r.disconnects) },
            { key: 'created', label: 'Created', hideSm: true, render: r => ago(r.createdAt) },
            { key: 'a', label: <span className="sr">Actions</span>, render: r => <button type="button" className="btn ghost sm danger-text" onClick={() => setClose(r)}>Close room</button> }
          ]} />
        )}</Loadable>
      </Card>
      <Card title="History" pad={false}>
        <FilterBar active={F.active} onClear={() => F.clear()}>
          <Select label="Status" value={F.get('status')} onChange={v => F.set({ status: v })} options={[['', 'Any status'], ['FINISHED', 'Finished'], ['CANCELLED', 'Cancelled'], ['EXPIRED', 'Expired'], ['RUNNING', 'Running'], ['WAITING', 'Waiting']]} />
          <SearchBox value={F.get('code')} onChange={v => F.set({ code: v })} placeholder="Room code" label="Room code" />
          <SearchBox value={F.get('user')} onChange={v => F.set({ user: v })} placeholder="Player username" label="Player" />
          <DateFilter from={F.get('from')} to={F.get('to')} onChange={d => F.set(d)} />
        </FilterBar>
        <DataTable q={past} empty="No competitions yet." onRow={r => setOpen(open === r.id ? null : r.id)} columns={[
          { key: 'code', label: 'Room', render: r => <span className="adm-mono">{r.code}</span> },
          { key: 'status', label: 'Status', render: r => <span><Status value={r.status} />{r.endReason && <small className="adm-muted"> {r.endReason}</small>}</span> },
          { key: 'host', label: 'Creator', render: r => <UserCell user={r.host} /> },
          { key: 'players', label: 'Players', align: 'right', render: r => num(r.players) },
          { key: 'winner', label: 'Winner', render: r => { const w = r.standings.find(s => s.rank === 1 && s.status !== 'dnf'); return w ? `${w.username} · ${w.wpm} wpm` : '—'; } },
          { key: 'start', label: 'Started', hideSm: true, render: r => (r.startedAt ? dateTime(r.startedAt) : '—') },
          { key: 'dur', label: 'Length', align: 'right', hideSm: true, render: r => (r.durationSeconds == null ? '—' : duration(r.durationSeconds)) },
          { key: 'dc', label: 'Disconnects', align: 'right', hideSm: true, render: r => num(r.disconnects) }
        ]} />
        <Pager data={past.data} onPage={p => F.set({ page: String(p) })} />
      </Card>
      <AnimatePresence>
        {open && past.data?.items.find(r => r.id === open) && (() => {
          const r = past.data.items.find(x => x.id === open);
          return (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Card title={`Room ${r.code} standings`} aside={<button type="button" className="btn ghost sm" onClick={() => setOpen(null)}>Close</button>} pad={false}>
                <DataTable rows={r.standings} rowKey={s => `${s.rank}-${s.username}`} empty="This race has no standings (it didn't finish)." columns={[
                  { key: 'r', label: 'Rank', render: s => s.rank },
                  { key: 'u', label: 'Player', render: s => (s.userId ? <UserCell user={{ id: s.userId, username: s.username }} /> : s.username) },
                  { key: 'w', label: 'WPM', align: 'right', render: s => num(s.wpm) },
                  { key: 'a', label: 'Accuracy', align: 'right', render: s => `${s.acc}%` },
                  { key: 's', label: 'Result', render: s => (s.status === 'valid' ? <Status value="success" /> : s.status === 'dnf' ? 'Did not finish' : <Severity value={s.status === 'flagged' ? 'critical' : 'suspicious'} />) },
                  { key: 'l', label: 'Left early', render: s => (s.left ? 'Yes' : '') }
                ]} />
              </Card>
            </motion.div>
          );
        })()}
      </AnimatePresence>
      <Confirm open={!!close} onClose={() => setClose(null)} danger confirmLabel="Close room" title={`Close room ${close?.code}?`}
        body="Everyone in the room is sent back with a notice. An unfinished race is not saved." onConfirm={async () => { await apost(`/competitions/live/${close.code}/close`); ui.toast(`Room ${close.code} closed`); live.refresh(); }} />
    </>
  );
}

/* ---------- data ---------- */

const KINDS = [['users', 'Users'], ['logins', 'Login history'], ['sessions', 'Sessions'], ['visitors', 'Visitor analytics'], ['pageviews', 'Page views'], ['activity', 'Activity logs'], ['audit', 'Audit logs'], ['security', 'Security events'], ['competitions', 'Competitions'], ['results', 'Typing results']];
const KIND_FILTERS = {
  users: [['status', 'Status', ['', 'active', 'suspended', 'deleted']], ['role', 'Role', ['', 'USER', 'ANALYST', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN']], ['provider', 'Provider', ['', 'email', 'github', 'google']]],
  logins: [['type', 'Event', ['', 'login', 'failed', 'signup', 'logout', 'revoked', 'blocked']], ['provider', 'Provider', ['', 'email', 'github', 'google']]],
  sessions: [['status', 'Status', ['', 'active', 'revoked']]],
  visitors: [['device', 'Device', ['', 'Desktop', 'Mobile', 'Tablet']]],
  security: [['severity', 'Severity', ['', 'normal', 'suspicious', 'critical']]],
  competitions: [['status', 'Status', ['', 'FINISHED', 'CANCELLED', 'EXPIRED']]],
  results: [['type', 'Kind', ['', 'test', 'race']]]
};

export function ExportPage() {
  const ui = useUI();
  const [kind, setKind] = useState('users');
  const [format, setFormat] = useState('csv');
  const [filters, setFilters] = useState({});
  const [busy, setBusy] = useState(false);
  const jobs = useQuery('/exports', {}, { poll: 2500 });
  const start = async e => {
    e.preventDefault(); setBusy(true);
    try { await apost('/exports', { kind, format, filters: Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) }); ui.toast('Export started'); jobs.refresh(); }
    catch (err) { ui.toast(err.message); } finally { setBusy(false); }
  };
  const extra = KIND_FILTERS[kind] || [];
  return (
    <>
      <PageHead kicker="Data" title="Export data" sub="Exports run in the background and are private: only you (or a super admin) can download them, every download is audited, and files are deleted when they expire." />
      <Card title="New export">
        <form className="adm-form" onSubmit={start}>
          <div className="adm-form-row">
            <Select label="Data" value={kind} onChange={v => { setKind(v); setFilters(f => ({ from: f.from, to: f.to })); }} options={KINDS} />
            <div className="adm-select"><span>Format</span><div className="seg" role="group" aria-label="Format">{['csv', 'json', 'xlsx'].map(f => <button key={f} type="button" aria-pressed={format === f} onClick={() => setFormat(f)}>{f.toUpperCase()}</button>)}</div></div>
            <div className="adm-select"><span>Date range</span><DateFilter from={filters.from} to={filters.to} onChange={d => setFilters(f => ({ ...f, ...d }))} /></div>
            {extra.map(([key, label, opts]) => <Select key={key} label={label} value={filters[key] || ''} onChange={v => setFilters(f => ({ ...f, [key]: v }))} options={opts.map(o => [o, o || `Any ${label.toLowerCase()}`])} />)}
            {['logins', 'sessions', 'activity', 'results'].includes(kind) && <label className="adm-select"><span>User</span><input className="adm-input" placeholder="Username or ID" value={filters.user || ''} onChange={e => setFilters(f => ({ ...f, user: e.target.value }))} /></label>}
          </div>
          <div className="adm-form-foot">
            <p className="adm-fine">{kind === 'users' ? 'Includes emails. ' : ''}Never includes passwords, session tokens or OAuth tokens.{format === 'xlsx' ? ' XLSX is limited to 100,000 rows.' : ''}</p>
            <button type="submit" className="btn primary" disabled={busy}><Download size="1em" />{busy ? 'Starting…' : 'Start export'}</button>
          </div>
        </form>
      </Card>
      <Card title="Recent exports" pad={false}>
        <DataTable q={jobs} empty="No exports yet." columns={[
          { key: 'what', label: 'Export', render: j => <span>{KINDS.find(k => k[0] === j.kind)?.[1]} <span className="adm-mono small">.{j.format}</span>{Object.keys(j.filters || {}).length > 0 && <small className="adm-muted"> · {Object.entries(j.filters).map(([k, v]) => `${k}: ${v}`).join(', ')}</small>}</span> },
          { key: 'by', label: 'Requested by', hideSm: true, render: j => j.requestedBy },
          { key: 'when', label: 'Requested', render: j => ago(j.createdAt) },
          { key: 'status', label: 'Status', render: j => (j.status === 'running' ? <span className="adm-progress" role="progressbar" aria-valuenow={j.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Export progress"><span style={{ width: `${j.progress}%` }} /><small>{j.progress}% · {num(j.rows)} of {num(j.total)}</small></span> : <span><Status value={j.status} />{j.error && <small className="adm-bad"> {j.error}</small>}</span>) },
          { key: 'rows', label: 'Rows', align: 'right', hideSm: true, render: j => (j.status === 'done' ? num(j.rows) : '—') },
          { key: 'size', label: 'Size', align: 'right', hideSm: true, render: j => (j.status === 'done' ? bytes(j.bytes) : '—') },
          { key: 'exp', label: 'Expires', hideSm: true, render: j => (j.expiresAt && j.status === 'done' ? dateTime(j.expiresAt) : '—') },
          { key: 'dl', label: <span className="sr">Download</span>, render: j => (j.status === 'done' && j.mine ? <button type="button" className="btn outline sm" onClick={() => { download(`/exports/${j.id}/download`); setTimeout(jobs.refresh, 1500); }}><Download size="1em" />Download</button> : null) }
        ]} />
      </Card>
    </>
  );
}

export function ReportsPage() {
  const ui = useUI();
  const nav = useNavigate();
  const [type, setType] = useState('weekly');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [sp, setSp] = useSearchParams();
  const F = useUrlFilters(sp, setSp, { page: '1' });
  const list = useQuery('/reports', { page: F.get('page') });
  const make = async e => {
    e.preventDefault(); setBusy(true);
    try { const r = await apost('/reports', { type, date: date || undefined, tz: tz() }); nav(`/admin/reports/${r.id}`); }
    catch (err) { ui.toast(err.message); setBusy(false); }
  };
  return (
    <>
      <PageHead kicker="Data" title="Reports" sub="Snapshots of real numbers for a day, a week or a month, each compared with the period before." />
      <Card title="Generate a report">
        <form className="adm-form" onSubmit={make}>
          <div className="adm-form-row">
            <div className="adm-select"><span>Report</span><div className="seg" role="group" aria-label="Report type">{[['daily', 'Daily'], ['weekly', 'Weekly (7 days)'], ['monthly', 'Monthly (30 days)']].map(([v, l]) => <button key={v} type="button" aria-pressed={type === v} onClick={() => setType(v)}>{l}</button>)}</div></div>
            <label className="adm-select"><span>Ending on</span><input className="adm-input" type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={e => setDate(e.target.value)} /></label>
            <button type="submit" className="btn primary" disabled={busy}><FileBarChart size="1em" />{busy ? 'Generating…' : 'Generate report'}</button>
          </div>
        </form>
      </Card>
      <Card title="Generated reports" pad={false}>
        <DataTable q={list} empty="No reports yet." onRow={r => nav(`/admin/reports/${r.id}`)} columns={[
          { key: 't', label: 'Report', render: r => `${cap(r.type)} report` },
          { key: 'p', label: 'Period', render: r => `${dateOnly(r.from)} – ${dateOnly(new Date(new Date(r.to) - 1))}` },
          { key: 'c', label: 'Generated', render: r => dateTime(r.createdAt) },
          { key: 'b', label: 'By', hideSm: true, render: r => r.createdBy },
          { key: 'd', label: <span className="sr">Download</span>, render: r => <span className="adm-row-actions"><button type="button" className="btn ghost sm" onClick={() => download(`/reports/${r.id}/download?format=csv`)}>CSV</button><button type="button" className="btn ghost sm" onClick={() => download(`/reports/${r.id}/download?format=json`)}>JSON</button></span> }
        ]} />
        <Pager data={list.data} onPage={p => F.set({ page: String(p) })} />
      </Card>
    </>
  );
}

export function ReportView() {
  const { id } = useParams();
  const q = useQuery(`/reports/${id}`);
  const row = (label, value, ch, goodUp = true) => <tr><th scope="row">{label}</th><td className="r num">{value}</td><td className="r">{ch === undefined ? '' : ch == null ? <span className="adm-muted">new</span> : <span className={`adm-delta ${ch > 0 ? 'up' : ch < 0 ? 'down' : 'flat'} ${ch === 0 ? '' : (ch > 0) === goodUp ? 'good' : 'bad'}`}>{ch > 0 ? '+' : ''}{ch}%</span>}</td></tr>;
  return (
    <Loadable q={q}>{r => {
      const d = r.data;
      return (
        <div className="adm-report">
          <PageHead kicker={<Link to="/admin/reports" className="adm-link">Reports</Link>} title={`${cap(r.type)} report`} sub={`${dateTime(r.from)} – ${dateTime(r.to)} (${d.period.timezone}) · generated ${dateTime(r.createdAt)} by ${r.createdBy}`}
            actions={<><button type="button" className="btn outline sm" onClick={() => window.print()}><Printer size="1em" />Print / PDF</button><button type="button" className="btn outline sm" onClick={() => download(`/reports/${r.id}/download?format=csv`)}><Download size="1em" />CSV</button><button type="button" className="btn outline sm" onClick={() => download(`/reports/${r.id}/download?format=json`)}><Download size="1em" />JSON</button></>} />
          <div className="adm-grid-2">
            <Card title="Users"><table className="adm-table dense"><tbody>
              {row('New users', num(d.users.new), d.users.newChange)}{row('Active users', num(d.users.active), d.users.activeChange)}{row('Total users', num(d.users.total))}
            </tbody></table></Card>
            <Card title="Visitors"><table className="adm-table dense"><tbody>
              {row('Unique visitors', num(d.visitors.visitors), d.visitors.visitorsChange)}{row('Page views', num(d.visitors.pageViews), d.visitors.pageViewsChange)}{row('Sessions', num(d.visitors.sessions))}
              {row('Bounce rate', pct(d.visitors.bounceRate))}{row('Avg. session', duration(d.visitors.avgSessionSeconds))}
            </tbody></table></Card>
            <Card title="Authentication"><table className="adm-table dense"><tbody>
              {row('Logins', num(d.authentication.logins), d.authentication.loginsChange)}{row('Failed logins', num(d.authentication.failed), d.authentication.failedChange, false)}
              {row('Success rate', d.authentication.successRate == null ? '—' : pct(d.authentication.successRate, 1))}
              {Object.entries(d.authentication.byProvider).map(([p, n]) => row(`Via ${p}`, num(n)))}
            </tbody></table></Card>
            <Card title="Engagement and retention"><table className="adm-table dense"><tbody>
              {row('Typing tests', num(d.engagement.tests))}{row('Races finished', num(d.engagement.racesFinished))}{row('Avg. daily active', dec(d.engagement.avgDau))}
              {row('Weekly / monthly active', `${num(d.engagement.wau)} / ${num(d.engagement.mau)}`)}
              {row('Day 1 / 7 / 30 retention', ['d1', 'd7', 'd30'].map(k => (d.retention[k] == null ? '—' : pct(d.retention[k]))).join(' / '))}
            </tbody></table></Card>
            <Card title="Security"><table className="adm-table dense"><tbody>{row('Critical', num(d.security.critical))}{row('Suspicious', num(d.security.suspicious))}{row('Normal', num(d.security.normal))}</tbody></table></Card>
            <Card title="System"><table className="adm-table dense"><tbody>{row('Errors', num(d.system.errors))}</tbody></table>
              {d.system.topErrors.length > 0 && <ul className="adm-events">{d.system.topErrors.map((e, i) => <li key={i}><Severity value={e.severity} /><span>{e.type}: {e.message}<small>{e.route} · {num(e.count)}×</small></span></li>)}</ul>}
            </Card>
            <Card title="Traffic sources"><BarList rows={d.traffic.map(s => ({ label: cap(s.source), value: s.sessions }))} /></Card>
            <Card title="Top pages"><BarList rows={d.topPages.map(p => ({ label: routeLabel(p.route), value: p.views }))} valueLabel="views" /></Card>
          </div>
        </div>
      );
    }}</Loadable>
  );
}

export function DataPage() {
  const ui = useUI();
  const q = useQuery('/data');
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <PageHead kicker="Data" title="Data management" sub="What Cadence stores and how long it keeps it. Retention runs automatically every 6 hours." actions={<button type="button" className="btn outline sm" onClick={() => setConfirm(true)}><Play size="1em" />Run cleanup now</button>} />
      <Loadable q={q}>{d => (
        <>
          <Card title="Retention">
            <Facts items={[
              ['Page views', `${d.settings.pageViewDays} days`], ['Visits', `${d.settings.visitorSessionDays} days`], ['User activity', `${d.settings.activityDays} days`],
              ['Login history', `${d.settings.loginEventDays} days`], ['Security events', `${d.settings.securityEventDays} days`], ['Error logs', `${d.settings.errorDays} days`],
              ['Export files', `${d.settings.exportHours} hours`], ['Audit log', 'Kept indefinitely']
            ]} />
            <p className="adm-fine">{d.auditNote} Change retention under <Link className="adm-link" to="/admin/settings">Application settings</Link>.</p>
          </Card>
          <Card title="Collections" pad={false}>
            <DataTable rows={d.collections} rowKey={c => c.name} columns={[
              { key: 'n', label: 'Collection', render: c => <span className="adm-mono">{c.name}</span> },
              { key: 'd', label: 'Documents', align: 'right', render: c => num(c.documents) },
              { key: 's', label: 'Data size', align: 'right', render: c => bytes(c.size) },
              { key: 'st', label: 'On disk', align: 'right', hideSm: true, render: c => bytes(c.storage) },
              { key: 'i', label: 'Indexes', align: 'right', hideSm: true, render: c => num(c.indexes) }
            ]} />
          </Card>
        </>
      )}</Loadable>
      <Confirm open={confirm} onClose={() => setConfirm(false)} title="Run retention cleanup now?" confirmLabel="Run cleanup" danger
        body="Data older than the retention settings is deleted permanently. Audit logs are never deleted."
        onConfirm={async () => { const r = await apost('/settings/retention/run'); const n = Object.values(r.removed || {}).reduce((a, b) => a + b, 0); ui.toast(`Cleanup removed ${num(n)} records`); q.refresh(); }} />
    </>
  );
}

/* ---------- system ---------- */

export function SystemPage() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'overview';
  const q = useQuery('/system', {}, { poll: 15000 });
  const health = s => <Status value={s === 'ok' ? 'success' : s === 'degraded' ? 'open' : 'failure'} />;
  return (
    <>
      <PageHead kicker="System" title="System health" sub="Live process, API and database health. Refreshes every 15 seconds." />
      <Tabs label="System section" value={tab} onChange={v => setSp(v === 'overview' ? {} : { tab: v }, { replace: true })} items={[['overview', 'Overview'], ['api', 'API'], ['database', 'Database']]} />
      <Loadable q={q}>{d => (
        <>
          {tab === 'overview' && (
            <>
              <div className="adm-kpis">
                {statCard(<><Server size="1em" /> Application</>, cap(d.application.status === 'ok' ? 'healthy' : d.application.status), `v${d.application.version} · ${d.application.environment}`)}
                {statCard(<><HardDrive size="1em" /> Database</>, d.database.status === 'ok' ? 'Healthy' : cap(d.database.status), d.database.pingMs != null ? `${d.database.pingMs} ms ping` : d.database.state)}
                {statCard(<><Cable size="1em" /> API</>, d.api.status === 'ok' ? 'Healthy' : 'Degraded', `${pct(d.api.errorRate5Min, 1)} errors · p95 ${d.api.p95Ms} ms`)}
                {statCard(<><Cpu size="1em" /> CPU</>, `${dec(d.server.cpuPercent)}%`, `${d.server.cpus} cores`)}
                {statCard('Memory (process)', bytes(d.server.memory.rss), `heap ${bytes(d.server.memory.heapUsed)}`)}
                {statCard('Uptime', duration(d.application.uptimeSeconds), d.application.node)}
                {statCard(<><Bug size="1em" /> Errors</>, num(d.errors.hour), `last hour · ${num(d.errors.day)} today · ${num(d.errors.week)} this week`)}
                {statCard('Realtime', num(d.realtime.connections), `sockets · ${num(d.realtime.rooms)} rooms · ${num(d.realtime.liveVisitors)} live visitors`)}
              </div>
              <Card title="Server">
                <Facts items={[
                  ['Platform', d.application.platform], ['Node.js', d.application.node],
                  ['System memory', `${bytes(d.server.memory.systemTotal - d.server.memory.systemFree)} used of ${bytes(d.server.memory.systemTotal)}`],
                  ['Load average', d.server.loadAvg.some(Boolean) ? d.server.loadAvg.map(x => x.toFixed(2)).join(' / ') : 'Not reported on this platform'],
                  ['Storage', d.server.disk ? `${bytes(d.server.disk.total - d.server.disk.free)} used of ${bytes(d.server.disk.total)}` : 'Not available'],
                  ['Errors', <Link key="e" className="adm-link" to="/admin/system/errors">Open error log</Link>]
                ]} />
              </Card>
            </>
          )}
          {tab === 'api' && (
            <>
              <div className="adm-kpis small">
                {statCard('Status', <>{health(d.api.status)}</>)}{statCard('Requests (1 h)', num(d.api.requestsLastHour))}{statCard('Error rate (5 min)', pct(d.api.errorRate5Min, 1))}
                {statCard('Avg. response', `${d.api.avgMs} ms`)}{statCard('Median', `${d.api.p50Ms} ms`)}{statCard('95th percentile', `${d.api.p95Ms} ms`)}
              </div>
              <div className="adm-grid-2">
                <ChartCard title="Requests per minute" table={{ keys: minuteKeys(d.api.series), unit: 'minute', series: [{ name: 'Requests', values: d.api.series.map(s => s.requests) }, { name: 'Server errors', values: d.api.series.map(s => s.errors) }] }}>
                  <MinuteChart rows={d.api.series} series={[['Requests', 'requests'], ['Server errors', 'errors']]} />
                </ChartCard>
                <ChartCard title="Average response time" table={{ keys: minuteKeys(d.api.series), unit: 'minute', series: [{ name: 'Avg. ms', values: d.api.series.map(s => s.avgMs) }] }}>
                  <MinuteChart rows={d.api.series} series={[['Avg. ms', 'avgMs']]} />
                </ChartCard>
              </div>
            </>
          )}
          {tab === 'database' && (
            <Card title="Database">
              <Facts items={[
                ['Status', health(d.database.status)], ['Connection', d.database.state], ['Ping', d.database.pingMs != null ? `${d.database.pingMs} ms` : '—'],
                ['Database', d.database.name], ['Collections', num(d.database.collections)], ['Documents', num(d.database.objects)],
                ['Data size', bytes(d.database.dataSize)], ['Storage size', bytes(d.database.storageSize)], ['Index size', bytes(d.database.indexSize)],
                d.database.error && ['Error', d.database.error]
              ]} />
              <p className="adm-fine">Per-collection sizes are under <Link className="adm-link" to="/admin/data">Data management</Link>.</p>
            </Card>
          )}
        </>
      )}</Loadable>
    </>
  );
}

/** Per-minute series for the last hour, plotted with the shared line chart. */
const minuteKeys = rows => rows.map(r => { const d = new Date(r.t); return `${d.toISOString().slice(0, 10)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; });
function MinuteChart({ rows, series }) {
  return <LineChart label="Last 60 minutes" keys={minuteKeys(rows)} unit="minute" series={series.map(([name, key]) => ({ name, values: rows.map(r => r[key]) }))} />;
}

export function ErrorsPage() {
  const ui = useUI();
  const { refreshMe } = useAdmin();
  const [sp, setSp] = useSearchParams();
  const F = useUrlFilters(sp, setSp, { status: 'open', page: '1' });
  const q = useQuery('/errors', { ...F.all, status: F.get('status') === 'all' ? '' : F.get('status'), limit: 30 }, { poll: 30000 });
  const [openId, setOpenId] = useState(null);
  const detail = useQuery(`/errors/${openId}`, {}, { enabled: !!openId });
  const setStatus = async (id, status) => { await apost(`/errors/${id}/status`, { status }); ui.toast(`Marked ${status}`); q.refresh(); refreshMe(); if (openId === id) detail.refresh(); };
  return (
    <>
      <PageHead kicker="System" title="Error logs" sub="Server, realtime and browser errors, grouped so a repeating error is one row with a count. Secrets, tokens, cookies and emails are scrubbed before storage." />
      <Tabs label="Status" value={F.get('status')} onChange={v => F.set({ status: v })} items={[['open', 'Open'], ['acknowledged', 'Acknowledged'], ['resolved', 'Resolved'], ['all', 'All']]} />
      <FilterBar active={F.active - (F.get('status') !== 'open' ? 1 : 0)} onClear={() => F.clear(['status'])}>
        <SearchBox value={F.get('q')} onChange={v => F.set({ q: v })} placeholder="Message, route or type" />
        <Select label="Severity" value={F.get('severity')} onChange={v => F.set({ severity: v })} options={[['', 'Any severity'], ['critical', 'Critical'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]} />
        <Select label="Source" value={F.get('source')} onChange={v => F.set({ source: v })} options={[['', 'Any source'], ['server', 'Server'], ['realtime', 'Realtime'], ['client', 'Browser']]} />
      </FilterBar>
      <Card pad={false}>
        <DataTable q={q} empty="No errors. Nice." onRow={e => setOpenId(openId === e.id ? null : e.id)} columns={[
          { key: 'sev', label: 'Severity', render: e => <Severity value={e.severity === 'critical' ? 'high' : e.severity} /> },
          { key: 'msg', label: 'Error', render: e => <span><strong className="adm-mono small">{e.type}</strong> {e.message}</span> },
          { key: 'route', label: 'Route', hideSm: true, render: e => <span className="adm-mono small">{e.route || '—'}</span> },
          { key: 'src', label: 'Source', hideSm: true, render: e => cap(e.source) },
          { key: 'n', label: 'Count', align: 'right', render: e => num(e.count) },
          { key: 'last', label: 'Last seen', render: e => ago(e.lastSeen) },
          { key: 'st', label: 'Status', render: e => <Status value={e.status} /> },
          { key: 'a', label: <span className="sr">Actions</span>, render: e => <span className="adm-row-actions">{e.status !== 'acknowledged' && e.status !== 'resolved' && <button type="button" className="btn ghost sm" onClick={() => setStatus(e.id, 'acknowledged')}>Acknowledge</button>}{e.status !== 'resolved' && <button type="button" className="btn ghost sm" onClick={() => setStatus(e.id, 'resolved')}><CircleCheck size="1em" />Resolve</button>}</span> }
        ]} />
        <Pager data={q.data} onPage={p => F.set({ page: String(p) })} />
      </Card>
      {openId && (
        <Card title="Error details" aside={<button type="button" className="btn ghost sm" onClick={() => setOpenId(null)}>Close</button>}>
          <Loadable q={detail}>{e => (
            <>
              <Facts items={[['Type', e.type], ['Message', e.message], ['Route', e.route || '—'], ['Source', cap(e.source)], ['Occurrences', num(e.count)], ['First seen', dateTime(e.firstSeen)], ['Last seen', dateTime(e.lastSeen)], ['Last request ID', <span key="r" className="adm-mono small">{e.lastRequestId || '—'}</span>], ['Status', <span key="s"><Status value={e.status} />{e.statusBy && <small className="adm-muted"> by {e.statusBy}</small>}</span>], ['Last 24 h', `${num(e.last24h.reduce((a, b) => a + b.n, 0))} occurrences`]]} />
              {e.stack && <pre className="adm-stack">{e.stack}</pre>}
            </>
          )}</Loadable>
        </Card>
      )}
    </>
  );
}

/* ---------- settings ---------- */

const FIELDS = {
  application: [
    ['maintenanceMode', 'Maintenance mode (online / offline)', 'When enabled, public visitors on desktop and mobile see the under-maintenance popup. The admin panel remains fully accessible.', 'bool'],
    ['maintenanceStart', 'Maintenance start time (From)', 'Scheduled start time (e.g. "02:00 AM UTC" or "Today, 10:30 PM"). Displayed on the visitor popup.', 'text'],
    ['maintenanceEnd', 'Maintenance end time (To)', 'Scheduled end time (e.g. "04:00 AM UTC" or "Today, 11:30 PM"). Displayed on the visitor popup with countdown.', 'text'],
    ['maintenanceMessage', 'Maintenance notice message', 'Custom notice displayed to visitors in the maintenance popup.', 'textarea'],
    ['registrationsOpen', 'Allow new sign-ups', 'When off, new accounts (email, Google or GitHub) are refused. Existing users can still sign in.', 'bool'],
    ['trackingEnabled', 'Visitor analytics', 'Record page views and visits with the first-party tracker.', 'bool'],
    ['respectDoNotTrack', 'Respect Do Not Track and Global Privacy Control', "Browsers that send these signals aren't counted.", 'bool']
  ],
  security: [
    ['failedLoginWarn', 'Failed sign-ins before "suspicious"', 'Per account, inside the detection window.', 'int'],
    ['failedLoginCritical', 'Failed sign-ins before "critical"', 'Per account or per IP, inside the detection window.', 'int'],
    ['multiAccountIp', 'Accounts from one IP before flagging', 'Different accounts tried from the same IP address.', 'int'],
    ['windowMinutes', 'Detection window (minutes)', 'How far back attempts are counted.', 'int']
  ],
  retention: [
    ['pageViewDays', 'Page views (days)', '', 'int'], ['visitorSessionDays', 'Visits (days)', '', 'int'], ['activityDays', 'User activity and finished races (days)', '', 'int'],
    ['loginEventDays', 'Login history (days)', '', 'int'], ['securityEventDays', 'Security events (days)', '', 'int'], ['errorDays', 'Error logs (days)', '', 'int'], ['exportHours', 'Export files (hours)', '', 'int']
  ]
};

function SettingsSection({ section, title, values, canEdit, onSaved }) {
  const ui = useUI();
  const [draft, setDraft] = useState(values);
  const [busy, setBusy] = useState(false);
  const changed = Object.keys(draft).filter(k => draft[k] !== values[k]);
  const save = async e => {
    e.preventDefault(); setBusy(true);
    try { await aput(`/settings/${section}`, Object.fromEntries(changed.map(k => [k, draft[k]]))); ui.toast('Settings saved'); onSaved(); }
    catch (err) { ui.toast(err.message); } finally { setBusy(false); }
  };
  return (
    <Card title={title} aside={!canEdit && <span className="adm-muted">Read only for your role</span>}>
      <form onSubmit={save} className="adm-settings">
        {FIELDS[section].map(([key, label, help, kind]) => (
          <div className="set-row" key={key}>
            <div><h3><label htmlFor={`set-${key}`}>{label}</label></h3>{help && <p>{help}</p>}</div>
            <div className="ctrl">
              {kind === 'bool' ? (
                <button id={`set-${key}`} type="button" role="switch" aria-checked={!!draft[key]} className={`adm-switch${draft[key] ? ' on' : ''}`} disabled={!canEdit} onClick={() => setDraft(d => ({ ...d, [key]: !d[key] }))}><span /></button>
              ) : kind === 'textarea' ? (
                <textarea id={`set-${key}`} className="adm-input" rows={2} style={{ width: '100%', minWidth: '220px', padding: '0.45rem 0.65rem', fontSize: '0.85rem' }} value={draft[key] ?? ''} disabled={!canEdit} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))} />
              ) : kind === 'text' ? (
                <input id={`set-${key}`} className="adm-input" type="text" style={{ minWidth: '220px', padding: '0.45rem 0.65rem', fontSize: '0.85rem' }} value={draft[key] ?? ''} disabled={!canEdit} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))} />
              ) : (
                <input id={`set-${key}`} className="adm-input num" type="number" min={1} value={draft[key]} disabled={!canEdit} onChange={e => setDraft(d => ({ ...d, [key]: Number(e.target.value) }))} />
              )}
            </div>
          </div>
        ))}
        {canEdit && <div className="adm-form-foot"><span className="adm-fine">{changed.length ? `${changed.length} unsaved change${changed.length === 1 ? '' : 's'}` : 'All changes are audited.'}</span><button type="submit" className="btn primary" disabled={!changed.length || busy}><Save size="1em" />Save</button></div>}
      </form>
    </Card>
  );
}

export function SettingsPage({ section }) {
  const q = useQuery('/settings');
  return (
    <>
      <PageHead kicker="Settings" title={section === 'security' ? 'Security settings' : 'Application settings'} sub={section === 'security' ? 'Thresholds for security event detection. Only super admins can change these.' : 'Maintenance mode, sign-ups, analytics and data retention.'} />
      <Loadable q={q}>{d => section === 'security'
        ? <SettingsSection key={JSON.stringify(d.settings.security)} section="security" title="Detection" values={d.settings.security} canEdit={d.canEdit.security} onSaved={q.refresh} />
        : <>
            {d.settings.application?.maintenanceMode && (
              <div style={{
                marginBottom: '1.25rem',
                padding: '0.85rem 1.25rem',
                borderRadius: '12px',
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                color: '#fbbf24',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                fontSize: '0.88rem'
              }}>
                <span style={{ fontSize: '1.25rem' }}>⚠️</span>
                <div>
                  <strong>Maintenance Mode is currently ACTIVE:</strong> Public visitors are seeing the under-maintenance notice popup from <strong>{d.settings.application.maintenanceStart || 'Scheduled'}</strong> to <strong>{d.settings.application.maintenanceEnd || 'Ongoing'}</strong>. The Admin Panel is fully unlocked.
                </div>
              </div>
            )}
            <SettingsSection key={JSON.stringify(d.settings.application)} section="application" title="Application & Maintenance Mode" values={d.settings.application} canEdit={d.canEdit.application} onSaved={q.refresh} />
            <SettingsSection key={JSON.stringify(d.settings.retention)} section="retention" title="Data retention" values={d.settings.retention} canEdit={d.canEdit.retention} onSaved={q.refresh} />
          </>}
      </Loadable>
    </>
  );
}

export function ProfilePage() {
  const ui = useUI();
  const { me, refreshMe } = useAdmin();
  const [revoke, setRevoke] = useState(null);
  const u = me.user;
  return (
    <>
      <PageHead kicker="Settings" title="Admin profile" sub="Your administrator account and where it's signed in." />
      <div className="adm-grid-2">
        <Card title="Account">
          <Facts items={[['Username', u.username], ['Email', u.email], ['Role', u.role.replace('_', ' ')], ['Account created', dateTime(u.createdAt)], ['Last login', u.lastLoginAt ? `${dateTime(u.lastLoginAt)} (${ago(u.lastLoginAt)})` : '—'], ['Active sessions', num(me.sessions.length)]]} />
          <p className="adm-fine">Change your username in <Link className="adm-link" to="/account">Account settings</Link>. Your permissions: {me.permissions.length}.</p>
        </Card>
        <Card title="Permissions"><ul className="adm-perms">{me.permissions.map(p => <li key={p}><CircleCheck size="1em" aria-hidden="true" />{p.replace('.', ': ').replace(/_/g, ' ')}</li>)}</ul></Card>
      </div>
      <Card title="Your sessions" pad={false}>
        <DataTable rows={me.sessions} empty="No active sessions." columns={[
          { key: 'd', label: 'Device', render: s => <span>{device(s)}{s.current && <strong className="adm-tag"> This device</strong>}</span> },
          { key: 'ip', label: 'IP / location', render: s => `${s.ip || '—'}${s.country ? ` · ${flag(s.country)} ${s.country}` : ''}` },
          { key: 'c', label: 'Signed in', hideSm: true, render: s => dateTime(s.createdAt) },
          { key: 'l', label: 'Last active', render: s => ago(s.lastActiveAt) },
          { key: 'e', label: 'Expires', hideSm: true, render: s => dateTime(s.expiresAt) },
          { key: 'a', label: <span className="sr">Actions</span>, render: s => <button type="button" className="btn ghost sm" onClick={() => setRevoke(s)}><LogOut size="1em" />{s.current ? 'Sign out' : 'Revoke'}</button> }
        ]} />
      </Card>
      <Confirm open={!!revoke} onClose={() => setRevoke(null)} danger confirmLabel={revoke?.current ? 'Sign out' : 'Revoke session'} title={revoke?.current ? 'Sign out of this device?' : 'Revoke this session?'}
        body={revoke ? `${device(revoke)} will be signed out.` : ''}
        onConfirm={async () => { const r = await apost(`/me/sessions/${revoke.id}/revoke`); if (r.signedOut) window.location.href = '/login'; else { ui.toast('Session revoked'); refreshMe(); } }} />
    </>
  );
}

