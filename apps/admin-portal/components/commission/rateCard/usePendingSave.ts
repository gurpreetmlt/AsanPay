"use client";

import { useState } from "react";
import { toast } from "react-hot-toast";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/taxCommissionUtils";
import type { CompareRow, PendingChange } from "./types";

export type SaveRequest = {
  title: string;
  changes: PendingChange[];
  warnings: string[];
  compare?: CompareRow[];
  /** Runs with the changes that went through (in order) before the screen reloads. */
  afterSave?: (saved: PendingChange[], reason: string) => void | Promise<void>;
};

export type SaveProgress = { done: number; total: number };

/**
 * Posts each change in order with the reason; `onSaved` runs when at least one change went through.
 * `runSave(reason, req)` saves `req` directly (no confirm popup) and resolves to how many changes saved.
 */
export function usePendingSave(onSaved: () => void) {
  const [saveReq, setSaveReq] = useState<SaveRequest | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<SaveProgress | null>(null);

  async function runSave(reason: string, direct?: SaveRequest): Promise<number> {
    const req = direct ?? saveReq;
    if (!req) return 0;
    setSaving(true);
    setProgress({ done: 0, total: req.changes.length });
    let done = 0;
    const warned = new Set<string>();
    try {
      for (const c of req.changes) {
        const body = { ...c.body, reason };
        const r =
          c.method === "delete"
            ? await api.delete(c.url, { data: body })
            : c.method === "patch"
              ? await api.patch(c.url, body)
              : await api.post(c.url, body);
        if (!r.data.success) throw new Error(r.data.message);
        const warning = (r.data.data as { warning?: string | null } | undefined)?.warning;
        if (warning && !warned.has(warning)) {
          warned.add(warning);
          toast(warning, { icon: "⚠️" });
        }
        done += 1;
        setProgress({ done, total: req.changes.length });
      }
      toast.success(done === 1 ? "Change saved" : `${done} changes saved`);
      setSaveReq(null);
    } catch (err) {
      const failed = req.changes[done];
      toast.error(
        `${failed ? `${failed.label}: ` : ""}${apiErrorMessage(err, "Save failed. Try again.")}${
          done > 0 ? ` (${done} earlier change${done === 1 ? "" : "s"} saved)` : ""
        }`,
      );
      if (done > 0) setSaveReq(null);
    } finally {
      if (done > 0 && req.afterSave) {
        try {
          await req.afterSave(req.changes.slice(0, done), reason);
        } catch {
          // afterSave reports its own errors; the saved changes stand.
        }
      }
      setSaving(false);
      setProgress(null);
      if (done > 0) onSaved();
    }
    return done;
  }

  return { saveReq, setSaveReq, saving, progress, runSave };
}
