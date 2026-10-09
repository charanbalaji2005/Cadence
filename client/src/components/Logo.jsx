import CadenceLogo from './CadenceLogo.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { hasSrmapBranding, SRMAP_LOGO_SM } from '../lib/srmap.js';

/**
 * The app's logo. For accounts the server reports as verified SRM AP students it becomes
 * "Cadence × Connect SRM AP"; everyone else (and signed-out visitors) sees the Cadence mark only.
 */
export default function Logo({ className = 'brand-mark', size = 36, animated = true, plain = false }) {
  const auth = useAuth();
  const mark = <CadenceLogo className={className} size={size} animated={animated} />;
  if (plain || !hasSrmapBranding(auth?.user)) return mark;
  return (
    <span className="brand-combo" role="img" aria-label="Cadence × Connect SRM AP" title="Cadence × Connect SRM AP">
      {mark}
      <span className="brand-combo-x" aria-hidden="true">×</span>
      <img className="brand-combo-srm" src={SRMAP_LOGO_SM} alt="" width={size} height={size} decoding="async" draggable="false" />
    </span>
  );
}
