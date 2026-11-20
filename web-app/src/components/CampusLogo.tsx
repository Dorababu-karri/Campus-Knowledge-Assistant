interface CampusLogoProps {
  size?: number;
  className?: string;
}

export default function CampusLogo({ size = 24, className = '' }: CampusLogoProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`inline-block ${className}`}
    >
      <defs>
        <linearGradient id="logoGradPrimary" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#627EEA" />
          <stop offset="0.5" stopColor="#8C65F7" />
          <stop offset="1" stopColor="#00F0FF" />
        </linearGradient>
        <linearGradient id="logoGradSecondary" x1="16" y1="6" x2="16" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8C65F7" />
          <stop offset="1" stopColor="#4C65D6" />
        </linearGradient>
      </defs>

      {/* Hexagonal Shield Foundation */}
      <path
        d="M16 2.5L27 8.5V17.5C27 23.5 22 28.5 16 30C10 28.5 5 23.5 5 17.5V8.5L16 2.5Z"
        stroke="url(#logoGradPrimary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="rgba(98, 126, 234, 0.08)"
      />

      {/* Stylized Knowledge Pages / Prism */}
      <path
        d="M16 8L22 12V20L16 24L10 20V12L16 8Z"
        fill="url(#logoGradSecondary)"
        fillOpacity="0.85"
      />
      
      {/* Central Spine / Light Beam */}
      <path
        d="M16 8V24"
        stroke="#FFFFFF"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      
      {/* Upper Diamond Highlight */}
      <path
        d="M16 8L20 11L16 14L12 11L16 8Z"
        fill="#00F0FF"
        fillOpacity="0.9"
      />
    </svg>
  );
}

