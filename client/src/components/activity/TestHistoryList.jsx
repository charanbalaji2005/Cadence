import { useMemo, useState } from 'react';
import { History, ChevronLeft, ChevronRight, Filter, ArrowUpDown } from 'lucide-react';
import { fmtDate, testTypeParts } from '../../lib/format.js';

const MODE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'time', label: 'Time' },
  { id: 'words', label: 'Words' },
  { id: 'quote', label: 'Quote' },
  { id: 'code', label: 'Code' },
  { id: 'zen', label: 'Zen' },
  { id: 'custom', label: 'Custom' }
];

const SORT_OPTIONS = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'wpm_desc', label: 'Highest WPM' },
  { id: 'acc_desc', label: 'Highest Accuracy' }
];

export default function TestHistoryList({ results = [], initialFilterDate = null, onClearDateFilter }) {
  const [modeFilter, setModeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let list = [...results];

    // Optional filter by specific day from Activity modal
    if (initialFilterDate) {
      list = list.filter(r => {
        const dStr = new Date(r.date).toISOString().slice(0, 10);
        return dStr === initialFilterDate;
      });
    }

    if (modeFilter !== 'all') {
      list = list.filter(r => r.mode === modeFilter);
    }

    switch (sortBy) {
      case 'oldest':
        list.sort((a, b) => a.date - b.date);
        break;
      case 'wpm_desc':
        list.sort((a, b) => b.wpm - a.wpm);
        break;
      case 'acc_desc':
        list.sort((a, b) => b.acc - a.acc);
        break;
      case 'newest':
      default:
        list.sort((a, b) => b.date - a.date);
        break;
    }

    return list;
  }, [results, modeFilter, sortBy, initialFilterDate]);

  const pageSize = 15;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(Math.max(0, page), totalPages - 1);
  const pageRows = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  return (
    <div className="test-history-card glass" aria-label="Test History Table">
      <div className="test-history-header">
        <div className="test-history-title-wrap">
          <History size={18} className="test-history-icon" />
          <h3 className="test-history-title">Test History</h3>
          {initialFilterDate && (
            <span className="date-filter-chip">
              Filtered: {initialFilterDate}
              <button type="button" onClick={onClearDateFilter}>×</button>
            </span>
          )}
        </div>

        <div className="test-history-toolbar">
          <div className="test-mode-filters">
            {MODE_FILTERS.map(f => (
              <button
                key={f.id}
                type="button"
                className={`filter-btn ${modeFilter === f.id ? 'active' : ''}`}
                onClick={() => { setModeFilter(f.id); setPage(0); }}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="test-sort-select-wrap">
            <ArrowUpDown size={14} />
            <select
              value={sortBy}
              onChange={e => { setSortBy(e.target.value); setPage(0); }}
              className="test-sort-select"
            >
              {SORT_OPTIONS.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="table-responsive">
        <table className="results-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Mode</th>
              <th>WPM</th>
              <th>Raw</th>
              <th>Accuracy</th>
              <th>Consistency</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length > 0 ? (
              pageRows.map((r, i) => (
                <tr key={r.id || i}>
                  <td className="cell-date">{fmtDate(r.date, true)}</td>
                  <td className="cell-mode">{testTypeParts(r).join(' ')}</td>
                  <td className="cell-wpm"><strong>{Math.round(r.wpm)}</strong></td>
                  <td className="cell-raw">{r.raw ? Math.round(r.raw) : '--'}</td>
                  <td className="cell-acc">{r.acc.toFixed(1)}%</td>
                  <td className="cell-cons">{r.consistency ? `${Math.round(r.consistency)}%` : '--'}</td>
                  <td className="cell-dur">{Math.round(r.elapsed)}s</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="table-empty-cell">
                  No tests found for this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="table-pagination">
          <button
            type="button"
            className="icon-btn"
            disabled={currentPage === 0}
            onClick={() => setPage(p => p - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="pagination-info">
            Page {currentPage + 1} of {totalPages}
          </span>
          <button
            type="button"
            className="icon-btn"
            disabled={currentPage >= totalPages - 1}
            onClick={() => setPage(p => p + 1)}
            aria-label="Next page"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
