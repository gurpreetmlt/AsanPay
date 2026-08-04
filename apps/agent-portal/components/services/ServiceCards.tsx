"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { ChevronDown, Star, Megaphone } from "lucide-react";
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

const AEPS_CODES = new Set([
  "CASH_WITHDRAW",
  "MINI_STATEMENT",
  "CASH_DEPOSIT",
  "BALANCE_ENQUIRY",
]);

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

/** First row of BBPS like Spice (~6–7); View all expands. */
const BBPS_PREVIEW = 12;

function resolveServiceRoute(code: string): string | null {
  const aepsTab = AEPS_TAB_MAP[code];
  if (aepsTab) return `/aeps?tab=${encodeURIComponent(aepsTab)}`;
  if (code === "UPI_CASH_POINT") return "/upi-cash-point";
  if (code === "MONEY_TRANSFER" || code === "DMT") return "/dmt";
  if (code === "NEPAL" || code === "NEPAL_REMITTANCE") return "/nepal";
  return null;
}

/** Compact Spice-style tile (~72px) so a full banking row fits on desktop. */
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
      className="group relative flex w-[4.25rem] shrink-0 flex-col items-center sm:w-[4.5rem]"
      style={{ "--tile-accent": tile.fg } as React.CSSProperties}
    >
      <button
        type="button"
        aria-label={favorite ? "Remove favourite" : "Add favourite"}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFav();
        }}
        className="absolute -right-0.5 top-0 z-10 rounded p-0.5 opacity-0 transition group-hover:opacity-100"
      >
        <Star size={10} strokeWidth={2.2} color={starColor} fill={favorite ? starColor : "none"} />
      </button>
      <button
        type="button"
        className="flex w-full flex-col items-center gap-0.5 text-center disabled:opacity-45"
        onClick={() => (onOpen ? onOpen() : toast(`${svc.name} — coming soon on web`))}
      >
        {svc.badge ? (
          <span
            className="max-w-full truncate rounded px-1 py-px text-[7px] font-bold uppercase leading-none tracking-tight"
            style={{ background: `${tile.fg}18`, color: tile.fg }}
            title={svc.badge}
          >
            {svc.badge}
          </span>
        ) : (
          <span className="h-[11px]" aria-hidden />
        )}
        {showAsset ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={assetSrc!}
            alt=""
            className="h-8 w-8 object-contain transition duration-150 ease-out group-hover:scale-105 sm:h-[34px] sm:w-[34px]"
            onError={() => setAssetFailed(true)}
          />
        ) : (
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg transition duration-150 ease-out group-hover:scale-105 sm:h-[34px] sm:w-[34px]"
            style={{ background: tile.bg }}
          >
            <DesignIcon name={designKey} size={18} color={tile.fg} />
          </div>
        )}
        <div
          className="line-clamp-2 min-h-[1.65rem] w-full text-center text-[9px] font-semibold leading-tight transition-colors duration-150 group-hover:text-[var(--tile-accent)] sm:text-[10px]"
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
  nowrap,
}: {
  services: Svc[];
  codes: string[];
  onToggle: (code: string) => void;
  onOpen: (code: string) => void;
  /** Prefer one horizontal row (scroll on small screens). */
  nowrap?: boolean;
}) {
  return (
    <div
      className={
        nowrap
          ? "flex flex-nowrap items-start gap-0.5 overflow-x-auto pb-0.5 sm:gap-1"
          : "flex flex-wrap content-start items-start gap-x-0.5 gap-y-2 sm:gap-x-1"
      }
    >
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

function CardShell({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white px-3 py-3 shadow-sm sm:px-4 sm:py-3.5 ${className}`}
      style={{ borderColor: B.border }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold" style={{ color: B.blue }}>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

/** Spice: AePS framed group + rest of banking tiles on ONE row. */
function BankingCard({
  aeps,
  rest,
  codes,
  onToggle,
  onOpen,
}: {
  aeps: Svc[];
  rest: Svc[];
  codes: string[];
  onToggle: (code: string) => void;
  onOpen: (code: string) => void;
}) {
  return (
    <CardShell title="Banking Services">
      <div className="flex flex-nowrap items-start gap-2 overflow-x-auto pb-0.5 sm:gap-3">
        {aeps.length > 0 ? (
          <div
            className="relative shrink-0 rounded-lg border px-1.5 pb-1.5 pt-3"
            style={{ borderColor: "rgba(11,42,154,0.2)" }}
          >
            <span
              className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2 rounded px-2 py-px text-[9px] font-extrabold tracking-wide text-white shadow-sm"
              style={{ background: B.badgeGrad }}
            >
              AePS
            </span>
            <div className="flex flex-nowrap items-start gap-0 sm:gap-0.5">
              {aeps.map((svc, i) => (
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
          </div>
        ) : null}

        {rest.length > 0 ? (
          <div className="flex min-w-0 flex-nowrap items-start gap-0 sm:gap-0.5">
            {rest.map((svc, i) => (
              <ServiceIconCard
                key={svc.id}
                svc={svc}
                index={i + 4}
                favorite={codes.includes(svc.code)}
                onToggleFav={() => onToggle(svc.code)}
                onOpen={() => onOpen(svc.code)}
              />
            ))}
          </div>
        ) : null}
      </div>
    </CardShell>
  );
}

/** ~450px side promo (content later). Matches Spice right rail. */
function DashboardAdBox() {
  return (
    <aside
      className="w-full shrink-0 xl:sticky xl:top-4 xl:w-[450px]"
      aria-label="Promotions"
    >
      <div
        className="relative flex min-h-[420px] flex-col overflow-hidden rounded-2xl p-5 text-white shadow-md"
        style={{ background: B.badgeGrad }}
      >
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/10" />
        <div className="relative z-10 flex flex-1 flex-col">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/80">
            <Megaphone size={14} />
            Promotions
          </div>
          <h3 className="text-xl font-bold leading-snug sm:text-2xl">
            {brand.name} offers
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-white/85">
            Side promo space (~450px). Campaign creatives will go here — decide content later.
          </p>
          <div
            className="mt-6 flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-white/35 bg-white/10 px-4 py-10 text-center"
          >
            <p className="text-sm font-semibold text-white/90">Ad slot</p>
            <p className="mt-1 text-xs text-white/70">450px width · reserved</p>
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
    const rest = bankingAll.filter((s) => !AEPS_CODES.has(s.code));

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

    return { aeps, rest, bbps, accept, govt, others };
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
      layout.rest.length +
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

        {(layout.aeps.length > 0 || layout.rest.length > 0) && (
          <BankingCard
            aeps={layout.aeps}
            rest={layout.rest}
            codes={codes}
            onToggle={handleToggle}
            onOpen={openService}
          />
        )}

        {layout.bbps.length > 0 && (
          <CardShell
            title={CATEGORY_NAME_OVERRIDES.BILL_PAYMENT_BBPS}
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
            />
          </CardShell>
        )}

        {(layout.accept.length > 0 || layout.govt.length > 0) && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {layout.accept.length > 0 && (
              <CardShell title="Accept Payments">
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
              <CardShell title="Govt. Services">
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
          <CardShell key={cat.id} title={CATEGORY_NAME_OVERRIDES[cat.code] ?? cat.name}>
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
