"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { ChevronDown, Star, Megaphone, Building2, Receipt, Wallet, Landmark, LayoutGrid } from "lucide-react";
import { fetchApi } from "@/lib/api";
import type { CatalogCategoryView } from "@/lib/types";
import { B, brand } from "@/lib/brand";
import { serviceIconPath } from "@asanpay/shared-types";
import { DesignIcon, designTileColors, serviceCodeToDesignKey } from "@/lib/designIcons";
import { flattenCatalogServices } from "@/lib/catalog";
import { extractApiError, isKycServicesUnlocked } from "@/lib/onboarding";
import { MAX_FAVORITES, selectFavoriteCodes, useFavoritesStore } from "@/lib/favorites";
import { useAuthStore } from "@/lib/store";

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

/** Collapsed BBPS shows 2×8; View all expands the rest. */
const BBPS_PREVIEW = 16;

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
      className="group relative flex w-[6.75rem] shrink-0 flex-col items-center"
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
          className="mx-auto w-full text-center text-[11px] font-semibold leading-snug transition-colors duration-150 group-hover:text-[var(--tile-accent)]"
          style={{ color: B.blue }}
        >
          <span className="line-clamp-2 block min-h-[1.85rem]">{svc.name}</span>
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
  nowrap,
  /** Fixed columns (e.g. 8) — Recharges & Bills collapsed = 2 rows × 8. */
  columns,
}: {
  services: Svc[];
  codes: string[];
  onToggle: (code: string) => void;
  onOpen: (code: string) => void;
  nowrap?: boolean;
  columns?: 8;
}) {
  const layoutClass = columns
    ? "grid grid-cols-4 content-start items-start gap-x-5 gap-y-5 sm:grid-cols-4 md:grid-cols-8 md:gap-x-6 md:gap-y-6"
    : nowrap
      ? "flex flex-nowrap items-start justify-start gap-x-5 overflow-x-auto pb-1 sm:gap-x-6"
      : "flex flex-wrap content-start items-start justify-start gap-x-5 gap-y-5 sm:gap-x-6 sm:gap-y-6";

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
        return columns ? (
          <div key={svc.id} className="flex justify-center">
            {card}
          </div>
        ) : (
          <div key={svc.id}>{card}</div>
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
      className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${className}`}
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
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

/** Codes that sit on the top row next to the AePS box (screenshot layout). */
const BANKING_TOP_CODES = [
  "UPI_CASH_POINT",
  "MONEY_TRANSFER",
  "NEPAL_REMITTANCE",
  "NEPAL",
  "DMT",
  "CASH_COLLECTION",
];

/** Codes that sit on the second row under / aligned with AePS (Loans … Credit). */
const BANKING_BOTTOM_CODES = ["LOANS", "INSURANCE", "CREDIT_CARDS"];

/** Spice-style Banking: top row = same even 8-col grid as Recharges; AePS frame on first 4. */
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
  /** Same track math as BBPS: 8 cols, gap-x-5 / sm:gap-x-6 → first-4 width = 50% − half gap */
  const aepsFrameW = "w-[calc(50%-0.625rem)] sm:w-[calc(50%-0.75rem)]";

  return (
    <CardShell
      title="Banking Services"
      titleIcon={<Building2 size={21} strokeWidth={2.2} color="#2A5CDD" aria-hidden />}
    >
      <div className="flex w-full flex-col gap-5">
        <div className="relative pt-1">
          {aeps.length > 0 ? (
            <>
              <div
                aria-hidden
                className={`pointer-events-none absolute bottom-0 left-0 top-0 z-0 rounded-xl border-2 ${aepsFrameW}`}
                style={{ borderColor: "rgba(11,42,154,0.22)" }}
              />
              <div className={`pointer-events-none absolute left-0 top-0 z-20 h-0 ${aepsFrameW}`}>
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

          {/* Identical 8-col grid to Recharges and Bills — equal space between all icons */}
          <div className="relative z-10 grid grid-cols-4 content-start items-start gap-x-5 gap-y-5 sm:gap-x-6 md:grid-cols-8 md:gap-y-6">
            {topRow.map((svc, i) => (
              <div key={svc.id} className="flex justify-center">
                <ServiceIconCard
                  svc={svc}
                  index={i}
                  favorite={codes.includes(svc.code)}
                  onToggleFav={() => onToggle(svc.code)}
                  onOpen={() => onOpen(svc.code)}
                />
              </div>
            ))}
          </div>
        </div>

        {bottomRest.length > 0 ? (
          <div className="grid grid-cols-4 content-start items-start gap-x-5 gap-y-5 sm:gap-x-6 md:grid-cols-8 md:gap-y-6">
            {bottomRest.map((svc, i) => (
              <div key={svc.id} className="flex justify-center">
                <ServiceIconCard
                  svc={svc}
                  index={i + 10}
                  favorite={codes.includes(svc.code)}
                  onToggleFav={() => onToggle(svc.code)}
                  onOpen={() => onOpen(svc.code)}
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </CardShell>
  );
}

/** Side promo — ~380px so main services stay wider & readable. */
function DashboardAdBox() {
  return (
    <aside className="w-full shrink-0 xl:sticky xl:top-4 xl:w-[380px]" aria-label="Promotions">
      <div
        className="relative flex min-h-[400px] flex-col overflow-hidden rounded-2xl p-5 text-white shadow-md"
        style={{ background: B.badgeGrad }}
      >
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/10" />
        <div className="relative z-10 flex flex-1 flex-col">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/80">
            <Megaphone size={14} />
            Promotions
          </div>
          <h3 className="text-xl font-bold leading-snug sm:text-2xl">{brand.name} offers</h3>
          <p className="mt-2 text-sm leading-relaxed text-white/85">
            Promo panel for campaigns. Creative artwork can go here later.
          </p>
          <div className="mt-6 flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-white/35 bg-white/10 px-4 py-10 text-center">
            <p className="text-sm font-semibold text-white/90">Ad slot</p>
            <p className="mt-1 text-xs text-white/70">Reserved · content later</p>
          </div>
          <button
            type="button"
            disabled
            className="mt-5 w-full rounded-xl bg-white py-3 text-sm font-bold opacity-90"
            style={{ color: B.blue }}
          >
            Coming soon
          </button>
        </div>
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
    const topRest = BANKING_TOP_CODES.map((c) => byCodeSvc.get(c)).filter(
      (s): s is Svc => Boolean(s),
    );
    const bottomRest = BANKING_BOTTOM_CODES.map((c) => byCodeSvc.get(c)).filter(
      (s): s is Svc => Boolean(s),
    );
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
    <div className="flex flex-col items-stretch gap-4 xl:flex-row xl:items-start">
      <div className="min-w-0 flex-1 space-y-3">
        {favorites.length > 0 ? (
          <CardShell
            title="Favourites"
            titleIcon={<Star size={21} strokeWidth={2.2} color={B.green} aria-hidden />}
            action={
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold"
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
              columns={8}
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
  );
}
