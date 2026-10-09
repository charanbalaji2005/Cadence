import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, Play, Trophy, Keyboard, RefreshCw, Copy } from 'lucide-react';
import Avatar from '../components/Avatar.jsx';
import { api } from '../lib/api.js';
import { fmtDate } from '../lib/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

export default function LeaderboardPage() {
  const auth = useAuth();
  const ui = useUI();
  const { setCfg } = useSettings();
  const nav = useNavigate();
  const [length, setLength] = useState('15');
  const [range, setRange] = useState('all');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async signal => {
    try {
      const d = await api(`/leaderboard?length=${length}&range=${range}&tz=${new Date().getTimezoneOffset()}`, { signal });
      setData(d); setError(null);
    } catch (err) { if (err.name !== 'AbortError') setError(err.message); }
  }, [length, range]);

  useEffect(() => {
    const ctrl = new AbortController();
    setData(null);
    load(ctrl.signal);
    const t = setInterval(() => { if (!document.hidden) load(); }, 30000);
    return () => { ctrl.abort(); clearInterval(t); };
  }, [load, auth.user?.id]);

  const quick = () => { setCfg({ mode: 'time', time: Number(length), punctuation: false, numbers: false }); nav('/'); };
  const Seg = ({ value, cur, set, children }) => <button aria-pressed={cur === value} onClick={() => set(value)}>{children}</button>;
  const myId = auth.user?.id;

  return (
    <div className="page">
      <div className="lb-head">
        <div><h1>Leaderboard</h1><p className="lede">English, {length} second tests without punctuation or numbers, ranked by words per minute.</p></div>
        <span className={`live-dot${data ? ' on' : ''}`}>{data ? `${data.players} player${data.players === 1 ? '' : 's'}` : error ? 'Offline' : 'Loading'}</span>
      </div>
      <div className="controls">
        <div className="seg" role="group" aria-label="Test length"><Seg value="15" cur={length} set={setLength}>15 seconds</Seg><Seg value="60" cur={length} set={setLength}>60 seconds</Seg></div>
        <div className="seg" role="group" aria-label="Time range"><Seg value="all" cur={range} set={setRange}>all time</Seg><Seg value="today" cur={range} set={setRange}>today</Seg></div>
        <span className="spacer" />
        <button className="btn outline sm" onClick={quick}><Play size="1em" />Take a {length}s test</button>
      </div>
      {!auth.user && (
        <div className="banner glass">
          <Eye size="1em" />
          <p>You're viewing as a guest. Anyone can see the board; log in to put your own scores on it.</p>
          <Link className="btn ghost sm" to="/login">Log in</Link>
          <Link className="btn primary sm" to="/register">Create account</Link>
        </div>
      )}
      {data?.me && (
        <div className="my-rank glass">
          <Trophy size="1.4em" style={{ color: 'var(--accent)' }} />
          <div><span className="muted" style={{ fontSize: '.85rem' }}>Your rank</span><br /><strong>#{data.me.rank}</strong></div>
          <div className="muted" style={{ marginLeft: 'auto', textAlign: 'right', fontSize: '.88rem' }}>{Math.round(data.me.wpm)} wpm<br />{data.me.acc.toFixed(1)}% accuracy</div>
        </div>
      )}
      <div className="panel glass">
        {error && !data ? (
          <div className="empty"><p>{error}</p><button className="btn outline" onClick={() => load()}><RefreshCw size="1em" />Try again</button></div>
        ) : !data ? <div className="spinner" role="status" aria-label="Loading" /> : data.entries.length ? (
          <div className="table-scroll"><table>
            <thead><tr><th>#</th><th>Player</th><th>wpm</th><th>accuracy</th><th>raw</th><th>consistency</th><th>Date</th></tr></thead>
            <tbody>{data.entries.map((e, i) => (
              <tr key={e.userId} className={e.userId === myId ? 'me' : ''}>
                <td><span className={`rank${i < 3 ? ' r' + (i + 1) : ''}`}>{i + 1}</span></td>
                <td>
                  <span className="player">
                    <Link
                      to={`/profile/${e.username}`}
                      className="player-link"
                      title={`View ${e.username}'s public profile`}
                    >
                      <Avatar name={e.username} url={e.avatar} size="sm" />
                      <span>{e.username}</span>
                    </Link>
                    {e.userId === myId && <span className="you">you</span>}
                    <button
                      type="button"
                      className="player-link-copy-btn"
                      title={`Copy ${e.username}'s public profile link`}
                      aria-label={`Copy ${e.username}'s public profile link`}
                      onClick={(ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        const url = `https://cadence-wj7c.onrender.com/profile/${e.username}`;
                        if (navigator.clipboard) navigator.clipboard.writeText(url);
                        ui.toast(`Copied ${e.username}'s profile link! 📋`);
                      }}
                    >
                      <Copy size={12} />
                    </button>
                  </span>
                </td>
                <td className="hl">{Math.round(e.wpm)}</td><td className="n">{e.acc.toFixed(1)}%</td><td className="n">{Math.round(e.raw)}</td><td className="n">{Math.round(e.consistency)}%</td><td>{fmtDate(e.date)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : (
          <div className="empty">
            <p>No scores {range === 'today' ? 'today' : 'yet'} for {length} second tests. {auth.user ? 'Finish one with at least 75% accuracy to take the top spot.' : 'Log in and finish one to take the top spot.'}</p>
            <button className="btn outline" onClick={quick}><Keyboard size="1em" />Start a {length} second test</button>
          </div>
        )}
      </div>
    </div>
  );
}
