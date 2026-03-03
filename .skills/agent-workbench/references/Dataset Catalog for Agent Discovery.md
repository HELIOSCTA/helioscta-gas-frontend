# Dataset Catalog v1 Plan (Better Replacement)

## Summary
Build a lean, internal-only dataset catalog that is durable across table-version churn and safe for prompt budgets.  
This replaces the original plan by removing unnecessary public API surface, adding canonical-to-current dataset mapping, and making prompt injection adaptive + fail-open.

## Important API/Interface/Type Changes
1. **Public HTTP APIs:** No new public endpoint in v1 (explicitly internal-only).
2. **Database interface:** New table `helioscta_agents.dataset_catalog` becomes the source of truth for dataset discovery metadata.
3. **Internal TypeScript interfaces:** Add `DatasetCatalogEntry`, `ColumnMeta`, `SampleQuery`, and formatter result types.
4. **Chat assembly contract (internal):** Chat route adds an optional `<dataset_catalog>` block before `<workspace_context>` when enabled.

## Implementation Plan
1. **Create migration `backend/migrations/011_dataset_catalog.sql`.**  
   Table: `helioscta_agents.dataset_catalog` with these columns and constraints:
   - `dataset_id SERIAL PRIMARY KEY`
   - `slug VARCHAR(128) NOT NULL UNIQUE` (canonical dataset ID)
   - `display_name VARCHAR(256) NOT NULL`
   - `description TEXT NOT NULL`
   - `dialect VARCHAR(32) NOT NULL CHECK (dialect IN ('postgresql','mssql'))`
   - `database_name VARCHAR(128) NOT NULL`
   - `schema_name VARCHAR(128) NOT NULL`
   - `table_name VARCHAR(256) NOT NULL`
   - `physical_version VARCHAR(128)` (current concrete version label)
   - `tags TEXT[] NOT NULL DEFAULT '{}'`
   - `synonyms TEXT[] NOT NULL DEFAULT '{}'`
   - `columns_meta JSONB NOT NULL DEFAULT '[]'::jsonb`
   - `sample_queries JSONB NOT NULL DEFAULT '[]'::jsonb`
   - `date_column VARCHAR(128)`
   - `date_range_hint VARCHAR(256)`
   - `row_count_hint BIGINT`
   - `refresh_cadence VARCHAR(64)`
   - `notes TEXT`
   - `rank_weight INTEGER NOT NULL DEFAULT 100`
   - `is_active BOOLEAN NOT NULL DEFAULT TRUE`
   - `created_by VARCHAR(255)`, `updated_by VARCHAR(255)`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - Check constraints: `jsonb_typeof(columns_meta)='array'` and `jsonb_typeof(sample_queries)='array'`
   - Indexes: `(is_active, rank_weight DESC, slug)`, GIN on `tags`, GIN on `synonyms`

2. **Create seed migration `backend/migrations/012_seed_dataset_catalog.sql`.**  
   Seed 8 known datasets using `INSERT ... ON CONFLICT (slug) DO UPDATE` so reruns are safe.  
   Canonical+current mapping rule:
   - `slug` stays stable (for agent reasoning).
   - `schema_name/table_name/physical_version` can be updated as physical tables roll forward.
   Metadata depth:
   - Full `columns_meta` + `sample_queries` for `genscape_noms`, `ice_next_day_gas`, `ice_balmo`.
   - Description/tags/synonyms/date hints for remaining datasets.

3. **Add internal types at `frontend/lib/types/dataset-catalog.ts`.**  
   Define:
   - `DatasetDialect = "postgresql" | "mssql"`
   - `ColumnMeta { name, type, description?, is_key? }`
   - `SampleQuery { label, sql, description? }`
   - `DatasetCatalogEntry` matching DB schema fields used by runtime
   - `CatalogPromptBlock { text: string; tokens: number; mode: "full" | "compact" | "minimal" }`

4. **Add catalog loader/formatter at `frontend/lib/dataset-catalog.ts`.**
   Implement:
   - `loadDatasetCatalog(): Promise<DatasetCatalogEntry[]>`
   - `formatCatalogForPrompt(entries, options): CatalogPromptBlock`
   Defaults:
   - Cache TTL in-process: `300000ms` (`CATALOG_CACHE_TTL_MS`, overrideable)
   - Query order: `is_active = TRUE ORDER BY rank_weight DESC, slug ASC`
   - Prompt budget cap: `1200` tokens (`CATALOG_MAX_PROMPT_TOKENS`, overrideable)
   - Formatting fallback tiers:
     1. `full`: description + tags + key columns + 1 sample query
     2. `compact`: description + tags only
     3. `minimal`: slug + dialect + fully qualified source only
   - If still over budget, trim lowest-priority entries by `rank_weight`.
   - Fail-open behavior: DB/query/parse errors return empty catalog and log warning; chat must continue.

5. **Add server-only flag helper at `frontend/lib/server-feature-flags.ts`.**  
   Add `DATASET_CATALOG_ENABLED` from `process.env.DATASET_CATALOG_ENABLED` (default `true`).

6. **Modify chat route `frontend/app/api/agents/[agentId]/chat/route.ts`.**
   Integration details:
   - After `let systemPrompt = agent.system_prompt;`, conditionally load/format catalog if flag enabled.
   - Append block as `\n\n<dataset_catalog>...</dataset_catalog>` before workspace context injection.
   - Preserve existing order:
     1. base agent prompt
     2. dataset catalog (new)
     3. workspace context
     4. output guidelines
   - Keep current budget guardrail flow; catalog formatter must pre-trim so request rarely hits cost rejection due to catalog alone.
   - Catalog load failures are non-fatal and must not throw from route.

7. **Operational update procedure (documented in the plan doc).**
   - To roll to a new physical source table, update only `schema_name/table_name/physical_version` for the existing `slug`.
   - No code deploy required for normal table-version rollovers.

## Test Cases and Scenarios
1. Migration idempotency: run 011/012 twice; no errors; row count remains 8 active datasets.
2. Schema validation: JSONB constraints reject non-array `columns_meta`/`sample_queries`.
3. Loader behavior: active rows returned sorted by `rank_weight DESC, slug`.
4. Formatter full mode: with normal seed data, output stays under cap and includes expected tags/dialect/source.
5. Formatter fallback: with artificially inflated metadata, mode degrades `full -> compact -> minimal` and stays under cap.
6. Feature flag off: no `<dataset_catalog>` block in system prompt.
7. DB failure path: simulate query failure; chat still streams response and logs warning.
8. End-to-end smoke: prompt mentioning “AGT nominations + cash + balmo” leads assistant to reference correct canonical datasets and dialects.

## Rollout and Monitoring
1. Deploy code with `DATASET_CATALOG_ENABLED=false` in staging.
2. Apply migrations 011 then 012 in staging DB.
3. Enable flag in staging, run chat smoke tests, confirm no budget regression.
4. Promote to production, enable flag, monitor chat route logs for catalog load/format warnings.
5. If issues occur, disable via env flag without rollback.

## Assumptions and Defaults
1. Catalog is curated manually in v1; no admin write API/UI in scope.
2. Single shared catalog across agents is acceptable.
3. Only `postgresql` and `mssql` dialects are needed.
4. Prompt catalog token budget default is `1200`.
5. Internal-only exposure is intentional; no `/api/dataset-catalog` route in this phase.
