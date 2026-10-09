/**
 * Connect SRM AP helpers for the browser. The server decides everything that matters
 * (format rules, batch, identity); these only give early, friendly feedback.
 */

export const SRMAP_LOGO_SM = '/brand/connect-srmap-96.webp';
export const SRMAP_LOGO_LG = '/brand/connect-srmap-256.webp';

/**
 * Institutional branding is shown only for an account the server reports as verified.
 * `user` must come from the server (/auth/me or a sign-in response), never from local storage.
 */
export const hasSrmapBranding = user => user?.connections?.srm_ap?.verified === true;

export const srmapBatch = user => (hasSrmapBranding(user) ? user.connections.srm_ap.batchYear ?? null : null);

const LOOSE_REGNO = /^[A-Z]{2}\d{8,16}$/;

/** Light check before sending: an institutional email or something shaped like a register number. */
export function checkIdentifier(raw, emailDomains = ['srmap.edu.in']) {
  const s = String(raw ?? '').trim();
  if (!s) return { ok: false, error: 'Enter your register number or institutional email.' };
  if (s.includes('@')) {
    const email = s.toLowerCase();
    const domain = email.split('@')[1] || '';
    if (!/^[^\s@]+@[^\s@]+$/.test(email) || !emailDomains.includes(domain)) {
      return { ok: false, error: `Use your institutional email (${emailDomains.map(d => `@${d}`).join(' or ')}).` };
    }
    return { ok: true, kind: 'email', value: email };
  }
  const regno = s.replace(/\s+/g, '').toUpperCase();
  if (!LOOSE_REGNO.test(regno)) return { ok: false, error: 'Register numbers look like APXXXXXXXXXXX.' };
  return { ok: true, kind: 'register_number', value: regno };
}

export const batchLabel = year => (year ? `${year} Batch` : '');

export const SRM_DEFAULT_FEMALE_AVATAR = 'https://oursrmap.purlyedit.in/def_female_profile.jpeg';
export const SRM_DEFAULT_MALE_AVATAR = 'https://oursrmap.purlyedit.in/def_male_profile.jpeg';

export function isFemaleGender(gender) {
  return /^(female|f|girl|woman)$/i.test(String(gender || '').trim());
}

export function getDefaultSrmAvatar(gender) {
  return isFemaleGender(gender) ? SRM_DEFAULT_FEMALE_AVATAR : SRM_DEFAULT_MALE_AVATAR;
}

export function cleanSrmPhoto(url, gender) {
  let p = String(url || '').trim();
  if (p) {
    p = p.replace(/uploads\/profile_photos\/(uploads\/profile_photos\/)+/g, 'uploads/profile_photos/');
    p = p.replace(/uploads\/profile_photos\/profiles\//g, 'profiles/');
    if (p.startsWith('http://oursrmap.purlyedit.in/')) {
      p = 'https://oursrmap.purlyedit.in/' + p.slice('http://oursrmap.purlyedit.in/'.length);
    }
  }
  if (!p || p === '0' || p === 'null' || p === 'undefined' || p.includes('default.') || p.includes('avatar.png') || p.endsWith('/uploads/profile_photos/')) {
    return getDefaultSrmAvatar(gender);
  }
  return p;
}
