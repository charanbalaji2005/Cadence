import { motion, useReducedMotion } from 'framer-motion';
import { Flag, WifiOff, LogOut } from 'lucide-react';
import Avatar from '../Avatar.jsx';
import { useLiveProgress } from '../../context/CompeteContext.jsx';

/**
 * Live race standings. This is the only part of the race screen that re-renders on
 * progress updates; bars move with a CSS transform, and rows only animate when the
 * order actually changes.
 */
export default function ProgressBoard({ room, myId }) {
  const live = useLiveProgress();
  const reduce = useReducedMotion();
  const timed = room.settings.mode === 'time';
  const rows = room.players.map(p => ({ ...p, ...live[p.id] }));
  // In a timed race everyone runs the same clock, so distance typed is what separates players.
  const lead = Math.max(1, ...rows.map(p => p.chars || 0));
  const width = p => (timed ? ((p.chars || 0) / lead) * 100 : p.progress || 0);
  const sorted = [...rows].sort((a, b) => Number(!!a.left) - Number(!!b.left) || width(b) - width(a) || (b.wpm || 0) - (a.wpm || 0));

  return (
    <ol className="cp-board glass" aria-label="Live race standings">
      {sorted.map((p, i) => {
        const pct = Math.max(0, Math.min(100, width(p)));
        const me = p.id === myId;
        return (
          <motion.li key={p.id} layout={!reduce} transition={{ type: 'spring', stiffness: 520, damping: 42 }}
            className={`cp-board-row${me ? ' is-me' : ''}${p.left ? ' is-left' : ''}`}>
            <span className="cp-pos" aria-label={`Position ${i + 1}`}>{i + 1}</span>
            <Avatar name={p.username} url={p.avatar} size="sm" />
            <span className="cp-board-name">
              {p.username}{me && <em>you</em>}
              {p.finished && <span className="cp-tag ok"><Flag size="1em" aria-hidden="true" />finished</span>}
              {p.left && <span className="cp-tag"><LogOut size="1em" aria-hidden="true" />left</span>}
              {!p.left && !p.connected && !me && <span className="cp-tag warn"><WifiOff size="1em" aria-hidden="true" />offline</span>}
            </span>
            <div className="cp-bar" role="progressbar" aria-label={`${p.username}${timed ? ', distance typed' : ', progress'}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
              <span style={{ transform: `scaleX(${pct / 100})` }} />
            </div>
            <span className="cp-board-wpm"><strong>{Math.round(p.wpm || 0)}</strong> wpm</span>
            <span className="cp-board-pct">{timed ? `${Math.round(p.acc ?? 100)}%` : `${Math.round(pct)}%`}</span>
          </motion.li>
        );
      })}
    </ol>
  );
}
