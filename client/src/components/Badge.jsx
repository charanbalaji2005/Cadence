import { Lock, Award } from 'lucide-react';
import { RARITY } from '../lib/achievements.js';
import { ACH_ICONS } from '../lib/icons.js';

export default function Badge({ a, locked }) {
  const Icon = locked ? Lock : ACH_ICONS[a.icon] || Award;
  return (
    <div className={`ach${locked ? ' locked' : ''}`} style={{ '--rc': RARITY[a.rarity] }}>
      <div className="hex"><Icon size="1em" /></div>
      <h3>{a.name}</h3>
      <p>{a.desc}</p>
      <span className="rar">{a.rarity}</span>
    </div>
  );
}
