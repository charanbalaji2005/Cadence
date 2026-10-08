import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Award } from 'lucide-react';
import { ACH_ICONS } from '../lib/icons.js';
import { RARITY } from '../lib/achievements.js';

const Ctx = createContext(null);

/**
 * Shared UI state: toasts, achievement pop-ups, Caps Lock, and a stack of open overlays
 * so the typing test knows to ignore keys while a dialog is up.
 */
export function UIProvider({ children }) {
  const [toastMsg, setToastMsg] = useState(null);
  const [popups, setPopups] = useState([]);
  const [caps, setCaps] = useState(false);
  const [palette, setPalette] = useState(false);
  const [themePicker, setThemePicker] = useState(false);
  const [prompt, setPrompt] = useState(null);
  const stack = useRef([]); // [{ id, close }]
  const toastTimer = useRef(null);

  const toast = useCallback(msg => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2800);
  }, []);
  const achievement = useCallback(a => {
    const key = a.id + Date.now();
    setPopups(p => [...p, { ...a, key }]);
    setTimeout(() => setPopups(p => p.map(x => (x.key === key ? { ...x, out: true } : x))), 2300);
    setTimeout(() => setPopups(p => p.filter(x => x.key !== key)), 2650);
  }, []);
  const pushOverlay = useCallback((id, close) => { stack.current = [...stack.current.filter(o => o.id !== id), { id, close }]; }, []);
  const popOverlay = useCallback(id => { stack.current = stack.current.filter(o => o.id !== id); }, []);
  const isOverlayOpen = useCallback(() => stack.current.length > 0, []);
  const closeTop = useCallback(() => { const top = stack.current[stack.current.length - 1]; if (top) top.close(); }, []);

  useEffect(() => {
    const onKey = e => { if (e.getModifierState) setCaps(e.getModifierState('CapsLock')); };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKey, true); };
  }, []);

  const value = useMemo(() => ({
    toast, achievement, caps, pushOverlay, popOverlay, isOverlayOpen, closeTop,
    palette, openPalette: () => setPalette(true), closePalette: () => setPalette(false),
    themePicker, openThemePicker: () => setThemePicker(true), closeThemePicker: () => setThemePicker(false),
    prompt, openPrompt: opts => setPrompt(opts), closePrompt: () => setPrompt(null)
  }), [toast, achievement, caps, pushOverlay, popOverlay, isOverlayOpen, closeTop, palette, themePicker, prompt]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className={`toast${toastMsg ? ' show' : ''}`} role="status">{toastMsg}</div>
      {popups.map(p => {
        const Icon = ACH_ICONS[p.icon] || Award;
        return (
          <div key={p.key} className={`ach-pop${p.out ? ' out' : ''}`} role="status" style={{ '--rc': RARITY[p.rarity] }}>
            <div className="hex"><Icon size="1em" /></div>
            <div><small>Achievement unlocked</small><strong>{p.name}</strong></div>
          </div>
        );
      })}
    </Ctx.Provider>
  );
}

export const useUI = () => useContext(Ctx);

/** Registers an open overlay so Escape closes it and typing pauses underneath. */
export function useOverlay(id, open, close) {
  const ui = useUI();
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return undefined;
    ui.pushOverlay(id, () => closeRef.current());
    return () => ui.popOverlay(id);
  }, [open, id]); // eslint-disable-line react-hooks/exhaustive-deps
}
