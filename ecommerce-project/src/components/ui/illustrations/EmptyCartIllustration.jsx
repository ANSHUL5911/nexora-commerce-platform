export function EmptyCartIllustration({ size = 120, className = '' }) {
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
      {/* Background architectural grid lines */}
      <line x1="20" y1="100" x2="100" y2="100" stroke="#EAE9E5" strokeWidth="1" />
      <line x1="15" y1="35" x2="105" y2="35" stroke="#EAE9E5" strokeWidth="1" strokeDasharray="2 2" />
      <line x1="60" y1="15" x2="60" y2="105" stroke="#EAE9E5" strokeWidth="1" strokeDasharray="2 2" />
      
      {/* Bag Vessel Body */}
      <path
        d="M32 44L38 94C38.5 97 41 99 44 99H76C79 99 81.5 97 82 94L88 44H32Z"
        fill="#F4F3F0"
        stroke="#121212"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      
      {/* Structural Handles */}
      <path
        d="M46 44V32C46 24.268 52.268 18 60 18C67.732 18 74 24.268 74 32V44"
        stroke="#121212"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      
      {/* Architectural Alignment Marks */}
      <circle cx="60" cy="68" r="4" fill="none" stroke="#787875" strokeWidth="1" />
      <line x1="52" y1="68" x2="68" y2="68" stroke="#787875" strokeWidth="1" strokeDasharray="1 2" />
      <line x1="60" y1="60" x2="60" y2="76" stroke="#787875" strokeWidth="1" strokeDasharray="1 2" />
      
      {/* Corner crosshairs */}
      <path d="M28 20V24H32" stroke="#D1D0CB" strokeWidth="1" />
      <path d="M92 20V24H88" stroke="#D1D0CB" strokeWidth="1" />
    </svg>
  );
}

export default EmptyCartIllustration;
