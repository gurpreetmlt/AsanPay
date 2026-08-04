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
  Users,
  Wallet,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";

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

const CATEGORY_ICON: Record<string, LucideIcon> = {
  landmark: Landmark,
  receipt: Receipt,
  fingerprint: Fingerprint,
  "building-2": Building2,
  users: Users,
};

export function getServiceIcon(code: string): LucideIcon {
  return SERVICE_ICON[code] ?? HandCoins;
}

export function getCategoryIcon(icon: string | null): LucideIcon {
  return (icon && CATEGORY_ICON[icon]) || LayoutGrid;
}
