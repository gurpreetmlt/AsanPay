"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { B, brand } from "@/lib/brand";

export default function AboutPage() {
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
          About {brand.name}
        </h1>

        <div className="mt-6 space-y-4 rounded-2xl border bg-white p-5 text-sm leading-relaxed" style={{ borderColor: B.border, color: B.blueMid }}>
          <p>
            {brand.name} is a business correspondent platform that lets retailers, distributors
            and super distributors offer everyday financial services — AePS cash withdrawal and
            deposit, domestic money transfer (DMT), bill payments and recharge — from a single
            shop counter.
          </p>
          <p>
            Every rupee that moves through {brand.name} is recorded in a double-entry ledger:
            money coming in, money going out, and who moved it are always traceable. Agent
            balances are held as a prepaid business advance against services — not a stored-value
            wallet — with earned commission and AePS income kept separately withdrawable to the
            agent's own verified bank account.
          </p>
          <p>
            {brand.name} operates as a sub-agent under an aggregator's banking correspondent
            arrangement and follows RBI's due-diligence directions for Aadhaar-enabled payment
            touchpoint operators, including biometric device registration, geofencing, and
            periodic re-verification.
          </p>
        </div>
      </div>
    </div>
  );
}
