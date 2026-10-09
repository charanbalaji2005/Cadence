import { IntegrationConfig } from '../../models/IntegrationConfig.js';
import { config } from '../../config.js';
import { seal, open, canSeal, hint } from '../../utils/secretBox.js';

const KEY = 'srm_ap';
const TTL_MS = 30000;
let cache = null;
let cachedAt = 0;

export async function getSrmapSettings() {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;
  let doc = null;
  try { doc = await IntegrationConfig.findOne({ key: KEY }).select('+apiKeySealed').lean(); } catch { /* database not ready: env only */ }
  const savedKey = doc?.apiKeySealed ? open(doc.apiKeySealed) : '';
  const env = config.srmap;
  cache = {
    enabled: typeof doc?.enabled === 'boolean' ? doc.enabled : env.enabled,
    directoryUrl: doc?.directoryUrl ?? env.directoryUrl,
    verifyUrl: doc?.verifyUrl ?? env.verifyUrl,
    allowDirectoryVerify: typeof doc?.allowDirectoryVerify === 'boolean' ? doc.allowDirectoryVerify : (env.allowDirectoryVerify ?? true),
    apiKey: savedKey || env.apiKey,
    apiKeySource: savedKey ? 'admin' : env.apiKey ? 'env' : 'none',
    apiKeyHint: savedKey ? (doc.apiKeyHint || hint(savedKey)) : hint(env.apiKey),
    // A key was saved but can't be opened (encryption key changed or missing).
    apiKeyUnreadable: !!doc?.apiKeySealed && !savedKey,
    apiKeyHeader: env.apiKeyHeader,
    timeoutMs: env.timeoutMs,
    emailDomains: env.emailDomains,
    regnoPattern: env.regnoPattern,
    batchYears: env.batchYears,
    lastTest: doc?.lastTest?.at ? doc.lastTest : null,
    updatedAt: doc?.updatedAt || null
  };
  cachedAt = Date.now();
  return cache;
}

export function resetSrmapSettingsCache() { cache = null; }

const isHttps = u => { try { const x = new URL(u); return x.protocol === 'https:' || (!config.isProd && x.protocol === 'http:'); } catch { return false; } };

export const NO_AUTH_PROVIDER_MESSAGE = 'Directory API available; student authentication provider not configured';

// The known SRM AP directory script. It looks students up; it has no credential-verification operation.
const DIRECTORY_SCRIPT = /\/typingmaster_connectsrmap_api\.php$/i;
const endpointOf = u => { try { const x = new URL(u); return `${x.origin}${x.pathname}`.toLowerCase(); } catch { return ''; } };

// The same script's `action=verify` checks the password on the SRM AP server (password_verify) and answers
// with the documented verification contract, so that URL is a real verifier (docs/php/typingmaster_connectsrmap_api.php).
export const isVerifyAction = u => { try { return new URL(u).searchParams.get('action') === 'verify'; } catch { return false; } };

/** True when the "verification" URL is really a directory lookup (get_student / list_students), which can never prove identity. */
export function isDirectoryEndpoint(verifyUrl, directoryUrl) {
  const v = endpointOf(verifyUrl);
  if (!v) return false;
  if (isVerifyAction(verifyUrl)) return false;
  return DIRECTORY_SCRIPT.test(v) || (!!directoryUrl && v === endpointOf(directoryUrl));
}

/**
 * Whether student sign-in can work. It needs a credential-verification endpoint: directory lookups alone
 * never prove who someone is, so without one (or with the directory API set in its place) sign-in stays off.
 */
