"use client";

import { B, ROLE_LABEL } from "@/lib/brand";
import type { DownlineUser } from "@/lib/types";

interface DownlineTableProps {
  users: DownlineUser[];
  onFund: (user: DownlineUser) => void;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function formatInr(amount: string | number) {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return "₹0";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function DownlineTable({ users, onFund }: DownlineTableProps) {
  if (users.length === 0) {
    return (
      <p className="rounded-xl px-4 py-8 text-center text-sm" style={{ color: B.muted, background: B.bg }}>
        You haven&apos;t onboarded anyone yet.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border" style={{ borderColor: B.border }}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr style={{ background: B.bg, borderBottom: `1px solid ${B.border}` }}>
              {["Name", "UID", "Role", "Balance", "Status", ""].map((h) => (
                <th
                  key={h || "action"}
                  className="px-4 py-3 text-left text-[14px] font-bold uppercase tracking-wider"
                  style={{ color: B.muted }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                className="border-b last:border-0"
                style={{ borderColor: B.border }}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ background: B.badgeGrad }}
                    >
                      {initials(u.name)}
                    </div>
                    <div>
                      <p className="font-semibold" style={{ color: B.blue }}>
                        {u.name}
                      </p>
                      <p className="text-xs" style={{ color: B.muted }}>
                        {u.mobile}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs" style={{ color: B.muted }}>
                  {u.uid}
                </td>
                <td className="px-4 py-3" style={{ color: B.blue }}>
                  {ROLE_LABEL[u.role] ?? u.role}
                </td>
                <td className="px-4 py-3 font-bold tabular-nums" style={{ color: B.blue }}>
                  {formatInr(u.mainBalance)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[14px] font-bold"
                    style={
                      u.isActive
                        ? { background: `${B.green}18`, color: B.greenDark }
                        : { background: B.bg, color: B.muted }
                    }
                  >
                    {u.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    disabled={!u.isActive}
                    onClick={() => onFund(u)}
                    className="rounded-xl px-3.5 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ background: B.badgeGrad }}
                  >
                    Fund
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
