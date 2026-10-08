import { rand } from './format.js';

export const WORDS = ('the be of and a to in he have it that for they with as not on she at by this we you do but from or which one would all will there say who make when can more if no man out other so what time up go about than into could state only new year some take come these know see use get like then first any work now may such give over think most even find day also after way many must look before great back through long where much should well people down own just because good each those feel seem how high too place little world very still nation hand old life tell write become here show house both between need mean call develop under last right move thing general school never same another begin while number part turn real leave might want point form off child few small since against ask late home interest large person end open public follow during present without again hold govern around possible head consider word program problem however lead system set order eye plan run keep face fact group play stand increase early course change help line').split(' ');

export const QUOTES = [
  'Good habits are quiet. You only hear them when they are missing.',
  'Look at the screen, trust your fingers, and breathe between sentences.',
  'Practice the hard words on purpose. The easy ones will look after themselves.',
  'A steady pace beats a frantic burst. Watch the next word, not the last one you missed.',
  'Speed is a side effect of calm hands. Slow down until the rhythm is steady, then let the rhythm carry you.',
  'Every key you press is a small decision. Make enough good ones in a row and they stop feeling like decisions at all.',
  'The fastest typists are not the ones who never make mistakes; they are the ones who recover before anyone notices that anything went wrong.',
  'Progress rarely arrives in a single leap. It shows up as one more word per minute, again and again, until the old record looks small and you wonder why it ever felt hard.'
];
export const quoteLen = q => (q.length <= 90 ? 'short' : q.length <= 140 ? 'medium' : 'long');

export function genWords(n, ctx, { punctuation, numbers }) {
  const out = [];
  for (let i = 0; i < n; i++) {
    let w = rand(WORDS);
    while (w === ctx.prev) w = rand(WORDS);
    ctx.prev = w;
    if (numbers && Math.random() < 0.12) w = String(Math.floor(Math.random() * (Math.random() < 0.5 ? 100 : 10000)));
    if (punctuation) {
      if (ctx.cap && /^[a-z]/.test(w)) w = w[0].toUpperCase() + w.slice(1);
      ctx.cap = false;
      const r = Math.random();
      if (r < 0.09) { w += '.'; ctx.cap = true; }
      else if (r < 0.15) w += ',';
      else if (r < 0.17) { w += '?'; ctx.cap = true; }
      else if (r < 0.185) { w += '!'; ctx.cap = true; }
      else if (r < 0.2) w += ';';
      else if (r < 0.215) w = `"${w}"`;
      else if (r < 0.225) w = `(${w})`;
    }
    out.push(w);
  }
  return out;
}

/** Builds a practice text weighted toward the given weak keys. */
export function practiceText(weak) {
  const pool = WORDS.filter(w => weak.some(k => w.includes(k)));
  const scored = pool.map(w => ({ w, s: weak.reduce((a, k) => a + (w.split(k).length - 1), 0) + Math.random() })).sort((a, b) => b.s - a.s);
  const pick = scored.slice(0, Math.max(30, Math.min(60, scored.length)));
  return Array.from({ length: 40 }, () => rand(pick).w).join(' ');
}
