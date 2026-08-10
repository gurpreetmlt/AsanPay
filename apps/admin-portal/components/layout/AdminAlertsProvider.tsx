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
  type: "kyc_pending" | "fund_request" | "support_ticket";
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
      const data = await fetchApi<{
        badges: AdminAlertBadges;
        notifications: AdminAlertNotification[];
      }>("/admin/alerts");
      setBadges(data.badges ?? EMPTY_BADGES);
      setNotifications(data.notifications ?? []);
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
