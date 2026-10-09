import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { UserPlus, Swords, MoreHorizontal, UserMinus, Ban, Check, X, Users, LogIn, UserRound, Copy } from 'lucide-react';
import Avatar from '../components/Avatar.jsx';
import AddFriendModal from '../components/friends/AddFriendModal.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { useCompete } from '../context/CompeteContext.jsx';

const POLL_MS = 30000;

function RowMenu({ friend, onRemove, onBlock, onCopyLink }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc, true); };
  }, [open]);
  return (
    <div className="fr-more" ref={ref}>
      <button type="button" className="icon-btn" aria-haspopup="menu" aria-expanded={open} aria-label={`More options for ${friend.username}`} onClick={() => setOpen(o => !o)}><MoreHorizontal size="1em" /></button>
      {open && (
        <div className="menu fr-menu" role="menu">
          <Link role="menuitem" to={`/profile/${friend.username}`} onClick={() => setOpen(false)}><UserRound size="1em" />View profile</Link>
          <button role="menuitem" type="button" onClick={() => { setOpen(false); onCopyLink(); }}><Copy size="1em" />Copy profile link</button>
          <button role="menuitem" type="button" onClick={() => { setOpen(false); onRemove(); }}><UserMinus size="1em" />Remove friend</button>
          <button role="menuitem" type="button" onClick={() => { setOpen(false); onBlock(); }}><Ban size="1em" />Block</button>
        </div>
      )}
    </div>
  );
}

