/** Design tile palettes + stroke icons — same as mobile `designIcons.tsx`. */
export const DESIGN_TILE_PALETTES: [string, string][] = [
  ["#EEF3FF", "#2A5CDD"],
  ["#E7FBF1", "#11A362"],
  ["#FFF1E9", "#E8843C"],
  ["#F3EEFF", "#7A56D6"],
  ["#FDEEF3", "#D94C79"],
  ["#EAF6FF", "#2B90D9"],
];

export function designTileColors(index: number, dark: boolean): { bg: string; fg: string } {
  const [bg, fg] = DESIGN_TILE_PALETTES[index % DESIGN_TILE_PALETTES.length]!;
  return dark ? { bg: "rgba(255,255,255,.055)", fg } : { bg, fg };
}

/** Map backend service `code` → design icon key */
export function serviceCodeToDesignKey(code: string): DesignIconName {
  const c = code.toUpperCase();

  const exact: Partial<Record<string, DesignIconName>> = {
    CASH_WITHDRAW: "aeps",
    AADHAAR_PAY: "aeps",
    SHG_WITHDRAW_CASH: "aeps",
    MINI_STATEMENT: "ministmt",
    CASH_DEPOSIT: "cash",
    CASH_COLLECTION: "collection",
    SHG_DEPOSIT_CASH: "cash",
    AGENT_COLLECTION: "collection",
    BALANCE_ENQUIRY: "balenq",
    UPI_CASH_POINT: "upi",
    MONEY_TRANSFER: "dmt",
    NEPAL_REMITTANCE: "dmt",
    NEPAL: "dmt",
    MINI_ATM: "miniatm",
    MICRO_ATM: "microatm",
    MOBILE_PREPAID: "recharge",
    MOBILE_RECHARGE: "recharge",
    MOBILE_POSTPAID: "recharge",
    NCMC_RECHARGE: "recharge",
    DTH: "dth",
    CABLE_TV: "tv",
    FASTAG_RECHARGE: "fastag",
    FLEET_CARD_RECHARGE: "fuel",
    LOANS: "loans",
    LOAN_REPAYMENT: "loans",
    INSURANCE: "insurance",
    INSURANCE_PREMIUM: "insurance",
    LIC: "insurance",
    LIC_SUVIDHA: "insurance",
    NPS: "bank",
    CREDIT_CARDS: "card",
    CREDIT_CARD_BILL: "card",
    LANDLINE_POSTPAID: "landline",
    BROADBAND_POSTPAID: "wifi",
    ELECTRICITY: "electricity",
    WATER: "water",
    GAS_PIPELINE: "gas",
    LPG_CYLINDER: "lpg",
    PREPAID_METER: "meter",
    DONATION: "gift",
    EDUCATION_FEES: "education",
    MUNICIPAL_TAXES: "tax",
    MUNICIPAL_SERVICES: "building",
    HOUSING_SOCIETY: "society",
    RENTAL: "home",
    CLUBS_AND_ASSOCIATIONS: "users",
    SUBSCRIPTION: "subscription",
    ECHALLAN: "ticket",
    EV_RECHARGE: "ev",
    APPLY_EPAN: "pan",
  };

  if (exact[c]) return exact[c]!;
  if (c.startsWith("BBPS")) return "bbps";
  if (c.includes("PAN")) return "pan";
  if (c.includes("TRAVEL")) return "travel";
  return "bbps";
}

export function categoryIconToDesignKey(icon: string | null): DesignIconName {
  if (!icon) return "grid";
  const i = icon.toLowerCase();
  if (i.includes("landmark") || i.includes("bank")) return "bank";
  if (i.includes("receipt") || i.includes("file")) return "doc";
  if (i.includes("fingerprint")) return "aeps";
  if (i.includes("building") || i.includes("users")) return "store";
  if (i.includes("star")) return "star";
  if (i.includes("grid") || i.includes("layout")) return "grid";
  if (i.includes("trend")) return "trend";
  return "grid";
}

