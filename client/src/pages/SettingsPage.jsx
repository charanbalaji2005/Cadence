import { Palette, Search, Minus, Plus, Volume2, Trash2, RotateCcw } from 'lucide-react';
import Swatch from '../components/Swatch.jsx';
import { THEMES, resolveTheme, rgba } from '../lib/themes.js';
import { sfx } from '../lib/sound.js';
import { clamp } from '../lib/format.js';
import { clearAll } from '../lib/store.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const SCHEMA = [
  { section: 'Look and feel', rows: [
    { key: 'glow', title: 'Background glow', desc: 'Soft color behind the glass panels. Off keeps the background plain.', opts: [[false, 'off'], [true, 'on']] },
    { key: 'fontSize', title: 'Text size', desc: 'Size of the words you type.', opts: [['small', 'small'], ['medium', 'medium'], ['large', 'large']] },
    { key: 'anim', title: 'Typing animation', desc: 'How each letter reacts as you type it.', opts: [['off', 'off'], ['fade', 'fade'], ['lift', 'lift'], ['pop', 'pop'], ['glow', 'glow']] },
    { key: 'caret', title: 'Caret style', desc: 'How the cursor looks.', opts: [['line', 'line'], ['block', 'block'], ['underline', 'underline'], ['outline', 'outline']] },
    { key: 'smoothCaret', title: 'Smooth caret', desc: 'Glide between letters instead of jumping.', opts: [[true, 'on'], [false, 'off']] }
  ] },
  { section: 'While typing', rows: [
    { key: 'liveSpeed', title: 'Live speed', desc: 'Show words per minute during the test.', opts: [[true, 'show'], [false, 'hide']] },
    { key: 'liveAcc', title: 'Live accuracy', desc: 'Show accuracy during the test.', opts: [[true, 'show'], [false, 'hide']] },
    { key: 'pace', title: 'Pace caret', desc: 'A second caret that moves at a target speed so you can race it.', opts: [['off', 'off'], ['pb', 'best'], ['average', 'average'], ['custom', 'custom']] },
    { key: 'paceWpm', title: 'Custom pace', desc: 'Target speed for the custom pace caret.', number: { min: 10, max: 300, unit: 'wpm' }, when: s => s.pace === 'custom' },
    { key: 'stopOnError', title: 'Stop on error', desc: "Wrong letters don't move the caret until you type the right one.", opts: [[false, 'off'], [true, 'on']] },
    { key: 'confidence', title: 'Confidence mode', desc: 'Backspace is turned off. Commit to every key.', opts: [[false, 'off'], [true, 'on']] },
    { key: 'capsWarning', title: 'Caps Lock warning', desc: 'Show a notice when Caps Lock is on.', opts: [[true, 'on'], [false, 'off']] },
    { key: 'quickRestart', title: 'Quick restart', desc: 'Press Tab to start a fresh test at any time.', opts: [[true, 'on'], [false, 'off']] }
  ] },
  { section: 'Sound and goals', rows: [
    { key: 'sound', title: 'Key sound', desc: 'Play a sound on each key press.', opts: [['off', 'off'], ['click', 'click'], ['soft', 'soft'], ['typewriter', 'typewriter']] },
    { key: 'dailyGoal', title: 'Daily goal', desc: 'Minutes of typing to aim for each day.', opts: [[5, '5 min'], [10, '10 min'], [20, '20 min'], [30, '30 min']] }
  ] }
];

export default function SettingsPage() {
  const { settings, setSetting, resetSettings } = useSettings();
  const ui = useUI();
  const auth = useAuth();

  const clear = () => ui.openPrompt({
    title: 'Clear typing history?', desc: `This removes every saved result, key stat and personal best for ${auth.user ? 'your account' : 'guest mode in this browser'}. It can't be undone.`,
    kind: null, okLabel: 'Clear history', danger: true,
    onOk: async () => { try { await clearAll(auth.user); ui.toast('Typing history cleared'); } catch (err) { return err.message; } }
  });

  return (
    <div className="page">
      <h1>Settings</h1>
      <p className="lede">{auth.user ? 'Changes save automatically and follow your account to other devices.' : 'Changes save automatically in this browser.'}</p>
      <div className="panel glass">
        <h2><Palette size="1em" />Theme<span className="aside"><button className="btn ghost sm" onClick={ui.openThemePicker}><Search size="1em" />Search themes</button></span></h2>
        <div className="theme-grid">
          {[['system'], ...THEMES].map(t => {
            const r = t[0] === 'system' ? resolveTheme('system') : t;
            return (
              <button key={t[0]} className="theme-card" aria-pressed={settings.theme === t[0]} onClick={() => setSetting('theme', t[0])}
                style={{ background: r[1], color: r[4], borderColor: rgba(r[4], 0.12) }}>
                <span>{t[0]}</span><Swatch t={r} />
              </button>
            );
          })}
        </div>
      </div>
      {SCHEMA.map(sec => (
        <div className="panel glass" key={sec.section}>
          <h2>{sec.section}</h2>
          {sec.rows.filter(s => !s.when || s.when(settings)).map(s => (
            <div className="set-row" key={s.key}>
              <div><h3>{s.title}</h3><p>{s.desc}</p></div>
              <div className="ctrl">
                {s.number ? (
                  <div className="stepper" style={{ padding: '.25rem' }}>
                    <button type="button" className="step" style={{ width: '2.3rem', height: '2.3rem' }} aria-label="Decrease" onClick={() => setSetting(s.key, clamp(settings[s.key] - 5, s.number.min, s.number.max))}><Minus size="1em" /></button>
                    <span className="num-in"><strong style={{ fontFamily: 'var(--font-type)', fontWeight: 500, fontSize: '1.1rem' }}>{settings[s.key]}</strong><span className="unit">{s.number.unit}</span></span>
                    <button type="button" className="step" style={{ width: '2.3rem', height: '2.3rem' }} aria-label="Increase" onClick={() => setSetting(s.key, clamp(settings[s.key] + 5, s.number.min, s.number.max))}><Plus size="1em" /></button>
                  </div>
                ) : (
                  <div className="seg" role="group" aria-label={s.title}>
                    {s.opts.map(([v, l]) => <button key={String(v)} aria-pressed={settings[s.key] === v} onClick={() => setSetting(s.key, v)}>{l}</button>)}
                  </div>
                )}
                {s.key === 'sound' && <button className="icon-btn" aria-label="Play a test sound" onClick={() => (settings.sound === 'off' ? ui.toast('Pick a key sound first.') : sfx('key', settings.sound))}><Volume2 size="1em" /></button>}
              </div>
            </div>
          ))}
        </div>
      ))}
      <div className="panel glass">
        <h2>Data</h2>
        <div className="set-row"><div><h3>Clear typing history</h3><p>Remove saved results, key stats and personal bests.</p></div><div className="ctrl"><button className="btn danger" onClick={clear}><Trash2 size="1em" />Clear history</button></div></div>
        <div className="set-row"><div><h3>Reset settings</h3><p>Put every setting back to its default.</p></div><div className="ctrl"><button className="btn ghost" onClick={() => { resetSettings(); ui.toast('Settings reset'); }}><RotateCcw size="1em" />Reset</button></div></div>
      </div>
    </div>
  );
}
