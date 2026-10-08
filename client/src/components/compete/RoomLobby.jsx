import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Copy, Check, Link2, Share2, Crown, Play, LogOut, X, WifiOff, CircleCheck, Circle, Settings2 } from 'lucide-react';
import Avatar from '../Avatar.jsx';
import RoomSettingsForm from './RoomSettingsForm.jsx';
import InviteFriends from './InviteFriends.jsx';
import ConnectionPill from './ConnectionPill.jsx';
import { useCompete } from '../../context/CompeteContext.jsx';
import { useUI } from '../../context/UIContext.jsx';
import { MAX_PLAYERS, inviteLink, settingsSummary, modeLabel, saveRoomSettings } from '../../lib/compete.js';

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    // Older browsers and non-secure origins: fall back to a hidden textarea.
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function PlayerSlot({ p, me, reduce }) {
  return (
    <motion.li layout={!reduce} className={`cp-slot${me ? ' is-me' : ''}${p.connected ? '' : ' is-offline'}`}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, transition: { duration: 0.15 } }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
      <span className="cp-av-wrap"><Avatar name={p.username} url={p.avatar} /><span className={`cp-presence${p.connected ? ' on' : ''}`} aria-hidden="true" /></span>
      <span className="cp-slot-main">
        <span className="cp-slot-name">{p.username}{me && <em>you</em>}</span>
        <span className="cp-slot-state">
          {!p.connected ? <><WifiOff size="1em" aria-hidden="true" />Disconnected</>
            : p.ready ? <span className="ok"><CircleCheck size="1em" aria-hidden="true" />Ready</span>
              : <><Circle size="1em" aria-hidden="true" />Not ready</>}
        </span>
      </span>
      {p.host && <span className="cp-host"><Crown size="1em" aria-hidden="true" />Host</span>}
    </motion.li>
  );
}

