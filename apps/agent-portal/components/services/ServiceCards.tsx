"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { ChevronDown, Star, Building2, Receipt, Wallet, Landmark, LayoutGrid } from "lucide-react";
import { fetchApi } from "@/lib/api";
import type { CatalogCategoryView } from "@/lib/types";
import { B } from "@/lib/brand";
import { serviceIconPath } from "@asanpay/shared-types";
import { DesignIcon, designTileColors, serviceCodeToDesignKey } from "@/lib/designIcons";
import { flattenCatalogServices } from "@/lib/catalog";
import { extractApiError, isKycServicesUnlocked } from "@/lib/onboarding";
import { MAX_FAVORITES, selectFavoriteCodes, useFavoritesStore } from "@/lib/favorites";
import { useAuthStore } from "@/lib/store";
import { PromoSlider } from "@/components/promos/PromoSlider";

type Svc = { id: string; code: string; name: string; badge: string | null; icon: string | null };

const CATEGORY_NAME_OVERRIDES: Record<string, string> = {
  BILL_PAYMENT_BBPS: "Recharges and Bills",
};

const HIDDEN_SERVICE_CODES = new Set([
  "AGENT_COLLECTION",
  "SHG_WITHDRAW_CASH",
  "SHG_DEPOSIT_CASH",
]);

const HIDDEN_CATEGORY_CODES = new Set(["SHG_SERVICES", "MORE_SERVICES"]);

const AEPS_TAB_MAP: Record<string, string> = {
  CASH_WITHDRAW: "Withdraw",
  MINI_STATEMENT: "Mini Statement",
  CASH_DEPOSIT: "Deposit",
  BALANCE_ENQUIRY: "Balance Enquiry",
  AADHAAR_PAY: "Withdraw",
};

/** Collapsed BBPS shows 2×7; View all expands the rest. */
const BBPS_PREVIEW = 14;

function resolveServiceRoute(code: string): string | null {
  const aepsTab = AEPS_TAB_MAP[code];
  if (aepsTab) return `/aeps?tab=${encodeURIComponent(aepsTab)}`;
  if (code === "UPI_CASH_POINT") return "/upi-cash-point";
  if (code === "MONEY_TRANSFER" || code === "DMT") return "/dmt";
  if (code === "NEPAL" || code === "NEPAL_REMITTANCE") return "/nepal";
  return null;
}

/** Original colorful service art — same size on every card. */
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
      className="group relative mx-auto flex w-full max-w-[6.75rem] flex-col items-center"
      style={{ "--tile-accent": tile.fg } as React.CSSProperties}
    >
      <button
        type="button"
        aria-label={favorite ? "Remove favourite" : "Add favourite"}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFav();
        }}
        className="absolute right-0 top-0 z-10 rounded-md p-0.5 opacity-0 transition group-hover:opacity-100"
      >
        <Star size={11} strokeWidth={2.2} color={starColor} fill={favorite ? starColor : "none"} />
      </button>
      <button
        type="button"
        className="flex w-full flex-col items-center justify-start gap-1.5 text-center disabled:opacity-45"
        onClick={() => (onOpen ? onOpen() : toast(`${svc.name} — coming soon on web`))}
      >
        {/* Fixed badge row so AePS (no badge) lines up with NEW / Flat badges outside */}
        <span
          className="mx-auto flex h-[14px] w-full max-w-full items-center justify-center truncate rounded px-1 text-[8px] font-bold uppercase leading-none"
          style={
            svc.badge
              ? { background: `${tile.fg}18`, color: tile.fg }
              : { visibility: "hidden" }
          }
          title={svc.badge ?? undefined}
        >
          {svc.badge ?? "·"}
        </span>
        {showAsset ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={assetSrc!}
            alt=""
            className="mx-auto block h-12 w-12 object-contain transition duration-150 ease-out group-hover:scale-110 group-hover:drop-shadow-md"
            onError={() => setAssetFailed(true)}
          />
        ) : (
          <div
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl transition duration-150 ease-out group-hover:scale-110"
            style={{ background: tile.bg }}
          >
            <DesignIcon name={designKey} size={26} color={tile.fg} />
          </div>
        )}
        <div
          className="mx-auto w-full text-center text-[12px] font-semibold leading-snug transition-colors duration-150 group-hover:text-[var(--tile-accent)]"
          style={{ color: B.blue }}
        >
          <span className="line-clamp-2 block min-h-[1.85rem]">{svc.name}</span>
        </div>
      </button>
    </div>
  );
}

/** Shared responsive track — Banking + BBPS stay aligned on every breakpoint. */
const SERVICE_GRID =
  "grid grid-cols-4 content-start items-start gap-x-2.5 gap-y-5 sm:gap-x-3.5 sm:gap-y-5 lg:grid-cols-7 lg:gap-x-4 lg:gap-y-6";

