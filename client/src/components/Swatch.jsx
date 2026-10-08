import { rgba } from '../lib/themes.js';

export default function Swatch({ t }) {
  return (
    <span className="swatch" style={{ background: t[1], boxShadow: `inset 0 0 0 1px ${rgba(t[4], 0.12)}` }}>
      <i style={{ background: t[2] }} /><i style={{ background: t[3] }} /><i style={{ background: t[4] }} />
    </span>
  );
}
