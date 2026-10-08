import crypto from 'node:crypto';

/**
 * Request facts for logs and analytics, derived without fingerprinting:
 * a coarse device/browser/OS from the user agent and an approximate country.
 */
export function parseUserAgent(ua = '') {
  const s = String(ua);
  const browser = /Edg(e|A|iOS)?\//.test(s) ? 'Edge'
    : /OPR\/|Opera/.test(s) ? 'Opera'
      : /SamsungBrowser/.test(s) ? 'Samsung Internet'
        : /Firefox\/|FxiOS/.test(s) ? 'Firefox'
          : /Chrome\/|CriOS/.test(s) ? 'Chrome'
            : /Safari\//.test(s) ? 'Safari' : 'Other';
  const os = /Windows/.test(s) ? 'Windows'
    : /Android/.test(s) ? 'Android'
      : /iPhone|iPad|iPod/.test(s) ? 'iOS'
        : /CrOS/.test(s) ? 'ChromeOS'
          : /Mac OS X|Macintosh/.test(s) ? 'macOS'
            : /Linux/.test(s) ? 'Linux' : 'Other';
  const device = /iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(s) ? 'Tablet'
    : /Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(s) ? 'Mobile' : 'Desktop';
  const bot = /bot\b|bot\/|crawl|spider|slurp|HeadlessChrome|facebookexternalhit|Lighthouse|preview|curl\/|wget|python-requests|node-fetch|axios/i.test(s);
  return { browser, os, device, bot };
}

/** Client IP as seen through the configured proxy (app.set('trust proxy', 1)). */
export const clientIp = req => String(req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '').slice(0, 64);

/**
 * Approximate country. Prefers a CDN/proxy header when one is present, otherwise the
 * region of the browser's preferred language (en-IN -> IN). Never more precise than a country.
 */
export function approxCountry(req, locale) {
  const header = req.get?.('cf-ipcountry') || req.get?.('x-vercel-ip-country') || req.get?.('x-country-code') || '';
  if (/^[A-Z]{2}$/.test(header) && header !== 'XX' && header !== 'T1') return header;
  const lang = locale || String(req.get?.('accept-language') || '').split(',')[0];
  const m = /^[a-z]{2,3}[-_]([A-Z]{2})\b/i.exec(lang.trim());
  return m ? m[1].toUpperCase() : '';
}

/** Facts about the current request, ready to store on sessions and events. */
export function requestFacts(req, locale) {
  const ua = String(req.get?.('user-agent') || '').slice(0, 300);
  const { browser, os, device, bot } = parseUserAgent(ua);
  return { ip: clientIp(req), userAgent: ua, browser, os, device, bot, country: approxCountry(req, locale) };
}

/** ch****@gmail.com: enough to recognise, not enough to harvest. */
export function maskEmail(email = '') {
  const [local, domain] = String(email).split('@');
  if (!domain) return local ? `${local.slice(0, 2)}****` : '';
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(2, Math.min(6, local.length - 2)))}@${domain}`;
}

/** 1234****6789 style masking for long identifiers. */
export function maskMiddle(v = '', keep = 4) {
  const s = String(v);
  return s.length <= keep * 2 ? s : `${s.slice(0, keep)}****${s.slice(-keep)}`;
}

/** One-way, so failed-login attempts for unknown emails can be counted without storing the address. */
export const hashIdentifier = v => crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex').slice(0, 32);

const SECRET_PATTERNS = [
  [/(authorization|cookie|password|passwd|secret|token|api[_-]?key|session)(["'\s:=]+)[^\s"',;}]+/gi, '$1$2[redacted]'],
  [/\b[A-Za-z0-9_-]{32,}\b/g, '[redacted]'],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, m => maskEmail(m)],
  [/mongodb(\+srv)?:\/\/[^\s"']+/gi, 'mongodb://[redacted]']
];
/** Removes secrets, tokens and emails from text before it is stored in error logs. */
export function scrub(text = '', max = 2000) {
  let s = String(text);
  for (const [re, rep] of SECRET_PATTERNS) s = s.replace(re, rep);
  return s.slice(0, max);
}