function ServiceRow({
  services,
  codes,
  onToggle,
  onOpen,
  nowrap,
  /** Fixed columns — Recharges & Bills collapsed = 2 rows × 7. */
  columns,
}: {
  services: Svc[];
  codes: string[];
  onToggle: (code: string) => void;
  onOpen: (code: string) => void;
  nowrap?: boolean;
  columns?: 7;
}) {
  const layoutClass = columns
    ? SERVICE_GRID
    : nowrap
      ? "flex flex-nowrap items-start justify-start gap-x-4 overflow-x-auto pb-1 sm:gap-x-5"
      : "flex flex-wrap content-start items-start justify-start gap-x-4 gap-y-5 sm:gap-x-5 sm:gap-y-6";

  return (
    <div className={layoutClass}>
      {services.map((svc, i) => {
        const card = (
          <ServiceIconCard
            svc={svc}
            index={i}
            favorite={codes.includes(svc.code)}
            onToggleFav={() => onToggle(svc.code)}
            onOpen={() => onOpen(svc.code)}
          />
        );
        return (
          <div key={svc.id} className={nowrap && !columns ? "shrink-0" : "flex min-w-0 justify-center"}>
            {card}
          </div>
        );
      })}
    </div>
  );
}

function CardShell({
  title,
  titleIcon,
  action,
  children,
  className = "",
}: {
  title: string;
  titleIcon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white shadow-sm ${className}`}
      style={{ borderColor: B.border }}
    >
      <div
        className="flex items-center justify-between gap-2 border-b px-4 py-3.5 sm:px-5 sm:py-4"
        style={{ borderColor: B.border }}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {titleIcon}
          <h3 className="truncate text-base font-bold" style={{ color: B.blue }}>
            {title}
          </h3>
        </div>
        {action}
      </div>
      <div className="p-3.5 sm:p-5">{children}</div>
    </div>
  );
}

/** Top row with AePS (7-col): AePS×4 + UPI + Money Transfer + Cash Collection. */
const BANKING_TOP_CODES = [
  "UPI_CASH_POINT",
  "MONEY_TRANSFER",
  "DMT", // alias if MONEY_TRANSFER missing — layout dedupes below
  "CASH_COLLECTION",
];

/** Second row: Nepal Transfer, then Loans … Credit. */
const BANKING_BOTTOM_CODES = [
  "NEPAL_REMITTANCE",
  "NEPAL",
  "LOANS",
  "INSURANCE",
  "CREDIT_CARDS",
];

/** Banking: flat 7-col grid like before; AePS border overlays first 4 only. */
function BankingCard({
  aeps,
  topRest,
  bottomRest,
  codes,
  onToggle,
  onOpen,
}: {
  aeps: Svc[];
  topRest: Svc[];
  bottomRest: Svc[];
  codes: string[];
  onToggle: (code: string) => void;
  onOpen: (code: string) => void;
}) {
  const topRow = [...aeps, ...topRest];

  function tile(svc: Svc, index: number) {
    return (
      <div key={svc.id} className="relative z-10 flex min-w-0 justify-center">
        <ServiceIconCard
          svc={svc}
          index={index}
          favorite={codes.includes(svc.code)}
          onToggleFav={() => onToggle(svc.code)}
          onOpen={() => onOpen(svc.code)}
        />
      </div>
    );
  }

  return (
    <CardShell
      title="Banking Services"
      titleIcon={<Building2 size={21} strokeWidth={2.2} color="#2A5CDD" aria-hidden />}
    >
      <div className="flex w-full min-w-0 flex-col gap-5">
        {/* Inset AePS border so icons don't kiss the frame on narrow widths */}
        <div className="relative min-w-0 px-1 pt-3 sm:px-1.5">
          {aeps.length > 0 ? (
            <>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-1 top-3 z-0 rounded-xl border-2 max-lg:bottom-[calc(50%+0.625rem)] sm:inset-x-1.5 lg:inset-x-auto lg:left-0 lg:bottom-0 lg:w-[calc(57.14%-0.85rem)]"
                style={{ borderColor: "rgba(11,42,154,0.22)" }}
              />
              <div className="pointer-events-none absolute inset-x-1 top-3 z-20 h-0 sm:inset-x-1.5 lg:inset-x-auto lg:left-0 lg:w-[calc(57.14%-0.85rem)]">
                <span
                  className="absolute right-2 top-0 flex h-6 w-[110px] -translate-y-1/2 items-center justify-center rounded-md border bg-white px-1.5 shadow-sm sm:right-2.5"
                  style={{ borderColor: B.border }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/assets/AEPS-Logo.png"
                    alt="AePS — Aadhaar Enabled Payment System"
                    className="h-[22px] w-[100px] object-contain"
                  />
                </span>
              </div>
            </>
          ) : null}

          <div className={`relative min-w-0 px-1.5 sm:px-2 ${SERVICE_GRID}`}>
            {topRow.map((svc, i) => tile(svc, i))}
          </div>
        </div>

        {bottomRest.length > 0 ? (
          <div className={`min-w-0 px-2.5 sm:px-3.5 ${SERVICE_GRID}`}>
            {bottomRest.map((svc, i) => tile(svc, i + 10))}
          </div>
        ) : null}
      </div>
    </CardShell>
  );
}

/** Side promo — image slider from Admin → Promotions (dashboard placement). */
function DashboardAdBox() {
  return (
    <aside
      className="flex w-full shrink-0 flex-col xl:w-[380px] 2xl:w-[420px]"
      aria-label="Promotions"
    >
      <div className="h-full min-h-[320px] flex-1">
        <PromoSlider placement="dashboard" fill />
      </div>
    </aside>
  );
}

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
  const [bbpsOpen, setBbpsOpen] = useState(false);
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

  const layout = useMemo(() => {
    const byCode = new Map(categories.map((c) => [c.code, c]));
    const filterSvc = (list: Svc[] | undefined) =>
      (list ?? []).filter((s) => !HIDDEN_SERVICE_CODES.has(s.code));

    const bankingRaw = filterSvc(byCode.get("BANKING_SERVICES")?.services);
    const moreRaw = filterSvc(byCode.get("MORE_SERVICES")?.services);
    const bankingAll = [...bankingRaw, ...moreRaw];

    const aepsOrder = ["CASH_WITHDRAW", "MINI_STATEMENT", "CASH_DEPOSIT", "BALANCE_ENQUIRY"];
    const aeps = aepsOrder
      .map((code) => bankingAll.find((s) => s.code === code))
      .filter((s): s is Svc => Boolean(s));

    const byCodeSvc = new Map(bankingAll.map((s) => [s.code, s]));
    const topRestRaw = BANKING_TOP_CODES.map((c) => byCodeSvc.get(c)).filter(
      (s): s is Svc => Boolean(s),
    );
    // Prefer MONEY_TRANSFER over DMT so row stays AePS + 3 icons.
    const topRest: Svc[] = [];
    const topSeen = new Set<string>();
    for (const s of topRestRaw) {
      const key = s.code === "DMT" || s.code === "MONEY_TRANSFER" ? "MONEY_TRANSFER" : s.code;
      if (topSeen.has(key)) continue;
      topSeen.add(key);
      topRest.push(s);
    }
    const bottomRestRaw = BANKING_BOTTOM_CODES.map((c) => byCodeSvc.get(c)).filter(
      (s): s is Svc => Boolean(s),
    );
    const bottomRest: Svc[] = [];
    const bottomSeen = new Set<string>();
    for (const s of bottomRestRaw) {
      const key = s.code === "NEPAL" || s.code === "NEPAL_REMITTANCE" ? "NEPAL" : s.code;
      if (bottomSeen.has(key)) continue;
      bottomSeen.add(key);
      bottomRest.push(s);
    }
    const used = new Set([
      ...aeps.map((s) => s.code),
      ...topRest.map((s) => s.code),
      ...bottomRest.map((s) => s.code),
    ]);
    /** Any leftover banking tiles go on the bottom row after the known set. */
    const leftover = bankingAll.filter((s) => !used.has(s.code));
    const bottomAll = [...bottomRest, ...leftover];

    const bbps = filterSvc(byCode.get("BILL_PAYMENT_BBPS")?.services);
    const accept = filterSvc(byCode.get("ACCEPT_PAYMENTS")?.services);
    const govt = filterSvc(byCode.get("GOVT_SERVICES")?.services);

    const others = categories.filter(
      (c) =>
        !HIDDEN_CATEGORY_CODES.has(c.code) &&
        !["BANKING_SERVICES", "BILL_PAYMENT_BBPS", "ACCEPT_PAYMENTS", "GOVT_SERVICES"].includes(
          c.code,
        ) &&
        filterSvc(c.services).length > 0,
    );

    return { aeps, topRest, bottomRest: bottomAll, bbps, accept, govt, others };
  }, [categories]);

  const favorites = useMemo(() => {
    const all = flattenCatalogServices(
      categories
        .filter((c) => !HIDDEN_CATEGORY_CODES.has(c.code) || c.code === "MORE_SERVICES")
        .map((c) => ({
          ...c,
          services: (c.services ?? []).filter((s) => !HIDDEN_SERVICE_CODES.has(s.code)),
        })),
    );
    return codes
      .map((code) => all.find((s) => s.code === code))
      .filter((s): s is NonNullable<typeof s> => !!s);
  }, [categories, codes]);

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

  if (loading) {
    return (
      <div className="rounded-2xl border bg-white p-6 text-sm" style={{ borderColor: B.border, color: B.muted }}>
        Loading services…
      </div>
    );
  }

  const hasAny =
    layout.aeps.length +
      layout.topRest.length +
      layout.bottomRest.length +
      layout.bbps.length +
      layout.accept.length +
      layout.govt.length +
      layout.others.length >
    0;

  if (!hasAny) {
    return (
      <div className="rounded-2xl border bg-white p-6 text-sm" style={{ borderColor: B.border, color: B.muted }}>
        No active services. Ask admin to enable them under Site Control, or re-run catalog seed on the backend.
      </div>
    );
  }

  const bbpsShown =
    bbpsOpen || layout.bbps.length <= BBPS_PREVIEW
      ? layout.bbps
      : layout.bbps.slice(0, BBPS_PREVIEW);

  return (
    <div className="min-w-0 space-y-3">
      {favorites.length > 0 ? (
        <CardShell
          title="Favourites"
          titleIcon={<Star size={21} strokeWidth={2.2} color={B.green} aria-hidden />}
          action={
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-bold"
              style={{ background: `${B.green}18`, color: B.greenDark }}
            >
              {favorites.length}
            </span>
          }
        >
          <ServiceRow
            services={favorites}
            codes={codes}
            onToggle={handleToggle}
            onOpen={openService}
            nowrap
          />
        </CardShell>
      ) : null}

      <h2 className="text-base font-bold md:text-lg" style={{ color: B.blue }}>
        {title}
      </h2>

      {/* Banking + Ad share the same top edge; ad stretches to bottom of this column */}
      <div className="flex flex-col items-stretch gap-4 xl:flex-row">
        <div className="min-w-0 flex-1 space-y-3">
          {(layout.aeps.length > 0 || layout.topRest.length > 0 || layout.bottomRest.length > 0) && (
            <BankingCard
              aeps={layout.aeps}
              topRest={layout.topRest}
              bottomRest={layout.bottomRest}
              codes={codes}
              onToggle={handleToggle}
              onOpen={openService}
            />
          )}

          {layout.bbps.length > 0 && (
            <CardShell
              title={CATEGORY_NAME_OVERRIDES.BILL_PAYMENT_BBPS}
              titleIcon={<Receipt size={21} strokeWidth={2.2} color="#7A56D6" aria-hidden />}
              action={
                layout.bbps.length > BBPS_PREVIEW ? (
                  <button
                    type="button"
                    onClick={() => setBbpsOpen((v) => !v)}
                    className="inline-flex items-center gap-0.5 text-xs font-bold"
                    style={{ color: B.blueLight }}
                  >
                    {bbpsOpen ? "Show less" : "View all"}
                    <ChevronDown
                      size={14}
                      style={{
                        transform: bbpsOpen ? "rotate(180deg)" : "none",
                        transition: "transform 150ms",
                      }}
                    />
                  </button>
                ) : null
              }
            >
              <ServiceRow
                services={bbpsShown}
                codes={codes}
                onToggle={handleToggle}
                onOpen={openService}
                columns={7}
              />
            </CardShell>
          )}

          {(layout.accept.length > 0 || layout.govt.length > 0) && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {layout.accept.length > 0 && (
                <CardShell
                  title="Accept Payments"
                  titleIcon={<Wallet size={21} strokeWidth={2.2} color="#E8843C" aria-hidden />}
                >
                  <ServiceRow
                    services={layout.accept}
                    codes={codes}
                    onToggle={handleToggle}
                    onOpen={openService}
                    nowrap
                  />
                </CardShell>
              )}
              {layout.govt.length > 0 && (
                <CardShell
                  title="Govt. Services"
                  titleIcon={<Landmark size={21} strokeWidth={2.2} color="#E8843C" aria-hidden />}
                >
                  <ServiceRow
                    services={layout.govt}
                    codes={codes}
                    onToggle={handleToggle}
                    onOpen={openService}
                    nowrap
                  />
                </CardShell>
              )}
            </div>
          )}

          {layout.others.map((cat) => (
            <CardShell
              key={cat.id}
              title={CATEGORY_NAME_OVERRIDES[cat.code] ?? cat.name}
              titleIcon={<LayoutGrid size={21} strokeWidth={2.2} color="#2A5CDD" aria-hidden />}
            >
              <ServiceRow
                services={(cat.services ?? []).filter((s) => !HIDDEN_SERVICE_CODES.has(s.code))}
                codes={codes}
                onToggle={handleToggle}
                onOpen={openService}
              />
            </CardShell>
          ))}
        </div>

        <DashboardAdBox />
      </div>
    </div>
  );
}
