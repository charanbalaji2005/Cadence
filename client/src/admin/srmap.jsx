import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CircleCheck, CircleSlash, PlugZap, Save, KeyRound, Unlink, ArrowLeft, GraduationCap, Info, RefreshCw } from 'lucide-react';
import { useUI } from '../context/UIContext.jsx';
import { useQuery, useUrlFilters, apost, aput, num, dateTime, ago, dateOnly } from './lib.js';
import { PageHead, Card, DataTable, Pager, FilterBar, SearchBox, Select, Tabs, UserCell, Confirm, Facts, Loadable, Status } from './ui.jsx';

const LOGO = '/brand/connect-srmap-256.webp';
const kpi = (label, value, sub) => <div className="adm-kpi"><span className="adm-kpi-label">{label}</span><strong className="adm-kpi-value">{value}</strong>{sub && <span className="adm-kpi-compare">{sub}</span>}</div>;
const batchText = (y, source) => (y ? `${y}${source === 'register_number' ? ' (from register no.)' : ''}` : 'Unknown');
const SYNC = { synced: ['ok', 'Synced'], pending: ['muted', 'Pending'], failed: ['crit', 'Failed'], not_found: ['warn', 'Not in directory'] };
const SyncPill = ({ s }) => { const [cls, label] = SYNC[s?.status] || SYNC.pending; return <span className={`adm-pill ${cls}`} title={s?.lastError ? `Last error: ${s.lastError}` : undefined}>{label}</span>; };
const Check = ({ ok, children }) => <li className={`adm-srm-check ${ok ? 'ok' : 'bad'}`}>{ok ? <CircleCheck size="1em" aria-hidden="true" /> : <CircleSlash size="1em" aria-hidden="true" />}<span>{children}</span><span className="sr">{ok ? ' (done)' : ' (missing)'}</span></li>;

