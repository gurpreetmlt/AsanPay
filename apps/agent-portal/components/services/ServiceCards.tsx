"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { ChevronDown, Star } from "lucide-react";
import { fetchApi } from "@/lib/api";
import type { CatalogCategoryView } from "@/lib/types";
import { B } from "@/lib/brand";
import { serviceIconPath } from "@asanpay/shared-types";
import { DesignIcon, designTileColors, serviceCodeToDesignKey } from "@/lib/designIcons";
import { flattenCatalogServices } from "@/lib/catalog";
import { extractApiError, isKycServicesUnlocked } from "@/lib/onboarding";
import { MAX_FAVORITES, selectFavoriteCodes, useFavoritesStore } from "@/lib/favorites";
import { useAuthStore } from "@/lib/store";

type Svc = { id: string; code: string; name: string; badge: string | null; icon: string | null };

/** Display-only overrides for category names — doesn't touch the catalog data in the DB. */
const CATEGORY_NAME_OVERRIDES: Record<string, string> = {
  BILL_PAYMENT_BBPS: "Recharge & Bill Payments (BBPS)",
};

const AEPS_TAB_MAP: Record<string, string> = {
  CASH_WITHDRAW: "Withdraw",
  MINI_STATEMENT: "Mini Statement",
  CASH_DEPOSIT: "Deposit",
  BALANCE_ENQUIRY: "Balance Enquiry",
  AADHAAR_PAY: "Withdraw",
};

/** How many tiles fit in one dense row on md+ before “View all” is needed. */
const PREVIEW_COUNT = 8;

/** Routes for services that have a dedicated page but aren't part of the AEPS tab set. */
function resolveServiceRoute(code: string): string | null {
  const aepsTab = AEPS_TAB_MAP[code];
  if (aepsTab) return `/aeps?tab=${encodeURIComponent(aepsTab)}`;
  if (code === "UPI_CASH_POINT") return "/upi-cash-point";
  if (code === "MONEY_TRANSFER" || code === "DMT") return "/dmt";
  if (code === "NEPAL" || code === "NEPAL_REMITTANCE") return "/nepal";
  return null;
}

function ServiceIconCard({
  svc,
  index,
  favorite,
  onToggleFav,
  onOpen,
}: {
  svc: Svc;
  index: number;
  favorite: boolean;
  onToggleFav: () => void;
  onOpen?: () => void;
}) {
  const tile = designTileColors(index, false);
  const assetSrc = serviceIconPath(svc.icon);
  const [assetFailed, setAssetFailed] = useState(false);
  const showAsset = Boolean(assetSrc) && !assetFailed;
  const starColor = favorite ? B.green : B.muted;
  const designKey = serviceCodeToDesignKey(svc.code);

  return (
    <div
      className="group relative flex w-[4.5rem] shrink-0 flex-col items-center sm:w-[5rem]"
      style={{ "--tile-accent": tile.fg } as React.CSSProperties}
    >
      <button
        type="button"
        aria-label={favorite ? "Remove favourite" : "Add favourite"}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFav();
        }}
        className="absolute -right-0.5 top-0 z-10 rounded-md p-0.5 opacity-0 transition group-hover:opacity-100"
      >
        <Star size={11} strokeWidth={2.2} color={starColor} fill={favorite ? starColor : "none"} />
      </button>
      <button
        type="button"
        className="flex w-full flex-col items-center gap-1 text-center disabled:opacity-45"
        onClick={() => (onOpen ? onOpen() : toast(`${svc.name} — coming soon on web`))}
      >
        {svc.badge ? (
          <span
            className="mb-0.5 max-w-full truncate rounded px-1 py-px text-[8px] font-bold uppercase leading-none"
            style={{ background: `${tile.fg}18`, color: tile.fg }}
            title={svc.badge}
          >
            {svc.badge}
          </span>
        ) : (
          <span className="mb-0.5 h-3" aria-hidden />
        )}
        {showAsset ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={assetSrc!}
            alt=""
            className="h-8 w-8 object-contain transition duration-150 ease-out group-hover:scale-110 group-hover:drop-shadow-md sm:h-9 sm:w-9"
            onError={() => setAssetFailed(true)}
          />
        ) : (
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg transition duration-150 ease-out group-hover:scale-110 sm:h-9 sm:w-9"
            style={{ background: tile.bg }}
          >
            <DesignIcon name={designKey} size={20} color={tile.fg} />
          </div>
        )}
        <div
          className="line-clamp-2 min-h-[1.75rem] w-full text-center text-[10px] font-semibold leading-tight transition-colors duration-150 group-hover:text-[var(--tile-accent)] sm:text-[11px]"
          style={{ color: B.blue }}
        >
          {svc.name}
        </div>
      </button>
    </div>
  );
}

