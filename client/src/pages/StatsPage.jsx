import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Keyboard, TrendingUp, Target, ChartColumn, CalendarDays, History, Download, Dumbbell, ChevronLeft, ChevronRight } from 'lucide-react';
import { LineChart, BarChart } from '../components/Chart.jsx';
import { useData } from '../lib/store.js';
import { aggregate, weakKeys } from '../lib/achievements.js';
import { practiceText } from '../lib/words.js';
import { clamp, dayKey, esc, fmtDate, fmtTime, testTypeParts } from '../lib/format.js';
import { mix, resolveTheme } from '../lib/themes.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useUI } from '../context/UIContext.jsx';

const KB_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const modeKey = h => h.mode + (h.mode2 ? ' ' + h.mode2 : '');

function download(name, data, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function StatsPage() {
  const data = useData();
  const auth = useAuth();
  const ui = useUI();
  const nav = useNavigate();
  const { settings, setCfg } = useSettings();
  const [range, setRange] = useState('30');
  const [mode, setMode] = useState('all');
  const [page, setPage] = useState(0);
  const all = data.results;

  const modes = useMemo(() => [...new Set(all.map(modeKey))].sort(), [all]);
  const hist = useMemo(() => {
    const cutoff = range === 'all' ? 0 : Date.now() - Number(range) * 864e5;
    return all.filter(h => h.date >= cutoff && (mode === 'all' || modeKey(h) === mode));
  }, [all, range, mode]);

  const head = (
    <>
      <h1>Stats and history</h1>
      <p className="lede">{auth.user ? `Every test you've finished as ${auth.user.username}.` : <>Your guest results in this browser. <Link to="/login" style={{ color: 'var(--accent)' }}>Log in</Link> to keep them with your account.</>}</p>
    </>
  );
  if (data.loading) return <div className="page wide">{head}<div className="spinner" role="status" aria-label="Loading" /></div>;
  if (data.error && !all.length) return <div className="page wide">{head}<div className="panel glass"><p>{data.error}</p></div></div>;
  if (!all.length) return (
    <div className="page wide">{head}
      <div className="panel glass"><div className="empty"><p>No tests yet. Finish one and your speed, accuracy and weak keys will show up here.</p><Link className="btn primary" to="/"><Keyboard size="1em" />Start typing</Link></div></div>
    </div>
  );

  const agg = aggregate(all);
  const avg = hist.length ? hist.reduce((a, h) => a + h.wpm, 0) / hist.length : 0;
  const accAvg = hist.length ? hist.reduce((a, h) => a + h.acc, 0) / hist.length : 0;
  const best = hist.reduce((m, h) => Math.max(m, h.wpm), 0);
  const todaySec = all.filter(h => dayKey(h.date) === dayKey(Date.now())).reduce((a, h) => a + h.elapsed, 0);
  const goalPct = clamp(todaySec / (settings.dailyGoal * 60) * 100, 0, 100);
  const weak = weakKeys(data.keyStats, 5);
  const pages = Math.max(1, Math.ceil(hist.length / 15));
  const pg = clamp(page, 0, pages - 1);
  const rows = hist.slice().reverse().slice(pg * 15, pg * 15 + 15);

  const ma = hist.map((h, i) => { const s = hist.slice(Math.max(0, i - 9), i + 1); return s.reduce((a, x) => a + x.wpm, 0) / s.length; });
  const lab = i => { const d = new Date(hist[i].date); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const tip = i => { const h = hist[i]; return `${esc(fmtDate(h.date, true))}<br><b>${Math.round(h.wpm)}</b> wpm, ${h.acc.toFixed(1)}%<br>${esc(testTypeParts(h).join(', '))}`; };
  const accs = hist.map(h => h.acc);

  const bins = [];
  if (hist.length) {
    const lo = Math.floor(Math.min(...hist.map(h => h.wpm)) / 10) * 10, hi = Math.floor(Math.max(...hist.map(h => h.wpm)) / 10) * 10;
    for (let b = lo; b <= hi; b += 10) { const v = hist.filter(h => h.wpm >= b && h.wpm < b + 10).length; bins.push({ v, label: String(b), title: `${v} test${v === 1 ? '' : 's'} at ${b} to ${b + 9} wpm`, hl: avg >= b && avg < b + 10 }); }
  }

  const counts = {}; all.forEach(h => { const k = dayKey(h.date); counts[k] = (counts[k] || 0) + 1; });
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const startD = new Date(today); startD.setDate(startD.getDate() - (17 * 7 + today.getDay()));
  const cells = Array.from({ length: 18 * 7 }, (_, i) => {
    const d = new Date(startD); d.setDate(startD.getDate() + i);
    const c = counts[dayKey(d)] || 0;
    return { future: d > today, l: c === 0 ? 0 : c <= 2 ? 1 : c <= 5 ? 2 : c <= 9 ? 3 : 4, title: `${c} test${c === 1 ? '' : 's'} on ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}` };
  });

  const t = resolveTheme(settings.theme);
  const keyStyle = k => {
    const v = data.keyStats[k];
    if (!v || v.n < 3) return { title: `${k}: not enough data` };
    const a = 1 - v.e / v.n, f = clamp((1 - a) / 0.12, 0, 1), col = mix(t[2], t[5], f);
    const ms = v.mc ? Math.round(v.ms / v.mc) : null;
    return { pct: Math.round(a * 100), style: { background: mix(t[1], col, 0.28 + f * 0.5), borderColor: col }, title: `${k}: ${(a * 100).toFixed(1)}% accurate over ${v.n} presses${ms ? `, ${ms} ms average` : ''}` };
  };

  const practice = () => {
    if (weak.length < 2) { ui.toast('Finish a few more tests so TypeFlow can find your weak keys.'); return; }
    const keys = weak.slice(0, 4).map(w => w.k);
    setCfg({ mode: 'custom', customText: practiceText(keys), customLabel: `practice: ${keys.join(', ')}` });
    nav('/');
  };
  const exportAs = fmt => {
    if (fmt === 'csv') {
      const lines = ['date,wpm,raw,accuracy,consistency,mode,length,punctuation,numbers,seconds', ...all.map(h => [new Date(h.date).toISOString(), h.wpm.toFixed(2), h.raw.toFixed(2), h.acc.toFixed(2), h.consistency.toFixed(1), h.mode, h.mode2 || '', h.punctuation, h.numbers, h.elapsed.toFixed(1)].join(','))];
      download('typeflow-history.csv', lines.join('\n'), 'text/csv');
    } else download('typeflow-history.json', JSON.stringify(all, null, 2), 'application/json');
  };
  const Seg = ({ v, children }) => <button aria-pressed={range === v} onClick={() => { setRange(v); setPage(0); }}>{children}</button>;

  return (
    <div className="page wide">
      {head}
      <div className="controls">
        <div className="seg" role="group" aria-label="Date range"><Seg v="7">7 days</Seg><Seg v="30">30 days</Seg><Seg v="90">90 days</Seg><Seg v="all">all time</Seg></div>
        <select className="select" aria-label="Test type" value={mode} onChange={e => { setMode(e.target.value); setPage(0); }}>
          <option value="all">all tests</option>{modes.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="panel glass">
        <div className="stats">
          <div><span>Tests</span><strong>{hist.length}</strong></div>
          <div><span>Best wpm</span><strong>{Math.round(best)}</strong></div>
          <div><span>Average wpm</span><strong>{Math.round(avg)}</strong></div>
          <div><span>Accuracy</span><strong>{accAvg.toFixed(1)}%</strong></div>
          <div><span>Time typing</span><strong>{fmtTime(hist.reduce((a, h) => a + h.elapsed, 0))}</strong></div>
          <div><span>Day streak</span><strong>{agg.current}</strong></div>
        </div>
        <div style={{ marginTop: '1.25rem' }}>
          <span className="muted" style={{ fontSize: '.85rem' }}>Today's goal: {fmtTime(todaySec)} of {settings.dailyGoal} minutes{goalPct >= 100 ? ', done' : ''}</span>
          <div className="goal-bar"><span style={{ width: `${goalPct}%` }} /></div>
        </div>
      </div>
      <div className="panel glass">
        <h2><TrendingUp size="1em" />Speed over time<span className="aside">{hist.length} tests</span></h2>
        <LineChart className="chart tall" deps={[hist]} options={{ n: hist.length, empty: 'Finish two tests in this range to see a trend.', label: 'Speed over time', xLabel: lab, tip,
          series: [{ values: hist.map(h => h.raw), cls: 'g-second' }, { values: hist.map(h => h.wpm), cls: 'g-main', area: true, dots: true }, { values: ma, cls: 'g-third' }] }} />
        <div className="legend"><span className="lg">wpm</span><span className="lg third">10 test average</span><span className="lg second">raw</span></div>
      </div>
      <div className="grid-2">
        <div className="panel glass"><h2><Target size="1em" />Accuracy</h2>
          <LineChart deps={[hist]} options={{ n: hist.length, label: 'Accuracy over time', min: Math.max(0, Math.min(90, Math.min(...accs) - 2)), max: 100, yFmt: v => Math.round(v) + '%', xLabel: lab, tip, series: [{ values: accs, cls: 'g-main', area: true, dots: true }] }} />
        </div>
        <div className="panel glass"><h2><ChartColumn size="1em" />Speed spread</h2><BarChart bins={bins} label="Speed spread" deps={[hist]} /></div>
      </div>
      <div className="grid-2">
        <div className="panel glass">
          <h2><CalendarDays size="1em" />Activity<span className="aside">longest streak {agg.longest} day{agg.longest === 1 ? '' : 's'}</span></h2>
          <div className="cal">{cells.map((c, i) => <i key={i} data-l={c.l} className={c.future ? 'future' : undefined} title={c.title} />)}</div>
          <div className="cal-legend">less <i style={{ background: 'var(--field)' }} /><i style={{ background: 'var(--accent)', opacity: 0.3 }} /><i style={{ background: 'var(--accent)', opacity: 0.55 }} /><i style={{ background: 'var(--accent)', opacity: 0.8 }} /><i style={{ background: 'var(--accent)' }} /> more</div>
        </div>
        <div className="panel glass">
          <h2><Keyboard size="1em" />Key accuracy</h2>
          <div className="kb">{KB_ROWS.map(row => (
            <div className="kb-row" key={row}>{[...row].map(k => { const s = keyStyle(k); return <div className="key" key={k} style={s.style} title={s.title}>{k}{s.pct != null && <small>{s.pct}</small>}</div>; })}</div>
          ))}</div>
          {weak.length ? (
            <>
              <div className="weak-list">{weak.map(w => <span key={w.k}><b>{w.k}</b>{(w.acc * 100).toFixed(1)}%{w.ms ? `, ${Math.round(w.ms)} ms` : ''}</span>)}</div>
              <button className="btn primary sm" onClick={practice}><Dumbbell size="1em" />Practice weak keys</button>
            </>
          ) : <p className="muted" style={{ marginTop: '1rem', fontSize: '.88rem' }}>Keys need a few more presses before weak spots show up.</p>}
        </div>
      </div>
      <div className="panel glass">
        <h2><History size="1em" />History
          <span className="aside">
            <button className="btn ghost sm" onClick={() => exportAs('csv')}><Download size="1em" />CSV</button>
            <button className="btn ghost sm" onClick={() => exportAs('json')}><Download size="1em" />JSON</button>
          </span>
        </h2>
        {rows.length ? (
          <>
            <div className="table-scroll"><table>
              <thead><tr><th>Date</th><th>wpm</th><th>raw</th><th>accuracy</th><th>consistency</th><th>Test</th><th>Time</th></tr></thead>
              <tbody>{rows.map((h, i) => (
                <tr key={h.id || `${h.date}-${i}`}><td>{fmtDate(h.date, true)}</td><td className="hl">{Math.round(h.wpm)}</td><td className="n">{Math.round(h.raw)}</td><td className="n">{h.acc.toFixed(1)}%</td><td className="n">{Math.round(h.consistency)}%</td><td>{testTypeParts(h).join(', ')}</td><td className="n">{fmtTime(h.elapsed)}</td></tr>
              ))}</tbody>
            </table></div>
            <div className="pager">
              <span>Page {pg + 1} of {pages}</span>
              <button className="icon-btn" aria-label="Previous page" disabled={pg === 0} onClick={() => setPage(pg - 1)}><ChevronLeft size="1em" /></button>
              <button className="icon-btn" aria-label="Next page" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)}><ChevronRight size="1em" /></button>
            </div>
          </>
        ) : <p className="muted">No tests in this range.</p>}
      </div>
    </div>
  );
}
