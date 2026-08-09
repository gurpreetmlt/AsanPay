"use client";

const LOGO_SRC = {
  /** Blue "Asan" — light / white backgrounds */
  dark: "/brand/asanpay-logo-dark.svg",
  /** White "Asan" — blue / dark backgrounds */
  light: "/brand/asanpay-logo-light.svg",
} as const;

const TAGLINE = "Payment Made Easy";

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
      <rect x="4" y="4" width="220" height="220" rx="58" fill="#0B2A9A" stroke="#FF8400" strokeWidth="8" />
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

/**
 * YouTube-style: wallet icon holds; AsanPay + tagline slide out from under the icon.
 * No typing — full tagline visible. Soft loop with long still.
 */
export function AsanPayLockup({
  width = 168,
  wordmark = true,
  light = true,
  animate = true,
  showTagline = true,
  className = "",
}: {
  width?: number;
  wordmark?: boolean;
  /** true = white Asan for dark/blue UI */
  light?: boolean;
  animate?: boolean;
  showTagline?: boolean;
  className?: string;
}) {
  const iconSize = Math.round(width * 0.28);
  const fontSize = Math.round(iconSize * 0.5);
  const asanColor = light ? "#FFFFFF" : "#0B2A9A";
  const payColor = light ? "#3BE39A" : "#18B26E";

  if (!wordmark) {
    return (
      <span className={`yt-lockup ${className}`.trim()} aria-label="AsanPay">
        <span className={animate ? "yt-lockup-icon yt-lockup-icon--anim" : "yt-lockup-icon"}>
          <AsanIcon size={iconSize} />
        </span>
      </span>
    );
  }

  return (
    <span
      className={`yt-lockup yt-lockup--row ${animate ? "yt-lockup--anim" : ""} ${className}`.trim()}
      aria-label="AsanPay"
    >
      <span className="yt-lockup-icon">
        <AsanIcon size={iconSize} />
      </span>
      <span className="yt-lockup-reveal">
        <span className="yt-lockup-word" style={{ fontSize }}>
          <span style={{ color: asanColor, fontWeight: 800 }}>Asan</span>
          <span style={{ color: payColor, fontWeight: 800 }}>Pay</span>
        </span>
        {showTagline ? (
          <span className="yt-lockup-tag">
            <span className="yt-lockup-rule" aria-hidden />
            <span className="yt-lockup-tagline">{TAGLINE}</span>
          </span>
        ) : null}
      </span>
    </span>
  );
}
