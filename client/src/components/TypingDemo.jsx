import { useEffect, useState } from 'react';
import { reduceMotion } from '../lib/format.js';

const LINES = ['practice the hard words on purpose and the easy ones will look after themselves', 'a steady pace beats a frantic burst so watch the next word', 'calm hands type faster than hurried ones'];

/** A small self-typing preview for the login and register pages, typos included. */
export default function TypingDemo() {
  const [s, setS] = useState({ li: 0, pos: 0, wrong: '' });
  useEffect(() => {
    if (reduceMotion()) return undefined;
    let li = 0, pos = 0, wrong = '', typo = -1, t;
    const step = () => {
      const L = LINES[li];
      if (typo === -1) typo = 10 + Math.floor(Math.random() * (L.length - 20));
      let delay = 55 + Math.random() * 70;
      if (wrong) { wrong = ''; delay = 140; }
      else if (pos === typo) { wrong = 'asdfjkl'[Math.floor(Math.random() * 7)]; typo = -2; delay = 380; }
      else if (pos < L.length) { pos++; if (L[pos - 1] === ' ') delay += 40; }
      else { delay = 1600; li = (li + 1) % LINES.length; pos = 0; typo = -1; }
      setS({ li, pos, wrong });
      t = setTimeout(step, delay);
    };
    t = setTimeout(step, 500);
    return () => clearTimeout(t);
  }, []);
  const L = LINES[s.li];
  if (reduceMotion()) return <div className="demo"><span className="t">{LINES[0]}</span></div>;
  return (
    <div className="demo" aria-hidden="true">
      <span className="t">{L.slice(0, s.pos)}</span>
      {s.wrong && <span className="x">{s.wrong}</span>}
      <span className="c" />
      <span className="r">{L.slice(s.pos + s.wrong.length)}</span>
    </div>
  );
}
