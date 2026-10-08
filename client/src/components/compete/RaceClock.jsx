import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import { fmtClock } from '../../lib/compete.js';

/** Race time left, from the server's start and end times. Re-renders only itself. */
export default function RaceClock({ startAt, endsAt, serverNow, timed }) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => { const id = setInterval(() => setNow(serverNow()), 250); return () => clearInterval(id); }, [serverNow]);
  const before = now < startAt;
  const left = (endsAt - Math.max(now, startAt)) / 1000;
  const elapsed = Math.max(0, (now - startAt) / 1000);
  return (
    <span className={`cp-clock${!before && left <= 10 ? ' urgent' : ''}`} aria-label={timed ? `${Math.ceil(left)} seconds left` : `${Math.floor(elapsed)} seconds elapsed`}>
      <Timer size="1em" aria-hidden="true" />
      {timed ? fmtClock(left) : <>{fmtClock(elapsed)}<small> / {fmtClock((endsAt - startAt) / 1000)}</small></>}
    </span>
  );
}