export default function RoomLobby({ room }) {
  const compete = useCompete();
  const ui = useUI();
  const nav = useNavigate();
  const reduce = useReducedMotion();
  const [copied, setCopied] = useState(null);
  const [draft, setDraft] = useState(room.settings);
  const debounce = useRef(null);
  const me = room.players.find(p => p.id === compete.myId);
  const isHost = room.hostId === compete.myId;
  const players = room.players.filter(p => !p.left);
  const empty = Math.max(0, MAX_PLAYERS - players.length);
  const readyCount = players.filter(p => p.ready || p.host).length;
  const settingsKey = JSON.stringify(room.settings);

  // The server's settings are the truth; the host's draft only runs ahead while they type custom text.
  useEffect(() => { setDraft(room.settings); }, [settingsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(debounce.current), []);

  const changeSettings = next => {
    setDraft(next);
    clearTimeout(debounce.current);
    const push = () => { if (next.mode !== 'custom' || next.customText.trim()) { compete.updateSettings(next); saveRoomSettings(next); } };
    if (next.mode === 'custom') debounce.current = setTimeout(push, 600); else push();
  };

  const copy = async (what, text, label) => {
    if (await copyText(text)) { setCopied(what); ui.toast(`${label} copied`); setTimeout(() => setCopied(c => (c === what ? null : c)), 1800); }
    else ui.toast("Couldn't copy. Select it and copy it yourself.");
  };
  const share = async () => {
    try { await navigator.share({ title: 'Race me on Cadence', text: `Join my typing race on Cadence. Room code ${room.code}`, url: inviteLink(room.code) }); }
    catch { /* the user closed the share sheet */ }
  };
  const leave = () => { compete.leaveRoom(); nav('/compete'); };
  const cancel = () => ui.openPrompt({
    title: 'Cancel this room?', desc: 'Everyone in the room will be sent back. The code stops working.', kind: null, okLabel: 'Cancel room', danger: true,
    onOk: () => { compete.cancelRoom(); nav('/compete'); }
  });

  return (
    <section className="cp-lobby" aria-labelledby="cp-lobby-title">
      <div className="cp-lobby-head">
        <div>
          <span className="cadence-kicker">cadence compete</span>
          <h1 id="cp-lobby-title">Room <span className="cp-code-inline">{room.code}</span></h1>
          <p className="lede">{players.length} of {MAX_PLAYERS} players · {settingsSummary(room.settings)}</p>
          <p className="sr" aria-live="polite">Room {room.code}, {players.length} of {MAX_PLAYERS} players.</p>
        </div>
        <ConnectionPill />
      </div>

      <div className="cp-lobby-grid">
        <div className="cp-lobby-main">
          <div className="panel glass cp-codecard">
            <span className="cp-codecard-label">Room code</span>
            <span className="cp-codecard-code" aria-label={`Room code ${room.code.split('').join(' ')}`}>{room.code}</span>
            <div className="cp-codecard-actions">
              <motion.button type="button" className="btn outline sm" whileTap={{ scale: 0.96 }} onClick={() => copy('code', room.code, 'Room code')}>
                {copied === 'code' ? <Check size="1em" /> : <Copy size="1em" />}{copied === 'code' ? 'Copied' : 'Copy code'}
              </motion.button>
              <motion.button type="button" className="btn outline sm" whileTap={{ scale: 0.96 }} onClick={() => copy('link', inviteLink(room.code), 'Invite link')}>
                {copied === 'link' ? <Check size="1em" /> : <Link2 size="1em" />}{copied === 'link' ? 'Copied' : 'Copy invite link'}
              </motion.button>
              {typeof navigator.share === 'function' && (
                <motion.button type="button" className="btn outline sm" whileTap={{ scale: 0.96 }} onClick={share}><Share2 size="1em" />Share</motion.button>
              )}
            </div>
          </div>

          <div className="panel glass">
            <h2>Players<span className="aside">{players.length} / {MAX_PLAYERS}</span></h2>
            <ul className="cp-slots">
              <AnimatePresence initial={false}>
                {players.map(p => <PlayerSlot key={p.id} p={p} me={p.id === compete.myId} reduce={reduce} />)}
                {Array.from({ length: empty }, (_, i) => (
                  <motion.li key={`empty-${i}`} layout={!reduce} className="cp-slot is-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <span className="cp-empty-dot" aria-hidden="true" />Waiting for player...
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
        </div>

        <div className="cp-lobby-side">
          <div className="panel glass">
            <h2><Settings2 size="1em" />Race settings{!isHost && <span className="aside">set by the host</span>}</h2>
            {isHost ? <RoomSettingsForm value={draft} onChange={changeSettings} idPrefix="lobby" /> : (
              <dl className="cp-summary">
                <div><dt>Mode</dt><dd>{modeLabel(room.settings.mode)}</dd></div>
                {room.settings.mode === 'time' && <div><dt>Duration</dt><dd>{room.settings.time} seconds</dd></div>}
                {room.settings.mode === 'words' && <div><dt>Words</dt><dd>{room.settings.words}</dd></div>}
                {room.settings.mode === 'quote' && <div><dt>Quote length</dt><dd>{room.settings.quoteLen}</dd></div>}
                {(room.settings.punctuation || room.settings.numbers) && <div><dt>Extras</dt><dd>{[room.settings.punctuation && 'punctuation', room.settings.numbers && 'numbers'].filter(Boolean).join(', ')}</dd></div>}
                {room.settings.mode === 'custom' && <div className="wide"><dt>Text</dt><dd className="cp-custom-preview">{room.settings.customText}</dd></div>}
                <div><dt>Players</dt><dd>Up to {MAX_PLAYERS}</dd></div>
              </dl>
            )}
          </div>
          {players.length < MAX_PLAYERS && <InviteFriends room={room} />}
        </div>
      </div>

      <div className="cp-lobby-bar glass">
        {isHost ? (
          <>
            <motion.button type="button" className="btn primary cp-start" whileHover={reduce ? undefined : { y: -1 }} whileTap={{ scale: 0.97 }} onClick={compete.startRoom}>
              <Play size="1em" />Start competition
            </motion.button>
            <span className="muted cp-bar-note">{players.length === 1 ? 'You can start alone, or wait for friends.' : `${readyCount} of ${players.length} ready`}</span>
            <span className="spacer" />
            <button type="button" className="btn ghost danger-text" onClick={cancel}><X size="1em" />Cancel room</button>
          </>
        ) : (
          <>
            <motion.button type="button" className={`btn ${me?.ready ? 'outline' : 'primary'}`} aria-pressed={!!me?.ready} whileTap={{ scale: 0.97 }} onClick={() => compete.setReady(!me?.ready)}>
              {me?.ready ? <><CircleCheck size="1em" />Ready</> : "I'm ready"}
            </motion.button>
            <span className="muted cp-bar-note">Waiting for the host to start...</span>
            <span className="spacer" />
          </>
        )}
        <button type="button" className="btn ghost" onClick={leave}><LogOut size="1em" />Leave room</button>
      </div>
    </section>
  );
}
