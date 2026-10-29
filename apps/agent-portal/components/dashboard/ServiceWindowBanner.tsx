"use client";

import { useEffect, useState } from "react";
import { Moon } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

type ServiceWindow = {
  closedNow: boolean;
  endLabel: string;
  message: string | null;
  openGroups: string[];
};

const GROUP_LABEL: Record<string, string> = {
  aeps: "AePS",
  dmt: "Money transfer",
  bbps: "Bill payments",
  recharge: "Recharge",
  cms: "CMS",
};

/** Night service window: shown to retailers while counter services are closed (server clock). */
export function ServiceWindowBanner() {
  const role = useAuthStore((s) => s.user?.role);
  const [win, setWin] = useState<ServiceWindow | null>(null);

  useEffect(() => {
    if (role !== "retailer") return;
    let cancelled = false;
    const load = () =>
      fetchApi<ServiceWindow>("/account/service-window")
        .then((w) => {
          if (!cancelled) setWin(w);
        })
        .catch(() => undefined);
    void load();
    const timer = window.setInterval(load, 5 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [role]);

  if (role !== "retailer" || !win?.closedNow) return null;

  return (
    <div
      className="flex items-start gap-3 rounded-2xl border-2 px-4 py-3"
      style={{ borderColor: "#C7D2FE", background: "linear-gradient(90deg, #EEF2FF 0%, #F5F7FF 100%)" }}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "#E0E7FF", color: "#3730A3" }}>
        <Moon size={18} />
      </span>
      <div className="min-w-0">
        <span
          className="mb-1 inline-block rounded-md px-2 py-0.5 text-[11px] font-extrabold tracking-wide"
          style={{ background: "#3730A3", color: "#fff" }}
        >
          OPENS AT {win.endLabel}
        </span>
        <p className="text-sm font-bold" style={{ color: "#312E81" }}>
          Services are closed for the night
        </p>
        <p className="text-xs font-medium" style={{ color: "#4338CA" }}>
          {win.message} You can still use the app — wallet, transfers, fund requests and reports work as usual.
        </p>
        {win.openGroups.length ? (
          <p className="mt-1 text-xs font-bold" style={{ color: "#15803D" }}>
            Open for you tonight: {win.openGroups.map((g) => GROUP_LABEL[g] ?? g).join(", ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
