"use client";

export function AsanPayLogo({
  width = 180,
  variant = "dark",
  className = "",
}: {
  width?: number;
  variant?: "dark" | "light";
  className?: string;
}) {
  const h = Math.round((width * 340) / 1000);
  const wordmark = variant === "light" ? "#ffffff" : "#0B2A9A";
  const tagline = variant === "light" ? "rgba(255,255,255,0.65)" : "#5A6DA8";
  const uid = `admin-${variant}`;
  return (
    <svg
      width={width}
      height={h}
      viewBox="0 0 1000 340"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="AsanPay"
    >
      <defs>
        <linearGradient id={`lbadge-${uid}`} x1="60" y1="50" x2="280" y2="282" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2A5CDD" />
          <stop offset="1" stopColor="#0B2A9A" />
        </linearGradient>
        <linearGradient id={`lwallet-${uid}`} x1="90" y1="120" x2="240" y2="252" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#24CC82" />
          <stop offset="1" stopColor="#11A362" />
        </linearGradient>
        <linearGradient id={`lpay-${uid}`} x1="640" y1="0" x2="850" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#24CC82" />
          <stop offset="1" stopColor="#12B76A" />
        </linearGradient>
      </defs>
      <rect
        x="52"
        y="52"
        width="228"
        height="228"
        rx="62"
        fill={variant === "light" ? "rgba(255,255,255,0.15)" : `url(#lbadge-${uid})`}
        stroke={variant === "light" ? "rgba(255,255,255,0.35)" : "none"}
        strokeWidth="4"
      />
      <rect x="120" y="110" width="96" height="30" rx="8" fill="#ffffff" opacity="0.38" />
      <rect x="94" y="130" width="144" height="112" rx="26" fill={`url(#lwallet-${uid})`} />
      <rect x="94" y="130" width="144" height="30" rx="26" fill="#ffffff" opacity="0.14" />
      <rect x="196" y="168" width="42" height="40" rx="14" fill={variant === "light" ? "rgba(255,255,255,0.25)" : "#0B2A9A"} />
      <circle cx="209" cy="188" r="7" fill="#ffffff" />
      <text x="332" y="180" fontSize="90" fontWeight="700" letterSpacing="-1.5" fill={wordmark} fontFamily="Poppins, sans-serif">
        Asan
        <tspan fill={`url(#lpay-${uid})`}>Pay</tspan>
      </text>
      <text x="336" y="231" fontSize="26.5" fontWeight="500" letterSpacing="5.8" fill={tagline} fontFamily="Poppins, sans-serif">
        Payment Made Easy
      </text>
    </svg>
  );
}

export function AsanIcon({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="52 52 228 228" fill="none" aria-hidden>
      <defs>
        <linearGradient id="admin-ib2" x1="60" y1="50" x2="280" y2="282" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2A5CDD" />
          <stop offset="1" stopColor="#0B2A9A" />
        </linearGradient>
        <linearGradient id="admin-iw2" x1="90" y1="120" x2="240" y2="252" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#24CC82" />
          <stop offset="1" stopColor="#11A362" />
        </linearGradient>
      </defs>
      <rect x="52" y="52" width="228" height="228" rx="62" fill="url(#admin-ib2)" />
      <rect x="120" y="110" width="96" height="30" rx="8" fill="#fff" opacity="0.38" />
      <rect x="94" y="130" width="144" height="112" rx="26" fill="url(#admin-iw2)" />
      <rect x="94" y="130" width="144" height="30" rx="26" fill="#fff" opacity="0.14" />
      <rect x="196" y="168" width="42" height="40" rx="14" fill="#0B2A9A" />
      <circle cx="209" cy="188" r="7" fill="#fff" />
    </svg>
  );
}