function ServiceRow({
  services,
  codes,
  onToggle,
  onOpen,
}: {
  services: Svc[];
  codes: string[];
  onToggle: (code: string) => void;
  onOpen: (code: string) => void;
}) {
  return (
    <div className="flex flex-wrap content-start items-start gap-x-1 gap-y-2 sm:gap-x-2">
      {services.map((svc, i) => (
        <ServiceIconCard
          key={svc.id}
          svc={svc}
          index={i}
          favorite={codes.includes(svc.code)}
          onToggleFav={() => onToggle(svc.code)}
          onOpen={() => onOpen(svc.code)}
        />
      ))}
    </div>
  );
}

/** Figma / Spice-style dense service rows (one line when few; View all only when many). */
export function ServiceCards({ title = "All Services" }: { title?: string }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const userId = user?.id;
  const servicesUnlocked = isKycServicesUnlocked(user);
  const hydrate = useFavoritesStore((s) => s.hydrate);
  const codes = useFavoritesStore((s) => (userId ? selectFavoriteCodes(s, userId) : []));
  const toggle = useFavoritesStore((s) => s.toggle);
  const remove = useFavoritesStore((s) => s.remove);

  const [categories, setCategories] = useState<CatalogCategoryView[]>([]);
  /** Categories expanded past the first row (only needed when count > PREVIEW_COUNT). */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchApi<CatalogCategoryView[]>("/catalog");
        if (alive) setCategories(Array.isArray(data) ? data : []);
      } catch (err) {
        if (alive) toast.error(extractApiError(err, "Could not load services"), { id: "catalog-load" });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const visibleCategories = useMemo(
    () => categories.filter((c) => (c.services?.length ?? 0) > 0),
    [categories],
  );

  const favorites = useMemo(() => {
    const all = flattenCatalogServices(visibleCategories);
    return codes
      .map((code) => all.find((s) => s.code === code))
      .filter((s): s is NonNullable<typeof s> => !!s);
  }, [visibleCategories, codes]);

  function openService(code: string) {
    if (!servicesUnlocked) {
      toast.error(
        user?.hasKycDocs
          ? "KYC under review — services unlock after admin approval"
          : "First complete your KYC",
      );
      return;
    }
    const route = resolveServiceRoute(code);
    if (route) router.push(route);
    else toast(`${code} — coming soon on web`);
  }

  function handleToggle(code: string) {
    if (!userId) return;
    if (codes.includes(code)) {
      remove(userId, code);
      return;
    }
    const result = toggle(userId, code);
    if (result.limitReached) toast.error(`Maximum ${MAX_FAVORITES} favourites`);
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="rounded-2xl border bg-white p-4 text-sm" style={{ borderColor: B.border, color: B.muted }}>
        Loading services…
      </div>
    );
  }

  if (!visibleCategories.length) {
    return (
      <div className="rounded-2xl border bg-white p-4 text-sm" style={{ borderColor: B.border, color: B.muted }}>
        No active services. Ask admin to enable them under Site Control, or re-run catalog seed on the backend.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {favorites.length > 0 ? (
        <div className="rounded-xl border bg-white px-3 py-2.5" style={{ borderColor: B.green }}>
          <div className="mb-2 flex items-center gap-2">
            <Star size={14} color={B.green} fill={B.green} />
            <div className="text-xs font-bold uppercase tracking-wider" style={{ color: B.muted }}>
              Favourites
            </div>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ background: `${B.green}18`, color: B.greenDark }}
            >
              {favorites.length}
            </span>
          </div>
          <ServiceRow
            services={favorites}
            codes={codes}
            onToggle={handleToggle}
            onOpen={openService}
          />
        </div>
      ) : null}

      <h2 className="text-base font-bold md:text-lg" style={{ color: B.blue }}>
        {title}
      </h2>

      {visibleCategories.map((cat) => {
        const services = cat.services;
        const needsExpand = services.length > PREVIEW_COUNT;
        const isOpen = expanded.has(cat.id);
        const shown = !needsExpand || isOpen ? services : services.slice(0, PREVIEW_COUNT);

        return (
          <div
            key={cat.id}
            className="rounded-xl border bg-white px-3 py-2.5"
            style={{ borderColor: B.border }}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: B.muted }}>
                {CATEGORY_NAME_OVERRIDES[cat.code] ?? cat.name}
              </span>
              {needsExpand ? (
                <button
                  type="button"
                  onClick={() => toggleExpanded(cat.id)}
                  className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-bold"
                  style={{ color: B.blueLight }}
                >
                  {isOpen ? "Show less" : "View all"}
                  <ChevronDown
                    size={14}
                    style={{
                      transform: isOpen ? "rotate(180deg)" : "none",
                      transition: "transform 150ms",
                    }}
                  />
                </button>
              ) : null}
            </div>
            <ServiceRow
              services={shown}
              codes={codes}
              onToggle={handleToggle}
              onOpen={openService}
            />
          </div>
        );
      })}
    </div>
  );
}
