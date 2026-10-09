import { useEffect, useState } from 'react';
import { BadgeCheck, GraduationCap, Unlink, RefreshCw } from 'lucide-react';
import SrmapModal, { SrmapButton } from './SrmapConnect.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { fmtDate } from '../lib/format.js';
import { hasSrmapBranding, batchLabel, SRMAP_LOGO_LG, cleanSrmPhoto, getDefaultSrmAvatar } from '../lib/srmap.js';

/** "SRM AP Connected" chip for the profile header. Renders nothing unless the server says the account is verified. */
export function SrmapBadge({ user }) {
  if (!hasSrmapBranding(user)) return null;
  const batch = user.connections.srm_ap.batchYear;
  return (
    <span className="srm-badge" title="Verified with Connect SRM AP">
      <BadgeCheck size="1em" aria-hidden="true" />SRM AP Connected{batch ? <span className="srm-badge-batch">{batchLabel(batch)}</span> : null}
    </span>
  );
}

/** Account settings: connect, view or disconnect the SRM AP identity. */
export default function SrmapAccountPanel() {
  const auth = useAuth();
  const ui = useUI();
  const [conn, setConn] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const connected = hasSrmapBranding(auth.user);

  useEffect(() => {
    let live = true;
    setError('');
    setConn(null);
    auth.srmapConnection().then(c => { if (live) setConn(c); }).catch(err => { if (live) setError(err.message); });
    return () => { live = false; };
  }, [auth.user?.id, connected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch this student's details from SRM AP again (after a failed or missing fetch).
  const retrySync = async () => {
    setSyncing(true); setError('');
    try {
      const d = await auth.srmapSyncProfile();
      setConn(c => ({ ...c, ...d.connection }));
      ui.toast('SRM AP details updated');
    } catch (err) {
      setError(err.message);
      auth.srmapConnection().then(setConn).catch(() => {});
    } finally { setSyncing(false); }
  };
  const sync = conn?.profileSync;

  const disconnect = () => ui.openPrompt({
    title: 'Disconnect SRM AP?',
    desc: 'The Connect SRM AP badge and branding will be removed from your account. Your typing results stay. You can connect again later by verifying with SRM AP.',
    kind: null, okLabel: 'Disconnect', danger: true,
    onOk: async () => { try { await auth.srmapUnlink(); ui.toast('SRM AP disconnected'); } catch (err) { return err.message; } }
  });

  return (
    <div className="panel glass srm-panel">
      <div className="srm-panel-head">
        {connected ? (
          <img
            src={cleanSrmPhoto(conn?.profilePhoto || auth.user?.avatar, conn?.gender)}
            alt={conn?.displayName ? `${conn.displayName}'s photo` : 'Student photo'}
            width="64"
            height="64"
            referrerPolicy="no-referrer"
            style={{ borderRadius: '50%', objectFit: 'cover' }}
            onError={e => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = getDefaultSrmAvatar(conn?.gender);
            }}
          />
        ) : (
          <img src={SRMAP_LOGO_LG} alt="Connect SRM AP" width="64" height="64" />
        )}
        <div>
          <h2>Connect SRM AP</h2>
          <p>{connected ? 'Your account is verified with your SRM AP student identity.' : 'Verify your SRM AP student identity to add the Connect SRM AP badge and branding.'}</p>
        </div>
      </div>
      {error && <p className="form-msg" role="alert">{error}</p>}
      {connected && conn?.connected ? (
        <>
          <dl className="srm-facts">
            <div><dt>Status</dt><dd><span className="srm-badge"><BadgeCheck size="1em" aria-hidden="true" />SRM AP Connected</span></dd></div>
            {conn.displayName && <div><dt>Verified name</dt><dd>{conn.displayName}</dd></div>}
            {conn.registerNumberMasked && <div><dt>Register number</dt><dd className="mono">{conn.registerNumberMasked}</dd></div>}
            {conn.email && <div><dt>Institutional email</dt><dd className="mono">{conn.email}</dd></div>}
            {(conn.className || conn.section) && <div><dt>Class & Section</dt><dd>{[conn.className, conn.section ? `Sec ${conn.section}` : null].filter(Boolean).join(' · ')}</dd></div>}
            {conn.gender && <div><dt>Gender</dt><dd>{conn.gender}</dd></div>}
            {conn.batchYear && <div><dt>Batch</dt><dd><GraduationCap size="1em" aria-hidden="true" /> {batchLabel(conn.batchYear)}</dd></div>}
            <div><dt>Connected</dt><dd>{fmtDate(conn.boundAt)}</dd></div>
            {conn.lastAuthenticatedAt && <div><dt>Last verified</dt><dd>{fmtDate(conn.lastAuthenticatedAt)}</dd></div>}
            <div><dt>SRM AP details</dt><dd>{sync?.status === 'synced' ? `Up to date (${fmtDate(sync.syncedAt)})` : sync?.status === 'not_found' ? 'Not found in the SRM AP directory' : sync?.status === 'failed' ? "Couldn't fetch yet. We'll retry when you next sign in." : 'Not fetched yet'}</dd></div>
          </dl>
          {sync?.status !== 'synced' && (
            <div className="set-row">
              <div><h3>Fetch SRM AP details</h3><p>Get your class, section, gender and photo from SRM AP now instead of waiting for your next sign-in.</p></div>
              <div className="ctrl"><button type="button" className="btn ghost" onClick={retrySync} disabled={syncing}><RefreshCw size="1em" />{syncing ? 'Fetching…' : 'Try again'}</button></div>
            </div>
          )}
          <div className="set-row">
            <div><h3>Disconnect</h3><p>{conn.canUnlink ? 'Remove the link between this account and your SRM AP identity.' : 'Connect SRM AP is your only way to sign in. Add Google or GitHub sign-in first.'}</p></div>
            <div className="ctrl"><button type="button" className="btn danger" onClick={disconnect} disabled={!conn.canUnlink}><Unlink size="1em" />Disconnect</button></div>
          </div>
        </>
      ) : !connected ? (
        <div className="srm-panel-cta"><SrmapButton onClick={() => setOpen(true)}>Connect SRM AP</SrmapButton></div>
      ) : null}
      <SrmapModal open={open} intent="link" onClose={() => setOpen(false)}
        onDone={() => { setOpen(false); ui.toast('SRM AP connected. Welcome, verified student!'); }} />
    </div>
  );
}
