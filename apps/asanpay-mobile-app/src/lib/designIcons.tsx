import React from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";

/** Design tile palettes from AsanPay.dc.html `palettes` */
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

/** AsanPay stroke icons — solid color, no Lucide. */
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
      return (
        <Svg {...common}>
          <Path d="M12 5a4.5 4.5 0 0 0-4.5 4.5v2" {...s} />
          <Path d="M16.5 11v-1.5A4.5 4.5 0 0 0 14 5.5" {...s} />
          <Path d="M9.8 9.5a2.2 2.2 0 0 1 4.4 0v3.5" {...s} />
          <Path d="M12 12v3" {...s} />
          <Path d="M7.5 14v2" {...s} />
          <Path d="M14 15v2.5" {...s} />
        </Svg>
      );
    case "dmt":
      return (
        <Svg {...common}>
          <Path d="M4 9h13" {...s} />
          <Path d="M13 5l4 4-4 4" {...s} />
          <Path d="M20 15H7" {...s} />
          <Path d="M11 19l-4-4 4-4" {...s} />
        </Svg>
      );
    case "bbps":
      return (
        <Svg {...common}>
          <Path d="M7 3h10v18l-2.2-1.2L12.5 21 10 19.8 7 21z" {...s} />
          <Path d="M10 8h4" {...s} />
          <Path d="M10 12h4" {...s} />
        </Svg>
      );
    case "recharge":
      return (
        <Svg {...common}>
          <Rect x={8} y={3} width={8} height={18} rx={2} {...s} />
          <Path d="M11 18h2" {...s} />
          <Path d="M4 8a5 5 0 0 1 0 8" {...s} />
          <Path d="M20 8a5 5 0 0 0 0 8" {...s} />
        </Svg>
      );
    case "dth":
      return (
        <Svg {...common}>
          <Path d="M4 18a10 10 0 0 1 10-10" {...s} />
          <Path d="M4 13a5 5 0 0 1 5-5" {...s} />
          <Circle cx={5} cy={18} r={1} stroke={color} strokeWidth={strokeWidth} fill="none" />
          <Rect x={12} y={3} width={9} height={6} rx={1.5} transform="rotate(20 16 6)" {...s} />
        </Svg>
      );
    case "cash":
      return (
        <Svg {...common}>
          <Rect x={3} y={8} width={18} height={11} rx={2} {...s} />
          <Circle cx={12} cy={13.5} r={2.4} stroke={color} strokeWidth={strokeWidth} fill="none" />
          <Path d="M12 3v3M9.5 5l2.5 1.5L14.5 5" {...s} />
        </Svg>
      );
    case "ministmt":
      return (
        <Svg {...common}>
          <Path d="M7 3h10v18H7z" {...s} />
          <Path d="M10 8h4M10 12h4M10 16h2" {...s} />
        </Svg>
      );
    case "balenq":
      return (
        <Svg {...common}>
          <Rect x={3} y={6} width={18} height={12} rx={2} {...s} />
          <Circle cx={17} cy={12} r={1.2} stroke={color} strokeWidth={strokeWidth} fill="none" />
          <Path d="M6 10h5M6 13h3" {...s} />
        </Svg>
      );
    case "miniatm":
      return (
        <Svg {...common}>
          <Rect x={3} y={5} width={18} height={14} rx={2} {...s} />
          <Path d="M3 9h18" {...s} />
          <Path d="M6 14h4" {...s} />
        </Svg>
      );
    case "microatm":
      return (
        <Svg {...common}>
          <Rect x={6} y={3} width={12} height={18} rx={2} {...s} />
          <Path d="M9 6h6" {...s} />
          <Circle cx={12} cy={14} r={2.3} stroke={color} strokeWidth={strokeWidth} fill="none" />
        </Svg>
      );
    case "upi":
      return (
        <Svg {...common}>
          <Rect x={7} y={3} width={10} height={18} rx={2} {...s} />
          <Path d="M10 6h4" {...s} />
          <Path d="M11 17l1.4-8 2.6 5" {...s} />
        </Svg>
      );
    case "insurance":
      return (
        <Svg {...common}>
          <Path d="M12 3l7 3v5c0 4.2-3 7.3-7 8.7C8 18.3 5 15.2 5 11V6z" {...s} />
          <Path d="M9 11.5l2 2 4-4.5" {...s} />
        </Svg>
      );
    case "loans":
      return (
        <Svg {...common}>
          <Circle cx={12} cy={12} r={8.5} stroke={color} strokeWidth={strokeWidth} fill="none" />
          <Path d="M9.5 9.5l5 5" {...s} />
          <Circle cx={9.6} cy={9.6} r={1} stroke={color} strokeWidth={strokeWidth} fill="none" />
          <Circle cx={14.4} cy={14.4} r={1} stroke={color} strokeWidth={strokeWidth} fill="none" />
        </Svg>
      );
    case "pan":
      return (
        <Svg {...common}>
          <Rect x={3} y={5} width={18} height={14} rx={2} {...s} />
          <Circle cx={8} cy={11} r={2} stroke={color} strokeWidth={strokeWidth} fill="none" />
          <Path d="M14 9h4M14 12.5h4" {...s} />
          <Path d="M6 15.5c0-1.4 1-2.2 2-2.2s2 .8 2 2.2" {...s} />
        </Svg>
      );
    case "travel":
      return (
        <Svg {...common}>
          <Path d="M21 15.5l-18 5.5 4.5-7L3 6.5 21 12l-8 2z" {...s} />
        </Svg>
      );
    case "wallet":
      return (
        <Svg {...common}>
          <Path d="M3 8a2 2 0 0 1 2-2h12v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" {...s} />
          <Path d="M17 9h4v6h-4a3 3 0 0 1 0-6z" {...s} />
          <Circle cx={18.5} cy={12} r={0.6} fill={color} stroke="none" />
        </Svg>
      );
    case "reports":
    case "trend":
      return (
        <Svg {...common}>
          {name === "reports" ? (
            <Path d="M5 20V11M10 20V4M15 20v-6M20 20V8" {...s} />
          ) : (
            <>
              <Path d="M4 15l5-5 4 4 7-8" {...s} />
              <Path d="M20 6h-4M20 6v4" {...s} />
            </>
          )}
        </Svg>
      );
    case "bank":
      return (
        <Svg {...common}>
          <Path d="M4 10l8-5 8 5" {...s} />
          <Path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" {...s} />
          <Path d="M3.5 20h17" {...s} />
        </Svg>
      );
    case "grid":
      return (
        <Svg {...common}>
          <Rect x={4} y={4} width={6} height={6} rx={1.5} {...s} />
          <Rect x={14} y={4} width={6} height={6} rx={1.5} {...s} />
          <Rect x={4} y={14} width={6} height={6} rx={1.5} {...s} />
          <Rect x={14} y={14} width={6} height={6} rx={1.5} {...s} />
        </Svg>
      );
    case "star":
      return (
        <Svg {...common}>
          <Path
            d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"
            fill={color}
            stroke={color}
            strokeWidth={1}
            strokeLinejoin="round"
          />
        </Svg>
      );
    case "store":
      return (
        <Svg {...common}>
          <Path d="M4 9l1-5h14l1 5M4 9v10h16V9M4 9h16" {...s} />
          <Path d="M4 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" {...s} />
        </Svg>
      );
    case "doc":
      return (
        <Svg {...common}>
          <Path d="M7 3h7l4 4v14H7z" {...s} />
          <Path d="M14 3v4h4M10 12h5M10 16h5" {...s} />
        </Svg>
      );
    case "shield":
      return (
        <Svg {...common}>
          <Path d="M12 3l7 3v5c0 4.2-3 7.3-7 8.7C8 18.3 5 15.2 5 11V6z" {...s} />
        </Svg>
      );
    case "gift":
      return (
        <Svg {...common}>
          <Rect x={4} y={8} width={16} height={12} rx={1.5} {...s} />
          <Path d="M4 12h16M12 8v12" {...s} />
          <Path d="M12 8C10 8 8 7 8 5.5S10 4 12 8zM12 8c2 0 4-1 4-2.5S14 4 12 8z" {...s} />
        </Svg>
      );
    case "scan":
      return (
        <Svg {...common}>
          <Path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" {...s} />
          <Path d="M4 12h16" {...s} />
        </Svg>
      );
    case "bell":
      return (
        <Svg {...common}>
          <Path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" {...s} />
          <Path d="M10 19a2 2 0 0 0 4 0" {...s} />
        </Svg>
      );
    case "profile":
      return (
        <Svg {...common}>
          <Circle cx={12} cy={8} r={3.4} stroke={color} strokeWidth={strokeWidth} fill="none" />
          <Path d="M5.5 20c.6-3.4 3.2-5 6.5-5s5.9 1.6 6.5 5" {...s} />
        </Svg>
      );
    case "home":
      return (
        <Svg {...common}>
          <Path d="M4 11l8-6.5L20 11" {...s} />
          <Path d="M6 10v9h12v-9" {...s} />
        </Svg>
      );
    case "settle":
      return (
        <Svg {...common}>
          <Path d="M4 8h13M14 5l3 3-3 3" {...s} />
          <Path d="M20 16H7M10 13l-3 3 3 3" {...s} />
        </Svg>
      );
    case "card":
      return (
        <Svg {...common}>
          <Rect x={3} y={6} width={18} height={12} rx={2} {...s} />
          <Path d="M3 10h18" {...s} />
          <Path d="M7 15h4" {...s} />
        </Svg>
      );
    case "landline":
      return (
        <Svg {...common}>
          <Path
            d="M8 3h3.5a1 1 0 0 1 1 1v2.5a1 1 0 0 1-1 1H9.5l-.8 1.8A10 10 0 0 0 15.2 15.8L17 15v-1.5a1 1 0 0 1 1-1H20.5a1 1 0 0 1 1 1V17a3 3 0 0 1-3 3A12 12 0 0 1 6.5 8.5 3 3 0 0 1 8 5.5z"
            {...s}
          />
        </Svg>
      );
    case "collection":
      return (
        <Svg {...common}>
          <Circle cx={9} cy={8} r={2.5} stroke={color} strokeWidth={strokeWidth} fill="none" />
          <Path d="M4.5 18c.7-3 2.8-4.5 4.5-4.5S13 15 13.5 18" {...s} />
          <Path d="M15 10h5M17.5 7.5v5" {...s} />
          <Circle cx={17.5} cy={16.5} r={3} stroke={color} strokeWidth={strokeWidth} fill="none" />
        </Svg>
      );
    case "fastag":
      return (
        <Svg {...common}>
          <Rect x={3} y={7} width={18} height={10} rx={2} {...s} />
          <Path d="M7 12h3M13 12h4" {...s} />
          <Path d="M3 10h18" {...s} />
        </Svg>
      );
    case "wifi":
      return (
        <Svg {...common}>
          <Path d="M5 10.5a9 9 0 0 1 14 0" {...s} />
          <Path d="M8 13.5a5 5 0 0 1 8 0" {...s} />
          <Circle cx={12} cy={17} r={1.2} fill={color} stroke="none" />
        </Svg>
      );
    case "education":
      return (
        <Svg {...common}>
          <Path d="M3 10l9-5 9 5-9 5-9-5z" {...s} />
          <Path d="M7 12.5v4.2c0 .8 2.2 2.3 5 2.3s5-1.5 5-2.3v-4.2" {...s} />
          <Path d="M21 10v6" {...s} />
        </Svg>
      );
    case "building":
      return (
        <Svg {...common}>
          <Path d="M5 21V7l7-4 7 4v14" {...s} />
          <Path d="M9 21v-5h6v5" {...s} />
          <Path d="M9 10h1.5M13.5 10H15M9 14h1.5M13.5 14H15" {...s} />
        </Svg>
      );
    case "users":
      return (
        <Svg {...common}>
          <Circle cx={9} cy={8} r={2.5} stroke={color} strokeWidth={strokeWidth} fill="none" />
          <Circle cx={16} cy={9} r={2} stroke={color} strokeWidth={strokeWidth} fill="none" />
          <Path d="M3.5 19c.7-3.2 3-5 5.5-5s4.8 1.8 5.5 5" {...s} />
          <Path d="M14 14.2c1.7-.3 3.4.5 4.5 2.8" {...s} />
        </Svg>
      );
    case "subscription":
      return (
        <Svg {...common}>
          <Circle cx={12} cy={12} r={8.5} stroke={color} strokeWidth={strokeWidth} fill="none" />
          <Path d="M10 9.5l5 2.5-5 2.5z" {...s} />
        </Svg>
      );
    case "ticket":
      return (
        <Svg {...common}>
          <Path d="M4 8a2 2 0 0 0 2-2h12a2 2 0 0 0 2 2v8a2 2 0 0 0-2 2H6a2 2 0 0 0-2-2z" {...s} />
          <Path d="M10 7v10" {...s} strokeDasharray="2 2" />
        </Svg>
      );
    case "water":
      return (
        <Svg {...common}>
          <Path d="M6 10h5.5a2.5 2.5 0 0 1 0 5H10" {...s} />
          <Path d="M6 8v10" {...s} />
          <Path d="M4.5 8H7.5" {...s} />
          <Path d="M14.5 15.2c0 1.5-1.2 2.8-2.5 2.8S9.5 16.7 9.5 15.2 12 12 12 12s2.5 1.7 2.5 3.2z" {...s} />
        </Svg>
      );
    case "lpg":
      return (
        <Svg {...common}>
          <Path d="M9 8h6v11a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" {...s} />
          <Path d="M10 8V6.5A1.5 1.5 0 0 1 11.5 5h1A1.5 1.5 0 0 1 14 6.5V8" {...s} />
          <Path d="M11 3.5h2" {...s} />
          <Path d="M9.5 13h5" {...s} />
          <Path d="M9.5 16.5h5" {...s} />
        </Svg>
      );
    case "gas":
      return (
        <Svg {...common}>
          <Path d="M7 20V9h3v11z" {...s} />
          <Path d="M10 12h4.5" {...s} />
          <Path d="M14.5 12c1.2 0 2.2-.6 2.8-1.5.4 1.4-.2 2.8-1.4 3.4 1 .8 1.2 2.2.3 3.2-.9.9-2.3.7-3-.3" {...s} />
        </Svg>
      );
    case "electricity":
      return (
        <Svg {...common}>
          <Path d="M9 3h6l1 7H14l1.5 11L8 10h3.5z" {...s} />
          <Path d="M11 7h2" {...s} />
        </Svg>
      );
    case "meter":
      return (
        <Svg {...common}>
          <Rect x={5} y={4} width={14} height={16} rx={2} {...s} />
          <Rect x={8} y={7} width={8} height={5} rx={1} {...s} />
          <Path d="M9 15h2M13 15h2M9 18h2M13 18h2" {...s} />
        </Svg>
      );
    case "tax":
      return (
        <Svg {...common}>
          <Path d="M8 7v10" {...s} />
          <Path d="M5.5 9.5C5.5 8 6.7 7 8 7s2.5 1 2.5 2.5S9.3 12 8 12s-2.5 1-2.5 2.5S6.7 17 8 17s2.5-1 2.5-2.5" {...s} />
          <Path d="M14 8l5 8M19 8l-5 8" {...s} />
        </Svg>
      );
    case "society":
      return (
        <Svg {...common}>
          <Path d="M4 20V9l5-3 5 3v11" {...s} />
          <Path d="M14 20V11l4-2.2V20" {...s} />
          <Path d="M7.5 12h2M7.5 15.5h2M11.5 12H13" {...s} />
        </Svg>
      );
    case "ev":
      return (
        <Svg {...common}>
          <Path d="M4 15h13l2-4H7l-1.2-2H4z" {...s} />
          <Circle cx={8} cy={17} r={1.6} stroke={color} strokeWidth={strokeWidth} fill="none" />
          <Circle cx={15} cy={17} r={1.6} stroke={color} strokeWidth={strokeWidth} fill="none" />
          <Path d="M17.5 11l1.5-4h2" {...s} />
          <Path d="M12 6.5L10 10h2l-1 3.5" {...s} />
        </Svg>
      );
    case "fuel":
      return (
        <Svg {...common}>
          <Path d="M6 21V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16" {...s} />
          <Path d="M5 21h12" {...s} />
          <Path d="M15 9h2.2a2 2 0 0 1 2 2V16a1.5 1.5 0 0 0 3 0V10l-2-2" {...s} />
          <Path d="M9 8h3M9 11.5h3" {...s} />
        </Svg>
      );
    case "tv":
      return (
        <Svg {...common}>
          <Rect x={3} y={7} width={18} height={12} rx={2} {...s} />
          <Path d="M8 4l4 3 4-3" {...s} />
          <Path d="M9 21h6" {...s} />
        </Svg>
      );
    case "bolt":
      return (
        <Svg {...common}>
          <Path d="M13 3L6 13h5l-1 8 7-10h-5z" {...s} />
        </Svg>
      );
    case "more":
    default:
      return (
        <Svg {...common}>
          <Circle cx={6} cy={12} r={1.4} fill={color} stroke="none" />
          <Circle cx={12} cy={12} r={1.4} fill={color} stroke="none" />
          <Circle cx={18} cy={12} r={1.4} fill={color} stroke="none" />
        </Svg>
      );
  }
}
