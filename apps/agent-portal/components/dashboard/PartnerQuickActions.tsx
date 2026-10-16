"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import {
  ArrowRightLeft,
  BarChart3,
  BookText,
  CirclePlus,
  Layers,
  MailPlus,
  Search,
  Users,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { InviteModal } from "@/components/network/InviteAgentPanel";
import { WalletActionForm } from "@/components/dashboard/WalletActionForm";
import { fetchApi } from "@/lib/api";
import { B, initials } from "@/lib/brand";
import { formatInr } from "@/lib/walletLabels";
import type { DownlineUser } from "@/lib/types";

interface Tile {
  key: string;
  label: string;
  hint: string;
  icon: ReactNode;
  color: string;
  bg: string;
  onClick: () => void;
}

/** Top-of-dashboard actions for Super Distributor / Distributor. */
export function PartnerQuickActions({
  childLabel,
  onBulkTransfer,
  onChanged,
}: {
  childLabel: "Distributor" | "Retailer";
  onBulkTransfer?: () => void;
  /** Called after a successful transfer so the dashboard can refresh numbers. */
  onChanged?: () => void;
}) {
  const router = useRouter();
  const childRole = childLabel === "Distributor" ? "distributor" : "retailer";
  const [showInvite, setShowInvite] = useState(false);
  const [picker, setPicker] = useState<DownlineUser[] | null>(null);
  const [fundTarget, setFundTarget] = useState<DownlineUser | null>(null);

  async function openFund() {
    try {
      const rows = await fetchApi<DownlineUser[]>("/users/downline");
      setPicker(rows.filter((r) => r.role === childRole));
    } catch {
      toast.error(`Could not load your ${childLabel.toLowerCase()}s. Check your connection and try again.`);
    }
  }

  const tiles: Tile[] = [
    {
      key: "invite",
      label: `Invite ${childLabel}`,
      hint: "Email signup link",
      icon: <MailPlus size={20} />,
      color: "#15803D",
      bg: "#DCFCE7",
      onClick: () => setShowInvite(true),
    },
    {
      key: "fund",
      label: "Transfer / Reverse",
      hint: `Send to or pull from a ${childLabel.toLowerCase()}`,
      icon: <ArrowRightLeft size={20} />,
      color: "#1D4ED8",
      bg: "#DBEAFE",
      onClick: () => void openFund(),
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
      key: "history",
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
    <>
      <div className={`grid grid-cols-3 gap-2 sm:gap-3 ${tiles.length > 6 ? "lg:grid-cols-7" : "lg:grid-cols-6"}`}>
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

      {showInvite ? <InviteModal childRole={childRole} onClose={() => setShowInvite(false)} /> : null}

      {picker ? (
        <DownlinePicker
          title={`Pick ${childLabel.toLowerCase()} — Transfer / Reverse`}
          emptyText={`No ${childLabel.toLowerCase()}s yet. Invite one first.`}
          rows={picker}
          onClose={() => setPicker(null)}
          onPick={(u) => {
            setPicker(null);
            setFundTarget(u);
          }}
        />
      ) : null}

      {fundTarget ? (
        <WalletActionForm
          target={fundTarget}
          initialKind="transfer"
          allowReverse={Number(fundTarget.mainBalance) > 0 && fundTarget.isActive}
          onClose={() => setFundTarget(null)}
          onSuccess={() => onChanged?.()}
        />
      ) : null}
    </>
  );
}

function DownlinePicker({
  title,
  emptyText,
  rows,
  onClose,
  onPick,
}: {
  title: string;
  emptyText: string;
  rows: DownlineUser[];
  onClose: () => void;
  onPick: (u: DownlineUser) => void;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(s) || r.mobile.includes(s) || r.uid.toLowerCase().includes(s),
    );
  }, [q, rows]);

  return (
    <Modal title={title} onClose={onClose}>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: B.muted }}>
          {emptyText}
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: B.border }}>
            <Search size={14} style={{ color: B.muted }} />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, mobile or ID"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {list.length === 0 ? (
              <p className="py-4 text-center text-xs" style={{ color: B.muted }}>
                No match for &quot;{q}&quot;
              </p>
            ) : (
              list.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  disabled={!r.isActive}
                  onClick={() => onPick(r)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ background: B.blue }}
                  >
                    {initials(r.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold" style={{ color: B.blue }}>
                      {r.name}
                    </span>
                    <span className="block text-[11px]" style={{ color: B.muted }}>
                      {r.mobile} · {r.uid}
                      {r.isActive ? "" : " · Inactive"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-bold tabular-nums" style={{ color: B.green }}>
                    {formatInr(r.mainBalance)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
