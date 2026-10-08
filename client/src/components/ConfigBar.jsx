import { useState } from 'react';
import { AtSign, Hash, Clock, Type, Quote, Mountain, Wrench, Pencil, SlidersHorizontal, ChevronDown, Globe } from 'lucide-react';
import { WORD_LIST_NAMES } from '../lib/words.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { useUI, useOverlay } from '../context/UIContext.jsx';
import { fmtTime } from '../lib/format.js';

function B({ active, onClick, icon: Icon, children, label }) {
  return (
    <button type="button" className={`cfg-btn${active ? ' active' : ''}`} aria-pressed={!!active} aria-label={label} onClick={onClick}>
      {Icon && <Icon size="1em" />}{children}
    </button>
  );
}

export default function ConfigBar() {
  const { cfg, setCfg } = useSettings();
  const ui = useUI();
  const [sheet, setSheet] = useState(false);
  useOverlay('sheet', sheet, () => setSheet(false));
  const m = cfg.mode;
  const extras = m === 'time' || m === 'words';

  const numberPrompt = kind => {
    const time = kind === 'time';
    ui.openPrompt({
      title: time ? 'Custom test length' : 'Custom word count',
      desc: time ? 'How many seconds should the test run?' : 'How many words should the test have?',
      kind: 'number', value: time ? cfg.time : cfg.words, min: 1, max: time ? 3600 : 1000, step: 5, unit: time ? 'seconds' : 'words',
      presets: time ? [10, 45, 90, 180, 300, 600] : [5, 15, 40, 75, 150, 250],
      hint: v => (time ? (v >= 60 ? fmtTime(v) : `${v} seconds`) : `about ${Math.max(1, Math.round(v / 40))} min at 40 wpm`),
      onOk: v => {
        const n = Math.round(Number(v)), max = time ? 3600 : 1000;
        if (!(n >= 1 && n <= max)) return `Enter a whole number from 1 to ${max}.`;
        setCfg(time ? { mode: 'time', time: n } : { mode: 'words', words: n });
      }
    });
  };
  const customText = () => ui.openPrompt({
    title: 'Custom text', desc: 'Paste or write the text you want to practise. Line breaks become spaces.', kind: 'textarea', value: cfg.customText,
    onOk: v => { const t = v.replace(/\s+/g, ' ').trim().slice(0, 5000); if (!t) return 'Add some text to practise with.'; setCfg({ mode: 'custom', customText: t, customLabel: '' }); }
  });

  const mods = extras && (<>
    <B active={cfg.punctuation} icon={AtSign} onClick={() => setCfg({ punctuation: !cfg.punctuation })}>punctuation</B>
    <B active={cfg.numbers} icon={Hash} onClick={() => setCfg({ numbers: !cfg.numbers })}>numbers</B>
  </>);
  const list = WORD_LIST_NAMES.includes(cfg.wordList) ? cfg.wordList : 'english';
  const nextList = WORD_LIST_NAMES[(WORD_LIST_NAMES.indexOf(list) + 1) % WORD_LIST_NAMES.length];
  const listShort = l => (l === 'english' ? 'english' : l.replace('english ', ''));
  const listButton = extras && <B active={list !== 'english'} icon={Globe} label={`Word list: ${list}. Switch to ${nextList}`} onClick={() => setCfg({ wordList: nextList })}>{listShort(list)}</B>;
  const listChoices = WORD_LIST_NAMES.map(l => <B key={l} active={list === l} onClick={() => setCfg({ wordList: l })}>{l}</B>);
  const modes = (<>
    <B active={m === 'time'} icon={Clock} onClick={() => setCfg({ mode: 'time' })}>time</B>
    <B active={m === 'words'} icon={Type} onClick={() => setCfg({ mode: 'words' })}>words</B>
    <B active={m === 'quote'} icon={Quote} onClick={() => setCfg({ mode: 'quote' })}>quote</B>
    <B active={m === 'zen'} icon={Mountain} onClick={() => setCfg({ mode: 'zen' })}>zen</B>
    <B active={m === 'custom'} icon={Wrench} onClick={() => setCfg({ mode: 'custom' })}>custom</B>
  </>);
  let sub = null, subTitle = '';
  if (m === 'time') { const p = [15, 30, 60, 120]; subTitle = 'Seconds'; sub = <>{p.map(t => <B key={t} active={cfg.time === t} onClick={() => setCfg({ time: t })}>{t}</B>)}<B active={!p.includes(cfg.time)} icon={Pencil} label="Custom length" onClick={() => numberPrompt('time')} /></>; }
  else if (m === 'words') { const p = [10, 25, 50, 100]; subTitle = 'Words'; sub = <>{p.map(n => <B key={n} active={cfg.words === n} onClick={() => setCfg({ words: n })}>{n}</B>)}<B active={!p.includes(cfg.words)} icon={Pencil} label="Custom word count" onClick={() => numberPrompt('words')} /></>; }
  else if (m === 'quote') { subTitle = 'Length'; sub = ['all', 'short', 'medium', 'long'].map(l => <B key={l} active={cfg.quoteLen === l} onClick={() => setCfg({ quoteLen: l })}>{l}</B>); }
  else if (m === 'custom') { subTitle = 'Text'; sub = <B icon={Pencil} onClick={customText}>change text</B>; }

  const summary = [m === 'time' ? `time ${cfg.time}` : m === 'words' ? `words ${cfg.words}` : m === 'quote' ? `quote ${cfg.quoteLen}` : m, extras && list !== 'english' && list, extras && cfg.punctuation && 'punctuation', extras && cfg.numbers && 'numbers'].filter(Boolean).join(', ');

  return (
    <>
      <div className="config glass" role="toolbar" aria-label="Test options">
        {mods && <><div className="group">{listButton}{mods}</div><span className="sep" /></>}
        <div className="group">{modes}</div>
        {sub && <><span className="sep" /><div className="group">{sub}</div></>}
      </div>
      <button className="cfg-summary glass" type="button" onClick={() => setSheet(true)}>
        <SlidersHorizontal size="1em" /><span>{summary}</span><ChevronDown size="1em" />
      </button>
      {sheet && (
        <div className="overlay sheet-ov" onMouseDown={e => { if (e.target === e.currentTarget) setSheet(false); }}>
          <div className="dialog sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
            <div className="sheet-handle" />
            <h2 id="sheetTitle" style={{ marginBottom: '1rem' }}>Test settings</h2>
            <div className="sheet-config">
              <h3>Mode</h3><div className="group">{modes}</div>
              {sub && <><h3>{subTitle}</h3><div className="group">{sub}</div></>}
              {extras && <><h3>Word list</h3><div className="group">{listChoices}</div></>}
              {mods && <><h3>Extras</h3><div className="group">{mods}</div></>}
            </div>
            <div className="dialog-actions"><button type="button" className="btn primary block" onClick={() => setSheet(false)}>Done</button></div>
          </div>
        </div>
      )}
    </>
  );
}
