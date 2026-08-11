"use client";

import { resolveValue, toast, Toaster, type Toast } from "react-hot-toast";

export type AlertVariant =
  | "primary"
  | "secondary"
  | "success"
  | "danger"
  | "warning"
  | "info"
  | "light"
  | "dark";

function variantFromToast(t: Toast): AlertVariant {
  const cls = t.className ?? "";
  const hit = (
    [
      "primary",
      "secondary",
      "success",
      "danger",
      "warning",
      "info",
      "light",
      "dark",
    ] as const
  ).find((v) => cls.includes(`bs-${v}`) || cls.includes(`alert-${v}`));
  if (hit) return hit;
  if (t.type === "success") return "success";
  if (t.type === "error") return "danger";
  if (t.type === "loading") return "info";
  return "primary";
}

/** Bootstrap-style animated toasts — drop-in for react-hot-toast. */
export function AppToaster() {
  return (
    <Toaster
      position="top-center"
      gutter={10}
      containerStyle={{ top: 16, zIndex: 9999 }}
      toastOptions={{ duration: 4200 }}
    >
      {(t) => {
        const variant = variantFromToast(t);
        return (
          <div
            role="status"
            aria-live="polite"
            className={`bs-alert bs-alert--${variant} ${
              t.visible ? "bs-alert--in" : "bs-alert--out"
            }`}
          >
            <div className="bs-alert__body">{resolveValue(t.message, t)}</div>
            {t.type !== "loading" ? (
              <button
                type="button"
                className="bs-alert__close"
                aria-label="Dismiss"
                onClick={() => toast.dismiss(t.id)}
              >
                ×
              </button>
            ) : null}
          </div>
        );
      }}
    </Toaster>
  );
}

/** Optional helpers for non-success/error Bootstrap tones. */
export const alertToast = {
  primary: (message: string) => toast(message, { className: "bs-primary" }),
  secondary: (message: string) => toast(message, { className: "bs-secondary" }),
  success: (message: string) => toast.success(message),
  danger: (message: string) => toast.error(message),
  warning: (message: string) => toast(message, { className: "bs-warning" }),
  info: (message: string) => toast(message, { className: "bs-info" }),
  light: (message: string) => toast(message, { className: "bs-light" }),
  dark: (message: string) => toast(message, { className: "bs-dark" }),
};
