-- 005_seed_agt_pack.sql
-- Seed the AGT Pipe Balance analysis pack

BEGIN;

-- Ensure workspace exists
INSERT INTO helioscta_agents.workspaces (slug, display_name, workspace_type)
VALUES ('agt_pipe_balance', 'AGT Pipe Balance', 'project')
ON CONFLICT (slug) DO NOTHING;

-- Create analysis pack
INSERT INTO helioscta_agents.analysis_packs (workspace_id, slug, display_name, description, created_by)
SELECT w.workspace_id,
       'agt_pipe_balance',
       'AGT Pipe Balance Analysis',
       'Daily Algonquin Gas Transmission pipeline balance report — nominations, cash/balmo pricing, and narrative analysis.',
       'system'
FROM helioscta_agents.workspaces w
WHERE w.slug = 'agt_pipe_balance'
ON CONFLICT (slug) DO NOTHING;

-- Declare pack inputs (4 files)
INSERT INTO helioscta_agents.analysis_pack_inputs (pack_id, input_type, file_path, required, dialect, display_label, sort_order)
SELECT p.pack_id, v.input_type, v.file_path, v.required, v.dialect, v.display_label, v.sort_order
FROM helioscta_agents.analysis_packs p
CROSS JOIN (VALUES
    ('prompt',  'prompt.md',                          TRUE,  NULL,         'Analysis Prompt',         1),
    ('sql',     'sql/agt_noms.sql',                   TRUE,  'mssql',      'AGT Nominations Query',   2),
    ('sql',     'sql/ice_cash_and_balmo.sql',          TRUE,  'postgresql', 'ICE Cash & Balmo Query',  3),
    ('config',  'reports/algonquin_gas_transmission.json', TRUE, NULL,     'Report Config/Map',       4)
) AS v(input_type, file_path, required, dialect, display_label, sort_order)
WHERE p.slug = 'agt_pipe_balance'
ON CONFLICT DO NOTHING;

COMMIT;