export default function FriendsPage() {
  const auth = useAuth();
  const ui = useUI();
  const compete = useCompete();
  const reduce = useReducedMotion();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async signal => {
    try { const d = await api('/friends', { signal }); setData(d); setError(null); }
    catch (err) { if (err.name !== 'AbortError') setError(err.message); }
  }, []);

  useEffect(() => {
    if (!auth.user) return undefined;
    const ctrl = new AbortController();
    load(ctrl.signal);
    // Online status is refreshed by polling, not pushed, to keep the server light.
    const t = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    return () => { ctrl.abort(); clearInterval(t); };
  }, [auth.user, load, compete?.friendsVersion]);

  if (auth.ready && !auth.user) {
    return (
      <div className="page">
        <h1>Friends</h1>
        <div className="panel glass empty"><p>Log in to add friends and race them in real time.</p><Link className="btn primary" to="/login"><LogIn size="1em" />Log in</Link></div>
      </div>
    );
  }

  const act = async (id, path, body, method = 'POST', done) => {
    setBusy(id);
    try { await api(path, { method, body }); if (done) ui.toast(done); await load(); }
    catch (err) { ui.toast(err.message); }
    finally { setBusy(null); }
  };
  const remove = f => ui.openPrompt({ title: `Remove ${f.username}?`, desc: "You'll need to send a new request to be friends again.", kind: null, okLabel: 'Remove friend', danger: true,
    onOk: () => act(f.id, `/friends/${f.id}`, undefined, 'DELETE', `${f.username} removed`) });
  const block = f => ui.openPrompt({ title: `Block ${f.username}?`, desc: "They won't find you in search or be able to send you requests. You can unblock them later.", kind: null, okLabel: 'Block', danger: true,
    onOk: () => act(f.id, '/friends/block', { userId: f.id }, 'POST', `${f.username} blocked`) });

  const friends = data?.friends || [];
  const online = friends.filter(f => f.online).length;
  const rowMotion = i => ({ initial: reduce ? { opacity: 0 } : { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0, transition: { delay: Math.min(i, 8) * 0.03 } }, exit: { opacity: 0, transition: { duration: 0.12 } } });

  return (
    <div className="page fr-page">
      <div className="fr-head">
        <div>
          <span className="cadence-kicker">cadence social</span>
          <h1>Friends</h1>
          <p className="lede">Add friends, then race them in real time.</p>
        </div>
        <motion.button type="button" className="btn primary" whileTap={{ scale: 0.97 }} onClick={() => setAdding(true)}><UserPlus size="1em" />Add friend</motion.button>
      </div>

      {error && <p className="form-msg" role="alert">{error}</p>}

      {data?.incoming.length > 0 && (
        <div className="panel glass">
          <h2>Friend requests<span className="aside">{data.incoming.length}</span></h2>
          <ul className="fr-list">
            <AnimatePresence initial={false}>
              {data.incoming.map((f, i) => (
                <motion.li key={f.id} layout={!reduce} {...rowMotion(i)}>
                  <Avatar name={f.username} url={f.avatar} />
                  <span className="fr-name">{f.username}<small>wants to be your friend</small></span>
                  <div className="fr-actions">
                    <button type="button" className="btn ghost sm" disabled={busy === f.id} onClick={() => act(f.id, '/friends/reject', { userId: f.id })}><X size="1em" />Decline</button>
                    <button type="button" className="btn primary sm" disabled={busy === f.id} onClick={() => act(f.id, '/friends/accept', { userId: f.id }, 'POST', `You and ${f.username} are now friends`)}><Check size="1em" />Accept</button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      )}

      {data?.outgoing.length > 0 && (
        <div className="panel glass">
          <h2>Sent requests<span className="aside">{data.outgoing.length}</span></h2>
          <ul className="fr-list">
            {data.outgoing.map(f => (
              <li key={f.id}>
                <Avatar name={f.username} url={f.avatar} />
                <span className="fr-name">{f.username}<small>Request sent</small></span>
                <div className="fr-actions"><button type="button" className="btn ghost sm" disabled={busy === f.id} onClick={() => act(f.id, '/friends/cancel', { userId: f.id })}>Cancel request</button></div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="panel glass">
        <h2><Users size="1em" />Your friends{data && <span className="aside">{friends.length ? `${online} online · ${friends.length} total` : ''}</span>}</h2>
        {!data && !error ? <div className="spinner" role="status" aria-label="Loading friends" /> : !friends.length ? (
          <div className="fr-empty">
            <span className="fr-empty-icon" aria-hidden="true"><Users size="1em" /></span>
            <p><strong>You don't have any friends yet.</strong></p>
            <p className="muted">Add friends to compete with them.</p>
            <button type="button" className="btn primary" onClick={() => setAdding(true)}><UserPlus size="1em" />Add friend</button>
          </div>
        ) : (
          <ul className="fr-list">
            <AnimatePresence initial={false}>
              {friends.map((f, i) => (
                <motion.li key={f.id} layout={!reduce} {...rowMotion(i)}>
                  <Link to={`/profile/${f.username}`} className="cp-av-wrap" title={`View ${f.username}'s public profile`}>
                    <Avatar name={f.username} url={f.avatar} />
                    <span className={`cp-presence${f.online ? ' on' : ''}`} aria-hidden="true" />
                  </Link>
                  <span className="fr-name">
                    <Link to={`/profile/${f.username}`} style={{ color: 'inherit', textDecoration: 'none' }} title={`View ${f.username}'s public profile`}>
                      {f.username}
                    </Link>
                    <small className={f.online ? 'on' : ''}>{f.online ? 'Online' : 'Offline'}</small>
                  </span>
                  <div className="fr-actions">
                    <motion.button type="button" className="btn outline sm" whileTap={{ scale: 0.96 }} onClick={() => compete.challenge(f)} aria-label={`Compete with ${f.username}`}>
                      <Swords size="1em" />Compete
                    </motion.button>
                    <RowMenu
                      friend={f}
                      onRemove={() => remove(f)}
                      onBlock={() => block(f)}
                      onCopyLink={() => {
                        const url = `https://cadence-wj7c.onrender.com/profile/${f.username}`;
                        if (navigator.clipboard) navigator.clipboard.writeText(url);
                        ui.toast(`Copied ${f.username}'s profile link! 📋`);
                      }}
                    />
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      {data?.blocked.length > 0 && (
        <details className="panel glass fr-blocked">
          <summary>Blocked users<span className="aside">{data.blocked.length}</span></summary>
          <ul className="fr-list">
            {data.blocked.map(f => (
              <li key={f.id}>
                <Avatar name={f.username} url={f.avatar} />
                <span className="fr-name">{f.username}</span>
                <div className="fr-actions"><button type="button" className="btn ghost sm" disabled={busy === f.id} onClick={() => act(f.id, `/friends/block/${f.id}`, undefined, 'DELETE', `${f.username} unblocked`)}>Unblock</button></div>
              </li>
            ))}
          </ul>
        </details>
      )}

      <AddFriendModal open={adding} onClose={() => setAdding(false)} onChanged={() => load()} />
    </div>
  );
}
