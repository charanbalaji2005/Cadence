import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { RealtimeClient } from '../lib/realtime.js';
import { ACTIVE_STATUS, settingsSummary } from '../lib/compete.js';
import { getData, recordSavedResult } from '../lib/store.js';
import { ACHIEVEMENTS, unlockedIds } from '../lib/achievements.js';
import { useAuth } from './AuthContext.jsx';
import { useUI } from './UIContext.jsx';
import { useNotifications } from './NotificationContext.jsx';
import CreateRoomModal from '../components/compete/CreateRoomModal.jsx';
import JoinRoomModal from '../components/compete/JoinRoomModal.jsx';
import InviteToasts from '../components/compete/InviteToasts.jsx';

const Ctx = createContext(null);
const REQUEST_TIMEOUT_MS = 15000;

/**
 * Live race numbers kept outside React state: progress arrives several times a second,
 * and only the race board subscribes to it. Updates are batched to one per frame.
 */
function createLiveStore() {
  let state = {};
  let frame = 0;
  const subs = new Set();
  const emit = () => { frame = 0; subs.forEach(fn => fn()); };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(emit); };
  return {
    get: () => state,
    subscribe: fn => { subs.add(fn); return () => subs.delete(fn); },
    merge(players) {
      const next = { ...state };
      for (const p of players) next[p.id] = { ...next[p.id], ...p };
      state = next;
      schedule();
    },
    reset(players = []) {
      state = Object.fromEntries(players.map(p => [p.id, { id: p.id, progress: p.progress, wpm: p.wpm, acc: p.acc, chars: p.chars, finished: p.finished, left: p.left }]));
      schedule();
    }
  };
}

