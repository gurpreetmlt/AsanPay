"use client";

import clsx from "clsx";
import type { DownlineUser } from "@/lib/types";
import { ROLE_LABEL } from "@/lib/roles";

interface DownlineTableProps {
  users: DownlineUser[];
  onFund: (user: DownlineUser) => void;
}

export function DownlineTable({ users, onFund }: DownlineTableProps) {
  if (users.length === 0) {
    return <p className="text-sm text-gray-500">You haven&apos;t onboarded anyone yet.</p>;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border-subtle bg-card">
      <table className="w-full text-sm">
        <thead className="border-b border-border-subtle bg-surface text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">UID</th>
            <th className="px-4 py-3 font-medium">Role</th>
            <th className="px-4 py-3 font-medium">Balance</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-border-subtle last:border-0">
              <td className="px-4 py-3">
                <p className="font-medium text-gray-900">{u.name}</p>
                <p className="text-xs text-gray-500">{u.mobile}</p>
              </td>
              <td className="px-4 py-3 text-gray-600">{u.uid}</td>
              <td className="px-4 py-3 text-gray-600">{ROLE_LABEL[u.role]}</td>
              <td className="px-4 py-3 font-medium text-gray-900">
                ₹{Number(u.mainBalance).toLocaleString("en-IN")}
              </td>
              <td className="px-4 py-3">
                <span
                  className={clsx(
                    "rounded-full px-2 py-0.5 text-xs",
                    u.isActive ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-500",
                  )}
                >
                  {u.isActive ? "Active" : "Inactive"}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => onFund(u)}
                  className="rounded-lg border border-brand-600 px-3 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50"
                >
                  Fund
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
