import { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useUI, useOverlay } from '../context/UIContext.jsx';
import { clamp } from '../lib/format.js';

/**
 * Dialog for number input (stepper with presets), long text, or a confirmation.
 * options: { title, desc, kind: 'number'|'textarea'|null, value, min, max, step, unit, presets, hint(v), okLabel, danger, onOk(value) -> error string | void }
 */
export default function Prompt() {
  const ui = useUI();
  const o = ui.prompt;
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const okRef = useRef(null);
  useOverlay('prompt', !!o, ui.closePrompt);

  useEffect(() => {
    if (!o) return;
    setValue(String(o.value ?? '')); setError(null);
    setTimeout(() => { if (inputRef.current) { inputRef.current.focus(); inputRef.current.select?.(); } else okRef.current?.focus(); }, 30);
  }, [o]);
  if (!o) return null;

  const submit = async e => {
    e.preventDefault();
    const err = await o.onOk(value);
    if (err) { setError(err); return; }
    ui.closePrompt();
  };
  const step = d => {
    const v = Number(value) || 0, s = o.step || 1;
    const n = d > 0 ? Math.floor(v / s) * s + s : Math.ceil(v / s) * s - s;
    setValue(String(clamp(n, o.min, o.max)));
  };
  const num = Number(value);

  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) ui.closePrompt(); }}>
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="promptTitle" onSubmit={submit} noValidate>
        <h2 id="promptTitle">{o.title}</h2>
        {o.desc && <p className="sub">{o.desc}</p>}
        {error && <p className="form-msg" role="alert">{error}</p>}
        {o.kind === 'textarea' && (
          <div className="field"><label htmlFor="pIn" className="sr">Text</label><textarea id="pIn" ref={inputRef} value={value} onChange={e => setValue(e.target.value)} /></div>
        )}
        {o.kind === 'number' && (
          <>
            <div className="stepper">
              <button type="button" className="step" aria-label="Decrease" onClick={() => step(-1)}><Minus size="1em" /></button>
              <label className="num-in">
                <input id="pIn" ref={inputRef} type="number" inputMode="numeric" min={o.min} max={o.max} value={value} aria-label={o.unit}
                  onChange={e => setValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'ArrowUp') { e.preventDefault(); step(1); } if (e.key === 'ArrowDown') { e.preventDefault(); step(-1); } }} />
                <span className="unit">{o.unit}</span>
              </label>
              <button type="button" className="step" aria-label="Increase" onClick={() => step(1)}><Plus size="1em" /></button>
            </div>
            <p className="step-hint">{num > 0 && o.hint ? o.hint(num) : '\u00a0'}</p>
            {o.presets && (
              <div className="chips">
                {o.presets.map(p => <button key={p} type="button" className="chip" aria-pressed={num === p} onClick={() => setValue(String(p))}>{p}</button>)}
              </div>
            )}
          </>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={ui.closePrompt}>Cancel</button>
          <button type="submit" ref={okRef} className={o.danger ? 'btn danger solid' : 'btn primary'}>{o.okLabel || 'Apply'}</button>
        </div>
      </form>
    </div>
  );
}
