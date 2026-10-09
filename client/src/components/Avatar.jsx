import { useState, useEffect } from 'react';
import { nameColor } from '../lib/format.js';

function cleanUrl(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let u = raw.trim()
    .replace(/uploads\/profile_photos\/profiles\//g, 'profiles/')
    .replace(/uploads\/profile_photos\/(uploads\/profile_photos\/)+/g, 'uploads/profile_photos/');
  if (u.startsWith('http://oursrmap.purlyedit.in/')) {
    u = 'https://oursrmap.purlyedit.in/' + u.slice('http://oursrmap.purlyedit.in/'.length);
  }
  return u;
}

export default function Avatar({ name, url, fallbackUrl, size = '' }) {
  const [broken, setBroken] = useState(false);
  const [triedFallback, setTriedFallback] = useState(false);

  useEffect(() => {
    setBroken(false);
    setTriedFallback(false);
  }, [url, fallbackUrl]);

  const cleaned = cleanUrl(url);
  const isSrm = cleaned.includes('oursrmap.purlyedit.in');
  const resolvedFallback = fallbackUrl || (isSrm ? 'https://oursrmap.purlyedit.in/def_male_profile.jpeg' : null);

  const currentSrc = !broken ? (triedFallback && resolvedFallback ? resolvedFallback : cleaned) : null;

  const handleError = () => {
    if (resolvedFallback && !triedFallback && cleaned !== resolvedFallback) {
      setTriedFallback(true);
    } else {
      setBroken(true);
    }
  };

  const initial = (String(name || '?')[0] || '?').toUpperCase();
  return (
    <span className={`avatar ${size}`} style={{ background: nameColor(name), color: '#fff' }}>
      <span>{initial}</span>
      {currentSrc && (
        <img
          src={currentSrc}
          alt=""
          referrerPolicy="no-referrer"
          onError={handleError}
        />
      )}
    </span>
  );
}
