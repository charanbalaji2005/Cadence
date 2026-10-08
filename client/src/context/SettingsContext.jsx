import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { applyTheme } from '../lib/themes.js';
import { local } from '../lib/format.js';
import { api } from '../lib/api.js';
import { useAuth } from './AuthContext.jsx';

export const DEFAULT_SETTINGS = {
  theme: 'paper', glow: false, fontSize: 'medium', anim: 'lift', caret: 'line', smoothCaret: true,
  liveSpeed: true, liveAcc: false, quickRestart: true, stopOnError: false, confidence: false,
  capsWarning: true, sound: 'off', pace: 'off', paceWpm: 80, dailyGoal: 10
};
export const DEFAULT_CFG = { mode: 'time', time: 60, words: 25, quoteLen: 'all', punctuation: false, numbers: false, customText: 'The quick brown fox jumps over the lazy dog.', customLabel: '' };
const SIZES = { small: 'clamp(1.1rem, .95rem + 1vw, 1.5rem)', medium: 'clamp(1.25rem, 1rem + 1.4vw, 1.9rem)', large: 'clamp(1.4rem, 1.1rem + 1.8vw, 2.4rem)' };

const Ctx = createContext(null);

export function SettingsProvider({ children }) {
  const auth = useAuth();
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, ...local.get('tf:settings', {}) }));
  const [cfg, setCfgState] = useState(() => ({ ...DEFAULT_CFG, ...local.get('tf:config', {}) }));
  const syncReady = useRef(false);

  // Apply look-and-feel settings to the document.
  useEffect(() => {
    applyTheme(settings.theme);
    const root = document.documentElement, body = document.body;
    root.style.setProperty('--type-size', SIZES[settings.fontSize] || SIZES.medium);
    body.classList.toggle('smooth', !!settings.smoothCaret);
    body.classList.toggle('glow', !!settings.glow);
    body.dataset.anim = settings.anim;
    local.set('tf:settings', settings);
  }, [settings]);
  useEffect(() => { local.set('tf:config', cfg); }, [cfg]);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const fn = () => { if (settings.theme === 'system') applyTheme('system'); };
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [settings.theme]);

  // When someone signs in, their saved settings follow them to this device.
  useEffect(() => {
    syncReady.current = false;
    if (auth.user && auth.serverSettings && Object.keys(auth.serverSettings).length) {
      setSettings(s => ({ ...s, ...pickKnown(auth.serverSettings) }));
    }
    const t = setTimeout(() => { syncReady.current = true; }, 0);
    return () => clearTimeout(t);
  }, [auth.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save settings to the account, debounced.
  useEffect(() => {
    if (!auth.user || !syncReady.current) return;
    const t = setTimeout(() => { api('/me/settings', { method: 'PUT', body: { settings } }).catch(() => {}); }, 800);
    return () => clearTimeout(t);
  }, [settings, auth.user]);

  const setSetting = useCallback((k, v) => setSettings(s => ({ ...s, [k]: v })), []);
  const resetSettings = useCallback(() => setSettings({ ...DEFAULT_SETTINGS }), []);
  const setCfg = useCallback(patch => setCfgState(c => ({ ...c, ...patch })), []);

  const value = useMemo(() => ({ settings, setSetting, resetSettings, cfg, setCfg }), [settings, setSetting, resetSettings, cfg, setCfg]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function pickKnown(o) {
  const out = {};
  for (const k in DEFAULT_SETTINGS) if (k in o && typeof o[k] === typeof DEFAULT_SETTINGS[k]) out[k] = o[k];
  return out;
}

export const useSettings = () => useContext(Ctx);
