import CadenceLogo from './CadenceLogo.jsx';

export default function Logo({ className = 'brand-mark', size = 36, animated = true }) {
  return <CadenceLogo className={className} size={size} animated={animated} />;
}
