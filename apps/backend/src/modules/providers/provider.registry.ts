import { EkoAdapter } from "./adapters/eko.adapter";
import { InstantPayAdapter } from "./adapters/instantpay.adapter";
import { PaySprintAdapter } from "./adapters/paysprint.adapter";
import { VyaparApiAdapter } from "./adapters/vyaparapi.adapter";
import type { ProviderAdapter } from "./types";

// Code -> adapter instance. Adding a provider = one adapter class + one entry
// here + a `providers` row in Postgres; the routing layer picks it up from
// provider_services with zero changes anywhere else.
const adapters: Record<string, ProviderAdapter> = {
  eko: new EkoAdapter(),
  paysprint: new PaySprintAdapter(),
  instantpay: new InstantPayAdapter(),
  vyaparapi: new VyaparApiAdapter(),
};

export function getAdapterByCode(code: string): ProviderAdapter | null {
  return adapters[code] ?? null;
}

export function listAdapterCodes(): string[] {
  return Object.keys(adapters);
}
