import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { LogIn, Swords, ArrowLeft, Info } from 'lucide-react';
import RoomLobby from '../components/compete/RoomLobby.jsx';
import RaceView from '../components/compete/RaceView.jsx';
import RaceResults from '../components/compete/RaceResults.jsx';
import ConnectionPill from '../components/compete/ConnectionPill.jsx';
import { cleanCode, isRoomCode } from '../lib/compete.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useCompete } from '../context/CompeteContext.jsx';

/** /compete/:code and /compete/join/:code. Joins the room if needed, then shows lobby, race or results. */
export default function RoomPage() {
  const params = useParams();
  const loc = useLocation();
  const nav = useNavigate();
  const auth = useAuth();
  const compete = useCompete();
  const code = cleanCode(params.code || '');
  const viaLink = loc.pathname.startsWith('/compete/join/');
  const room = compete.room?.code === code ? compete.room : null;
  const notice = compete.notice?.code === code ? compete.notice : null;
  const [join, setJoin] = useState({ state: 'idle', error: null });
  const tried = useRef(null);

  useEffect(() => {
    if (!auth.user || compete.status !== 'connected' || notice) return;
    if (room) { if (viaLink) nav(`/compete/${code}`, { replace: true }); return; }
    if (tried.current === code) return;
    tried.current = code;
    if (!isRoomCode(code)) { setJoin({ state: 'error', error: 'Enter a valid room code.' }); return; }
    setJoin({ state: 'joining', error: null });
    compete.joinRoom(code)
      .then(() => setJoin({ state: 'idle', error: null }))
      .catch(err => { if (err?.code !== 'SUPERSEDED') setJoin({ state: 'error', error: err?.message || 'Could not join this room.' }); });
  }, [auth.user, compete.status, room, notice, code, viaLink]); // eslint-disable-line react-hooks/exhaustive-deps

  if (auth.ready && !auth.user) {
    return (
      <Shell>
        <h1>Join room {code}</h1>
        <p className="lede">Competitions need a Cadence account, so results and rankings belong to someone.</p>
        <div className="cp-shell-actions"><Link className="btn primary" to="/login"><LogIn size="1em" />Log in</Link><Link className="btn outline" to="/register">Create an account</Link></div>
      </Shell>
    );
  }

  if (room) {
    if (room.status === 'WAITING') return <div className="page wide cp-page"><RoomLobby room={room} /></div>;
    if (room.status === 'FINISHED') return <div className="page wide cp-page"><RaceResults key={room.code} room={room} /></div>;
    return <div className="page wide cp-page cp-page-race"><RaceView key={room.code} room={room} /></div>;
  }

  const retry = () => { tried.current = null; setJoin({ state: 'idle', error: null }); compete.clearNotice(); };
  const back = (
    <div className="cp-shell-actions">
      <Link className="btn outline" to="/compete"><ArrowLeft size="1em" />Back to Compete</Link>
      <button type="button" className="btn primary" onClick={() => compete.openCreateRoom()}><Swords size="1em" />Create a room</button>
    </div>
  );

  if (notice) {
    return <Shell><h1><Info size="1em" /> Room {code}</h1><p className="lede" role="status">{notice.message}</p>{back}</Shell>;
  }
  if (join.state === 'error') {
    return (
      <Shell>
        <h1>Room {code || '?'}</h1>
        <p className="lede" role="alert">{join.error}</p>
        <div className="cp-shell-actions">
          <button type="button" className="btn outline" onClick={() => compete.openJoinRoom()}>Enter another code</button>
          <button type="button" className="btn ghost" onClick={retry}>Try again</button>
          <Link className="btn ghost" to="/compete"><ArrowLeft size="1em" />Back</Link>
        </div>
      </Shell>
    );
  }
  if (tried.current === code && join.state === 'idle') {
    // We were in this room but aren't any more (removed after a long disconnect, or left in another tab).
    return <Shell><h1>Room {code}</h1><p className="lede">You're not in this room any more.</p><div className="cp-shell-actions"><button type="button" className="btn primary" onClick={retry}>Rejoin</button><Link className="btn ghost" to="/compete">Back to Compete</Link></div></Shell>;
  }
  return (
    <Shell>
      <div className="spinner" role="status" aria-label="Joining room" />
      <p className="lede cp-center">{compete.status === 'connected' ? `Joining room ${code}...` : 'Connecting to Cadence...'}</p>
      <div className="cp-center"><ConnectionPill /></div>
    </Shell>
  );
}

function Shell({ children }) {
  return <div className="page cp-page"><div className="panel glass cp-shell">{children}</div></div>;
}
