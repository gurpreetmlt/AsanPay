"use client";

import { useEffect, useState } from "react";

const LOGO_SRC = {
  /** Blue "Asan" — light / white backgrounds */
  dark: "/brand/asanpay-logo-dark.svg",
  /** White "Asan" — blue / dark backgrounds */
  light: "/brand/asanpay-logo-light.svg",
} as const;

const TAGLINE = "Payment Made Easy";
/** Full logo loop — long still in the middle */
const LOGO_LOOP_MS = 5600;

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

function TypeTagline({ cycle }: { cycle: number }) {
  const [n, setN] = useState(0);

  useEffect(() => {
    setN(0);
    let intervalId: number | undefined;
    const start = window.setTimeout(() => {
      let i = 0;
      intervalId = window.setInterval(() => {
        i += 1;
        setN(i);
        if (i >= TAGLINE.length && intervalId !== undefined) window.clearInterval(intervalId);
      }, 48);
    }, 900);
    return () => {
      window.clearTimeout(start);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [cycle]);

  return (
    <span className="yt-tagline" aria-label={TAGLINE}>
      {TAGLINE.slice(0, n)}
      {n < TAGLINE.length ? <span className="yt-tagline-caret">|</span> : null}
    </span>
  );
}

/** Tagline sits under wordmark only (not under wallet icon) — Final-Logo alignment. */
function TaglineBlock({
  cycle,
  animate,
}: {
  cycle: number;
  animate: boolean;
}) {
  return (
    <span className="yt-tagline-block">
      <span className="yt-tagline-rule" aria-hidden />
      {animate ? <TypeTagline cycle={cycle} /> : <span className="yt-tagline">{TAGLINE}</span>}
    </span>
  );
}

/**
 * Wallet icon + AsanPay column + typed tagline under AsanPay only.
 * Soft in-bounds animation (no translate clip).
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
  const [cycle, setCycle] = useState(0);
  const iconSize = Math.round(width * 0.26);
  const fontSize = Math.round(iconSize * 0.52);
  const asanColor = light ? "#FFFFFF" : "#0B2A9A";
  const payColor = light ? "#3BE39A" : "#18B26E";

  useEffect(() => {
    if (!animate) return;
    const id = window.setInterval(() => setCycle((c) => c + 1), LOGO_LOOP_MS);
    return () => window.clearInterval(id);
  }, [animate]);

  if (!wordmark) {
    return (
      <span className={`yt-final-lockup ${className}`.trim()} aria-label="AsanPay">
        <span className={animate ? "yt-final-mark--animate" : undefined}>
          <AsanIcon size={iconSize} />
        </span>
      </span>
    );
  }

  return (
    <span
      className={`yt-final-lockup yt-final-lockup--row ${animate ? "yt-final-mark--animate" : ""} ${className}`.trim()}
      aria-label="AsanPay"
    >
      <AsanIcon size={iconSize} />
      <span className="yt-final-wordcol">
        <span className="yt-final-word" style={{ fontSize }}>
          <span style={{ color: asanColor, fontWeight: 800 }}>Asan</span>
          <span style={{ color: payColor, fontWeight: 800 }}>Pay</span>
        </span>
        {showTagline ? <TaglineBlock cycle={cycle} animate={animate} /> : null}
      </span>
    </span>
  );
}
