"use client";

const LOGO_SRC = {
  /** Blue "Asan" — light / white backgrounds */
  dark: "/brand/asanpay-logo-dark.svg",
  /** White "Asan" — blue / dark backgrounds */
  light: "/brand/asanpay-logo-light.svg",
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
