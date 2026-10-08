import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useUI, useOverlay } from '../context/UIContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getData } from '../lib/store.js';
import { weakKeys } from '../lib/achievements.js';
import { practiceText } from '../lib/words.js';

export default function CommandPalette() {
  const ui = useUI();
  const nav = useNavigate();
  const auth = useAuth();
  const { settings, setSetting, cfg, setCfg } = useSettings();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const listRef = useRef(null);
  useOverlay('palette', ui.palette, ui.closePalette);

  const commands = useMemo(() => {
    const test = patch => { setCfg(patch); nav('/'); };
    const c = [
      { label: 'Restart test', k: 'tab', run: () => { nav('/'); window.dispatchEvent(new Event('tf:restart')); } },
      { label: 'Theme...', k: 'ctrl shift t', run: () => setTimeout(ui.openThemePicker, 0) },
      { label: 'Practice weak keys', run: () => {
        const weak = weakKeys(getData().keyStats, 4).map(w => w.k);
        if (weak.length < 2) { ui.toast('Finish a few more tests so TypeFlow can find your weak keys.'); return; }
        test({ mode: 'custom', customText: practiceText(weak), customLabel: `practice: ${weak.join(', ')}` });
      } },
      ...['time', 'words', 'quote', 'zen', 'custom'].map(m => ({ label: `Mode: ${m}`, run: () => test({ mode: m }) })),
      ...[15, 30, 60, 120].map(t => ({ label: `Time: ${t} seconds`, run: () => test({ mode: 'time', time: t }) })),
      ...[10, 25, 50, 100].map(n => ({ label: `Words: ${n}`, run: () => test({ mode: 'words', words: n }) })),
      { label: `Punctuation: turn ${cfg.punctuation ? 'off' : 'on'}`, run: () => setCfg({ punctuation: !cfg.punctuation }) },
      { label: `Numbers: turn ${cfg.numbers ? 'off' : 'on'}`, run: () => setCfg({ numbers: !cfg.numbers }) },
      ...['off', 'click', 'soft', 'typewriter'].map(s => ({ label: `Sound: ${s}`, run: () => setSetting('sound', s) })),
      ...['off', 'fade', 'lift', 'pop', 'glow'].map(s => ({ label: `Typing animation: ${s}`, run: () => setSetting('anim', s) })),
      ...['line', 'block', 'underline', 'outline'].map(s => ({ label: `Caret: ${s}`, run: () => setSetting('caret', s) })),
      ...[['off', 'off'], ['pb', 'personal best'], ['average', 'average']].map(([v, l]) => ({ label: `Pace caret: ${l}`, run: () => setSetting('pace', v) })),
      { label: `Background glow: turn ${settings.glow ? 'off' : 'on'}`, run: () => setSetting('glow', !settings.glow) },
      { label: `Stop on error: turn ${settings.stopOnError ? 'off' : 'on'}`, run: () => setSetting('stopOnError', !settings.stopOnError) },
      { label: `Confidence mode: turn ${settings.confidence ? 'off' : 'on'}`, run: () => setSetting('confidence', !settings.confidence) },
      { label: 'Go to typing test', run: () => nav('/') },
      { label: 'Go to leaderboard', run: () => nav('/leaderboard') },
      { label: 'Go to stats and history', run: () => nav('/stats') },
      { label: 'Go to settings', run: () => nav('/settings') },
      { label: 'Go to about', run: () => nav('/about') }
    ];
    if (auth.user) c.push({ label: 'Go to account', run: () => nav('/account') }, { label: 'Sign out', run: async () => { await auth.logout(); ui.toast('Signed out'); nav('/'); } });
    else c.push({ label: 'Log in', run: () => nav('/login') }, { label: 'Create account', run: () => nav('/register') });
    return c;
  }, [settings, cfg, auth, nav, setCfg, setSetting, ui]);

  const items = commands.filter(c => c.label.toLowerCase().includes(q.trim().toLowerCase()));
  useEffect(() => { if (ui.palette) { setQ(''); setIdx(0); } }, [ui.palette]);
  useEffect(() => { listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [idx]);
  if (!ui.palette) return null;

  const run = i => { const c = items[i]; if (!c) return; ui.closePalette(); c.run(); };
  return (
    <div className="overlay top-aligned" onMouseDown={e => { if (e.target === e.currentTarget) ui.closePalette(); }}>
      <div className="dialog palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette-search">
          <Search size="1em" />
          <input className="palette-input" autoFocus placeholder="Type a command" value={q} aria-controls="paletteList"
            onChange={e => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => (i + 1) % Math.max(1, items.length)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => (i - 1 + items.length) % Math.max(1, items.length)); }
              else if (e.key === 'Enter') { e.preventDefault(); run(idx); }
            }} />
        </div>
        <ul id="paletteList" role="listbox" ref={listRef}>
          {items.length ? items.map((c, i) => (
            <li key={c.label} role="option" aria-selected={i === idx} onMouseMove={() => i !== idx && setIdx(i)} onClick={() => run(i)}>
              {c.label}{c.k && <span className="k">{c.k}</span>}
            </li>
          )) : <li className="none">No matching commands</li>}
        </ul>
      </div>
    </div>
  );
}
