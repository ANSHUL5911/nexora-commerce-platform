export function NetworkErrorIllustration({ size = 120, className = '' }) {
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
      {/* Reticle grid */}
      <circle cx="60" cy="60" r="42" stroke="#EAE9E5" strokeWidth="1" strokeDasharray="3 3" />
      <circle cx="60" cy="60" r="28" stroke="#EAE9E5" strokeWidth="1" />
      
      {/* Broken Axis */}
      <line x1="18" y1="60" x2="48" y2="60" stroke="#121212" strokeWidth="1.5" />
      <line x1="72" y1="60" x2="102" y2="60" stroke="#121212" strokeWidth="1.5" />
      <line x1="60" y1="18" x2="60" y2="48" stroke="#121212" strokeWidth="1.5" />
      <line x1="60" y1="72" x2="60" y2="102" stroke="#121212" strokeWidth="1.5" />

      {/* Disconnection Warning Node */}
      <rect x="50" y="50" width="20" height="20" rx="2" fill="#FDF2F2" stroke="#9E1C1C" strokeWidth="1.5" />
      <line x1="60" y1="55" x2="60" y2="61" stroke="#9E1C1C" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="60" cy="65" r="1" fill="#9E1C1C" />

      {/* Synchrony pulse indicators */}
      <circle cx="34" cy="60" r="2" fill="#787875" />
      <circle cx="86" cy="60" r="2" fill="#787875" />
    </svg>
  );
}

export default NetworkErrorIllustration;
