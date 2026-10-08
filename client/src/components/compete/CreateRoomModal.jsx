import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Swords, Loader2, UserPlus } from 'lucide-react';
import Modal from './Modal.jsx';
import RoomSettingsForm from './RoomSettingsForm.jsx';
import ConnectionPill from './ConnectionPill.jsx';
import Avatar from '../Avatar.jsx';
import { useCompete } from '../../context/CompeteContext.jsx';
import { savedRoomSettings, saveRoomSettings } from '../../lib/compete.js';

export default function CreateRoomModal({ open, invite = [], onClose, onCreated }) {
  const compete = useCompete();
  const [settings, setSettings] = useState(savedRoomSettings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { if (open) { setSettings(savedRoomSettings()); setError(null); setBusy(false); } }, [open]);

  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    if (settings.mode === 'custom' && !settings.customText.trim()) { setError('Add some text for a custom race.'); return; }
    setBusy(true); setError(null);
    saveRoomSettings(settings);
    try {
      const room = await compete.createRoom(settings, invite.map(f => f.id));
      onCreated(room);
    } catch (err) {
      if (err?.code !== 'SUPERSEDED') setError(err?.message || 'Could not create the room. Try again.');
    } finally { setBusy(false); }
  };

  return (
    <Modal id="create-room" open={open} onClose={onClose} wide title="Create a room"
      description="Pick the race. You'll get a 6-character code to share with up to 3 friends.">
      <form onSubmit={submit} noValidate>
        {invite.length > 0 && (
          <div className="cp-inviting">
            <UserPlus size="1em" aria-hidden="true" />
            <span>Inviting</span>
            {invite.map(f => <span key={f.id} className="cp-chip-user"><Avatar name={f.username} url={f.avatar} size="sm" />{f.username}</span>)}
          </div>
        )}
        <RoomSettingsForm value={settings} onChange={setSettings} idPrefix="create" />
        <AnimatePresence>
          {error && (
            <motion.p className="form-msg" role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{error}</motion.p>
          )}
        </AnimatePresence>
        <div className="dialog-actions cp-actions">
          <ConnectionPill />
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <motion.button type="submit" className="btn primary" disabled={busy} whileTap={{ scale: 0.97 }}>
            {busy ? <Loader2 size="1em" className="cp-spin" /> : <Swords size="1em" />}{busy ? 'Creating...' : 'Create room'}
          </motion.button>
        </div>
      </form>
    </Modal>
  );
}
