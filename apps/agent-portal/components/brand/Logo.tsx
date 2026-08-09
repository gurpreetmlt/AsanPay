"use client";

import { useEffect, useState } from "react";

const LOGO_SRC = {
  /** Blue "Asan" — light / white backgrounds */
  dark: "/brand/asanpay-logo-dark.svg",
  /** White "Asan" — blue / dark backgrounds */
  light: "/brand/asanpay-logo-light.svg",
} as const;

const FINAL_LOGO = {
  /** White Asan + green Pay — for dark/blue sidebars */
  light: "/brand/asanpay-final-light.svg",
  /** Blue Asan + green Pay — for light backgrounds */
  dark: "/brand/asanpay-final-dark.svg",
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

/**
 * Official Final-Logo lockup (light/dark) + typed tagline.
 * YouTube-style soft entrance, long still, no clip.
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
  /** true = final light logo (white Asan) for dark/blue UI */
  light?: boolean;
  animate?: boolean;
  showTagline?: boolean;
  className?: string;
}) {
  const [cycle, setCycle] = useState(0);
  const src = light ? FINAL_LOGO.light : FINAL_LOGO.dark;
  // Crop baked-in SVG tagline; we type it separately below.
  const cropH = Math.round(width * 0.205);

  useEffect(() => {
    if (!animate) return;
    const id = window.setInterval(() => setCycle((c) => c + 1), LOGO_LOOP_MS);
    return () => window.clearInterval(id);
  }, [animate]);

  if (!wordmark) {
    return (
      <span className={`yt-final-lockup ${className}`.trim()} aria-label="AsanPay">
        <span className={animate ? "yt-final-mark yt-final-mark--animate" : "yt-final-mark"}>
          <AsanIcon size={Math.round(width * 0.26)} />
        </span>
      </span>
    );
  }

  return (
    <span className={`yt-final-lockup ${className}`.trim()} aria-label="AsanPay">
      <span
        className={animate ? "yt-final-crop yt-final-mark--animate" : "yt-final-crop"}
        style={{ width, height: cropH }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={cycle}
          src={src}
          alt=""
          width={width}
          draggable={false}
          className="yt-final-img"
          style={{ width, height: "auto" }}
        />
      </span>
      {showTagline ? (
        animate ? <TypeTagline cycle={cycle} /> : <span className="yt-tagline">{TAGLINE}</span>
      ) : null}
    </span>
  );
}
