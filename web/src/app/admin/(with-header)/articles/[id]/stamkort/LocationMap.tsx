interface Props {
  country: string | null;
  city: string | null;
}

export default function LocationMap({ country, city }: Props) {
  const label = [city, country].filter(Boolean).join(', ') || 'Unknown location';
  return (
    <svg
      width={84}
      height={84}
      viewBox="0 0 84 84"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label={label}
      style={{ display: 'block', borderRadius: '6px' }}
    >
      <rect width="84" height="84" rx="6" fill="#EDF5F8" />
      {/* ocean */}
      <rect x="0" y="44" width="84" height="40" rx="0" fill="#BFDBFE" opacity="0.4" />
      {/* landmass shapes */}
      <ellipse cx="38" cy="42" rx="26" ry="16" fill="#CBD5E1" />
      <ellipse cx="20" cy="34" rx="11" ry="8"  fill="#CBD5E1" />
      <ellipse cx="62" cy="36" rx="9"  ry="7"  fill="#CBD5E1" />
      <ellipse cx="56" cy="50" rx="8"  ry="5"   fill="#CBD5E1" />
      {/* pin shadow */}
      <ellipse cx="42" cy="52" rx="4" ry="1.5" fill="#000" opacity="0.12" />
      {/* pin stem */}
      <line x1="42" y1="36" x2="42" y2="51" stroke="#D94A43" strokeWidth="2" strokeLinecap="round" />
      {/* pin head */}
      <circle cx="42" cy="32" r="6" fill="#D94A43" />
      <circle cx="42" cy="31" r="2.5" fill="white" opacity="0.85" />
    </svg>
  );
}
