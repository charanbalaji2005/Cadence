import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Check } from 'lucide-react';
import { THEMES, applyTheme, resolveTheme } from '../lib/themes.js';
import { useUI, useOverlay } from '../context/UIContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import Swatch from './Swatch.jsx';

export default function ThemePicker() {
  const ui = useUI();
  const { settings, setSetting } = useSettings();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const listRef = useRef(null);
  const open = ui.themePicker;

  const close = () => { applyTheme(settings.theme); ui.closeThemePicker(); };
  useOverlay('theme', open, close);

  const items = useMemo(() => {
    const all = [{ id: 'system', label: 'system, follows your device', t: resolveTheme('system') }, ...THEMES.map(t => ({ id: t[0], label: t[0], t }))];
    return all.filter(x => x.label.includes(q.trim().toLowerCase()));
  }, [q]);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setIdx(Math.max(0, [{ id: 'system' }, ...THEMES.map(t => ({ id: t[0] }))].findIndex(x => x.id === settings.theme)));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !items[idx]) return;
    applyTheme(items[idx].id);
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [idx, items, open]);

  if (!open) return null;
  const choose = i => { const x = items[i]; if (!x) return; setSetting('theme', x.id); ui.closeThemePicker(); ui.toast(`Theme: ${x.id}`); };

  return (
    <div className="overlay top-aligned" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="dialog palette" role="dialog" aria-modal="true" aria-label="Choose a theme">
        <div className="palette-search">
          <Search size="1em" />
          <input className="palette-input" autoFocus placeholder="Search themes" value={q} aria-controls="themeList"
            onChange={e => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => (i + 1) % Math.max(1, items.length)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => (i - 1 + items.length) % Math.max(1, items.length)); }
              else if (e.key === 'Enter') { e.preventDefault(); choose(idx); }
            }} />
        </div>
        <ul className="theme-list" id="themeList" role="listbox" ref={listRef}>
          {items.length ? items.map((x, i) => (
            <li key={x.id} role="option" aria-selected={i === idx} onMouseEnter={() => setIdx(i)} onClick={() => choose(i)}>
              <span className="tname"><span className="tick">{x.id === settings.theme && <Check size="1em" />}</span>{x.label}</span>
              <Swatch t={x.t} />
            </li>
          )) : <li className="none">No themes match that search</li>}
        </ul>
      </div>
    </div>
  );
}
