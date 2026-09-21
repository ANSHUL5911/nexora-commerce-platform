export function NotFoundIllustration({ size = 120, className = '' }) {
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
      {/* Azimuth / Compass Dial */}
      <circle cx="60" cy="60" r="44" stroke="#121212" strokeWidth="1.5" />
      <circle cx="60" cy="60" r="38" stroke="#D1D0CB" strokeWidth="1" strokeDasharray="1 3" />
      <circle cx="60" cy="60" r="24" fill="#F4F3F0" stroke="#EAE9E5" strokeWidth="1" />
      
      {/* North / South / East / West tick marks */}
      <line x1="60" y1="12" x2="60" y2="20" stroke="#121212" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="60" y1="100" x2="60" y2="108" stroke="#787875" strokeWidth="1" strokeLinecap="round" />
      <line x1="12" y1="60" x2="20" y2="60" stroke="#787875" strokeWidth="1" strokeLinecap="round" />
      <line x1="100" y1="60" x2="108" y2="60" stroke="#787875" strokeWidth="1" strokeLinecap="round" />

      {/* Uncharted Needle / Coordinate Pointer */}
      <polygon points="60,34 65,60 60,56 55,60" fill="#121212" stroke="#121212" strokeWidth="1" />
      <polygon points="60,86 65,60 60,64 55,60" fill="#FFFFFF" stroke="#787875" strokeWidth="1" />
      <circle cx="60" cy="60" r="2.5" fill="#121212" />

      {/* Cardinal N */}
      <text x="60" y="30" fontFamily="monospace" fontSize="8" fill="#121212" textAnchor="middle" fontWeight="bold">N</text>
    </svg>
  );
}

export default NotFoundIllustration;
