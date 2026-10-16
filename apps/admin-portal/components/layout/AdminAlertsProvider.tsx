"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

export type AdminAlertNotification = {
  id: string;
  type: "kyc_pending" | "fund_request" | "support_ticket" | "pan_gap";
  title: string;
  body: string;
  href: string;
  createdAt: string;
  meta?: Record<string, unknown>;
};

export type AdminAlertBadges = {
  kycPending: number;
  kycPendingByRole: {
    super_distributor: number;
    distributor: number;
    retailer: number;
  };
  fundRequestsPending: number;
  supportTicketsOpen: number;
  /** Agents with TDS withheld this month and no PAN on file */
  panGapCount?: number;
  /** Agent settlement banks awaiting admin verify */
  settlementBanksPending: number;
};

type AdminAlertsState = {
  badges: AdminAlertBadges;
  notifications: AdminAlertNotification[];
  loading: boolean;
  refresh: () => Promise<void>;
};

const EMPTY_BADGES: AdminAlertBadges = {
  kycPending: 0,
  kycPendingByRole: { super_distributor: 0, distributor: 0, retailer: 0 },
  fundRequestsPending: 0,
  supportTicketsOpen: 0,
  settlementBanksPending: 0,
};

const AdminAlertsContext = createContext<AdminAlertsState | null>(null);

const POLL_MS = 45_000;

export function AdminAlertsProvider({ children }: { children: ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [badges, setBadges] = useState<AdminAlertBadges>(EMPTY_BADGES);
  const [notifications, setNotifications] = useState<AdminAlertNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!accessToken) {
      setBadges(EMPTY_BADGES);
      setNotifications([]);
      return;
    }
    setLoading(true);
    try {
      const [data, pendingBanks] = await Promise.all([
        fetchApi<{
          badges: AdminAlertBadges;
          notifications: AdminAlertNotification[];
        }>("/admin/alerts"),
        fetchApi<{ id: string }[]>("/settlements/banks/pending").catch(() => [] as { id: string }[]),
      ]);
      const bankCount = Array.isArray(pendingBanks) ? pendingBanks.length : 0;
      setBadges({
        ...(data.badges ?? EMPTY_BADGES),
        settlementBanksPending: bankCount,
      });
      const base = [...(data.notifications ?? [])];
      if (bankCount > 0 && !base.some((n) => n.href.includes("settlements"))) {
        base.unshift({
          id: "settlement-banks-pending",
          type: "fund_request",
          title: "Settlement banks pending",
          body: `${bankCount} agent bank${bankCount === 1 ? "" : "s"} awaiting verification`,
          href: "/settlements?tab=banks",
          createdAt: new Date().toISOString(),
        });
      }
      setNotifications(base);
    } catch {
      /* keep last good snapshot */
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void refresh();
    if (!accessToken) return;
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [accessToken, refresh]);

  const value = useMemo(
    () => ({ badges, notifications, loading, refresh }),
    [badges, notifications, loading, refresh],
  );

  return <AdminAlertsContext.Provider value={value}>{children}</AdminAlertsContext.Provider>;
}

export function useAdminAlerts(): AdminAlertsState {
  const ctx = useContext(AdminAlertsContext);
  if (!ctx) {
    return {
      badges: EMPTY_BADGES,
      notifications: [],
      loading: false,
      refresh: async () => undefined,
    };
  }
  return ctx;
}

/** Format 12 / 99+ for red pill badges. */
export function formatBadgeCount(n: number): string {
  if (n <= 0) return "";
  if (n > 99) return "99+";
  return String(n);
}
