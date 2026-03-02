# Pack: agt_pipe_balance

**Display Name:** AGT Pipeline Balance
**Owner:** aidan.keaveny@helioscta.com

## Objective

Produce a daily pipeline balance analysis for Algonquin Gas Transmission (AGT), combining Genscape nominations data with ICE cash/balmo pricing to assess flow dynamics and pricing signals across pipeline zones.

## Inputs

| File | Type | Dialect | Required | Notes |
|------|------|---------|----------|-------|
| `sql/core/10_agt_noms.sql` | sql | mssql | yes | 30-day Genscape nominations |
| `sql/core/20_ice_cash_and_balmo.sql` | sql | postgresql | yes | NE cash & balmo pricing |
| `prompt.md` | prompt | — | yes | Three-teammate analysis spec |
| `assets/maps/algonquin_gas_transmission.json` | config | — | yes | Pipeline topology / zone map |

## Core SQL

| Script | Dialect | Description |
|--------|---------|-------------|
| `sql/core/10_agt_noms.sql` | mssql | 30-day rolling nominations from Genscape (receipts, deliveries, interconnects) |
| `sql/core/20_ice_cash_and_balmo.sql` | postgresql | ICE next-day cash, balmo, basis spreads for NE + national benchmarks |

## Run Steps

1. **load_inputs** — verify prompt, SQL, and map asset exist in workspace
2. **execute_sql** — run 10_agt_noms.sql (mssql) then 20_ice_cash_and_balmo.sql (postgresql)
3. **compute_metrics** — derive day-over-day flow deltas per zone, save `data/metrics.json`
4. **build_context** — assemble analysis context for report generation
5. **generate_report** — produce structured JSON report (`data/report.json`)
6. **evidence_link** — link report sections to SQL run evidence (`data/evidence.json`)

## Output Contract

After a successful run, the following files must exist:

- `runs/{date}/run_{id}/sql/results/10_agt_noms_results.csv`
- `runs/{date}/run_{id}/sql/results/20_ice_cash_and_balmo_results.csv`
- `runs/{date}/run_{id}/context/analysis_draft.md`
- `runs/{date}/run_{id}/data/report.json`
- `runs/{date}/run_{id}/data/metrics.json`
- `runs/{date}/run_{id}/data/evidence.json`

## Review Checklist

- [ ] Nominations data covers all AGT zones (Stony Point, Oxford, Burrillville, LDC)
- [ ] Pricing data matches the trade date
- [ ] Cash-balmo spreads are computed correctly
- [ ] Basis is relative to Henry Hub
- [ ] Flow-price correlation narrative is supported by evidence
- [ ] Structured report renders correctly in workbench Report tab