function SettingsForm({ data, onSaved }) {
  const ui = useUI();
  const s = data.settings;
  const [draft, setDraft] = useState({ enabled: s.enabled, directoryUrl: s.directoryUrl, verifyUrl: s.verifyUrl });
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState(null);
  const canEdit = data.canConfigure;
  const changed = Object.keys(draft).filter(k => draft[k] !== s[k]);

  const save = async (patch, msg = 'Connect SRM AP settings saved') => {
    setBusy(true);
    try { await aput('/srmap/settings', patch); setApiKey(''); ui.toast(msg); onSaved(); }
    catch (err) { ui.toast(err.message); } finally { setBusy(false); }
  };
  const submit = e => {
    e.preventDefault();
    const patch = Object.fromEntries(changed.map(k => [k, draft[k]]));
    if (apiKey) patch.apiKey = apiKey;
    if (Object.keys(patch).length) save(patch);
  };
  const runTest = async () => {
    setTesting(true); setTest(null);
    try { setTest(await apost('/srmap/test')); onSaved(); } catch (err) { ui.toast(err.message); } finally { setTesting(false); }
  };

  return (
    <Card title="Integration settings" aside={!canEdit && <span className="adm-muted">Read only for your role</span>}>
      <form onSubmit={submit} className="adm-settings">
        <div className="set-row">
          <div><h3><label htmlFor="srm-enabled">Enable Connect SRM AP</label></h3><p>Shows the sign-in option to students. Turning it off never deletes accounts, links or typing stats.</p></div>
          <div className="ctrl"><button id="srm-enabled" type="button" role="switch" aria-checked={!!draft.enabled} className={`adm-switch${draft.enabled ? ' on' : ''}`} disabled={!canEdit} onClick={() => setDraft(d => ({ ...d, enabled: !d.enabled }))}><span /></button></div>
        </div>
        <div className="set-row">
          <div><h3><label htmlFor="srm-verify">Identity verification endpoint</label></h3><p>SRM AP service that checks a student's credentials and returns a verified student ID. Required for sign-in. Leave empty to use <code>SRMAP_VERIFY_URL</code>.</p></div>
          <div className="ctrl adm-srm-url"><input id="srm-verify" className="adm-input" type="url" inputMode="url" placeholder="https://…" value={draft.verifyUrl} disabled={!canEdit} onChange={e => setDraft(d => ({ ...d, verifyUrl: e.target.value.trim() }))} /></div>
        </div>
        <div className="set-row">
          <div><h3><label htmlFor="srm-dir">Directory API endpoint</label></h3><p>Used to fetch one verified student's details (<code>get_student</code>) after sign-up, and for connection tests. It is never listed, and a lookup never counts as proof of identity. Leave empty to use <code>SRMAP_DIRECTORY_URL</code>.</p></div>
          <div className="ctrl adm-srm-url"><input id="srm-dir" className="adm-input" type="url" inputMode="url" placeholder="https://…" value={draft.directoryUrl} disabled={!canEdit} onChange={e => setDraft(d => ({ ...d, directoryUrl: e.target.value.trim() }))} /></div>
        </div>
        <div className="set-row">
          <div>
            <h3><label htmlFor="srm-key">API key</label></h3>
            <p>
              {s.apiKey.set ? <>Set {s.apiKey.source === 'env' ? 'from the SRMAP_API_KEY environment variable' : 'in this panel'} <span className="adm-mono">{s.apiKey.hint}</span>. </> : 'Not set. '}
              Sent only from the server, in the <span className="adm-mono">{s.apiKeyHeader}</span> header. Saved keys are encrypted and never shown again.
              {!s.canStoreSecrets && <> Saving a key here needs <code>INTEGRATION_ENCRYPTION_KEY</code> on the server; otherwise set <code>SRMAP_API_KEY</code> in Render.</>}
              {s.apiKey.unreadable && <strong className="adm-srm-warn"> The saved key can't be decrypted. Re-enter it.</strong>}
            </p>
          </div>
          <div className="ctrl adm-srm-url">
            <input id="srm-key" className="adm-input" type="password" autoComplete="new-password" placeholder={s.apiKey.set ? 'Enter a new key to replace it' : 'Paste the API key'} value={apiKey} disabled={!canEdit || !s.canStoreSecrets} onChange={e => setApiKey(e.target.value.trim())} />
            {canEdit && s.apiKey.source === 'admin' && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => save({ apiKey: '' }, 'Saved key removed')}><KeyRound size="1em" />Remove saved key</button>}
          </div>
        </div>
        {canEdit && (
          <div className="adm-form-foot">
            <button type="button" className="btn outline" onClick={runTest} disabled={testing}><PlugZap size="1em" />{testing ? 'Testing…' : 'Test connection'}</button>
            <span className="adm-fine">{changed.length || apiKey ? `${changed.length + (apiKey ? 1 : 0)} unsaved change${changed.length + (apiKey ? 1 : 0) === 1 ? '' : 's'}` : 'All changes are audited. Secrets never appear in the audit log.'}</span>
            <button type="submit" className="btn primary" disabled={busy || (!changed.length && !apiKey)}><Save size="1em" />Save</button>
          </div>
        )}
        {test && (
          <ul className="adm-srm-checks" aria-live="polite">
            {test.results.map(r => <Check key={r.target} ok={r.ok}><strong>{r.target === 'directory' ? 'Directory API' : 'Verification service'}:</strong> {r.message}{r.httpStatus ? ` (HTTP ${r.httpStatus}, ${r.latencyMs} ms)` : ''}</Check>)}
          </ul>
        )}
        {!test && s.lastTest && <p className="adm-fine">Last test {ago(s.lastTest.at)}: {s.lastTest.ok ? 'passed' : 'failed'}. {s.lastTest.message}</p>}
      </form>
    </Card>
  );
}

