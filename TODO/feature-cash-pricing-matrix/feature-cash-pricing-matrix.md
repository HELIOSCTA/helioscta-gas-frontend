# Cash Pricing Matrix - Claude Code Task Brief

Use this prompt in Claude Code:

```text
Build a production-ready "NYMEX Price Matrix" page that matches the layout and intent of:
TODO/feature-cash-pricing-matrix/NYMEX_PRICE_MATRIX.png

Repository: helioscta-gas-frontend
Tech stack: Next.js 15 + TypeScript (frontend), Postgres-backed API route in frontend/app/api

Goals
1. Create a matrix page that visually mirrors the screenshot style:
   - stacked table sections with dark blue section headers
   - first section for "Current Month Cash to Henry Hub Futures"
   - additional month sections (seasonal view) such as "January Matrix of Cash against Henry Hub Futures"
   - first columns: date/year, Henry Hub cash, Henry Hub balmo
   - futures strip columns (prompt through +11)
   - average row at the bottom of each section
2. Keep the existing "Cash Pricing Matrix" nav entry, but update the page content to the new matrix layout.
3. Add robust loading, empty, and error states.
4. Keep implementation strongly typed and lint-clean.

Files to update
- frontend/components/gas/CashPricingMatrix.tsx
- frontend/app/api/ice-cash-pricing-matrix/route.ts
- frontend/app/HomePageClient.tsx (only if section metadata text needs adjustment)

Data source proposal (required)
Use canonical schemas `ice` and `ice_cleaned`. In this environment, map them to currently available equivalents:

Canonical -> Current equivalent
- ice.future_contracts_daily_settlement -> ice_python.future_contracts_v1_2025_dec_16
- ice.next_day_gas -> ice_python.next_day_gas_v1_2025_dec_16
- ice.balmo -> ice_python.balmo_v1_2025_dec_16
- ice_cleaned.next_day_gas_daily -> ice_python_cleaned.ice_python_next_day_gas_daily
- ice_cleaned.balmo_daily -> ice_python_cleaned.ice_python_balmo

Also use these dbt helper datasets:
- dbt.source_v1_nymex_ng_expiration_dates_daily (valid trade days + prompt contract code)
- dbt.sources_v1_ice_prompt_month_codes (contract strip by prompt offset per date)

Why each source
- ice / raw futures: needed for contract-level strip settlement (prompt to +11).
- ice_cleaned / daily cash + balmo: already normalized to hub-level daily columns; easier and safer than symbol-level pivoting.
- dbt expiration/prompt tables: required for correct prompt month rollover and strip alignment by trade date.

Hub mapping for MVP
- hh -> hh_cash / hh_balmo / futures root HNG
- transco_st85 -> transco_st85_cash / transco_st85_balmo / futures root TRZ (basis, add to HNG)
- waha -> waha_cash / waha_balmo / futures root WAH (basis, add to HNG)
- transco_z5s -> transco_zone_5_south_cash / transco_zone_5_south_balmo / futures root T5B (basis, add to HNG)
- tetco_m3 -> tetco_m3_cash / tetco_m3_balmo / futures root TMT (basis, add to HNG)
- agt -> agt_cash / agt_balmo / futures root ALQ (basis, add to HNG)
- iroquois_z2 -> iroquois_z2_cash / iroquois_z2_balmo / futures root IZB (basis, add to HNG)
- socal_cg -> socal_cg_cash / socal_cg_balmo / futures root SCB (basis, add to HNG)
- pge_cg -> pge_cg_cash / pge_cg_balmo / futures root PGE (basis, add to HNG)
- cig -> cig_cash / cig_balmo / futures root CRI (basis, add to HNG)

Computation rules
1. Outright futures:
   - HH hub: outright = HNG settlement
   - non-HH hubs: outright = HNG settlement + basis settlement
2. Strip construction:
   - use prompt contract for each trade date
   - include offsets 0..11
3. Matrix cells:
   - section row key is trade_date (current month section) or year bucket (seasonal section)
   - show numeric values with 2-3 decimals
4. Average row:
   - arithmetic average of non-null values per column

API contract
- GET /api/ice-cash-pricing-matrix?month=3&year=2026&hub=hh
- return:
  {
    rows: [...],
    strip: [{ prompt_offset, contract_code, label }],
    sections: [{ key, title, rows, averages }],
    sourceMetadata: {
      canonicalSchemas: ["ice", "ice_cleaned"],
      resolvedTables: {...}
    }
  }
- include `Cache-Control: public, s-maxage=300, stale-while-revalidate=60`

UI acceptance criteria
- visually close to screenshot (header bars, compact table style, average footer row)
- mobile and desktop readable
- no runtime errors with missing values
- handles month/year/hub changes without full reload

Engineering constraints
- use parameterized SQL values where possible
- do not hardcode date literals except defaults derived from current date
- keep TypeScript strictness (no `any` unless unavoidable)
- run:
  - cd frontend && npm run lint
```
