import { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Swords, X } from 'lucide-react';
import Avatar from '../Avatar.jsx';
import { settingsSummary } from '../../lib/compete.js';

const LIFETIME_MS = 30000;

function InviteToast({ t, onJoin, onDecline, onDismiss }) {
  const reduce = useReducedMotion();
  useEffect(() => { const timer = setTimeout(() => onDismiss(t.id), LIFETIME_MS); return () => clearTimeout(timer); }, [t.id, onDismiss]);
  const inv = t.invite;
  return (
    <motion.div layout className="cp-toast glass" role="alertdialog" aria-labelledby={`${t.id}-msg`}
      initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24, scale: 0.98 }} animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: 24, transition: { duration: 0.15 } }}>
      <button type="button" className="icon-btn cp-toast-x" aria-label="Dismiss invite" onClick={() => onDismiss(t.id)}><X size="1em" /></button>
      <div className="cp-toast-head">
        <Avatar name={inv.from?.username} url={inv.from?.avatar} />
        <p id={`${t.id}-msg`}><strong>{inv.from?.username || 'A friend'}</strong> invited you to a typing competition.</p>
      </div>
      <p className="cp-toast-meta"><Swords size="1em" aria-hidden="true" />{settingsSummary(inv.settings)} · {inv.players} / {inv.maxPlayers} players</p>
      <div className="cp-toast-actions">
        <button type="button" className="btn ghost sm" onClick={() => onDecline(inv)}>Decline</button>
        <button type="button" className="btn primary sm" onClick={() => onJoin(inv)}>Join</button>
      </div>
    </motion.div>
  );
}

/** Live invitations, stacked in a corner. They also stay listed on the Compete page. */
export default function InviteToasts({ toasts, onJoin, onDecline, onDismiss }) {
  return (
    <div className="cp-toasts">
      <AnimatePresence initial={false}>
        {toasts.map(t => <InviteToast key={t.id} t={t} onJoin={onJoin} onDecline={onDecline} onDismiss={onDismiss} />)}
      </AnimatePresence>
    </div>
  );
}
