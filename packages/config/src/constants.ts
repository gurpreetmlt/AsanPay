export enum Role {
  Admin = 'admin',
  Distributor = 'distributor',
  Retailer = 'retailer',
}

export enum UserStatus {
  Pending = 'pending',
  Active = 'active',
  Blocked = 'blocked',
}

export enum KycStatus {
  Pending = 'pending',
  Submitted = 'submitted',
  Verified = 'verified',
  Rejected = 'rejected',
}

export enum Service {
  Aeps = 'aeps',
  Dmt = 'dmt',
  Bbps = 'bbps',
  Recharge = 'recharge',
  AadhaarPay = 'aadhaar_pay',
}

export enum AggregatorProvider {
  Noble = 'noble',
  Setu = 'setu',
  Decentro = 'decentro',
}

export enum TxnStatus {
  Pending = 'pending',
  Success = 'success',
  Failed = 'failed',
  Reversed = 'reversed',
}

export enum LedgerType {
  Credit = 'credit',
  Debit = 'debit',
}

export enum LedgerRefType {
  FundTransfer = 'fund_transfer',
  Service = 'service',
  Commission = 'commission',
  Reversal = 'reversal',
}

export enum CommissionSlabType {
  Flat = 'flat',
  Percent = 'percent',
}

export enum KycProvider {
  Digilocker = 'digilocker',
  Surepass = 'surepass',
}

export enum TicketStatus {
  Open = 'open',
  InProgress = 'in_progress',
  Resolved = 'resolved',
  Closed = 'closed',
}

export const CURRENCY = 'INR' as const;

export const DEFAULT_WALLET_LIMIT = 500_000;

export const SERVICE_LABELS: Record<Service, string> = {
  [Service.Aeps]: 'AEPS',
  [Service.Dmt]: 'DMT',
  [Service.Bbps]: 'BBPS',
  [Service.Recharge]: 'Recharge',
  [Service.AadhaarPay]: 'Aadhaar Pay',
};

export const BBPS_CATEGORIES = [
  'mobile',
  'dth',
  'electricity',
  'gas',
  'water',
  'fastag',
  'broadband',
  'landline',
  'insurance',
  'loan',
] as const;

export type BbpsCategory = (typeof BBPS_CATEGORIES)[number];

export const DEFAULT_SERVICE_CONFIG: Record<
  Service,
  { enabled: boolean; aggregator: AggregatorProvider; minAmount: number; maxAmount: number }
> = {
  [Service.Aeps]: {
    enabled: true,
    aggregator: AggregatorProvider.Noble,
    minAmount: 100,
    maxAmount: 10_000,
  },
  [Service.Dmt]: {
    enabled: true,
    aggregator: AggregatorProvider.Noble,
    minAmount: 100,
    maxAmount: 49_990,
  },
  [Service.Bbps]: {
    enabled: true,
    aggregator: AggregatorProvider.Noble,
    minAmount: 1,
    maxAmount: 100_000,
  },
  [Service.Recharge]: {
    enabled: true,
    aggregator: AggregatorProvider.Noble,
    minAmount: 10,
    maxAmount: 10_000,
  },
  [Service.AadhaarPay]: {
    enabled: true,
    aggregator: AggregatorProvider.Noble,
    minAmount: 1,
    maxAmount: 10_000,
  },
};
