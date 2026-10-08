/* name, background, accent, sub, text, error */
export const THEMES = [
  ['paper', '#FFFFFF', '#0E9A6C', '#9AA4B4', '#1B2230', '#E0475F'],
  ['ink', '#FFFFFF', '#111318', '#A3A8B1', '#111318', '#E03131'],
  ['snow', '#F7F9FC', '#3B6FE0', '#9AA6BC', '#1C2433', '#E5484D'],
  ['arctic', '#F0F7F8', '#0F9BAA', '#92B1B6', '#183238', '#E63946'],
  ['sky', '#EEF6FF', '#1E88E5', '#93AECB', '#12304F', '#E53950'],
  ['mint cream', '#F1FAF5', '#1F9D74', '#93B5A6', '#17342A', '#D9534F'],
  ['sage', '#E9EFE6', '#5F8A5A', '#9DAA97', '#2C3A2A', '#C2524A'],
  ['lavender', '#F6F3FF', '#7C5CE0', '#ABA2C9', '#2C2442', '#E0466A'],
  ['sakura', '#FFF5F7', '#E0507A', '#C9A3AE', '#4A2A35', '#C0392B'],
  ['bubblegum', '#FFF0F6', '#FF4FA3', '#D3A3BD', '#3B1F2E', '#E5383B'],
  ['peach', '#FFF3EC', '#F2703A', '#D8AF9C', '#3D2620', '#D7263D'],
  ['lemonade', '#FFFBE6', '#D99A00', '#BDB38A', '#3A3420', '#D9472B'],
  ['sandstone', '#F3E9DC', '#B5651D', '#B8A58D', '#3D2F22', '#B83A3A'],
  ['midnight', '#0D1524', '#4FE3A6', '#5E6F8E', '#E3EBF7', '#FF7A93'],
  ['abyss', '#0A0F1A', '#38BDF8', '#475569', '#E2E8F0', '#FB7185'],
  ['ocean', '#0B1E2D', '#2EC4B6', '#4C6B80', '#DCEFF5', '#FF6B6B'],
  ['fjord', '#2B303B', '#88C0D0', '#616E88', '#E5E9F0', '#BF616A'],
  ['slate', '#1F2937', '#A78BFA', '#6B7280', '#F3F4F6', '#F87171'],
  ['graphite', '#1E1F22', '#F2C14E', '#5F6168', '#D9DADC', '#EF5D60'],
  ['carbon', '#121212', '#FFFFFF', '#555A61', '#CFCFCF', '#FF5252'],
  ['forest', '#0F1A14', '#7BD389', '#4E6B58', '#DCEBDD', '#F2727F'],
  ['moss', '#1C2118', '#B5C99A', '#5D6B53', '#E6EBDD', '#E07A5F'],
  ['plum', '#1D1426', '#C77DFF', '#6A5880', '#EADCF7', '#FF6B9A'],
  ['dusk rose', '#191724', '#EBBCBA', '#6E6A86', '#E0DEF4', '#EB6F92'],
  ['sunset', '#2A1B2E', '#FF9E64', '#7A5C7E', '#F8E1D4', '#FF5D73'],
  ['ember', '#1A1210', '#FF7A45', '#6E574F', '#F2E3DA', '#FF4D5E'],
  ['coffee', '#231A15', '#D4A373', '#6B5A4C', '#EFE3D3', '#E76F51'],
  ['amber terminal', '#120D04', '#FFB000', '#6B4E12', '#FFD27A', '#FF5A36'],
  ['matrix', '#000000', '#15FF00', '#1F5A1F', '#C8FFC4', '#FF3B3B'],
  ['cyber', '#0D0221', '#00F0FF', '#4B3C7A', '#E6E1FF', '#FF2A6D'],
  ['neon', '#0B0B12', '#39FF88', '#4A4A66', '#F2F2FF', '#FF2E88'],
  ['contrast', '#000000', '#FFE600', '#8A8A8A', '#FFFFFF', '#FF4040']
];

const hex = h => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const toHex = r => '#' + r.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, t) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
export const rgba = (a, al) => { const A = hex(a); return `rgba(${A[0]},${A[1]},${A[2]},${al})`; };
export const lum = a => { const c = hex(a).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };

export function resolveTheme(name) {
  if (name === 'system') name = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'midnight' : 'paper';
  return THEMES.find(t => t[0] === name) || THEMES[0];
}

function tokens([, bg, acc, sub, text, err]) {
  const dark = lum(bg) < 0.35, shade = mix(text, '#203060', 0.5);
  return {
    '--bg': bg, '--bg-2': mix(bg, text, dark ? 0.05 : 0.03), '--text': text, '--sub': sub, '--dim': mix(sub, bg, 0.5),
    '--accent': acc, '--accent-ink': lum(acc) > 0.45 ? '#111418' : '#FFFFFF', '--accent-soft': rgba(acc, dark ? 0.16 : 0.11),
    '--error': err, '--error-extra': mix(err, bg, 0.4),
    '--glass': rgba(bg, dark ? 0.55 : 0.7), '--glass-strong': rgba(mix(bg, text, dark ? 0.04 : 0), 0.96),
    '--glass-border': rgba(text, dark ? 0.09 : 0.08), '--field': rgba(text, dark ? 0.05 : 0.035), '--hairline': rgba(text, 0.09),
    '--shadow': dark ? '0 18px 60px rgba(0,0,0,.4)' : `0 14px 44px ${rgba(shade, 0.1)}`,
    '--shadow-soft': dark ? '0 6px 24px rgba(0,0,0,.28)' : `0 4px 18px ${rgba(shade, 0.06)}`,
    '--blob-1': acc, '--blob-2': mix(acc, err, 0.5), '--blob-3': mix(sub, acc, 0.4), '--blob-op': dark ? '.24' : '.18',
    '--caret-glow': rgba(acc, 0.45), '--scrim': dark ? 'rgba(0,0,0,.55)' : rgba(text, 0.24),
    'color-scheme': dark ? 'dark' : 'light'
  };
}

export function applyTheme(name) {
  const t = resolveTheme(name), tk = tokens(t), st = document.documentElement.style;
  for (const k in tk) st.setProperty(k, tk[k]);
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', t[1]);
}
