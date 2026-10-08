import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Globe, MousePointerClick } from 'lucide-react';
import { TypingEngine } from '../../lib/engine.js';
import { sfx } from '../../lib/sound.js';
import { isTouch } from '../../lib/format.js';
import { useSettings } from '../../context/SettingsContext.jsx';
import { useUI } from '../../context/UIContext.jsx';

/**
 * The normal Cadence typing surface, driven by the race instead of the first keypress.
 * Same engine, same markup and styles as the typing test; the room only decides
 * the text (via the shared seed) and when the clock starts.
 */
const RaceTyping = forwardRef(function RaceTyping({ cfg, onFinish }, ref) {
  const { settings } = useSettings();
  const ui = useUI();
  const r = { words: useRef(null), track: useRef(null), wrap: useRef(null), caret: useRef(null), pace: useRef(null), input: useRef(null), counter: useRef(null), speed: useRef(null), lang: useRef(null) };
  const engine = useRef(null);
  const live = useRef({});
  live.current = { settings, ui, onFinish };

  useEffect(() => {
    const els = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.current]));
    const e = new TypingEngine(els, {
      getSettings: () => live.current.settings,
      paceTarget: () => 0, // no pace caret in races: the other players are the pace
      onFinish: res => live.current.onFinish(res),
      onTyping: on => document.body.classList.toggle('typing', on),
      sfx: kind => sfx(kind, live.current.settings.sound),
      canFocus: () => !live.current.ui.isOverlayOpen()
    });
    engine.current = e;
    return () => { e.destroy(); document.body.classList.remove('typing'); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A new seed means new text; anything else about cfg is fixed for the race.
  useEffect(() => { engine.current.newTest(cfg); }, [cfg.seed]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (e.defaultPrevented || live.current.ui.isOverlayOpen()) return;
      const t = e.target, eng = engine.current, k = e.key;
      if (t !== r.input.current && t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (k === 'Backspace') { e.preventDefault(); eng.focus(true); eng.handleBackspace(e.ctrlKey || e.altKey || e.metaKey); return; }
      const altGr = e.getModifierState && e.getModifierState('AltGraph');
      if (k.length === 1 && (altGr || (!e.ctrlKey && !e.metaKey && !e.altKey))) { e.preventDefault(); eng.focus(true); eng.handleChar(k); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    startRace: lateMs => engine.current?.startRace(lateMs),
    liveStats: () => engine.current?.liveStats(),
    /** Ends the race for this player (time limit reached). Does nothing if they never started. */
    finish: () => { if (engine.current?.running) engine.current.finish(); },
    focus: () => engine.current?.focus(true)
  }), []);

  const onInput = e => { const v = e.target.value; e.target.value = ''; for (const ch of v) engine.current.handleChar(ch === ' ' ? ' ' : ch); };

  return (
    <div className="cp-typing">
      <div className="meta-row">
        <span className="live-counter" ref={r.counter} />
        <span className="lang"><Globe size="1em" /><span ref={r.lang}>english</span></span>
        <span className="live-speed" ref={r.speed} />
      </div>
      <div className="words-wrap unfocused" ref={r.wrap} onClick={() => engine.current.focus(true)}>
        <div className="track" ref={r.track}>
          <div className="pace-caret" ref={r.pace} hidden />
          <div className={`caret caret-${settings.caret}${settings.smoothCaret ? ' smooth' : ''}`} ref={r.caret} />
          <div className="words" ref={r.words} aria-label="Race text" />
        </div>
        <div className="focus-hint"><span><MousePointerClick size="1em" />{isTouch() ? 'Tap here to type' : 'Click here or start typing to focus'}</span></div>
      </div>
      <input className="hidden-input" ref={r.input} type="text" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false" enterKeyHint="next" aria-label="Race typing input"
        onInput={onInput} onFocus={() => engine.current.updateFocus()} onBlur={() => setTimeout(() => engine.current?.updateFocus(), 0)} />
    </div>
  );
});

export default RaceTyping;
