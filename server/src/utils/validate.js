import { z } from 'zod';

export const usernameSchema = z.string().trim().regex(/^[A-Za-z0-9_]{3,16}$/, 'Usernames use 3 to 16 letters, numbers or underscores.');
export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address, like you@example.com.').max(254);
export const passwordSchema = z.string().min(8, 'Passwords need at least 8 characters.').max(200, 'Passwords can be at most 200 characters.');

export const registerSchema = z.object({ username: usernameSchema, email: emailSchema, password: passwordSchema, remember: z.boolean().optional().default(true) });
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, 'Enter your password.').max(200), remember: z.boolean().optional().default(true) });
export const googleSchema = z.object({ credential: z.string().min(10).max(5000), remember: z.boolean().optional().default(true) });

const keyStat = z.object({ n: z.number().int().min(0).max(100000), e: z.number().int().min(0).max(100000), ms: z.number().min(0).max(1e8), mc: z.number().int().min(0).max(100000) });

export const resultSchema = z.object({
  wpm: z.number().min(0).max(400),
  raw: z.number().min(0).max(500),
  acc: z.number().min(0).max(100),
  consistency: z.number().min(0).max(100),
  mode: z.enum(['time', 'words', 'quote', 'zen', 'custom']),
  mode2: z.string().max(10).regex(/^\d*$/).default(''),
  language: z.enum(['english', 'english 1k', 'english advanced']).default('english'),
  punctuation: z.boolean().default(false),
  numbers: z.boolean().default(false),
  elapsed: z.number().min(1).max(4 * 3600),
  chars: z.object({ correct: z.number().int().min(0), incorrect: z.number().int().min(0), extra: z.number().int().min(0), missed: z.number().int().min(0) }),
  keyStats: z.record(z.string().regex(/^[a-z0-9]$/), keyStat).optional().default({}),
  date: z.number().optional(),
  clientId: z.string().uuid().optional()
});
// Each imported result is validated on its own so one bad entry doesn't block the rest.
export const importSchema = z.object({ results: z.array(z.unknown()).max(500) });
export const settingsSchema = z.object({ settings: z.record(z.string().max(40), z.union([z.string().max(60), z.number(), z.boolean()])).refine(o => Object.keys(o).length <= 40, 'Too many settings.') });
export const profileSchema = z.object({ username: usernameSchema });

/** Parses input with a zod schema; responds 400 with the first readable message on failure. */
export function parse(schema, data, res) {
  const r = schema.safeParse(data ?? {});
  if (!r.success) { res.status(400).json({ error: r.error.issues[0]?.message || 'Invalid request.' }); return null; }
  return r.data;
}
