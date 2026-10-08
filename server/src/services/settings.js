import { AppSettings, DEFAULT_SETTINGS } from '../models/AdminData.js';

let cache = null;
let cachedAt = 0;
const TTL_MS = 30000;

const merge = doc => ({
  retention: { ...DEFAULT_SETTINGS.retention, ...(doc?.retention || {}) },
  security: { ...DEFAULT_SETTINGS.security, ...(doc?.security || {}) },
  application: { ...DEFAULT_SETTINGS.application, ...(doc?.application || {}) }
});

/** Admin-configurable settings, cached briefly so hot paths (tracking, login) don't hit the database. */
export async function getSettings() {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;
  try {
    cache = merge(await AppSettings.findOne({ key: 'global' }).lean());
    cachedAt = Date.now();
  } catch {
    cache = cache || merge(null);
  }
  return cache;
}

export async function updateSettings(section, patch) {
  const current = await getSettings();
  const next = { ...current[section], ...patch };
  await AppSettings.updateOne({ key: 'global' }, { $set: { [section]: next } }, { upsert: true });
  cache = null;
  return getSettings();
}

export function resetSettingsCache() { cache = null; }