export function SrmapPage() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const F = useUrlFilters(sp, setSp, { status: 'active', batch: '', sync: '', q: '', page: '1' });
  const overview = useQuery('/srmap/overview');
  const list = useQuery('/srmap/bindings', { ...F.all, limit: 25 });
  const batches = overview.data?.stats.byBatch || [];
  return (
    <>
      <PageHead kicker="Authentication" title="Connect SRM AP" sub="Verified SRM AP student identities linked to Cadence accounts, and the integration's settings."
        actions={<img src={LOGO} alt="Connect SRM AP" width="56" height="56" className="adm-srm-logo" />} />
      <Loadable q={overview}>{d => (
        <>
          <div className="adm-kpis small">
            {kpi('Verified bindings', num(d.stats.active))}
            {kpi('New this week', num(d.stats.lastWeek))}
            {kpi('Unbound (history)', num(d.stats.unbound))}
            {kpi('Profiles synced', num(d.stats.sync?.synced || 0), (d.stats.sync?.failed || d.stats.sync?.not_found || d.stats.sync?.pending) ? `${num((d.stats.sync.failed || 0) + (d.stats.sync.pending || 0))} to retry, ${num(d.stats.sync.not_found || 0)} not in directory` : 'All linked students')}
            {kpi('Sign-in status', d.readiness.ready ? 'Ready' : d.settings.enabled ? 'Disabled' : 'Off', d.readiness.ready ? 'Students can sign in' : d.providerStatus?.message || 'Students see a configuration notice')}
          </div>
          <div className="adm-grid-2 wide-left">
            <SettingsForm key={JSON.stringify(d.settings)} data={d} onSaved={overview.refresh} />
            <div>
              <Card title="Provider readiness">
                {d.providerStatus && <p className="adm-fine" style={{ marginTop: 0 }}><span className={`adm-pill ${d.readiness.ready ? 'ok' : 'muted'}`}>{d.readiness.ready ? 'Ready' : 'Sign-in disabled'}</span> {d.providerStatus.message}</p>}
                <ul className="adm-srm-checks">
                  {d.readiness.checks.map(c => <Check key={c.key} ok={c.ok}>{c.label}</Check>)}
                  <Check ok={d.readiness.directoryConfigured}>Directory API endpoint (HTTPS)</Check>
                </ul>
                {!d.readiness.ready && <p className="adm-fine"><Info size="1em" aria-hidden="true" /> Sign-in stays disabled until SRM AP provides a verification endpoint. Fetching student details is not the same as verifying a student's credentials.</p>}
              </Card>
              <Card title="Student profile details">
                <p className="adm-fine" style={{ marginTop: 0 }}><span className="adm-pill ok">Per student</span> {d.directorySync.note}</p>
              </Card>
              {batches.length > 0 && (
                <Card title="Bindings by batch">
                  <ul className="adm-srm-batches">{batches.map(b => <li key={String(b.batchYear)}><GraduationCap size="1em" aria-hidden="true" /><span>{b.batchYear ? `${b.batchYear} Batch` : 'Batch unknown'}</span><strong>{num(b.n)}</strong></li>)}</ul>
                </Card>
              )}
            </div>
          </div>
        </>
      )}</Loadable>

      <Tabs label="Binding status" value={F.get('status')} onChange={v => F.set({ status: v })} items={[['active', 'Active'], ['unbound', 'Unbound'], ['all', 'All']]} />
      <FilterBar active={(F.get('q') ? 1 : 0) + (F.get('batch') ? 1 : 0) + (F.get('sync') ? 1 : 0)} onClear={() => F.set({ q: '', batch: '', sync: '' })}>
        <SearchBox value={F.get('q')} onChange={v => F.set({ q: v })} placeholder="Username, name, email or full register number" />
        <Select label="Batch" value={F.get('batch')} onChange={v => F.set({ batch: v })} options={[['', 'Any'], ...batches.filter(b => b.batchYear).map(b => [String(b.batchYear), String(b.batchYear)]), ['unknown', 'Unknown']]} />
        <Select label="Profile" value={F.get('sync')} onChange={v => F.set({ sync: v })} options={[['', 'Any'], ['synced', 'Synced'], ['pending', 'Pending'], ['failed', 'Failed'], ['not_found', 'Not in directory']]} />
      </FilterBar>
      <Card pad={false}>
        <DataTable q={list} empty="No SRM AP bindings match." onRow={r => nav(`/admin/authentication/srmap/${r.id}`)} columns={[
          { key: 'u', label: 'Cadence user', render: r => <UserCell user={r.user} sub={r.displayName} to={false} /> },
          { key: 'reg', label: 'Register no.', render: r => <span className="adm-mono">{r.registerNumberMasked || 'Apxxxxxxxxxxx'}</span> },
          { key: 'b', label: 'Batch', render: r => batchText(r.batchYear, r.batchSource) },
          { key: 'bound', label: 'Bound', hideSm: true, render: r => dateOnly(r.boundAt) },
          { key: 'last', label: 'Last verified', hideSm: true, render: r => ago(r.lastAuthenticatedAt) },
          { key: 'sync', label: 'Profile', hideSm: true, render: r => <SyncPill s={r.profileSync} /> },
          { key: 's', label: 'Status', render: r => <Status value={r.active ? 'active' : 'revoked'} /> }
        ]} />
        <Pager data={list.data} onPage={p => F.set({ page: String(p) })} />
      </Card>
    </>
  );
}