export type DesignIconName =
  | "aeps"
  | "dmt"
  | "bbps"
  | "recharge"
  | "dth"
  | "cash"
  | "ministmt"
  | "balenq"
  | "miniatm"
  | "microatm"
  | "upi"
  | "insurance"
  | "loans"
  | "pan"
  | "travel"
  | "more"
  | "wallet"
  | "reports"
  | "home"
  | "profile"
  | "scan"
  | "bell"
  | "gift"
  | "doc"
  | "store"
  | "star"
  | "bank"
  | "grid"
  | "trend"
  | "shield"
  | "settle"
  | "card"
  | "landline"
  | "collection"
  | "fastag"
  | "wifi"
  | "education"
  | "building"
  | "users"
  | "subscription"
  | "ticket"
  | "bolt"
  | "water"
  | "lpg"
  | "gas"
  | "electricity"
  | "meter"
  | "tax"
  | "society"
  | "ev"
  | "fuel"
  | "tv";

interface Props {
  name: DesignIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/** AsanPay stroke icons — same as mobile `DesignIcon`, solid color, no Lucide. */
export function DesignIcon({ name, size = 26, color = "#2A5CDD", strokeWidth = 2.35 }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
  };
  const s = { stroke: color, strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  switch (name) {
    case "aeps":
      /* Cash Withdraw — hand holding Aadhaar-style card */
      return (
        <svg {...common}>
          <path d="M8 14.5c0-1.4 1.1-2.5 2.5-2.5h7a2 2 0 0 1 2 2v4.2a1.8 1.8 0 0 1-1.8 1.8H9.2A1.2 1.2 0 0 1 8 18.8z" {...s} />
          <rect x={10.2} y={7} width={7.6} height={5.2} rx={0.9} {...s} />
          <path d="M12.2 9.6c0-.9.7-1.5 1.6-1.5.6 0 1 .3 1.2.7" {...s} />
          <path d="M13.8 10.8v.6" {...s} />
          <path d="M5.5 13.2c1.2-.2 2.2.5 2.5 1.5" {...s} />
          <path d="M4.8 16.2c.8-1.2 1.8-1.8 3.2-1.8" {...s} />
        </svg>
      );
    case "dmt":
      /* Money Transfer — note + swap arrows */
      return (
        <svg {...common}>
          <rect x={4} y={6} width={16} height={12} rx={2} {...s} />
          <path d="M12 9.2v5.6M10.2 11.2 12 9.2l1.8 2M10.2 14.2 12 16.2l1.8-2" {...s} />
          <path d="M7 10.5h1.2M15.8 13.5H17" {...s} />
        </svg>
      );
    case "bbps":
      return (
        <svg {...common}>
          <path d="M7 3h10v18l-2.2-1.2L12.5 21 10 19.8 7 21z" {...s} />
          <path d="M10 8h4" {...s} />
          <path d="M10 12h4" {...s} />
        </svg>
      );
    case "recharge":
      return (
        <svg {...common}>
          <rect x={8} y={3} width={8} height={18} rx={2} {...s} />
          <path d="M11 18h2" {...s} />
          <path d="M4 8a5 5 0 0 1 0 8" {...s} />
          <path d="M20 8a5 5 0 0 0 0 8" {...s} />
        </svg>
      );
    case "dth":
      return (
        <svg {...common}>
          <path d="M4 18a10 10 0 0 1 10-10" {...s} />
          <path d="M4 13a5 5 0 0 1 5-5" {...s} />
          <circle cx={5} cy={18} r={1} stroke={color} strokeWidth={strokeWidth} fill="none" />
          <rect x={12} y={3} width={9} height={6} rx={1.5} transform="rotate(20 16 6)" {...s} />
        </svg>
      );
    case "cash":
      /* Cash Deposit — hand holding coin */
      return (
        <svg {...common}>
          <circle cx={12} cy={9} r={3.4} stroke={color} strokeWidth={strokeWidth} fill="none" />
          <path d="M12 7.4v3.2M10.8 8.4h2.4" {...s} />
          <path d="M6.5 14.5c1.2-1.4 2.8-2.1 5.5-2.1s4.3.7 5.5 2.1" {...s} />
          <path d="M5.5 18.5c.8-2 2.5-3.1 6.5-3.1s5.7 1.1 6.5 3.1" {...s} />
        </svg>
      );
    case "ministmt":
      /* Mini Statement — jagged receipt */
      return (
        <svg {...common}>
          <path d="M7 3.5h10v14.5l-1.6-1-1.6 1-1.6-1-1.6 1-1.6-1-1.6 1z" {...s} />
          <path d="M10 7.5h4M10 11h4M10 14.5h2.5" {...s} />
        </svg>
      );
    case "balenq":
      /* Balance Enquiry — money bag + fingerprint hint */
      return (
        <svg {...common}>
          <path d="M9.2 8.2 10.5 5.5h3L15 8.2" {...s} />
          <path d="M8 9.2h8l1.2 9.3a1.6 1.6 0 0 1-1.6 1.8H8.4a1.6 1.6 0 0 1-1.6-1.8z" {...s} />
          <path d="M12 11.2c1.1 0 1.8.8 1.8 1.8 0 1.5-1.8 2.4-1.8 3.4" {...s} />
          <path d="M10.5 13.2c0-.7.5-1.2 1.2-1.4" {...s} />
        </svg>
      );
    case "miniatm":
      return (
        <svg {...common}>
          <rect x={3} y={5} width={18} height={14} rx={2} {...s} />
          <path d="M3 9h18" {...s} />
          <path d="M6 14h4" {...s} />
        </svg>
      );
    case "microatm":
      return (
        <svg {...common}>
          <rect x={6} y={3} width={12} height={18} rx={2} {...s} />
          <path d="M9 6h6" {...s} />
          <circle cx={12} cy={14} r={2.3} stroke={color} strokeWidth={strokeWidth} fill="none" />
        </svg>
      );
    case "upi":
      /* UPI Cash Point — QR frame + ₹ */
      return (
        <svg {...common}>
          <path d="M5 8V5.5A1.5 1.5 0 0 1 6.5 4H9" {...s} />
          <path d="M15 4h2.5A1.5 1.5 0 0 1 19 5.5V8" {...s} />
          <path d="M19 16v2.5a1.5 1.5 0 0 1-1.5 1.5H15" {...s} />
          <path d="M9 20H6.5A1.5 1.5 0 0 1 5 18.5V16" {...s} />
          <path d="M9.2 10.2h5.6M12 10.2v6.2M10 13.3h4" {...s} />
          <path d="M4.5 12.2h15" {...s} />
        </svg>
      );
    case "insurance":
      return (
        <svg {...common}>
          <path d="M12 3l7 3v5c0 4.2-3 7.3-7 8.7C8 18.3 5 15.2 5 11V6z" {...s} />
          <path d="M9 11.5l2 2 4-4.5" {...s} />
        </svg>
      );
    case "loans":
      /* Loans — money bag with % */
      return (
        <svg {...common}>
          <path d="M9.2 8 10.6 5.2h2.8L14.8 8" {...s} />
          <path d="M7.8 9h8.4l1.3 9.2a1.7 1.7 0 0 1-1.7 1.9H8.2a1.7 1.7 0 0 1-1.7-1.9z" {...s} />
          <path d="M10 13.2l4 3.2M10.4 16.2h.1M13.5 13.2h.1" {...s} />
        </svg>
      );
    case "pan":
      return (
        <svg {...common}>
          <rect x={3} y={5} width={18} height={14} rx={2} {...s} />
          <circle cx={8} cy={11} r={2} stroke={color} strokeWidth={strokeWidth} fill="none" />
          <path d="M14 9h4M14 12.5h4" {...s} />
          <path d="M6 15.5c0-1.4 1-2.2 2-2.2s2 .8 2 2.2" {...s} />
        </svg>
      );
    case "travel":
      return (
        <svg {...common}>
          <path d="M21 15.5l-18 5.5 4.5-7L3 6.5 21 12l-8 2z" {...s} />
        </svg>
      );
    case "wallet":
      return (
        <svg {...common}>
          <path d="M3 8a2 2 0 0 1 2-2h12v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" {...s} />
          <path d="M17 9h4v6h-4a3 3 0 0 1 0-6z" {...s} />
          <circle cx={18.5} cy={12} r={0.6} fill={color} stroke="none" />
        </svg>
      );
    case "reports":
    case "trend":
      return (
        <svg {...common}>
          {name === "reports" ? (
            <path d="M5 20V11M10 20V4M15 20v-6M20 20V8" {...s} />
          ) : (
            <>
              <path d="M4 15l5-5 4 4 7-8" {...s} />
              <path d="M20 6h-4M20 6v4" {...s} />
            </>
          )}
        </svg>
      );
    case "bank":
      return (
        <svg {...common}>
          <path d="M4 10l8-5 8 5" {...s} />
          <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" {...s} />
          <path d="M3.5 20h17" {...s} />
        </svg>
      );
    case "grid":
      return (
        <svg {...common}>
          <rect x={4} y={4} width={6} height={6} rx={1.5} {...s} />
          <rect x={14} y={4} width={6} height={6} rx={1.5} {...s} />
          <rect x={4} y={14} width={6} height={6} rx={1.5} {...s} />
          <rect x={14} y={14} width={6} height={6} rx={1.5} {...s} />
        </svg>
      );
    case "star":
      return (
        <svg {...common}>
          <path
            d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"
            fill={color}
            stroke={color}
            strokeWidth={1}
            strokeLinejoin="round"
          />
        </svg>
      );
    case "store":
      return (
        <svg {...common}>
          <path d="M4 9l1-5h14l1 5M4 9v10h16V9M4 9h16" {...s} />
          <path d="M4 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" {...s} />
        </svg>
      );
    case "doc":
      return (
        <svg {...common}>
          <path d="M7 3h7l4 4v14H7z" {...s} />
          <path d="M14 3v4h4M10 12h5M10 16h5" {...s} />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3l7 3v5c0 4.2-3 7.3-7 8.7C8 18.3 5 15.2 5 11V6z" {...s} />
        </svg>
      );
    case "gift":
      return (
        <svg {...common}>
          <rect x={4} y={8} width={16} height={12} rx={1.5} {...s} />
          <path d="M4 12h16M12 8v12" {...s} />
          <path d="M12 8C10 8 8 7 8 5.5S10 4 12 8zM12 8c2 0 4-1 4-2.5S14 4 12 8z" {...s} />
        </svg>
      );
    case "scan":
      return (
        <svg {...common}>
          <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" {...s} />
          <path d="M4 12h16" {...s} />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" {...s} />
          <path d="M10 19a2 2 0 0 0 4 0" {...s} />
        </svg>
      );
    case "profile":
      return (
        <svg {...common}>
          <circle cx={12} cy={8} r={3.4} stroke={color} strokeWidth={strokeWidth} fill="none" />
          <path d="M5.5 20c.6-3.4 3.2-5 6.5-5s5.9 1.6 6.5 5" {...s} />
        </svg>
      );
    case "home":
      return (
        <svg {...common}>
          <path d="M4 11l8-6.5L20 11" {...s} />
          <path d="M6 10v9h12v-9" {...s} />
        </svg>
      );
    case "settle":
      return (
        <svg {...common}>
          <path d="M4 8h13M14 5l3 3-3 3" {...s} />
          <path d="M20 16H7M10 13l-3 3 3 3" {...s} />
        </svg>
      );
    case "card":
      /* Credit Cards — overlapping cards + chip */
      return (
        <svg {...common}>
          <rect x={5} y={5} width={14} height={9.5} rx={1.6} {...s} />
          <rect x={7.5} y={9.5} width={14} height={9.5} rx={1.6} {...s} />
          <rect x={9.2} y={12.2} width={2.8} height={2.2} rx={0.4} {...s} />
          <path d="M13.5 13.2h4.5M13.5 15.2h3" {...s} />
        </svg>
      );
    case "landline":
      return (
        <svg {...common}>
          <path
            d="M8 3h3.5a1 1 0 0 1 1 1v2.5a1 1 0 0 1-1 1H9.5l-.8 1.8A10 10 0 0 0 15.2 15.8L17 15v-1.5a1 1 0 0 1 1-1H20.5a1 1 0 0 1 1 1V17a3 3 0 0 1-3 3A12 12 0 0 1 6.5 8.5 3 3 0 0 1 8 5.5z"
            {...s}
          />
        </svg>
      );
    case "collection":
      /* Cash Collection — two hands passing a bill */
      return (
        <svg {...common}>
          <path d="M4.5 14.5c1.5-1.8 3.2-2.6 5.5-2.6h2.2" {...s} />
          <path d="M4 17.5c1.2-1.5 2.8-2.2 5.2-2.2h3" {...s} />
          <rect x={10} y={7.5} width={7.5} height={4.8} rx={0.8} {...s} />
          <path d="M12.2 10h3.2" {...s} />
          <path d="M16.5 13.5c1.6.3 2.8 1.3 3.3 2.8" {...s} />
          <path d="M14.8 16c1.3.2 2.3 1 2.8 2.2" {...s} />
        </svg>
      );
    case "fastag":
      return (
        <svg {...common}>
          <rect x={3} y={7} width={18} height={10} rx={2} {...s} />
          <path d="M7 12h3M13 12h4" {...s} />
          <path d="M3 10h18" {...s} />
        </svg>
      );
    case "wifi":
      return (
        <svg {...common}>
          <path d="M5 10.5a9 9 0 0 1 14 0" {...s} />
          <path d="M8 13.5a5 5 0 0 1 8 0" {...s} />
          <circle cx={12} cy={17} r={1.2} fill={color} stroke="none" />
        </svg>
      );
    case "education":
      return (
        <svg {...common}>
          <path d="M3 10l9-5 9 5-9 5-9-5z" {...s} />
          <path d="M7 12.5v4.2c0 .8 2.2 2.3 5 2.3s5-1.5 5-2.3v-4.2" {...s} />
          <path d="M21 10v6" {...s} />
        </svg>
      );
    case "building":
      return (
        <svg {...common}>
          <path d="M5 21V7l7-4 7 4v14" {...s} />
          <path d="M9 21v-5h6v5" {...s} />
          <path d="M9 10h1.5M13.5 10H15M9 14h1.5M13.5 14H15" {...s} />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <circle cx={9} cy={8} r={2.5} stroke={color} strokeWidth={strokeWidth} fill="none" />
          <circle cx={16} cy={9} r={2} stroke={color} strokeWidth={strokeWidth} fill="none" />
          <path d="M3.5 19c.7-3.2 3-5 5.5-5s4.8 1.8 5.5 5" {...s} />
          <path d="M14 14.2c1.7-.3 3.4.5 4.5 2.8" {...s} />
        </svg>
      );
    case "subscription":
      return (
        <svg {...common}>
          <circle cx={12} cy={12} r={8.5} stroke={color} strokeWidth={strokeWidth} fill="none" />
          <path d="M10 9.5l5 2.5-5 2.5z" {...s} />
        </svg>
      );
    case "ticket":
      return (
        <svg {...common}>
          <path d="M4 8a2 2 0 0 0 2-2h12a2 2 0 0 0 2 2v8a2 2 0 0 0-2 2H6a2 2 0 0 0-2-2z" {...s} />
          <path d="M10 7v10" {...s} strokeDasharray="2 2" />
        </svg>
      );
    case "water":
      return (
        <svg {...common}>
          <path d="M6 10h5.5a2.5 2.5 0 0 1 0 5H10" {...s} />
          <path d="M6 8v10" {...s} />
          <path d="M4.5 8H7.5" {...s} />
          <path d="M14.5 15.2c0 1.5-1.2 2.8-2.5 2.8S9.5 16.7 9.5 15.2 12 12 12 12s2.5 1.7 2.5 3.2z" {...s} />
        </svg>
      );
    case "lpg":
      return (
        <svg {...common}>
          <path d="M9 8h6v11a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" {...s} />
          <path d="M10 8V6.5A1.5 1.5 0 0 1 11.5 5h1A1.5 1.5 0 0 1 14 6.5V8" {...s} />
          <path d="M11 3.5h2" {...s} />
          <path d="M9.5 13h5" {...s} />
          <path d="M9.5 16.5h5" {...s} />
        </svg>
      );
    case "gas":
      return (
        <svg {...common}>
          <path d="M7 20V9h3v11z" {...s} />
          <path d="M10 12h4.5" {...s} />
          <path d="M14.5 12c1.2 0 2.2-.6 2.8-1.5.4 1.4-.2 2.8-1.4 3.4 1 .8 1.2 2.2.3 3.2-.9.9-2.3.7-3-.3" {...s} />
        </svg>
      );
    case "electricity":
      return (
        <svg {...common}>
          <path d="M9 3h6l1 7H14l1.5 11L8 10h3.5z" {...s} />
          <path d="M11 7h2" {...s} />
        </svg>
      );
    case "meter":
      return (
        <svg {...common}>
          <rect x={5} y={4} width={14} height={16} rx={2} {...s} />
          <rect x={8} y={7} width={8} height={5} rx={1} {...s} />
          <path d="M9 15h2M13 15h2M9 18h2M13 18h2" {...s} />
        </svg>
      );
    case "tax":
      return (
        <svg {...common}>
          <path d="M8 7v10" {...s} />
          <path d="M5.5 9.5C5.5 8 6.7 7 8 7s2.5 1 2.5 2.5S9.3 12 8 12s-2.5 1-2.5 2.5S6.7 17 8 17s2.5-1 2.5-2.5" {...s} />
          <path d="M14 8l5 8M19 8l-5 8" {...s} />
        </svg>
      );
    case "society":
      return (
        <svg {...common}>
          <path d="M4 20V9l5-3 5 3v11" {...s} />
          <path d="M14 20V11l4-2.2V20" {...s} />
          <path d="M7.5 12h2M7.5 15.5h2M11.5 12H13" {...s} />
        </svg>
      );
    case "ev":
      return (
        <svg {...common}>
          <path d="M4 15h13l2-4H7l-1.2-2H4z" {...s} />
          <circle cx={8} cy={17} r={1.6} stroke={color} strokeWidth={strokeWidth} fill="none" />
          <circle cx={15} cy={17} r={1.6} stroke={color} strokeWidth={strokeWidth} fill="none" />
          <path d="M17.5 11l1.5-4h2" {...s} />
          <path d="M12 6.5L10 10h2l-1 3.5" {...s} />
        </svg>
      );
    case "fuel":
      return (
        <svg {...common}>
          <path d="M6 21V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16" {...s} />
          <path d="M5 21h12" {...s} />
          <path d="M15 9h2.2a2 2 0 0 1 2 2V16a1.5 1.5 0 0 0 3 0V10l-2-2" {...s} />
          <path d="M9 8h3M9 11.5h3" {...s} />
        </svg>
      );
    case "tv":
      return (
        <svg {...common}>
          <rect x={3} y={7} width={18} height={12} rx={2} {...s} />
          <path d="M8 4l4 3 4-3" {...s} />
          <path d="M9 21h6" {...s} />
        </svg>
      );
    case "bolt":
      return (
        <svg {...common}>
          <path d="M13 3L6 13h5l-1 8 7-10h-5z" {...s} />
        </svg>
      );
    case "more":
    default:
      return (
        <svg {...common}>
          <circle cx={6} cy={12} r={1.4} fill={color} stroke="none" />
          <circle cx={12} cy={12} r={1.4} fill={color} stroke="none" />
          <circle cx={18} cy={12} r={1.4} fill={color} stroke="none" />
        </svg>
      );
  }
}
