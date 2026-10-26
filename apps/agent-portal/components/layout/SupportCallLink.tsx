"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PhoneCall } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";

/** Support helpline from admin Platform settings (`/support/contacts`). */
function telDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("91") && digits.length === 12 ? digits : `91${digits.slice(-10)}`;
}

function displayPhone(raw: string): string {
  const d = telDigits(raw);
  return d.length === 12 ? `+91 ${d.slice(2, 7)} ${d.slice(7)}` : raw.trim();
}

const pillClass =
  "icon-tooltip inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition hover:opacity-80";

/** Header pill: phone icon + support number; click opens the dialer (falls back to /support when unset). */
export function SupportCallLink() {
  const [phone, setPhone] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetchApi<{ supportPhone?: string }>("/support/contacts")
      .then((c) => {
        if (!cancelled) setPhone((c.supportPhone ?? "").trim());
      })
      .catch(() => {
        /* pill falls back to the Support page */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const digits = telDigits(phone);

  if (!digits) {
    return (
      <Link href="/support" className={pillClass} style={{ background: B.bg, color: B.blue }} data-tooltip="Support">
        <PhoneCall size={16} />
        <span className="hidden sm:inline">Help</span>
      </Link>
    );
  }

  return (
    <a
      href={`tel:+${digits}`}
      className={pillClass}
      style={{ background: B.bg, color: B.blue }}
      aria-label={`Call support ${displayPhone(phone)}`}
      data-tooltip="Call support"
    >
      <PhoneCall size={16} />
      <span className="hidden sm:inline">{displayPhone(phone)}</span>
    </a>
  );
}
