import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Swords, LogIn, ArrowRight, Users, Mail, Info, X } from 'lucide-react';
import Avatar from '../components/Avatar.jsx';
import ConnectionPill from '../components/compete/ConnectionPill.jsx';
import CompetitionHistory from '../components/compete/CompetitionHistory.jsx';
import { api } from '../lib/api.js';
import { settingsSummary } from '../lib/compete.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useCompete } from '../context/CompeteContext.jsx';

const STATUS = { WAITING: 'waiting for players', COUNTDOWN: 'starting', RUNNING: 'race in progress', FINISHED: 'results ready' };

function RaceAFriend() {
  const compete = useCompete();
  const [friends, setFriends] = useState(null);
  useEffect(() => {
    const ctrl = new AbortController();
    api('/friends', { signal: ctrl.signal }).then(d => setFriends(d.friends)).catch(err => { if (err.name !== 'AbortError') setFriends([]); });
    return () => ctrl.abort();
  }, [compete.friendsVersion]);
  return (
    <div className="panel glass">
      <h2><Users size="1em" />Race a friend<Link className="aside link" to="/friends">All friends</Link></h2>
      {friends === null ? <div className="spinner" role="status" aria-label="Loading friends" /> : !friends.length ? (
        <div className="empty"><p>You don't have any friends yet. Add friends to compete with them.</p><Link className="btn outline sm" to="/friends">Add friends</Link></div>
      ) : (
        <ul className="fr-list compact">
          {friends.slice(0, 5).map(f => (
            <li key={f.id}>
              <span className="cp-av-wrap"><Avatar name={f.username} url={f.avatar} size="sm" /><span className={`cp-presence${f.online ? ' on' : ''}`} aria-hidden="true" /></span>
              <span className="fr-name">{f.username}<small className={f.online ? 'on' : ''}>{f.online ? 'Online' : 'Offline'}</small></span>
              <button type="button" className="btn outline sm" onClick={() => compete.challenge(f)} aria-label={`Compete with ${f.username}`}><Swords size="1em" />Compete</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function CompetePage() {
  const auth = useAuth();
  const compete = useCompete();
  const nav = useNavigate();
  const reduce = useReducedMotion();
  const room = compete.room;
  const notice = compete.notice;

  if (auth.ready && !auth.user) {
    return (
      <div className="page wide cp-page">
        <div className="panel glass cp-hero">
          <div className="cp-hero-text">
            <span className="cadence-kicker">cadence compete</span>
            <h1>Compete</h1>
            <p className="lede">Challenge your friends in real-time typing. Up to 4 players, same text, same start.</p>
          </div>
          <div className="cp-hero-actions"><Link className="btn primary" to="/login"><LogIn size="1em" />Log in to compete</Link><Link className="btn outline" to="/register">Create an account</Link></div>
        </div>
      </div>
    );
  }

  return (
    <div className="page wide cp-page">
      <motion.div className="panel glass cp-hero" initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div className="cp-hero-text">
          <span className="cadence-kicker">cadence compete</span>
          <h1>Compete</h1>
          <p className="lede">Challenge your friends in real-time typing. Up to 4 players, same text, same start.</p>
        </div>
        <div className="cp-hero-actions">
          <motion.button type="button" className="btn primary" whileTap={{ scale: 0.97 }} onClick={() => compete.openCreateRoom()}><Swords size="1em" />Create room</motion.button>
          <motion.button type="button" className="btn outline" whileTap={{ scale: 0.97 }} onClick={() => compete.openJoinRoom()}><LogIn size="1em" />Join room</motion.button>
        </div>
        <div className="cp-hero-conn"><ConnectionPill /></div>
      </motion.div>

      <AnimatePresence>
        {notice && (
          <motion.div className="cp-notice" role="status" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <Info size="1em" aria-hidden="true" /><span>{notice.message}</span>
            <button type="button" className="icon-btn" aria-label="Dismiss" onClick={compete.clearNotice}><X size="1em" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {room && (
        <motion.div className="cp-current glass" initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <span className={`cp-live-dot${room.status === 'RUNNING' ? ' racing' : ''}`} aria-hidden="true" />
          <span>You're in room <strong className="cp-code-inline">{room.code}</strong>, {STATUS[room.status] || room.status.toLowerCase()} · {room.players.filter(p => !p.left).length} / {room.maxPlayers} players</span>
          <button type="button" className="btn primary sm" onClick={() => nav(`/compete/${room.code}`)}>Return to room<ArrowRight size="1em" /></button>
        </motion.div>
      )}

      <div className="grid-2">
        <div className="panel glass">
          <h2><Mail size="1em" />Invitations{compete.invites.length > 0 && <span className="aside">{compete.invites.length}</span>}</h2>
          {compete.invites.length ? (
            <ul className="fr-list">
              <AnimatePresence initial={false}>
                {compete.invites.map(inv => (
                  <motion.li key={inv.code} layout={!reduce} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <Avatar name={inv.from?.username} url={inv.from?.avatar} />
                    <span className="fr-name">{inv.from?.username || 'A friend'}<small>{settingsSummary(inv.settings)} · {inv.players} / {inv.maxPlayers} players</small></span>
                    <div className="fr-actions">
                      <button type="button" className="btn ghost sm" onClick={() => compete.declineInvite(inv.code)}>Decline</button>
                      <button type="button" className="btn primary sm" onClick={() => compete.joinFromInvite(inv)}>Join</button>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          ) : (
            <div className="cp-empty">
              <p><strong>No active competition.</strong></p>
              <p className="muted">Create a room and challenge your friends.</p>
            </div>
          )}
        </div>
        <RaceAFriend />
      </div>

      <CompetitionHistory />
    </div>
  );
}
