"use client";

import type { CSSProperties } from "react";

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

/** Wordmark crop aspect from Final Logo (viewBox 620×200). */
const WORD_ASPECT = 200 / 620;

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
 * Meet animation: wallet travels Y→A (right→left); wordmark mask-reveals A→Y.
 * Proportions match Final Logo: large wallet, smaller wordmark.
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
  /* Final Logo ratio ≈ icon 240 : wordmark 620 on 1000 canvas */
  const iconSize = Math.round(width * 0.29);
  const wordW = Math.round(width * 0.66);
  const wordH = Math.round(wordW * WORD_ASPECT);
  const variant = light ? "light" : "dark";
  /** Wallet starts near the "Y" of AsanPay, then slides to the "A" side */
  const travelPx = Math.round(wordW * 0.92);

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
      style={{ ["--yt-travel" as string]: `${travelPx}px` } as CSSProperties}
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
            objectPosition: "left center",
            ...(showTagline ? {} : { clipPath: "inset(0 0 38% 0)" }),
          }}
        />
      </span>
    </span>
  );
}
