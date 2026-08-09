"use client";

/** Exact Final Logo assets (wordmark includes AsanPay + tagline). */
const WORDMARK_SRC = {
  /** Blue Asan — light / white backgrounds */
  dark: "/brand/AsanPay-Dark-Logo-Wordmark.svg",
  /** White Asan — blue / dark backgrounds */
  light: "/brand/AsanPay-Light-Logo-Wordmark.svg",
} as const;

const FULL_LOGO_SRC = {
  dark: "/brand/AsanPay-Dark-Logo.svg",
  light: "/brand/AsanPay-Light-Logo.svg",
} as const;

const ICON_SRC = {
  dark: "/brand/AsanPay-Dark-Icon.svg",
  light: "/brand/AsanPay-Light-Icon.svg",
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
      src={FULL_LOGO_SRC[variant]}
      alt="AsanPay"
      width={width}
      height={h}
      className={className}
      style={{ width, height: "auto", maxHeight: h, objectFit: "contain" }}
      draggable={false}
    />
  );
}

/** Wallet mark only — cropped from Final Logo. */
export function AsanIcon({
  size = 36,
  light = true,
}: {
  size?: number;
  /** true = icon for dark/blue UI (same mark; light/dark files match) */
  light?: boolean;
}) {
  const src = light ? ICON_SRC.light : ICON_SRC.dark;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      aria-hidden
      draggable={false}
      style={{ width: size, height: size, display: "block", objectFit: "contain" }}
    />
  );
}

/**
 * YouTube-style mask text reveal: wallet holds; exact Final Logo wordmark
 * (AsanPay + tagline) slides out from under the icon. Tagline stays inside logo bounds.
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
  /** Kept for API compat — Final Logo wordmark always includes the tagline. */
  showTagline?: boolean;
  className?: string;
}) {
  const iconSize = Math.round(width * 0.26);
  const wordW = Math.round(width * 0.78);
  const wordH = Math.round((wordW * 155) / 560);
  const variant = light ? "light" : "dark";

  if (!wordmark) {
    return (
      <span className={`yt-lockup ${className}`.trim()} aria-label="AsanPay">
        <span className={animate ? "yt-lockup-icon yt-lockup-icon--anim" : "yt-lockup-icon"}>
          <AsanIcon size={iconSize} light={light} />
        </span>
      </span>
    );
  }

  return (
    <span
      className={`yt-lockup yt-lockup--row ${animate ? "yt-lockup--anim" : ""} ${className}`.trim()}
      aria-label="AsanPay — Payment Made Easy"
    >
      <span className="yt-lockup-icon">
        <AsanIcon size={iconSize} light={light} />
      </span>
      <span className="yt-lockup-reveal" style={{ width: wordW, height: wordH }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={WORDMARK_SRC[variant]}
          alt=""
          width={wordW}
          height={wordH}
          className="yt-lockup-wordmark"
          draggable={false}
          style={{
            width: wordW,
            height: wordH,
            display: "block",
            objectFit: "contain",
            objectPosition: "left top",
            ...(showTagline ? {} : { clipPath: "inset(0 0 38% 0)" }),
          }}
        />
      </span>
    </span>
  );
}
