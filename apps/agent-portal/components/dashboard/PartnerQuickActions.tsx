"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  BarChart3,
  BookText,
  CirclePlus,
  Layers,
  MailPlus,
  Users,
} from "lucide-react";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";

interface Tile {
  key: string;
  label: string;
  hint: string;
  icon: ReactNode;
  color: string;
  bg: string;
  onClick: () => void;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Top-of-dashboard actions for Super Distributor / Distributor. */
export function PartnerQuickActions({
  childLabel,
  onBulkTransfer,
}: {
  childLabel: "Distributor" | "Retailer";
  onBulkTransfer?: () => void;
}) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const firstName = (user?.name ?? "").trim().split(/\s+/)[0] || "there";
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  const tiles: Tile[] = [
    {
      key: "invite",
      label: `Invite ${childLabel}`,
      hint: "Email signup link",
      icon: <MailPlus size={20} />,
      color: "#15803D",
      bg: "#DCFCE7",
      onClick: () => router.push("/network?invite=1"),
    },
    {
      key: "fund",
      label: `Fund ${childLabel}`,
      hint: "Top-up or reverse",
      icon: <ArrowRightLeft size={20} />,
      color: "#1D4ED8",
      bg: "#DBEAFE",
      onClick: () => router.push("/network"),
    },
    ...(onBulkTransfer
      ? [
          {
            key: "bulk",
            label: "Bulk Transfer",
            hint: "Fund many at once",
            icon: <Layers size={20} />,
            color: "#0E7490",
            bg: "#CFFAFE",
            onClick: onBulkTransfer,
          },
        ]
      : []),
    {
      key: "network",
      label: `My ${childLabel}s`,
      hint: "View your network",
      icon: <Users size={20} />,
      color: "#4338CA",
      bg: "#E0E7FF",
      onClick: () => router.push("/network"),
    },
    {
      key: "add-money",
      label: "Add Money",
      hint: "Request wallet top-up",
      icon: <CirclePlus size={20} />,
      color: "#047857",
      bg: "#D1FAE5",
      onClick: () => router.push("/fund-request"),
    },
    {
      key: "passbook",
      label: "History",
      hint: "Credits and debits",
      icon: <BookText size={20} />,
      color: "#B45309",
      bg: "#FEF3C7",
      onClick: () => router.push("/passbook"),
    },
    {
      key: "reports",
      label: "Reports",
      hint: "Volume and commission",
      icon: <BarChart3 size={20} />,
      color: "#7C3AED",
      bg: "#EDE9FE",
      onClick: () => router.push("/reports"),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold" style={{ color: B.blue }}>
            {greeting()}, {firstName}
          </h1>
          <p className="text-xs" style={{ color: B.muted }}>
            {today} · Here is your network at a glance
          </p>
        </div>
      </div>
      <div
        className={`grid grid-cols-3 gap-2 sm:gap-3 ${tiles.length > 6 ? "lg:grid-cols-7" : "lg:grid-cols-6"}`}
      >
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={t.onClick}
            className="group flex cursor-pointer flex-col items-center gap-2 rounded-2xl border bg-white px-2 py-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            style={{ borderColor: B.border }}
          >
            <span
              className="flex h-11 w-11 items-center justify-center rounded-xl transition group-hover:scale-110"
              style={{ background: t.bg, color: t.color }}
            >
              {t.icon}
            </span>
            <span className="text-[13px] font-semibold leading-tight" style={{ color: B.blue }}>
              {t.label}
            </span>
            <span className="hidden text-[11px] leading-tight sm:block" style={{ color: B.muted }}>
              {t.hint}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
