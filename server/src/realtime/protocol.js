import crypto from 'node:crypto';
import { z } from 'zod';

export const MAX_PLAYERS = 4;
export const RACE_MODES = ['time', 'words', 'quote', 'custom'];
export const TIME_OPTIONS = [15, 30, 60, 120];
export const WORD_OPTIONS = [10, 25, 50, 100];
export const QUOTE_OPTIONS = ['all', 'short', 'medium', 'long'];
export const CUSTOM_TEXT_MAX = 1000;

// No I, O, 0 or 1, so a code read aloud or off a screen can't be mistyped.
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export function generateRoomCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return code;
}

/** Uppercases and strips spaces or dashes people paste in. Returns null if it can't be a room code. */
export function normalizeRoomCode(raw) {
  if (typeof raw !== 'string') return null;
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return CODE_RE.test(code) ? code : null;
}

const oneOf = values => z.number().int().refine(v => values.includes(v), `Choose one of ${values.join(', ')}.`);

export const settingsSchema = z.object({
  mode: z.enum(RACE_MODES, { errorMap: () => ({ message: 'Choose time, words, quote or custom.' }) }),
  time: oneOf(TIME_OPTIONS).default(60),
  words: oneOf(WORD_OPTIONS).default(25),
  quoteLen: z.enum(QUOTE_OPTIONS).default('all'),
  punctuation: z.boolean().default(false),
  numbers: z.boolean().default(false),
  customText: z.string().max(CUSTOM_TEXT_MAX * 2).default('')
}).transform((s, ctx) => {
  const extras = s.mode === 'time' || s.mode === 'words';
  const customText = s.mode === 'custom' ? s.customText.replace(/\s+/g, ' ').trim().slice(0, CUSTOM_TEXT_MAX) : '';
  if (s.mode === 'custom' && !customText) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Add some text for a custom race.' });
    return z.NEVER;
  }
  return { mode: s.mode, time: s.time, words: s.words, quoteLen: s.quoteLen, punctuation: extras && s.punctuation, numbers: extras && s.numbers, customText };
});

/** How long a race may run. Timed races last exactly their length; text races get a generous cap. */
export function raceLimitSeconds(s) {
  if (s.mode === 'time') return s.time;
  const words = s.mode === 'words' ? s.words : s.mode === 'quote' ? 45 : s.customText.split(' ').length;
  return Math.min(600, Math.max(45, Math.ceil(words * 3)));
}

/** The mode2 label results use elsewhere in Cadence (pb keys, history). */
export const mode2For = s => (s.mode === 'time' ? String(s.time) : s.mode === 'words' ? String(s.words) : '');

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Unknown player.');
const keyStat = z.object({ n: z.number().int().min(0).max(100000), e: z.number().int().min(0).max(100000), ms: z.number().min(0).max(1e8), mc: z.number().int().min(0).max(100000) });

export const finishSchema = z.object({
  wpm: z.number().min(0).max(400),
  raw: z.number().min(0).max(500),
  acc: z.number().min(0).max(100),
  consistency: z.number().min(0).max(100),
  elapsed: z.number().min(0).max(700),
  chars: z.object({ correct: z.number().int().min(0).max(1e5), incorrect: z.number().int().min(0).max(1e5), extra: z.number().int().min(0).max(1e5), missed: z.number().int().min(0).max(1e5) }),
  keyStats: z.record(z.string().regex(/^[a-z0-9]$/), keyStat).refine(o => Object.keys(o).length <= 36).optional().default({})
});

/** Every message a client may send. Anything else is rejected before it reaches room logic. */
export const clientMessages = {
  heartbeat: z.object({ t: z.number().finite().optional() }),
  sync: z.object({}),
  create_room: z.object({ settings: z.unknown(), invite: z.array(objectId).max(MAX_PLAYERS - 1).optional().default([]) }),
  join_room: z.object({ code: z.string().max(20) }),
  leave_room: z.object({}),
  ready: z.object({ ready: z.boolean() }),
  update_settings: z.object({ settings: z.unknown() }),
  start_room: z.object({}),
  cancel_room: z.object({}),
  rematch: z.object({}),
  invite: z.object({ userId: objectId }),
  decline_invite: z.object({ code: z.string().max(20) }),
  progress: z.object({
    progress: z.number().min(0).max(100),
    wpm: z.number().min(0).max(400),
    acc: z.number().min(0).max(100),
    chars: z.number().int().min(0).max(1e5)
  }),
  finish: finishSchema
};

/** Friendly copy for every error code the room layer can send. */
export const ERRORS = {
  BAD_REQUEST: 'That request was not valid.',
  RATE_LIMITED: 'Slow down for a moment and try again.',
  INVALID_CODE: 'Enter a valid room code.',
  ROOM_NOT_FOUND: "This room doesn't exist or has expired.",
  ROOM_RESTARTED: 'This competition ended because the server restarted.',
  ROOM_FULL: 'This room is full.',
  ALREADY_STARTED: 'This competition has already started.',
  NOT_IN_ROOM: "You're not in a room.",
  NOT_HOST: "You don't have permission to do that.",
  WRONG_STATE: "That can't be done right now.",
  NOT_FRIENDS: 'You can only invite friends.',
  ALREADY_IN_ROOM: 'That player is already in this room.',
  INVITE_SELF: "You can't invite yourself.",
  SERVER: 'Something went wrong on the server. Try again.'
};

export class RoomError extends Error {
  constructor(code, message) { super(message || ERRORS[code] || ERRORS.SERVER); this.code = code; }
}
