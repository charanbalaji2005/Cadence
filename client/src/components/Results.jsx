import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Repeat, ChartLine, Trophy } from 'lucide-react';
import { LineChart } from './Chart.jsx';
import { fmtTime, reduceMotion, testTypeParts } from '../lib/format.js';
import { useNotifications } from '../context/NotificationContext.jsx';

function CountUp({ to, suffix = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current; if (!node) return undefined;
    if (reduceMotion()) { node.textContent = Math.round(to) + suffix; return undefined; }
    const t0 = performance.now(); let raf;
    const step = now => { const p = Math.min(1, (now - t0) / 650), e = 1 - Math.pow(1 - p, 3); node.textContent = Math.round(to * e) + suffix; if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, suffix]);
  return <span className="num" ref={ref}>0{suffix}</span>;
}

export default function Results({ r, save, onNext, onRepeat, signedIn }) {
  const { addNotification } = useNotifications();
  const nextRef = useRef(null);
  const shownAt = useRef(0);
  const notifiedPbRef = useRef(false);

  useEffect(() => {
    if (save?.pb && !notifiedPbRef.current) {
      notifiedPbRef.current = true;
      addNotification({
        category: 'Personal Best',
        title: `New PB: ${Math.round(r.wpm)} WPM!`,
        content: `Accuracy: ${r.acc.toFixed(1)}% (${testTypeParts(r)})`,
        type: 'success'
      });
    }
  }, [save?.pb, r, addNotification]);

  // Keys still in flight when the test ends must not trigger Next, so focus it after a short pause.
  useEffect(() => {
    shownAt.current = performance.now();
    const t = setTimeout(() => nextRef.current?.focus({ preventScroll: true }), 700);
    return () => clearTimeout(t);
  }, [r]);
  const guard = fn => e => { if (e.detail === 0 && performance.now() - shownAt.current < 700) return; fn(); };
  const parts = testTypeParts(r);
  const missed = Object.entries(r.keyStats || {}).filter(([, v]) => v.e > 0).sort((a, b) => b[1].e - a[1].e).slice(0, 3).map(([k]) => k);
  const secs = r.seconds;
  const lb = save?.leaderboard;

  let note;
  if (!save) note = signedIn ? 'Saving...' : null;
  else if (save.error) note = save.error;
  else if (save.offline) note = 'You seem to be offline. This result will be saved when the connection is back.';
  else if (!signedIn) note = <><Link to="/login">Log in</Link> to save results and join the leaderboard.</>;
  else if (lb?.eligible) note = lb.newBest ? `Saved. New leaderboard best: you're #${lb.rank}.` : `Saved. Your best on this board ranks #${lb.rank}.`;
  else if (lb?.reason) note = `Saved to your history. ${lb.reason}`;
  else note = 'Saved to your history.';

  return (
    <section className="results glass" aria-live="polite">
      <div className="res-top">
        <div className="res-main">
          <div className="big" title={`${r.wpm.toFixed(2)} wpm`}><span className="lbl">wpm</span><CountUp to={r.wpm} /></div>
          <div className="big" title={`${r.acc.toFixed(2)}%`}><span className="lbl">acc</span><CountUp to={r.acc} suffix="%" /></div>
          {save?.pb && (
            <p className="pb"><Trophy size="1em" />{save.pb.previous != null ? `New personal best, up ${Math.round(r.wpm - save.pb.previous)} from ${Math.round(save.pb.previous)}` : `First personal best for ${save.pb.key}`}</p>
          )}
        </div>
        <div>
          <LineChart deps={[r]} options={{
            n: secs.length, empty: 'Type for at least two seconds to see a speed graph.', label: 'Speed during the test',
            series: [{ values: secs.map(s => s.wpm), cls: 'g-main', area: true }, { values: secs.map(s => s.raw), cls: 'g-second' }],
            marks: secs.map((s, i) => (s.err > 0 ? { i, v: s.raw } : null)).filter(Boolean),
            xLabel: i => i + 1,
            tip: i => `second ${i + 1}<br><b>${Math.round(secs[i].wpm)}</b> wpm, ${Math.round(secs[i].raw)} raw<br>${secs[i].err} error${secs[i].err === 1 ? '' : 's'}`
          }} />
          <div className="legend"><span className="lg">wpm</span><span className="lg second">raw</span><span className="lg err">errors</span></div>
        </div>
      </div>
      <dl className="res-row">
        <div><dt>test type</dt><dd>{parts[0]}{parts.slice(1).map(p => <small key={p}>{p}</small>)}</dd></div>
        <div><dt>raw</dt><dd>{Math.round(r.raw)}</dd></div>
        <div><dt title="correct / incorrect / extra / missed">characters</dt><dd>{`${r.chars.correct}/${r.chars.incorrect}/${r.chars.extra}/${r.chars.missed}`}</dd></div>
        <div><dt>consistency</dt><dd>{Math.round(r.consistency)}%</dd></div>
        <div><dt>time</dt><dd>{fmtTime(r.elapsed)}</dd></div>
        <div><dt>missed most</dt><dd>{missed.length ? missed.join(' ') : 'none'}</dd></div>
      </dl>
      <div className="res-actions">
        <button className="btn primary" ref={nextRef} onClick={guard(onNext)}><ChevronRight size="1em" />Next test</button>
        <button className="btn ghost" onClick={guard(onRepeat)}><Repeat size="1em" />Repeat</button>
        <Link className="btn ghost" to="/stats"><ChartLine size="1em" />Stats</Link>
        {note && <p className="save-note">{note}</p>}
      </div>
    </section>
  );
}
