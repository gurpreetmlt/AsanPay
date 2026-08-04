import { BRAND_DEFAULTS } from "@asanpay/shared-types";
import { brand } from "./colors";

// name/tagline come from the single shared source (@asanpay/shared-types BRAND_DEFAULTS) — the
// same constant apps/agent-portal/lib/brand.ts reads. Renaming the brand only needs a change there; this
// app still needs a fresh release build to ship it, since it's compiled, not env-configured.
export const BRAND = {
  appName: BRAND_DEFAULTS.name,
  tagline: BRAND_DEFAULTS.tagline,
  loginSubtitle: "Super Distributor · Distributor · Retailer",
  colors: brand,
} as const;
