# Eko BBPS — Doc index

Official pages paste → save here. Postman overview: [`BBPS.md`](BBPS.md).

## Collected (official)

| Step | Doc | Canonical |
|------|-----|-----------|
| 1. Categories | [`BBPS_CATEGORIES.md`](BBPS_CATEGORIES.md) | https://eps.eko.in/docs/bbps-get-categories |
| 1b. Locations | [`BBPS_LOCATIONS.md`](BBPS_LOCATIONS.md) | https://eps.eko.in/docs/bbps-get-locations |
| 2. Operators | [`BBPS_OPERATORS.md`](BBPS_OPERATORS.md) | https://eps.eko.in/docs/bbps-get-operators |
| 2b. Operator Parameters | [`BBPS_OPERATOR_PARAMETERS.md`](BBPS_OPERATOR_PARAMETERS.md) | https://eps.eko.in/docs/bbps-get-operator-parameters |
| 2c. UPPCL District Discome | [`BBPS_DISTRICT_DISCOME.md`](BBPS_DISTRICT_DISCOME.md) | https://eps.eko.in/docs/bbps-district-discome |
| 3a. Operator Code + Circle (recharge) | [`BBPS_OPERATOR_CODE_CIRCLE.md`](BBPS_OPERATOR_CODE_CIRCLE.md) | https://eps.eko.in/docs/bbps-operator-code-circle |
| 3b. Recharge Plans | [`BBPS_RECHARGE_PLANS.md`](BBPS_RECHARGE_PLANS.md) | https://eps.eko.in/docs/bbps-recharge-plans |
| 4. Fetch Bill | [`BBPS_FETCH_BILL.md`](BBPS_FETCH_BILL.md) | https://eps.eko.in/docs/bbps-fetch-bill |
| 5. Pay Bill | [`BBPS_PAY_BILL.md`](BBPS_PAY_BILL.md) | https://eps.eko.in/docs/bbps-pay-bill |

## Still needed (paste next)

- [x] Get BBPS Categories
- [x] Get BBPS Locations
- [x] Get BBPS Operators / Billers
- [x] Get Operator Parameters
- [x] Get District Discome (UPPCL / operator 190)
- [x] Get Operator Code and Circle (mobile recharge detect)
- [x] Get Recharge Plans
- [x] Fetch Bill
- [x] Pay Bill
- [ ] Transaction status / inquiry (if separate)
- [ ] Shared error-codes (if BBPS-specific)

## Typical sequence

### Bill pay

1. **Categories** → pick `operator_category_id`
2. **Locations** → pick `operator_location_id` (string, zero-padded)
3. **Operators** by `category` (+ `location`) → `operator_id` (= `phone_operator_code` later)
4. **Operator Parameters** → dynamic form fields (`param_name`s)
5. If operator **190 (UPPCL)** → **District Discome** → `district_discome`
6. **Fetch Bill** → confirm `amount` + `utilitycustomername` (same `client_ref_id` on Pay)
7. **Pay Bill** — exact amount; on **208** re-fetch + fresh `client_ref_id` (save `tid` first)
8. Status / receipt as needed

### Mobile recharge (BBPS helpers)

1. **Operator Code + Circle** for `{customer_mobile}` → `phone_operator_code`, `circle_area`
2. **Recharge Plans** with `phone_operator_code` + `circleid` (= `circle_area`)
3. **Pay Bill** with chosen plan `amount` (omit `utilitycustomername`; or manual amount if plans `1805`)
