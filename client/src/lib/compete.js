import { local } from './format.js';

export const MAX_PLAYERS = 4;
export const TIME_OPTIONS = [15, 30, 60, 120];
export const WORD_OPTIONS = [10, 25, 50, 100];
export const QUOTE_OPTIONS = ['all', 'short', 'medium', 'long'];
export const CUSTOM_TEXT_MAX = 1000;
export const DEFAULT_ROOM_SETTINGS = { mode: 'time', time: 60, words: 25, quoteLen: 'all', punctuation: false, numbers: false, customText: '' };
export const ACTIVE_STATUS = new Set(['WAITING', 'COUNTDOWN', 'RUNNING']);

// Same alphabet the server uses: no I, O, 0 or 1.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const cleanCode = raw => [...String(raw).toUpperCase()].filter(c => CODE_ALPHABET.includes(c)).join('').slice(0, 6);
export const isRoomCode = c => c.length === 6 && [...c].every(ch => CODE_ALPHABET.includes(ch));

export const inviteLink = code => `${window.location.origin}/compete/join/${code}`;

const SETTINGS_KEY = 'cadence:room-settings';
export const savedRoomSettings = () => ({ ...DEFAULT_ROOM_SETTINGS, ...local.get(SETTINGS_KEY, {}) });
export const saveRoomSettings = s => local.set(SETTINGS_KEY, s);

/** "time 60s, punctuation" style summary of a room's settings. */
export function settingsSummary(s) {
  if (!s) return '';
  const head = s.mode === 'time' ? `${s.time} seconds` : s.mode === 'words' ? `${s.words} words` : s.mode === 'quote' ? `${s.quoteLen === 'all' ? 'any' : s.quoteLen} quote` : 'custom text';
  return [head, s.punctuation && 'punctuation', s.numbers && 'numbers'].filter(Boolean).join(', ');
}
export const modeLabel = m => ({ time: 'Time', words: 'Words', quote: 'Quote', custom: 'Custom' }[m] || m);

/** The engine config for a race: same text for everyone from the shared seed. */
export function raceCfg(room) {
  const s = room.settings;
  return { mode: s.mode, time: s.time, words: s.words, quoteLen: s.quoteLen, punctuation: s.punctuation, numbers: s.numbers, customText: s.customText, customLabel: 'custom race', seed: room.seed, race: true };
}

export const ordinal = n => n + (['st', 'nd', 'rd'][((n + 90) % 100 - 10) % 10 - 1] || 'th');
export const fmtClock = sec => { const s = Math.max(0, Math.ceil(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
