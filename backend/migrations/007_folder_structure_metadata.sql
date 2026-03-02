-- 007_folder_structure_metadata.sql
-- Add folder structure metadata columns for run-scoped paths and input categorization

BEGIN;

-- Store the computed blob root for each run's artifacts
ALTER TABLE helioscta_agents.pack_runs
  ADD COLUMN IF NOT EXISTS run_output_path VARCHAR(512);

-- Categorize inputs and store relative paths within the pack folder
ALTER TABLE helioscta_agents.analysis_pack_inputs
  ADD COLUMN IF NOT EXISTS category VARCHAR(64),
  ADD COLUMN IF NOT EXISTS relative_path VARCHAR(512);

COMMIT;