export function SrmapBindingDetail() {
  const ui = useUI();
  const { id } = useParams();
  const q = useQuery(`/srmap/bindings/${id}`);
  const overview = useQuery('/srmap/overview');
  const [confirm, setConfirm] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const canUnbind = overview.data?.canUnbind;
  const canSync = overview.data?.canConfigure;
  const resync = async () => {
    setSyncing(true);
    try {
      const r = await apost(`/srmap/bindings/${id}/sync`);
      ui.toast(r.ok ? 'Student details fetched' : `Couldn't fetch details (${r.code})`);
      q.reload();
    } catch (err) { ui.toast(err.message); } finally { setSyncing(false); }
  };
  return (
    <>
      <Link className="adm-link" to="/admin/authentication/srmap"><ArrowLeft size="1em" /> All SRM AP bindings</Link>
      <Loadable q={q}>{d => (
        <>
          <PageHead kicker="Connect SRM AP" title={d.user?.username || 'Deleted account'} sub={d.binding.displayName}
            actions={d.binding.active && (canSync || canUnbind) && <>
              {canSync && <button type="button" className="btn outline" onClick={resync} disabled={syncing}><RefreshCw size="1em" />{syncing ? 'Fetching…' : 'Re-fetch details'}</button>}
              {canUnbind && <button type="button" className="btn danger" onClick={() => setConfirm(true)}><Unlink size="1em" />Unbind</button>}
            </>} />
          <div className="adm-grid-2">
            <Card title="Binding">
              <Facts items={[
                ['Status', <Status key="s" value={d.binding.active ? 'active' : 'revoked'} />],
                ['Verified name', d.binding.displayName || '—'],
                ['Register number', <span key="r" className="adm-mono">{d.binding.registerNumberMasked || 'Apxxxxxxxxxxx'}</span>],
                ['Student ID', <span key="i" className="adm-mono">{d.binding.externalStudentId}</span>],
                ['Verified email', d.binding.verifiedEmail || '—'],
                ['Identity verified', d.binding.identityVerified ? 'Yes, by SRM AP' : 'No'],
                ['Consent given', d.binding.consentAt ? dateTime(d.binding.consentAt) : '—'],
                ['Batch', batchText(d.binding.batchYear, d.binding.batchSource)],
                (d.binding.className || d.binding.section) && ['Class / section', [d.binding.className, d.binding.section].filter(Boolean).join(' · ')],
                d.binding.gender && ['Gender', d.binding.gender],
                ['Profile details', <span key="p"><SyncPill s={d.binding.profileSync} />{d.binding.profileSync?.syncedAt ? ` fetched ${ago(d.binding.profileSync.syncedAt)}` : ''}{d.binding.profileSync?.attempts ? ` · ${d.binding.profileSync.attempts} attempt${d.binding.profileSync.attempts === 1 ? '' : 's'}` : ''}</span>],
                ['Bound', dateTime(d.binding.boundAt)],
                ['Last verified', d.binding.lastAuthenticatedAt ? `${dateTime(d.binding.lastAuthenticatedAt)} (${ago(d.binding.lastAuthenticatedAt)})` : '—'],
                !d.binding.active && ['Unbound', `${dateTime(d.binding.unboundAt)}${d.binding.unboundReason ? ` · ${d.binding.unboundReason}` : ''}`]
              ]} />
            </Card>
            <Card title="Cadence account">
              {d.user ? (
                <>
                  <UserCell user={d.user} sub={d.user.email} />
                  <Facts items={[['Account status', <Status key="a" value={d.user.status} />], ['Signs in with', d.user.provider === 'srm_ap' ? 'Connect SRM AP' : d.user.provider], ['Other sign-in methods', d.soleSignInMethod ? 'None. Unbinding locks this student out.' : 'Yes']]} />
                </>
              ) : <p className="adm-muted">The account no longer exists.</p>}
            </Card>
          </div>
          <Card title="History" pad={false}>
            <DataTable rows={d.history} rowKey={h => `${h.type}-${h.at}`} empty="No history yet." columns={[
              { key: 't', label: 'Event', render: h => ({ bound: 'Bound', login: 'Verified sign-in', refreshed: 'Profile refreshed', synced: 'Details fetched', sync_failed: 'Details fetch failed', unbound: 'Unbound' }[h.type] || h.type) },
              { key: 'at', label: 'When', render: h => dateTime(h.at) },
              { key: 'by', label: 'By', render: h => h.by?.username || '—' },
              { key: 'n', label: 'Note', hideSm: true, render: h => h.note || '—' }
            ]} />
          </Card>
          {d.audit.length > 0 && (
            <Card title="Audit log" pad={false}>
              <DataTable rows={d.audit} empty="No admin actions." columns={[
                { key: 'seq', label: '#', render: a => <span className="adm-mono">{a.seq}</span> },
                { key: 'a', label: 'Action', render: a => a.action.replace(/_/g, ' ').toLowerCase() },
                { key: 'actor', label: 'Admin', render: a => a.actor },
                { key: 'r', label: 'Reason', hideSm: true, render: a => a.reason || '—' },
                { key: 'at', label: 'When', render: a => dateTime(a.at) }
              ]} />
            </Card>
          )}
          <Confirm open={confirm} onClose={() => setConfirm(false)} danger confirmLabel="Unbind" title="Unbind this SRM AP identity?"
            body={d.soleSignInMethod
              ? 'Connect SRM AP is the only way this student signs in. Unbinding removes their SRM AP branding and they will not be able to sign in until support helps them. Their account and typing stats are kept.'
              : 'The student loses the SRM AP badge and branding. Their account and typing stats are kept, and they can verify again later.'}
            note="Reason (required, recorded in the audit log)" typeToConfirm={d.soleSignInMethod ? 'UNBIND' : undefined}
            onConfirm={async ({ note }) => {
              if (!note || note.trim().length < 3) throw new Error('Give a reason (3+ characters).');
              await apost(`/srmap/bindings/${id}/unbind`, { reason: note.trim(), confirmLockout: d.soleSignInMethod || undefined });
              ui.toast('SRM AP identity unbound'); q.reload();
            }} />
        </>
      )}</Loadable>
    </>
  );
}
