export default function Logo({ className = 'brand-mark' }) {
  return (
    <svg className={className} viewBox="0 0 48 36" aria-hidden="true">
      <rect x="2" y="2" width="44" height="32" rx="9" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M10 21c3.5-7 7.5-7 11 0s7.5 7 11 0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="38.5" cy="11" r="2.2" fill="currentColor" />
    </svg>
  );
}
