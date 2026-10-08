import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LogIn, Loader2 } from 'lucide-react';
import Modal from './Modal.jsx';
import ConnectionPill from './ConnectionPill.jsx';
import { useCompete } from '../../context/CompeteContext.jsx';
import { cleanCode, isRoomCode } from '../../lib/compete.js';

export default function JoinRoomModal({ open, initialCode = '', onClose, onJoined }) {
  const compete = useCompete();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { if (open) { setCode(cleanCode(initialCode)); setError(null); setBusy(false); } }, [open, initialCode]);

  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    if (!isRoomCode(code)) { setError('Enter a valid room code.'); return; }
    setBusy(true); setError(null);
    try { onJoined(await compete.joinRoom(code)); }
    catch (err) { if (err?.code !== 'SUPERSEDED') setError(err?.message || 'Could not join the room. Try again.'); }
    finally { setBusy(false); }
  };

  return (
    <Modal id="join-room" open={open} onClose={onClose} title="Join a room" description="Enter the 6-character code your friend shared.">
      <form onSubmit={submit} noValidate>
        <label htmlFor="join-code" className="sr">Room code</label>
        <input id="join-code" data-autofocus className={`cp-code-input${error ? ' invalid' : ''}`} value={code} placeholder="C8K4P2"
          inputMode="text" autoComplete="off" autoCapitalize="characters" spellCheck="false" maxLength={9}
          aria-invalid={!!error} aria-describedby={error ? 'join-err' : undefined}
          onChange={e => { setCode(cleanCode(e.target.value)); setError(null); }} />
        <AnimatePresence>
          {error && <motion.p id="join-err" className="form-msg" role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{error}</motion.p>}
        </AnimatePresence>
        <div className="dialog-actions cp-actions">
          <ConnectionPill />
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <motion.button type="submit" className="btn primary" disabled={busy || code.length < 6} whileTap={{ scale: 0.97 }}>
            {busy ? <Loader2 size="1em" className="cp-spin" /> : <LogIn size="1em" />}{busy ? 'Joining...' : 'Join room'}
          </motion.button>
        </div>
      </form>
    </Modal>
  );
}
