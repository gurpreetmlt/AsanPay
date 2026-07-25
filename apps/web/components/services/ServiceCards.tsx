"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Star } from "lucide-react";
import { fetchApi } from "@/lib/api";
import type { CatalogCategoryView } from "@/lib/types";
import { B } from "@/lib/brand";
import { serviceIconPath } from "@asanpay/shared-types";
import { designTileColors } from "@/lib/designIcons";
import { flattenCatalogServices } from "@/lib/catalog";
import { extractApiError } from "@/lib/onboarding";
import { MAX_FAVORITES, selectFavoriteCodes, useFavoritesStore } from "@/lib/favorites";
import { useAuthStore } from "@/lib/store";

type Svc = { id: string; code: string; name: string; badge: string | null; icon: string | null };

const AEPS_TAB_MAP: Record<string, string> = {
  CASH_WITHDRAW: "Withdraw",
  MINI_STATEMENT: "Mini Statement",
  CASH_DEPOSIT: "Deposit",
  BALANCE_ENQUIRY: "Balance Enquiry",
  AADHAAR_PAY: "Withdraw",
};

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

  return (
    <div
      className="group relative flex flex-col items-start gap-3 rounded-2xl border p-4 text-left transition hover:shadow-md"
      style={{ borderColor: B.border, background: `${tile.fg}0A` }}
    >
      <button
        type="button"
        aria-label={favorite ? "Remove favourite" : "Add favourite"}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFav();
        }}
        className="absolute right-2.5 top-2.5 rounded-lg p-1 transition hover:bg-white/80"
      >
        <Star size={15} strokeWidth={2.2} color={starColor} fill={favorite ? starColor : "none"} />
      </button>
      <button
        type="button"
        className="flex w-full flex-col items-start gap-3 text-left"
        onClick={() => onOpen ? onOpen() : toast(`${svc.name} — coming soon on web`)}
      >
        <div
          className="flex h-11 w-11 items-center justify-center rounded-xl"
          style={{ background: showAsset ? "transparent" : tile.bg }}
        >
          {showAsset ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={assetSrc!}
              alt=""
              className="h-9 w-9 object-contain"
              onError={() => setAssetFailed(true)}
            />
          ) : null}
        </div>
        <div className="pr-5">
          <div className="text-sm font-semibold leading-snug" style={{ color: B.blue }}>
            {svc.name}
          </div>
          {svc.badge ? (
            <div className="mt-1 text-[10px] font-bold uppercase" style={{ color: tile.fg }}>
              {svc.badge}
            </div>
          ) : (
            <div className="mt-1 text-[10px] uppercase tracking-wide" style={{ color: B.muted }}>
              {svc.code.replace(/_/g, " ")}
            </div>
          )}
        </div>
      </button>
    </div>
  );
}

/** Figma dashboard service cards + Favourites strip (same icon style). */
export function ServiceCards({ title = "All Services" }: { title?: string }) {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const hydrate = useFavoritesStore((s) => s.hydrate);
  const codes = useFavoritesStore((s) => (userId ? selectFavoriteCodes(s, userId) : []));
  const toggle = useFavoritesStore((s) => s.toggle);
  const remove = useFavoritesStore((s) => s.remove);

  const [categories, setCategories] = useState<CatalogCategoryView[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchApi<CatalogCategoryView[]>("/catalog");
        if (alive) setCategories(data);
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

  const favorites = useMemo(() => {
    const all = flattenCatalogServices(categories);
    return codes
      .map((code) => all.find((s) => s.code === code))
      .filter((s): s is NonNullable<typeof s> => !!s);
  }, [categories, codes]);

  function handleToggle(code: string) {
    if (!userId) return;
    if (codes.includes(code)) {
      remove(userId, code);
      return;
    }
    const result = toggle(userId, code);
    if (result.limitReached) toast.error(`Maximum ${MAX_FAVORITES} favourites`);
  }

  if (loading) {
    return (
      <div className="rounded-2xl border bg-white p-6 text-sm" style={{ borderColor: B.border, color: B.muted }}>
        Loading services…
      </div>
    );
  }

  if (!categories.length) {
    return (
      <div className="rounded-2xl border bg-white p-6 text-sm" style={{ borderColor: B.border, color: B.muted }}>
        No services available. Run catalog seed on backend.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {favorites.length > 0 ? (
        <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.green }}>
          <div className="mb-4 flex items-center gap-2">
            <Star size={16} color={B.green} fill={B.green} />
            <div className="text-sm font-bold uppercase tracking-wider" style={{ color: B.muted }}>
              Favourites
            </div>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-bold"
              style={{ background: `${B.green}18`, color: B.greenDark }}
            >
              {favorites.length}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {favorites.map((svc, i) => (
              <ServiceIconCard
                key={svc.id}
                svc={svc}
                index={i}
                favorite
                onToggleFav={() => handleToggle(svc.code)}
                onOpen={resolveServiceRoute(svc.code) ? () => router.push(resolveServiceRoute(svc.code)!) : undefined}
              />
            ))}
          </div>
        </div>
      ) : null}

      <h2 className="text-lg font-bold" style={{ color: B.blue }}>
        {title}
      </h2>
      {categories.map((cat) => (
        <div key={cat.id} className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
          <div className="mb-4 text-sm font-bold uppercase tracking-wider" style={{ color: B.muted }}>
            {cat.name}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {cat.services.map((svc, i) => (
              <ServiceIconCard
                key={svc.id}
                svc={svc}
                index={i}
                favorite={codes.includes(svc.code)}
                onToggleFav={() => handleToggle(svc.code)}
                onOpen={resolveServiceRoute(svc.code) ? () => router.push(resolveServiceRoute(svc.code)!) : undefined}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
