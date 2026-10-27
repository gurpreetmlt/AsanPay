"use client";

import { useState } from "react";
import { toast } from "react-hot-toast";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/taxCommissionUtils";
import type { PendingChange } from "./types";

export type SaveRequest = { title: string; changes: PendingChange[]; warnings: string[] };

/** Posts each change in order with the reason; `onSaved` runs when at least one change went through. */
export function usePendingSave(onSaved: () => void) {
  const [saveReq, setSaveReq] = useState<SaveRequest | null>(null);
  const [saving, setSaving] = useState(false);

  async function runSave(reason: string) {
    if (!saveReq) return;
    setSaving(true);
    let done = 0;
    try {
      for (const c of saveReq.changes) {
        const body = { ...c.body, reason };
        const r = c.method === "delete" ? await api.delete(c.url, { data: body }) : await api.post(c.url, body);
        if (!r.data.success) throw new Error(r.data.message);
        const warning = (r.data.data as { warning?: string | null } | undefined)?.warning;
        if (warning) toast(warning, { icon: "⚠️" });
        done += 1;
      }
      toast.success(done === 1 ? "Change saved" : `${done} changes saved`);
      setSaveReq(null);
    } catch (err) {
      const failed = saveReq.changes[done];
      toast.error(
        `${failed ? `${failed.label}: ` : ""}${apiErrorMessage(err, "Save failed. Try again.")}${
          done > 0 ? ` (${done} earlier change${done === 1 ? "" : "s"} saved)` : ""
        }`,
      );
      if (done > 0) setSaveReq(null);
    } finally {
      setSaving(false);
      if (done > 0) onSaved();
    }
  }

  return { saveReq, setSaveReq, saving, runSave };
}
