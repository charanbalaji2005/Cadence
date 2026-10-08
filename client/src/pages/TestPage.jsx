import { useCallback, useEffect, useRef, useState } from 'react';
import { Globe, MousePointerClick, RotateCw, ArrowBigUpDash } from 'lucide-react';
import ConfigBar from '../components/ConfigBar.jsx';
import Results from '../components/Results.jsx';
import { TypingEngine } from '../lib/engine.js';
import { sfx } from '../lib/sound.js';
import { getData, saveResult } from '../lib/store.js';
import { ACHIEVEMENTS, unlockedIds } from '../lib/achievements.js';
import { isTouch, pbKey } from '../lib/format.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function TestPage() {
  const { settings, cfg } = useSettings();
  const ui = useUI();
  const auth = useAuth();
  const r = { words: useRef(null), track: useRef(null), wrap: useRef(null), caret: useRef(null), pace: useRef(null), input: useRef(null), counter: useRef(null), speed: useRef(null), lang: useRef(null) };
  const engine = useRef(null);
  const [result, setResult] = useState(null);
  const [save, setSave] = useState(null);
  const [testKey, setTestKey] = useState(0);
  const repeatNext = useRef(false);
  const resultRef = useRef(null);

  // Latest values for callbacks the engine holds on to.
  const live = useRef({});
  live.current = { settings, cfg, ui, user: auth.user, result };

  const onFinish = useCallback(async res => {
    const before = unlockedIds(getData().results);
    resultRef.current = res;
    setResult(res); setSave(null);
    const user = live.current.user;
    const saved = await saveResult(user, res);
    if (resultRef.current === res) setSave(saved);
    if (user) {
      const after = unlockedIds(getData().results);
      ACHIEVEMENTS.filter(a => after.includes(a.id) && !before.includes(a.id)).forEach((a, i) => setTimeout(() => live.current.ui.achievement(a), 700 + i * 2600));
    }
  }, []);

  useEffect(() => {
    const els = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.current]));
    const e = new TypingEngine(els, {
      getSettings: () => live.current.settings,
      paceTarget: c => {
        const st = live.current.settings;
        if (st.pace === 'off' || c.mode === 'zen') return 0;
        if (st.pace === 'custom') return st.paceWpm;
        const d = getData();
        if (st.pace === 'average') { const l = d.results.slice(-10); return l.length ? l.reduce((a, h) => a + h.wpm, 0) / l.length : 0; }
        const key = pbKey({ mode: c.mode, mode2: c.mode === 'time' ? String(c.time) : c.mode === 'words' ? String(c.words) : '', punctuation: c.punctuation, numbers: c.numbers });
        return d.bests[key]?.wpm || 0;
      },
      onFinish: res => onFinish(res),
      onTyping: on => document.body.classList.toggle('typing', on),
      sfx: kind => sfx(kind, live.current.settings.sound),
      canFocus: () => !live.current.ui.isOverlayOpen() && !resultRef.current
    });
    engine.current = e;
    return () => e.destroy();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A fresh test whenever the options change or a restart is requested.
  useEffect(() => { resultRef.current = null; setResult(null); setSave(null); }, [cfg]);
  useEffect(() => {
    if (result) return;
    engine.current.newTest(cfg, repeatNext.current);
    repeatNext.current = false;
  }, [cfg, testKey, result === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const restart = useCallback((repeat = false) => { repeatNext.current = repeat; resultRef.current = null; setResult(null); setSave(null); setTestKey(k => k + 1); }, []);

  useEffect(() => { const fn = () => restart(); window.addEventListener('tf:restart', fn); return () => window.removeEventListener('tf:restart', fn); }, [restart]);
  useEffect(() => { requestAnimationFrame(() => { engine.current?.measure(); engine.current?.placeCaret(); }); }, [settings.fontSize, settings.caret]);
  useEffect(() => {
    let t;
    const onResize = () => { clearTimeout(t); t = setTimeout(() => { engine.current?.measure(); engine.current?.placeCaret(); }, 120); };
    window.addEventListener('resize', onResize);
    document.fonts?.ready.then(onResize);
    return () => { window.removeEventListener('resize', onResize); clearTimeout(t); };
  }, []);

  useEffect(() => {
    const onKey = e => {
      const L = live.current;
      if (e.defaultPrevented || L.ui.isOverlayOpen()) return;
      const k = e.key, eng = engine.current;
      if (k === 'Tab' && L.settings.quickRestart) { e.preventDefault(); restart(); return; }
      const t = e.target;
      if (t !== r.input.current && t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (resultRef.current) return;
      if (k === 'Enter' && e.shiftKey) { e.preventDefault(); eng.finishZen(); return; }
      if (k === 'Backspace') { e.preventDefault(); eng.focus(true); eng.handleBackspace(e.ctrlKey || e.altKey || e.metaKey); return; }
      const altGr = e.getModifierState && e.getModifierState('AltGraph');
      if (k.length === 1 && (altGr || (!e.ctrlKey && !e.metaKey && !e.altKey))) { e.preventDefault(); eng.focus(true); eng.handleChar(k); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [restart]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mobile keyboards that report "Unidentified" keys deliver text through the input event.
  const onInput = e => { const v = e.target.value; e.target.value = ''; for (const ch of v) engine.current.handleChar(ch === '\u00a0' ? ' ' : ch); };

  return (
    <section className="view-test">
      <ConfigBar />
      <div className="stage">
        <div hidden={!!result}>
          <div className="meta-row">
            {ui.caps && settings.capsWarning && <div className="caps" role="status"><ArrowBigUpDash size="1em" />Caps Lock is on</div>}
            <span className="live-counter" ref={r.counter} />
            <span className="lang"><Globe size="1em" /><span ref={r.lang}>english</span></span>
            <span className="live-speed" ref={r.speed} />
          </div>
          <div className="words-wrap unfocused" ref={r.wrap} onClick={() => engine.current.focus(true)}>
            <div className="track" ref={r.track}>
              <div className="pace-caret" ref={r.pace} hidden />
              <div className={`caret caret-${settings.caret}${settings.smoothCaret ? ' smooth' : ''}`} ref={r.caret} />
              <div className="words" ref={r.words} aria-label="Words to type" />
            </div>
            <div className="focus-hint"><span><MousePointerClick size="1em" />{isTouch() ? 'Tap here to start typing' : 'Click here or start typing to focus'}</span></div>
          </div>
          <input className="hidden-input" ref={r.input} type="text" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false" enterKeyHint="next" aria-label="Typing input"
            onInput={onInput} onFocus={() => engine.current.updateFocus()} onBlur={() => setTimeout(() => engine.current?.updateFocus(), 0)} />
          <button className="icon-btn restart" title="Restart test (Tab)" aria-label="Restart test" onClick={() => restart()}><RotateCw size="1em" /></button>
        </div>
        {result && <Results r={result} save={save} signedIn={!!auth.user} onNext={() => restart()} onRepeat={() => restart(true)} />}
      </div>
    </section>
  );
}
