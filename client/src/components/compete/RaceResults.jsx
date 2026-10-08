import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Trophy, RotateCw, Plus, ChartLine, LogOut, Loader2, ShieldAlert, Check } from 'lucide-react';
import Avatar from '../Avatar.jsx';
import { useCompete } from '../../context/CompeteContext.jsx';
import { useUI } from '../../context/UIContext.jsx';
import { ordinal, settingsSummary } from '../../lib/compete.js';

export default function RaceResults({ room }) {
  const compete = useCompete();
  const ui = useUI();
  const nav = useNavigate();
  const reduce = useReducedMotion();
  const [busy, setBusy] = useState(false);
  const standings = room.standings || [];
  const winner = standings[0] && standings[0].status !== 'dnf' && standings[0].status !== 'flagged' ? standings[0] : null;
  const mine = standings.find(s => s.userId === compete.myId);
  const isHost = room.hostId === compete.myId;
  const host = room.players.find(p => p.id === room.hostId);
  const saved = compete.savedCode === room.code;

  let note = null;
  if (mine?.status === 'valid') note = saved ? <><Check size="1em" aria-hidden="true" />Saved to your history and stats.</> : <><Loader2 size="1em" className="cp-spin" aria-hidden="true" />Saving your result...</>;
  else if (mine?.status === 'suspicious' || mine?.status === 'flagged') note = <><ShieldAlert size="1em" aria-hidden="true" />This result looked unusual, so it wasn't counted toward your stats.</>;
  else if (mine?.status === 'dnf') note = "You didn't finish this race.";

  const rematch = async () => {
    setBusy(true);
    try { const r = await compete.rematch(); nav(`/compete/${r.code}`, { replace: true }); }
    catch (err) { if (err?.message) ui.toast(err.message); }
    finally { setBusy(false); }
  };
  const joinRematch = async () => {
    setBusy(true);
    try { const r = await compete.joinRoom(room.rematchCode); nav(`/compete/${r.code}`, { replace: true }); }
    catch (err) { if (err?.message) ui.toast(err.message); }
    finally { setBusy(false); }
  };
  const leave = () => { compete.leaveRoom(); nav('/compete'); };

  return (
    <section className="cp-results" aria-labelledby="cp-results-title">
      <motion.div className={`cp-winner glass${winner ? ' has-winner' : ''}`}
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}>
        <span className="cadence-kicker"><Trophy size="1em" aria-hidden="true" /> competition complete</span>
        {winner ? (
          <>
            <motion.div className="cp-winner-avatar" initial={reduce ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.15, type: 'spring', stiffness: 400, damping: 20 }}>
              <Avatar name={winner.username} url={winner.avatar} size="lg" />
              <span className="cp-crown" aria-hidden="true"><Trophy size="1em" /></span>
            </motion.div>
            <h1 id="cp-results-title">{winner.userId === compete.myId ? 'You win!' : `${winner.username} wins`}</h1>
            <p className="cp-winner-line"><strong>{Math.round(winner.wpm)}</strong> wpm · {winner.acc}% accuracy</p>
          </>
        ) : <h1 id="cp-results-title">Nobody finished</h1>}
        <p className="muted cp-results-meta">Room {room.code} · {settingsSummary(room.settings)}</p>
      </motion.div>

      <ol className="cp-standings" aria-label="Final standings">
        {standings.map((s, i) => {
          const isMe = s.userId === compete.myId;
          const counted = s.status === 'valid';
          return (
            <motion.li key={s.userId} className={`cp-standing${isMe ? ' is-me' : ''}${s.rank === 1 && winner ? ' is-first' : ''}`}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.08, duration: 0.3 }}>
              <span className={`cp-medal m${s.rank}`} aria-label={`${ordinal(s.rank)} place`}>{s.rank}</span>
              <Avatar name={s.username} url={s.avatar} />
              <span className="cp-standing-name">{s.username}{isMe && <em>you</em>}{s.left && <span className="cp-tag">left</span>}</span>
              {s.status === 'dnf'
                ? <span className="cp-standing-stats"><span className="cp-tag">did not finish</span></span>
                : (
                  <span className="cp-standing-stats">
                    <span><strong>{Math.round(s.wpm)}</strong> wpm</span>
                    <span>{s.acc}%</span>
                    {!counted && <span className="cp-tag warn" title="Didn't pass the result checks">not counted</span>}
                  </span>
                )}
            </motion.li>
          );
        })}
      </ol>

      {note && <p className="cp-note" role="status">{note}</p>}

      <div className="cp-results-actions">
        {isHost ? (
          <motion.button type="button" className="btn primary" onClick={rematch} disabled={busy} whileTap={{ scale: 0.97 }}>
            {busy ? <Loader2 size="1em" className="cp-spin" /> : <RotateCw size="1em" />}Rematch
          </motion.button>
        ) : room.rematchCode ? (
          <button type="button" className="btn primary" onClick={joinRematch} disabled={busy}><RotateCw size="1em" />Join rematch</button>
        ) : <span className="muted cp-wait">Waiting for {host?.username || 'the host'} to start a rematch...</span>}
        <button type="button" className="btn outline" onClick={() => compete.openCreateRoom()}><Plus size="1em" />New room</button>
        <Link className="btn ghost" to="/stats"><ChartLine size="1em" />Results</Link>
        <button type="button" className="btn ghost" onClick={leave}><LogOut size="1em" />Leave</button>
      </div>
    </section>
  );
}
