export function EmptyAdminIllustration({ size = 120, className = '' }) {
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
      {/* Console frame */}
      <rect x="20" y="26" width="80" height="68" rx="2" fill="#F4F3F0" stroke="#121212" strokeWidth="1.5" />
      <line x1="20" y1="42" x2="100" y2="42" stroke="#121212" strokeWidth="1" />
      
      {/* Console title dots */}
      <circle cx="28" cy="34" r="2" fill="#121212" />
      <circle cx="36" cy="34" r="2" fill="#787875" />
      <circle cx="44" cy="34" r="2" fill="#D1D0CB" />
      
      {/* Table grid columns */}
      <line x1="45" y1="42" x2="45" y2="94" stroke="#EAE9E5" strokeWidth="1" />
      <line x1="75" y1="42" x2="75" y2="94" stroke="#EAE9E5" strokeWidth="1" />

      {/* Row skeletons */}
      <line x1="28" y1="54" x2="92" y2="54" stroke="#EAE9E5" strokeWidth="1" strokeDasharray="2 2" />
      <line x1="28" y1="68" x2="92" y2="68" stroke="#EAE9E5" strokeWidth="1" strokeDasharray="2 2" />
      <line x1="28" y1="82" x2="92" y2="82" stroke="#EAE9E5" strokeWidth="1" strokeDasharray="2 2" />

      {/* Center status badge */}
      <rect x="48" y="60" width="24" height="12" rx="1" fill="#FFFFFF" stroke="#787875" strokeWidth="1" />
      <circle cx="54" cy="66" r="2" fill="#787875" />
      <line x1="59" y1="66" x2="68" y2="66" stroke="#787875" strokeWidth="1" />
    </svg>
  );
}

export default EmptyAdminIllustration;
