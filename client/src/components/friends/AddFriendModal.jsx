import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AtSign, Loader2, Check, UserPlus, Clock, UserCheck, Ban } from 'lucide-react';
import Modal from '../compete/Modal.jsx';
import Avatar from '../Avatar.jsx';
import { api } from '../../lib/api.js';

const STATE_COPY = {
  self: "That's you",
  friends: 'Already friends',
  pending_sent: 'Request sent',
  pending_received: 'Wants to be your friend',
  blocked: 'Blocked'
};

/**
 * Search by username (debounced, server-side prefix search) and send a request.
 * Enter sends to the exact match.
 */
export default function AddFriendModal({ open, onClose, onChanged }) {
  const reduce = useReducedMotion();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | searching | done | error
  const [message, setMessage] = useState(null);  // { ok, text }
  const [busyId, setBusyId] = useState(null);
  const timer = useRef(null);
  const ctrl = useRef(null);

  useEffect(() => { if (open) { setQ(''); setResults([]); setStatus('idle'); setMessage(null); } }, [open]);
  useEffect(() => () => { clearTimeout(timer.current); ctrl.current?.abort(); }, []);

  const search = value => {
    const term = value.trim().replace(/^@/, '').toLowerCase();
    setQ(value); setMessage(null);
    clearTimeout(timer.current); ctrl.current?.abort();
    if (term.length < 2) { setResults([]); setStatus('idle'); return; }
    setStatus('searching');
    timer.current = setTimeout(async () => {
      ctrl.current = new AbortController();
      try {
        const d = await api(`/friends/search?username=${encodeURIComponent(term)}`, { signal: ctrl.current.signal });
        setResults(d.results); setStatus('done');
      } catch (err) {
        if (err.name === 'AbortError') return;
        setStatus('error'); setResults([]);
        setMessage({ ok: false, text: err.status === 429 ? 'Too many searches. Wait a moment and try again.' : err.message });
      }
    }, 300);
  };

  const setState = (id, state) => setResults(rs => rs.map(r => (r.id === id ? { ...r, state } : r)));
  const act = async (user, kind) => {
    setBusyId(user.id); setMessage(null);
    try {
      if (kind === 'accept') { await api('/friends/accept', { method: 'POST', body: { userId: user.id } }); setState(user.id, 'friends'); setMessage({ ok: true, text: `You and ${user.username} are now friends.` }); }
      else {
        const d = await api('/friends/request', { method: 'POST', body: { userId: user.id } });
        setState(user.id, d.state);
        setMessage({ ok: true, text: d.state === 'friends' ? `You and ${user.username} are now friends.` : `Friend request sent to ${user.username}.` });
      }
      onChanged?.();
    } catch (err) {
      if (err.status === 409 || err.status === 400) search(q);
      setMessage({ ok: false, text: err.status === 429 ? 'Too many requests. Wait a moment and try again.' : err.message });
    } finally { setBusyId(null); }
  };

  const submit = e => {
    e.preventDefault();
    const exact = results.find(r => r.exact);
    if (!exact) { if (status === 'done') setMessage({ ok: false, text: 'No Cadence user has that username.' }); return; }
    if (exact.state === 'none') act(exact, 'request');
    else if (exact.state === 'pending_received') act(exact, 'accept');
    else setMessage({ ok: false, text: exact.state === 'self' ? "You can't add yourself." : `${exact.username}: ${STATE_COPY[exact.state].toLowerCase()}.` });
  };

  const action = r => {
    if (busyId === r.id) return <button type="button" className="btn primary sm" disabled><Loader2 size="1em" className="cp-spin" /></button>;
    switch (r.state) {
      case 'none': return <motion.button type="button" className="btn primary sm" whileTap={{ scale: 0.95 }} onClick={() => act(r, 'request')}><UserPlus size="1em" />Request</motion.button>;
      case 'pending_received': return <motion.button type="button" className="btn primary sm" whileTap={{ scale: 0.95 }} onClick={() => act(r, 'accept')}><Check size="1em" />Accept</motion.button>;
      case 'pending_sent': return <span className="cp-state"><Clock size="1em" />Request sent</span>;
      case 'friends': return <span className="cp-state ok"><UserCheck size="1em" />Friends</span>;
      case 'blocked': return <span className="cp-state"><Ban size="1em" />Blocked</span>;
      default: return <span className="cp-state">{STATE_COPY[r.state] || ''}</span>;
    }
  };

  const term = q.trim().replace(/^@/, '');
  return (
    <Modal id="add-friend" open={open} onClose={onClose} title="Add a friend" description="Search for a Cadence username to send a friend request.">
      <form onSubmit={submit} noValidate>
        <div className="fr-search">
          <AtSign size="1em" aria-hidden="true" />
          <label htmlFor="fr-q" className="sr">Username</label>
          <input id="fr-q" data-autofocus value={q} placeholder="username" autoComplete="off" spellCheck="false" maxLength={21}
            aria-describedby="fr-status" onChange={e => search(e.target.value)} />
          {status === 'searching' && <Loader2 size="1em" className="cp-spin fr-search-spin" aria-hidden="true" />}
        </div>
        <p id="fr-status" className="fr-status" aria-live="polite">
          {status === 'searching' ? 'Searching...' : status === 'done' && !results.length ? `No user found for "${term}".` : term.length === 1 ? 'Keep typing...' : ' '}
        </p>
        <ul className="fr-results">
          <AnimatePresence initial={false}>
            {results.map((r, i) => (
              <motion.li key={r.id} layout={!reduce}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.03 } }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}>
                <span className="cp-av-wrap"><Avatar name={r.username} url={r.avatar} /><span className={`cp-presence${r.online ? ' on' : ''}`} aria-hidden="true" /></span>
                <span className="fr-name">{r.username}<small>{r.state === 'self' ? "That's you" : r.online ? 'Online' : 'Offline'}</small></span>
                {action(r)}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        <AnimatePresence>
          {message && (
            <motion.p key={message.text} className={`form-msg${message.ok ? ' info' : ''}`} role={message.ok ? 'status' : 'alert'}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {message.text}
            </motion.p>
          )}
        </AnimatePresence>
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Done</button>
          <button type="submit" className="btn primary" disabled={!term || status === 'searching'}><UserPlus size="1em" />Request</button>
        </div>
      </form>
    </Modal>
  );
}
