import { useCallback, useEffect, useState } from "react";
import { fetchApi } from "../lib/api";
import type { LedgerEntry } from "../lib/types";

export function useRecentLedger(limit = 10) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await fetchApi<LedgerEntry[]>("/wallet/ledger", { limit });
      setEntries(data);
    } catch {
      /* silent — screen can retry via refresh */
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    void load();
  }, [load]);

  return { entries, loading, reload: load };
}
