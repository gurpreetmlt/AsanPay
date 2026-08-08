"use client";

const LOGO_SRC = {
  /** Blue "Asan" — use on light / white backgrounds */
  dark: "/brand/asanpay-logo-dark.png",
  /** White "Asan" — use on blue / dark backgrounds */
  light: "/brand/asanpay-logo-light.png",
} as const;

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
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LOGO_SRC[variant]}
      alt="AsanPay"
      width={width}
      height={h}
      className={className}
      style={{ width, height: "auto", maxHeight: h, objectFit: "contain" }}
      draggable={false}
    />
  );
}

/** Wallet mark only — matches brand icon (collapsed sidebar). */
export function AsanIcon({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 228 228" fill="none" aria-hidden>
      <rect x="4" y="4" width="220" height="220" rx="58" fill="#0B2A9A" stroke="#F5A623" strokeWidth="8" />
      <rect x="68" y="58" width="92" height="28" rx="8" fill="#ffffff" opacity="0.38" />
      <rect x="42" y="78" width="144" height="112" rx="26" fill="#24CC82" />
      <rect x="42" y="78" width="144" height="30" rx="26" fill="#ffffff" opacity="0.14" />
      <text
        x="78"
        y="155"
        fill="#ffffff"
        fontSize="72"
        fontWeight="700"
        fontFamily="Poppins, system-ui, sans-serif"
      >
        ₹
      </text>
      <rect x="148" y="116" width="42" height="40" rx="14" fill="#0B2A9A" />
      <circle cx="161" cy="136" r="7" fill="#ffffff" />
    </svg>
  );
}
