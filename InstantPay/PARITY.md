# InstantPay Cross-Platform Parity

Source of truth for `apps/web` + `apps/mobile` parity on InstantPay-backed rails.

## Rule

Koi bhi InstantPay-backed service tab tak complete nahi hai jab tak:

1. backend contract wired ho,
2. `apps/web` mein visible entrypoint + usable flow ho,
3. `apps/mobile` mein visible entrypoint + usable flow ho,
4. ya doc mein explicit platform exception likhi ho.

## Current matrix

| Rail | Backend | Web | Mobile | Notes |
|------|---------|-----|--------|-------|
| AePS | Yes | Partial | Strong | Web flow biometric capture-first hai; mobile deeper transactional path pe hai. |
| DMT / Money Transfer | Yes | Strong | Strong | Rail via `AEPS_PROVIDER_MODE` adapters (not final provider); catalog hides harness tiles. |
| Nepal Remittance | Yes | Strong | Strong | Web + mobile dono mein outlet, remitter, beneficiary, quote, transfer, status available. |
| InstantPay Merchant Onboarding | Yes | Min-KYC + Bio-KYC | Min-KYC + Bio-KYC | Account / Settings entrypoints; RD `wadh` on capture |
| UPI Cash Point | No confirmed InstantPay backend rail | Mock | Mock | Catalog/UI only; backend contract confirm hone tak InstantPay parity item na maano. |

## Audit checklist

Har nayi InstantPay service ke liye verify:

- catalog / card visibility
- tap / click routing
- dedicated page or screen
- usable happy-path flow
- docs updated
- release notes mention platform parity
