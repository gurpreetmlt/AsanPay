"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";

interface SearchHit {
  id: string;
  kind: "statement" | "fund_request" | "bank_entry" | "agent";
  title: string;
  subtitle: string | null;
  amount: string | null;
  status: string | null;
  href: string;
}

const KIND_LABEL: Record<SearchHit["kind"], string> = {
  statement: "Statement",
  fund_request: "Deposit",
  bank_entry: "Bank entry",
  agent: "Agent",
};

function inr(v: string) {
  return `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function TreasurySearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(() => {
      void (async () => {
        try {
          const data = await fetchApi<{ q: string; hits: SearchHit[] }>("/banking/search", {
            q: trimmed,
            limit: "30",
          });
          setHits(data.hits);
          setOpen(true);
        } catch {
          setHits([]);
        } finally {
          setLoading(false);
        }
      })();
    }, 280);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  function go(hit: SearchHit) {
    setOpen(false);
    setQ("");
    setHits([]);
    router.push(hit.href);
  }

  return (
    <div ref={wrapRef} className="relative w-full max-w-md">
      <label className="sr-only" htmlFor="treasury-search">
        Search UTR, amount, agent or mobile
      </label>
      <div
        className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2.5 shadow-sm"
        style={{ borderColor: B.border }}
      >
        <Search size={16} style={{ color: B.muted }} />
        <input
          id="treasury-search"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          style={{ color: B.blue }}
          placeholder="Search UTR, amount, agent, mobile…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => hits.length > 0 && setOpen(true)}
          autoComplete="off"
        />
        {q ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQ("");
              setHits([]);
              setOpen(false);
            }}
            style={{ color: B.muted }}
          >
            <X size={15} />
          </button>
        ) : null}
      </div>

      {open && q.trim().length >= 2 ? (
        <div
          className="absolute left-0 right-0 z-30 mt-1.5 max-h-80 overflow-y-auto rounded-xl border bg-white shadow-lg"
          style={{ borderColor: B.border }}
        >
          {loading ? (
            <p className="px-3 py-3 text-sm" style={{ color: B.muted }}>
              Searching…
            </p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-3 text-sm" style={{ color: B.muted }}>
              No matches for “{q.trim()}”
            </p>
          ) : (
            <ul>
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => go(h)}
                    className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-[#F8FAFC]"
                  >
                    <span
                      className="mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase"
                      style={{ background: "#EEF2FF", color: B.blue }}
                    >
                      {KIND_LABEL[h.kind]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold" style={{ color: B.blue }}>
                        {h.title}
                        {h.amount ? (
                          <span className="ml-2 font-semibold tabular-nums" style={{ color: B.green }}>
                            {inr(h.amount)}
                          </span>
                        ) : null}
                      </span>
                      {h.subtitle ? (
                        <span className="block truncate text-xs" style={{ color: B.muted }}>
                          {h.subtitle}
                          {h.status ? ` · ${h.status}` : ""}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
