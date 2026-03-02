# Pack: <pack_slug>

**Display Name:** <display_name>
**Owner:** <owner_email>

## Objective

<!-- What decision or output does this pack produce? -->

## Inputs

| File | Type | Dialect | Required | Notes |
|------|------|---------|----------|-------|
| `sql/core/10_<topic>.sql` | sql | postgresql / mssql | yes | |
| `prompt.md` | prompt | — | yes | |
| `assets/maps/<file>.json` | config | — | no | |

## Core SQL

| Script | Dialect | Description |
|--------|---------|-------------|
| `sql/core/10_<topic>.sql` | postgresql | |
| `sql/core/20_<topic>.sql` | mssql | |

## Run Steps

1. **load_inputs** — verify all required files exist in workspace
2. **execute_sql** — run core SQL scripts in order
3. **compute_metrics** — derive day-over-day deltas, save `data/metrics.json`
4. **build_context** — assemble analysis context for report generation
5. **generate_report** — produce structured JSON report (`data/report.json`)
6. **evidence_link** — link report sections to SQL run evidence (`data/evidence.json`)

## Output Contract

After a successful run, the following files must exist:

- `runs/{date}/run_{id}/sql/results/*.csv`
- `runs/{date}/run_{id}/context/analysis_draft.md`
- `runs/{date}/run_{id}/data/report.json`
- `runs/{date}/run_{id}/data/metrics.json`
- `runs/{date}/run_{id}/data/evidence.json`

## Review Checklist

- [ ] All core SQL executed without errors
- [ ] Row counts are within expected ranges
- [ ] Metrics deltas are computed correctly
- [ ] Structured report contains all required sections
- [ ] Pricing data matches trade date
- [ ] Evidence links map to correct SQL runs
