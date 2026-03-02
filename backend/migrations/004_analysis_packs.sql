-- 004_analysis_packs.sql
-- Analysis Packs: step-based pipeline runs, guardrailed SQL execution, report artifacts

BEGIN;

-- Analysis packs — a reusable analysis template tied to a workspace
CREATE TABLE IF NOT EXISTS helioscta_agents.analysis_packs (
    pack_id         SERIAL PRIMARY KEY,
    workspace_id    INTEGER NOT NULL REFERENCES helioscta_agents.workspaces(workspace_id),
    slug            VARCHAR(128) NOT NULL UNIQUE,
    display_name    VARCHAR(256) NOT NULL,
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_by      VARCHAR(256),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Declared inputs for a pack (prompt files, SQL files, config files)
CREATE TABLE IF NOT EXISTS helioscta_agents.analysis_pack_inputs (
    input_id        SERIAL PRIMARY KEY,
    pack_id         INTEGER NOT NULL REFERENCES helioscta_agents.analysis_packs(pack_id),
    input_type      VARCHAR(64) NOT NULL,        -- 'prompt', 'sql', 'config', 'report_template'
    file_path       VARCHAR(512) NOT NULL,        -- relative path within workspace blob prefix
    required        BOOLEAN NOT NULL DEFAULT TRUE,
    dialect         VARCHAR(32),                  -- 'postgresql', 'mssql', NULL for non-SQL
    display_label   VARCHAR(256),
    sort_order      INTEGER NOT NULL DEFAULT 0
);

-- A single execution run of a pack
CREATE TABLE IF NOT EXISTS helioscta_agents.pack_runs (
    run_id          SERIAL PRIMARY KEY,
    pack_id         INTEGER NOT NULL REFERENCES helioscta_agents.analysis_packs(pack_id),
    run_date        DATE NOT NULL DEFAULT CURRENT_DATE,
    trade_date      DATE,
    status          VARCHAR(32) NOT NULL DEFAULT 'pending',   -- pending, running, completed, failed, finalized
    started_by      VARCHAR(256),
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    error_summary   TEXT
);
CREATE INDEX IF NOT EXISTS idx_pack_runs_pack_date ON helioscta_agents.pack_runs (pack_id, run_date DESC);

-- Individual steps within a run
CREATE TABLE IF NOT EXISTS helioscta_agents.pack_run_steps (
    step_id         SERIAL PRIMARY KEY,
    run_id          INTEGER NOT NULL REFERENCES helioscta_agents.pack_runs(run_id),
    step_name       VARCHAR(64) NOT NULL,
    step_order      INTEGER NOT NULL,
    status          VARCHAR(32) NOT NULL DEFAULT 'pending',   -- pending, running, completed, failed, skipped
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    log_text        TEXT,
    output_json     JSONB,
    retry_count     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pack_run_steps_run_order ON helioscta_agents.pack_run_steps (run_id, step_order);

-- Guardrailed SQL execution log
CREATE TABLE IF NOT EXISTS helioscta_agents.sql_runs (
    sql_run_id      SERIAL PRIMARY KEY,
    run_id          INTEGER REFERENCES helioscta_agents.pack_runs(run_id),
    workspace_id    INTEGER REFERENCES helioscta_agents.workspaces(workspace_id),
    step_id         INTEGER REFERENCES helioscta_agents.pack_run_steps(step_id),
    dialect         VARCHAR(32) NOT NULL,         -- 'postgresql' or 'mssql'
    sql_text        TEXT NOT NULL,
    executed_by     VARCHAR(256),
    status          VARCHAR(32) NOT NULL DEFAULT 'pending',
    row_count       INTEGER,
    elapsed_ms      INTEGER,
    truncated       BOOLEAN NOT NULL DEFAULT FALSE,
    error_text      TEXT,
    result_json     JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sql_runs_run_date ON helioscta_agents.sql_runs (run_id, created_at DESC);

-- Generated report artifacts
CREATE TABLE IF NOT EXISTS helioscta_agents.report_artifacts (
    artifact_id         SERIAL PRIMARY KEY,
    run_id              INTEGER NOT NULL REFERENCES helioscta_agents.pack_runs(run_id),
    artifact_type       VARCHAR(64) NOT NULL,     -- 'markdown', 'html', 'csv', 'chart_png'
    workspace_file_id   INTEGER REFERENCES helioscta_agents.workspace_files(file_id),
    blob_path           VARCHAR(512),
    generated_by        VARCHAR(256),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Evidence links from report sections to source data
CREATE TABLE IF NOT EXISTS helioscta_agents.evidence_links (
    evidence_id         SERIAL PRIMARY KEY,
    run_id              INTEGER NOT NULL REFERENCES helioscta_agents.pack_runs(run_id),
    section_key         VARCHAR(128) NOT NULL,
    claim_text          TEXT,
    sql_run_id          INTEGER REFERENCES helioscta_agents.sql_runs(sql_run_id),
    workspace_file_id   INTEGER REFERENCES helioscta_agents.workspace_files(file_id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_evidence_links_run_section ON helioscta_agents.evidence_links (run_id, section_key);

COMMIT;
