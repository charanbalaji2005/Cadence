import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { api } from '../../lib/api.js';
import { fmtDate } from '../../lib/format.js';
import { ordinal } from '../../lib/compete.js';
import { useCompete } from '../../context/CompeteContext.jsx';

/** Competition record (played, wins, top 3, best, win rate) and recent races. */
export default function CompetitionHistory({ limit = 8 }) {
  const compete = useCompete();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const ctrl = new AbortController();
    api('/competitions/history', { signal: ctrl.signal })
      .then(d => { setData(d); setError(null); })
      .catch(err => { if (err.name !== 'AbortError') setError(err.message); });
    return () => ctrl.abort();
  }, [compete.savedCode]); // reload after each race is saved

  return (
    <div className="panel glass cp-history">
      <h2><Trophy size="1em" />Competitions</h2>
      {error ? <p className="muted">{error}</p> : !data ? <div className="spinner" role="status" aria-label="Loading competitions" /> : (
        <>
          <div className="stats">
            <div><span>Competitions</span><strong>{data.stats.played}</strong></div>
            <div><span>Wins</span><strong>{data.stats.wins}</strong></div>
            <div><span>Top 3</span><strong>{data.stats.top3}</strong></div>
            <div><span>Best</span><strong>{data.stats.best}<small> wpm</small></strong></div>
            <div><span>Win rate</span><strong>{data.stats.winRate}%</strong></div>
          </div>
          {data.recent.length ? (
            <div className="table-scroll cp-history-table">
              <table>
                <thead><tr><th>Opponents</th><th>Result</th><th>wpm</th><th>Date</th></tr></thead>
                <tbody>
                  {data.recent.slice(0, limit).map(r => (
                    <tr key={r.id} className={r.rank === 1 && r.players > 1 ? 'cp-win' : ''}>
                      <td className="cp-opponents">{r.opponents.length ? r.opponents.map(o => o.username).join(', ') : 'solo'}</td>
                      <td>{ordinal(r.rank)} of {r.players}{r.status === 'suspicious' && <span className="cp-tag warn">not counted</span>}</td>
                      <td className="hl">{Math.round(r.wpm)}</td>
                      <td>{fmtDate(r.date, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="muted cp-history-empty">No competitions yet. Create a room and challenge your friends.</p>}
        </>
      )}
    </div>
  );
}
