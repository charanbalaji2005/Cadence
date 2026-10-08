import { useState } from 'react';
import { nameColor } from '../lib/format.js';

export default function Avatar({ name, url, size = '' }) {
  const [broken, setBroken] = useState(false);
  const initial = (String(name || '?')[0] || '?').toUpperCase();
  return (
    <span className={`avatar ${size}`} style={{ background: nameColor(name), color: '#fff' }}>
      <span>{initial}</span>
      {url && !broken && <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />}
    </span>
  );
}