export function CompeteProvider({ children }) {
  const auth = useAuth();
  const ui = useUI();
  const notif = useNotifications();
  const nav = useNavigate();
  const [status, setStatus] = useState('idle');
  const [room, setRoom] = useState(null);
  const [invites, setInvites] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [friendRequests, setFriendRequests] = useState(0);
  const [friendsVersion, setFriendsVersion] = useState(0);
  const [notice, setNotice] = useState(null);
  const [savedCode, setSavedCode] = useState(null);
  const [announcement, setAnnouncement] = useState('');
  const [modal, setModal] = useState(null);
  const live = useMemo(createLiveStore, []);

  const client = useRef(null);
  const roomRef = useRef(null);
  const pending = useRef(new Map()); // message type -> { resolve, reject, timer, match(room) }
  const bootId = useRef(null);
  const myResult = useRef(null);     // the full result of this browser's last race, for stats
  const recorded = useRef(new Set());
  const latest = useRef({});
  latest.current = { ui, notif, nav, user: auth.user };

  const myId = auth.user?.id || null;

  const applyRoom = useCallback(next => {
    roomRef.current = next;
    setRoom(next);
    if (next) live.reset(next.players);
  }, [live]);

  const settle = useCallback((type, ok, value) => {
    const p = pending.current.get(type);
    if (!p) return false;
    clearTimeout(p.timer);
    pending.current.delete(type);
    if (ok) p.resolve(value); else p.reject(value);
    return true;
  }, []);

  /** Adds this player's race to local stats right away (the server saved it already) and shows any new achievements. */
  const recordRace = useCallback((code, standings) => {
    const { user, ui: u } = latest.current;
    const mine = standings.find(s => s.userId === user?.id);
    const mr = myResult.current;
    if (!mine || !mr || mr.code !== code || recorded.current.has(code)) return;
    recorded.current.add(code);
    if (mine.status !== 'valid') return;
    const before = unlockedIds(getData().results);
    recordSavedResult({ ...mr.result, race: { code, rank: mine.rank, players: standings.length } });
    const after = unlockedIds(getData().results);
    ACHIEVEMENTS.filter(a => after.includes(a.id) && !before.includes(a.id)).forEach((a, i) => setTimeout(() => u.achievement(a), 1400 + i * 2600));
  }, []);

  const handle = useRef(null);
  handle.current = msg => {
    const { ui: u, notif: n, nav: go, user } = latest.current;
    const name = id => roomRef.current?.players.find(p => p.id === id)?.username || 'A player';
    switch (msg.type) {
      case 'hello': {
        const prevBoot = bootId.current;
        bootId.current = msg.bootId;
        setFriendRequests(msg.friendRequests || 0);
        setInvites(msg.invites || []);
        const had = roomRef.current;
        if (prevBoot && prevBoot !== msg.bootId && had && ACTIVE_STATUS.has(had.status) && !msg.room) {
          setNotice({ code: had.code, kind: 'restart', message: 'This competition ended because the server restarted.' });
        }
        applyRoom(msg.room);
        break;
      }
      case 'room_state': {
        applyRoom(msg.room);
        for (const [type, p] of pending.current) if (p.match?.(msg.room)) settle(type, true, msg.room);
        break;
      }
      case 'room_left': applyRoom(null); break;
      case 'start_countdown': {
        const next = roomRef.current && { ...roomRef.current, status: 'COUNTDOWN', startAt: msg.startAt, endsAt: msg.endsAt, seed: msg.seed };
        if (next) applyRoom(next);
        setAnnouncement('The race starts in 3 seconds.');
        break;
      }
      case 'race_started': if (roomRef.current) { roomRef.current = { ...roomRef.current, status: 'RUNNING' }; setRoom(roomRef.current); } break;
      case 'progress': live.merge(msg.players.filter(p => p.id !== user?.id)); break;
      case 'player_joined': setAnnouncement(`${msg.player.username} joined the room.`); break;
      case 'player_left': setAnnouncement(`${name(msg.userId)} left the room.`); break;
      case 'player_ready': if (msg.ready) setAnnouncement(`${name(msg.userId)} is ready.`); break;
      case 'player_finished':
        live.merge([{ id: msg.userId, finished: true, wpm: msg.wpm, acc: msg.acc }]);
        if (msg.userId !== user?.id) setAnnouncement(`${name(msg.userId)} finished at ${msg.wpm} words per minute.`);
        break;
      case 'race_finished': {
        if (roomRef.current?.code === msg.code) { roomRef.current = { ...roomRef.current, status: 'FINISHED', standings: msg.standings }; setRoom(roomRef.current); }
        const winner = msg.standings[0];
        setAnnouncement(winner ? `Competition complete. ${winner.username} wins with ${Math.round(winner.wpm)} words per minute.` : 'Competition complete.');
        recordRace(msg.code, msg.standings);
        break;
      }
      case 'results_saved': setSavedCode(msg.code); break;
      case 'room_cancelled':
      case 'room_expired': {
        const message = msg.type === 'room_cancelled' ? (msg.reason === 'admin' ? 'An administrator closed this room.' : 'The host cancelled this room.')
          : msg.reason === 'restart' ? 'This competition ended because the server restarted.'
            : 'This room expired after 30 minutes without activity.';
        setNotice({ code: msg.code, kind: msg.type === 'room_cancelled' ? 'cancelled' : msg.reason, message });
        if (roomRef.current?.code === msg.code) applyRoom(null);
        break;
      }
      case 'invites': setInvites(msg.invites); break;
      case 'invite': {
        const inv = msg.invite;
        setToasts(t => [...t.filter(x => x.invite.code !== inv.code), { id: `${inv.code}-${Date.now()}`, invite: inv }].slice(-3));
        n.addNotification({ category: 'Compete', title: `${inv.from?.username || 'A friend'} invited you to a typing competition.`, content: settingsSummary(inv.settings), type: 'info' });
        break;
      }
      case 'invite_sent': u.toast('Invite sent'); break;
      case 'invite_declined': u.toast(`${msg.username} declined your invite.`); break;
      case 'rematch': {
        // Players still looking at the results follow the host; anyone elsewhere gets an invite instead.
        if (window.location.pathname.startsWith('/compete/')) {
          client.current?.send('join_room', { code: msg.code });
          pending.current.set('join_room', { resolve: r => go(`/compete/${r.code}`, { replace: true }), reject: () => {}, timer: setTimeout(() => settle('join_room', false, {}), REQUEST_TIMEOUT_MS), match: r => r?.code === msg.code });
        } else u.toast(`${msg.from} started a rematch. Join from the Compete page.`);
        break;
      }
      case 'friend_request':
        setFriendsVersion(v => v + 1);
        u.toast(`${msg.user.username} sent you a friend request`);
        n.addNotification({ category: 'Friends', title: `${msg.user.username} sent you a friend request.`, type: 'info' });
        break;
      case 'friend_accepted':
        setFriendsVersion(v => v + 1);
        u.toast(`${msg.user.username} accepted your friend request`);
        n.addNotification({ category: 'Friends', title: `${msg.user.username} is now your friend.`, type: 'success' });
        break;
      case 'friends_changed': setFriendRequests(msg.friendRequests || 0); setFriendsVersion(v => v + 1); break;
      case 'broadcast_message':
        if (msg.message) {
          u.toast(`📢 New ${msg.message.type}: ${msg.message.title}`);
          window.dispatchEvent(new CustomEvent('cadence:refresh-notifications'));
          if (n?.refreshNotifications) n.refreshNotifications();
        }
        break;
      case 'error': if (!settle(msg.ref, false, msg)) u.toast(msg.message); break;
      case 'unauthorized': applyRoom(null); break;
      default: break;
    }
  };

  // One socket while signed in; none for guests.
  useEffect(() => {
    if (!myId) { applyRoom(null); setInvites([]); setToasts([]); setNotice(null); setFriendRequests(0); setStatus('idle'); return undefined; }
    const c = new RealtimeClient({ onMessage: m => handle.current(m), onStatus: setStatus });
    client.current = c;
    c.start();
    const waiting = pending.current;
    return () => {
      c.stop();
      client.current = null;
      waiting.forEach(p => clearTimeout(p.timer));
      waiting.clear();
    };
  }, [myId, applyRoom]);

  const request = useCallback((type, data, match) => new Promise((resolve, reject) => {
    settle(type, false, { code: 'SUPERSEDED', message: '' });
    const timer = setTimeout(() => settle(type, false, { code: 'TIMEOUT', message: "The server didn't answer. Check your connection and try again." }), REQUEST_TIMEOUT_MS);
    pending.current.set(type, { resolve, reject, timer, match });
    client.current?.send(type, data);
  }), [settle]);

  const send = useCallback((type, data) => client.current?.send(type, data), []);

  const actions = useMemo(() => ({
    createRoom: (settings, invite = []) => request('create_room', { settings, invite }, r => r && r.status === 'WAITING' && r.hostId === myId && r.players.length === 1),
    joinRoom: code => request('join_room', { code }, r => r?.code === code),
    rematch: () => { const old = roomRef.current?.code; return request('rematch', {}, r => r && r.code !== old && r.status === 'WAITING'); },
    leaveRoom: () => { send('leave_room'); applyRoom(null); },
    setReady: ready => send('ready', { ready }),
    updateSettings: settings => send('update_settings', { settings }),
    startRoom: () => send('start_room'),
    cancelRoom: () => send('cancel_room'),
    invite: userId => send('invite', { userId }),
    /** "Compete" on a friend: invite them into your waiting room, or open a new room with them invited. */
    challenge: friend => {
      const r = roomRef.current, { nav: go, ui: u } = latest.current;
      if (r?.status === 'WAITING') { send('invite', { userId: friend.id }); go(`/compete/${r.code}`); }
      else if (r && ACTIVE_STATUS.has(r.status)) u.toast('Finish your current race first.');
      else setModal({ kind: 'create', invite: [friend] });
    },
    declineInvite: code => {
      send('decline_invite', { code });
      setInvites(list => list.filter(i => i.code !== code));
      setToasts(t => t.filter(x => x.invite.code !== code));
    },
    sendProgress: p => send('progress', p),
    finish: result => {
      const code = roomRef.current?.code;
      myResult.current = { code, result };
      const { wpm, raw, acc, consistency, elapsed, chars, keyStats } = result;
      send('finish', { wpm, raw, acc, consistency, elapsed, chars, keyStats: keyStats || {} });
    },
    serverNow: () => client.current?.serverNow() ?? Date.now(),
    reconnect: () => client.current?.reconnectNow(),
    clearNotice: () => setNotice(null),
    openCreateRoom: (opts = {}) => setModal({ kind: 'create', invite: opts.invite || [] }),
    openJoinRoom: (opts = {}) => setModal({ kind: 'join', code: opts.code || '' }),
    closeModal: () => setModal(null)
  }), [request, send, applyRoom, myId]);

  const joinFromInvite = useCallback(async inv => {
    setToasts(t => t.filter(x => x.invite.code !== inv.code));
    try { const r = await actions.joinRoom(inv.code); nav(`/compete/${r.code}`); }
    catch (err) { if (err?.message) ui.toast(err.message); }
  }, [actions, nav, ui]);

  const dismissToast = useCallback(id => setToasts(t => t.filter(x => x.id !== id)), []);
  const declineFromToast = useCallback(inv => actions.declineInvite(inv.code), [actions]);

  const value = useMemo(() => ({
    status, room, invites, friendRequests, friendsVersion, notice, savedCode, live, myId, ...actions, joinFromInvite
  }), [status, room, invites, friendRequests, friendsVersion, notice, savedCode, live, myId, actions, joinFromInvite]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <CreateRoomModal open={modal?.kind === 'create'} invite={modal?.invite || []} onClose={actions.closeModal}
        onCreated={r => { actions.closeModal(); nav(`/compete/${r.code}`); }} />
      <JoinRoomModal open={modal?.kind === 'join'} initialCode={modal?.code || ''} onClose={actions.closeModal}
        onJoined={r => { actions.closeModal(); nav(`/compete/${r.code}`); }} />
      <InviteToasts toasts={toasts} onJoin={joinFromInvite} onDecline={declineFromToast} onDismiss={dismissToast} />
      <div className="sr" aria-live="polite" role="status">{announcement}</div>
    </Ctx.Provider>
  );
}

export const useCompete = () => useContext(Ctx);

/** Subscribes a component to live race numbers without re-rendering anything else. */
export function useLiveProgress() {
  const { live } = useCompete();
  return useSyncExternalStore(live.subscribe, live.get);
}