export function readiness(s) {
  const verifyIsDirectory = isDirectoryEndpoint(s.verifyUrl, s.directoryUrl);
  const verifyConfigured = !!s.verifyUrl && isHttps(s.verifyUrl) && (!verifyIsDirectory || s.allowDirectoryVerify === true);
  const directoryConfigured = !!s.directoryUrl && isHttps(s.directoryUrl);
  const checks = [
    { key: 'enabled', ok: !!s.enabled, label: 'Integration switched on' },
    {
      key: 'verifyUrl', ok: verifyConfigured,
      label: verifyIsDirectory && !s.allowDirectoryVerify
        ? 'Identity verification endpoint: the directory API is set here, but it cannot verify credentials'
        : 'Identity verification endpoint (HTTPS)'
    },
    { key: 'apiKey', ok: !!s.apiKey, label: s.apiKeyUnreadable ? 'API key saved but unreadable (check INTEGRATION_ENCRYPTION_KEY)' : 'Server API key' }
  ];
  const ready = checks.every(c => c.ok);
  const providerStatus = ready ? { code: 'ready', message: 'Student verification service configured.' }
    : !verifyConfigured && directoryConfigured ? { code: 'directory_only', message: NO_AUTH_PROVIDER_MESSAGE }
    : !verifyConfigured ? { code: 'not_configured', message: 'No SRM AP student authentication provider configured.' }
    : !s.enabled ? { code: 'disabled', message: 'Connect SRM AP is switched off.' }
    : { code: 'incomplete', message: 'Connect SRM AP setup is incomplete.' };
  return { ready, checks, directoryConfigured, verifyConfigured, verifyIsDirectory, providerStatus };
}

/** What the sign-in modal needs to know. No URLs or secrets. */
export async function publicConfig() {
  const s = await getSrmapSettings();
  const r = readiness(s);
  return {
    enabled: s.enabled,
    ready: r.ready,
    passwordRequired: true,
    emailDomains: s.emailDomains,
    message: !s.enabled ? 'Connect SRM AP is turned off right now.'
      : !r.ready ? 'Connect SRM AP sign-in is not available yet. SRM AP has not provided a student verification service. Use another sign-in method for now.' : ''
  };
}

/** Admin view: secrets masked, never returned. */
export function adminView(s) {
  return {
    enabled: s.enabled,
    directoryUrl: s.directoryUrl || '',
    verifyUrl: s.verifyUrl || '',
    apiKey: { set: !!s.apiKey, source: s.apiKeySource, hint: s.apiKeyHint, unreadable: s.apiKeyUnreadable },
    canStoreSecrets: canSeal(),
    apiKeyHeader: s.apiKeyHeader,
    timeoutMs: s.timeoutMs,
    emailDomains: s.emailDomains,
    lastTest: s.lastTest,
    updatedAt: s.updatedAt
  };
}

/**
 * Saves admin changes. apiKey: a string replaces the saved key, '' removes it (falling back to the env var),
 * undefined leaves it alone. Returns the list of changed field names (never values) for the audit log.
 */
export async function updateSrmapSettings(patch, actor) {
  const $set = { updatedBy: actor?._id };
  const $unset = {};
  const changed = [];
  for (const k of ['enabled', 'directoryUrl', 'verifyUrl']) {
    if (patch[k] === undefined) continue;
    // An empty URL removes the override, so the environment variable applies again.
    if (patch[k] === '') $unset[k] = 1; else $set[k] = patch[k];
    changed.push(k);
  }
  if (patch.apiKey !== undefined) {
    if (patch.apiKey === '') { $unset.apiKeySealed = 1; $set.apiKeyHint = ''; }
    else { $set.apiKeySealed = seal(patch.apiKey); $set.apiKeyHint = hint(patch.apiKey); }
    changed.push('apiKey');
  }
  await IntegrationConfig.updateOne({ key: KEY }, { $set, ...(Object.keys($unset).length ? { $unset } : {}) }, { upsert: true });
  resetSrmapSettingsCache();
  return changed;
}

export async function saveLastTest(result) {
  await IntegrationConfig.updateOne({ key: KEY }, { $set: { lastTest: { ...result, at: new Date() } } }, { upsert: true });
  resetSrmapSettingsCache();
}
