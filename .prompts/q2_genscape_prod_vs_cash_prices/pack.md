# Pack: q2_genscape_prod_vs_cash_prices

**Display Name:** Q2 Genscape Production vs Cash Prices
**Owner:** aidan.keaveny@helioscta.com

## Objective

Analyze historical Q2 (March–June) natural gas production volumes from Genscape against ICE cash and balmo pricing to identify seasonal production-price relationships across US basins.

## Inputs

| File | Type | Dialect | Required | Notes |
|------|------|---------|----------|-------|
| `sql/core/10_genscape_prod.sql` | sql | mssql | yes | Q2 historical production by basin |
| `sql/core/20_ice_cash_and_balmo.sql` | sql | postgresql | yes | Q2 historical cash & balmo pricing |
| `prompt.md` | prompt | — | yes | Analysis brief |

## Core SQL

| Script | Dialect | Description |
|--------|---------|-------------|
| `sql/core/10_genscape_prod.sql` | mssql | Daily regional production for Q2 months, 2023+ |
| `sql/core/20_ice_cash_and_balmo.sql` | postgresql | ICE cash, balmo, basis spreads for Q2 months, 2023+ |

## Run Steps

1. **load_inputs** — verify SQL and prompt files exist
2. **execute_sql** — run production then pricing queries
3. **compute_metrics** — derive year-over-year production deltas
4. **draft_markdown** — build analysis context
5. **render_report** — convert to styled HTML
6. **evidence_link** — link sections to SQL evidence

## Output Contract

- `runs/{date}/run_{id}/sql/results/10_genscape_prod_results.csv`
- `runs/{date}/run_{id}/sql/results/20_ice_cash_and_balmo_results.csv`
- `runs/{date}/run_{id}/reports/report.html`

## Review Checklist

- [ ] Production data covers all major basins
- [ ] Pricing data matches Q2 date ranges
- [ ] Year-over-year comparisons are computed correctly
