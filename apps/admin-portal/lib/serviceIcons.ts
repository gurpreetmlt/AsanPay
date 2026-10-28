import {
  Banknote,
  Building2,
  Car,
  Coins,
  CreditCard,
  Droplet,
  FileText,
  Fingerprint,
  Flame,
  Fuel,
  Gift,
  GraduationCap,
  HandCoins,
  Landmark,
  LayoutGrid,
  Receipt,
  Send,
  ShieldCheck,
  Smartphone,
  Tv,
  Wallet,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";

/** Same service icons as the agent app tiles (keep in sync with agent-portal/lib/icons.ts). */
const SERVICE_ICON: Record<string, LucideIcon> = {
  CASH_WITHDRAW: Banknote,
  MINI_STATEMENT: FileText,
  CASH_DEPOSIT: Landmark,
  BALANCE_ENQUIRY: Wallet,
  UPI_CASH_POINT: Smartphone,
  MONEY_TRANSFER: Send,
  NEPAL_REMITTANCE: Send,
  NEPAL: Send,
  CASH_COLLECTION: Coins,
  LOANS: Building2,
  INSURANCE: ShieldCheck,
  CREDIT_CARDS: CreditCard,
  MOBILE_PREPAID: Smartphone,
  ELECTRICITY: Zap,
  DTH: Tv,
  WATER: Droplet,
  GAS_PIPELINE: Flame,
  FASTAG_RECHARGE: Car,
  BROADBAND_POSTPAID: Wifi,
  AADHAAR_PAY: Fingerprint,
  LPG_CYLINDER: Fuel,
  EDUCATION_FEES: GraduationCap,
  DONATION: Gift,
};

export function getServiceIcon(code: string): LucideIcon {
  return SERVICE_ICON[code] ?? HandCoins;
}

/** Category icon picked from its name (Banking, Bill payment, Recharge, AePS, Insurance…). */
export function getCategoryIconByName(name: string): LucideIcon {
  const n = name.toLowerCase();
  if (/bill|bbps/.test(n)) return Receipt;
  if (/recharge|mobile|dth/.test(n)) return Smartphone;
  if (/aeps|aadhaar/.test(n)) return Fingerprint;
  if (/insur/.test(n)) return ShieldCheck;
  if (/loan|credit/.test(n)) return CreditCard;
  if (/travel|ticket/.test(n)) return Car;
  if (/bank|money|transfer|cash/.test(n)) return Landmark;
  return LayoutGrid;
}
