"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Link2 } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { DetailSection } from "@/components/users/DetailSection";

type Row = {
  userId: string;
  uid: string;
  name: string;
  roleLabel: string;
  isActive: boolean;
  kycVerified: boolean;
  isThis: boolean;
  linkedAt: string | null;
};
type Data = { linked: boolean; maxLinked: number; accounts: Row[] };

/** Agent page → Overview: the same person's other accounts (same PAN + Aadhaar), read-only. */
export function LinkedAccountsCard({ userId }: { userId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchApi<Data>(`/admin/users/${userId}/linked-accounts`)
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [userId]);

  return (
    <DetailSection title="Linked accounts" icon={Link2}>
      {error ? (
        <p className="text-sm" style={{ color: B.danger }}>
          Linked accounts did not load. Refresh the page.
        </p>
      ) : !data ? (
        <p className="text-sm" style={{ color: B.muted }}>
          Loading…
        </p>
      ) : !data.linked ? (
        <p className="text-sm" style={{ color: B.muted }}>
          Not linked to any other account. The agent links accounts with the same PAN and Aadhaar from their profile menu.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px]" style={{ color: B.muted }}>
            Same person · {data.accounts.length} of {data.maxLinked} accounts. Wallets and commission stay separate.
          </p>
          {data.accounts.map((a) => {
            const body = (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold" style={{ color: B.blue }}>
                    {a.name}
                    {a.isThis ? (
                      <span className="ml-1.5 text-[10px] font-bold" style={{ color: B.muted }}>
                        (this agent)
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[11px]" style={{ color: B.muted }}>
                    {a.roleLabel} · {a.uid}
                    {!a.isActive ? " · Inactive" : !a.kycVerified ? " · KYC not verified" : ""}
                  </p>
                </div>
                {a.isThis ? null : <ChevronRight size={16} style={{ color: B.muted }} />}
              </>
            );
            return a.isThis ? (
              <div key={a.userId} className="flex items-center gap-3 rounded-xl border px-3 py-2" style={{ borderColor: B.border, background: B.secondary }}>
                {body}
              </div>
            ) : (
              <Link
                key={a.userId}
                href={`/users/${a.userId}`}
                className="flex items-center gap-3 rounded-xl border px-3 py-2 transition hover:bg-[rgba(42,92,221,0.05)]"
                style={{ borderColor: B.border }}
              >
                {body}
              </Link>
            );
          })}
        </div>
      )}
    </DetailSection>
  );
}
