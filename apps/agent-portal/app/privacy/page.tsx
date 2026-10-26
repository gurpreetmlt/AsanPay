"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PRIVACY_BODY } from "@asanpay/shared-types";
import { B, brand } from "@/lib/brand";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen" style={{ background: B.bg }}>
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <Link
          href="/support"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold"
          style={{ color: B.blueLight }}
        >
          <ArrowLeft size={16} /> Back
        </Link>

        <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
          Privacy Policy
        </h1>
        <p className="mt-1 text-xs" style={{ color: B.muted }}>
          How {brand.name} collects, uses and protects your information.
        </p>

        <div
          className="mt-6 whitespace-pre-wrap rounded-2xl border bg-white p-5 text-sm leading-relaxed"
          style={{ borderColor: B.border, color: B.blueMid }}
        >
          {PRIVACY_BODY}
        </div>
      </div>
    </div>
  );
}
