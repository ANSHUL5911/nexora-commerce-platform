export function EmptySearchIllustration({ size = 120, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`nx-illustration ${className}`.trim()}
      aria-hidden="true"
    >
      {/* Ledger coordinate grid */}
      <rect x="24" y="24" width="72" height="72" fill="#F4F3F0" stroke="#EAE9E5" strokeWidth="1" />
      <line x1="24" y1="48" x2="96" y2="48" stroke="#EAE9E5" strokeWidth="1" />
      <line x1="24" y1="72" x2="96" y2="72" stroke="#EAE9E5" strokeWidth="1" />
      <line x1="48" y1="24" x2="48" y2="96" stroke="#EAE9E5" strokeWidth="1" />
      <line x1="72" y1="24" x2="72" y2="96" stroke="#EAE9E5" strokeWidth="1" />

      {/* Optical Focal Lens */}
      <circle cx="56" cy="56" r="24" fill="#FFFFFF" stroke="#121212" strokeWidth="1.5" />
      <circle cx="56" cy="56" r="18" fill="none" stroke="#D1D0CB" strokeWidth="1" strokeDasharray="3 3" />
      
      {/* Loupe Handle */}
      <line x1="73" y1="73" x2="94" y2="94" stroke="#121212" strokeWidth="2.5" strokeLinecap="round" />
      
      {/* Internal Reticle / Crosshair */}
      <line x1="50" y1="56" x2="62" y2="56" stroke="#787875" strokeWidth="1" />
      <line x1="56" y1="50" x2="56" y2="62" stroke="#787875" strokeWidth="1" />
      <circle cx="56" cy="56" r="1.5" fill="#787875" />
    </svg>
  );
}

export default EmptySearchIllustration;
