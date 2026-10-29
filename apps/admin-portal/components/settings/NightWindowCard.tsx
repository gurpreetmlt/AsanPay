"use client";

import { Moon } from "lucide-react";
import { B } from "@/lib/brand";
import { NightWindowForm } from "@/components/settings/NightWindowForm";

/** Platform Settings → Night service window (counter services close every night, IST). */
export function NightWindowCard() {
  return (
    <section id="night-window" className="scroll-mt-24 space-y-4 rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
      <div className="flex items-center gap-2">
        <Moon size={18} style={{ color: B.blueLight }} />
        <h2 className="text-sm font-bold" style={{ color: B.blue }}>
          Night service window · all agents
        </h2>
      </div>
      <p className="text-xs" style={{ color: B.muted }}>
        AePS, money transfer (DMT), bill payments (BBPS), recharge and CMS close every night in this window for every
        agent. Login, wallet, transfers, fund requests and settlements stay open. To keep a service open for one agent,
        use their page → Services &amp; limits → Night services.
      </p>
      <NightWindowForm />
    </section>
  );
}
