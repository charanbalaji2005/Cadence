import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Flag, LogOut, Loader2 } from 'lucide-react';
import RaceTyping from './RaceTyping.jsx';
import ProgressBoard from './ProgressBoard.jsx';
import Countdown from './Countdown.jsx';
import RaceClock from './RaceClock.jsx';
import ConnectionPill from './ConnectionPill.jsx';
import { useCompete } from '../../context/CompeteContext.jsx';
import { useUI } from '../../context/UIContext.jsx';
import { raceCfg } from '../../lib/compete.js';

const PROGRESS_MS = 300;
const r1 = n => Math.round(n * 10) / 10;

/** Countdown and race. All timing comes from the server's startAt and endsAt. */
export default function RaceView({ room }) {
  const compete = useCompete();
  const ui = useUI();
  const nav = useNavigate();
  const typing = useRef(null);
  const me = room.players.find(p => p.id === compete.myId);
  const [phase, setPhase] = useState(me?.finished ? 'done' : 'countdown');
  const [mine, setMine] = useState(null);
  const cfg = useMemo(() => raceCfg(room), [room.code, room.seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const { serverNow, sendProgress, live, myId, finish } = compete;

  // GO on the shared clock. A tab that's late (reconnect, throttled timer) starts with the time already used.
  useEffect(() => {
    if (phase !== 'countdown') return undefined;
    const go = () => { typing.current?.startRace(Math.max(0, serverNow() - room.startAt)); setPhase('racing'); };
    const wait = room.startAt - serverNow();
    if (wait <= 0) { go(); return undefined; }
    const t = setTimeout(go, wait);
    return () => clearTimeout(t);
  }, [room.startAt, phase, serverNow]);

  // The race has a hard end. Timed races end themselves in the engine; this is the backstop and the cap for text races.
  useEffect(() => {
    if (phase !== 'racing') return undefined;
    const t = setTimeout(() => typing.current?.finish(), Math.max(0, room.endsAt - serverNow() + (cfg.mode === 'time' ? 400 : 0)));
    return () => clearTimeout(t);
  }, [phase, room.endsAt, cfg.mode, serverNow]);

  // A few small progress messages a second, and only when something changed. Never per keystroke.
  useEffect(() => {
    if (phase !== 'racing') return undefined;
    let last = null;
    const id = setInterval(() => {
      const s = typing.current?.liveStats();
      if (!s) return;
      const p = { progress: r1(s.progress), wpm: Math.round(Math.min(400, s.wpm)), acc: r1(s.acc), chars: s.chars };
      live.merge([{ id: myId, ...p }]);
      if (!last || p.progress !== last.progress || p.wpm !== last.wpm || p.chars !== last.chars) { sendProgress(p); last = p; }
    }, PROGRESS_MS);
    return () => clearInterval(id);
  }, [phase, live, myId, sendProgress]);

  const onFinish = useCallback(res => {
    const s = typing.current?.liveStats();
    if (s) {
      const p = { progress: r1(s.progress), wpm: Math.round(Math.min(400, res.wpm)), acc: r1(res.acc), chars: s.chars };
      live.merge([{ id: myId, ...p, finished: true }]);
      sendProgress(p);
    }
    setMine(res);
    setPhase('done');
    finish(res);
  }, [live, myId, sendProgress, finish]);

  const leave = () => ui.openPrompt({
    title: 'Leave the race?', desc: "You'll be listed as did not finish. The race carries on for everyone else.", kind: null, okLabel: 'Leave race', danger: true,
    onOk: () => { compete.leaveRoom(); nav('/compete'); }
  });

  return (
    <section className="cp-race" aria-label={`Race in room ${room.code}`}>
      <header className="cp-race-top">
        <span className="cadence-kicker">cadence compete</span>
        <span className="cp-code-sm" aria-label={`Room ${room.code}`}>{room.code}</span>
        <span className="spacer" />
        <RaceClock startAt={room.startAt} endsAt={room.endsAt} serverNow={serverNow} timed={cfg.mode === 'time'} />
        <ConnectionPill />
      </header>
      <ProgressBoard room={room} myId={myId} />
      <div className={`cp-race-stage${phase === 'countdown' ? ' is-counting' : ''}`}>
        {phase !== 'done' && !me?.left
          ? <RaceTyping ref={typing} cfg={cfg} onFinish={onFinish} />
          : <FinishedCard mine={mine} />}
        <Countdown startAt={room.startAt} serverNow={serverNow} />
      </div>
      <div className="cp-race-foot">
        <button type="button" className="btn ghost sm" onClick={leave}><LogOut size="1em" />Leave race</button>
      </div>
    </section>
  );
}

function FinishedCard({ mine }) {
  return (
    <motion.div className="cp-finished glass" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} role="status">
      <Flag size="1.4em" className="cp-finished-icon" aria-hidden="true" />
      {mine ? (
        <>
          <h2>You finished</h2>
          <dl className="cp-finished-stats">
            <div><dt>wpm</dt><dd>{Math.round(mine.wpm)}</dd></div>
            <div><dt>accuracy</dt><dd>{Math.round(mine.acc)}%</dd></div>
            <div><dt>raw</dt><dd>{Math.round(mine.raw)}</dd></div>
          </dl>
        </>
      ) : <h2>Race in progress</h2>}
      <p className="muted"><Loader2 size="1em" className="cp-spin" aria-hidden="true" /> Waiting for the others to finish...</p>
    </motion.div>
  );
}
