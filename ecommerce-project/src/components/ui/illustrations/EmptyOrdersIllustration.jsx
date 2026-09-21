export function EmptyOrdersIllustration({ size = 120, className = '' }) {
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
      {/* Background register frame */}
      <rect x="26" y="22" width="68" height="76" rx="2" fill="#F4F3F0" stroke="#121212" strokeWidth="1.5" />
      
      {/* Folio spine / binder line */}
      <line x1="36" y1="22" x2="36" y2="98" stroke="#D1D0CB" strokeWidth="1" strokeDasharray="3 2" />

      {/* Ledger Lines */}
      <line x1="44" y1="36" x2="84" y2="36" stroke="#121212" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="44" y1="48" x2="74" y2="48" stroke="#D1D0CB" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="44" y1="58" x2="80" y2="58" stroke="#D1D0CB" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="44" y1="68" x2="68" y2="68" stroke="#D1D0CB" strokeWidth="1.5" strokeLinecap="round" />

      {/* Archival Seal */}
      <circle cx="72" cy="82" r="8" fill="#FFFFFF" stroke="#787875" strokeWidth="1" />
      <circle cx="72" cy="82" r="5" fill="none" stroke="#787875" strokeWidth="0.75" strokeDasharray="1 1" />
      
      {/* Alignment tick marks */}
      <path d="M20 22H24V26" stroke="#787875" strokeWidth="1" />
      <path d="M100 98H96V94" stroke="#787875" strokeWidth="1" />
    </svg>
  );
}

export default EmptyOrdersIllustration;
