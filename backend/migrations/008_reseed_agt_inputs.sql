-- 008_reseed_agt_inputs.sql
-- Update AGT pack inputs with standardized relative paths and categories

BEGIN;

-- Update sql/agt_noms.sql -> sql/core/10_agt_noms.sql
UPDATE helioscta_agents.analysis_pack_inputs
SET relative_path = 'sql/core/10_agt_noms.sql',
    category = 'core_sql'
WHERE pack_id = (SELECT pack_id FROM helioscta_agents.analysis_packs WHERE slug = 'agt_pipe_balance')
  AND file_path = 'sql/agt_noms.sql';

-- Update sql/ice_cash_and_balmo.sql -> sql/core/20_ice_cash_and_balmo.sql
UPDATE helioscta_agents.analysis_pack_inputs
SET relative_path = 'sql/core/20_ice_cash_and_balmo.sql',
    category = 'core_sql'
WHERE pack_id = (SELECT pack_id FROM helioscta_agents.analysis_packs WHERE slug = 'agt_pipe_balance')
  AND file_path = 'sql/ice_cash_and_balmo.sql';

-- Update reports/algonquin_gas_transmission.json -> assets/maps/algonquin_gas_transmission.json
UPDATE helioscta_agents.analysis_pack_inputs
SET relative_path = 'assets/maps/algonquin_gas_transmission.json',
    category = 'map_asset'
WHERE pack_id = (SELECT pack_id FROM helioscta_agents.analysis_packs WHERE slug = 'agt_pipe_balance')
  AND file_path = 'reports/algonquin_gas_transmission.json';

-- Update prompt.md
UPDATE helioscta_agents.analysis_pack_inputs
SET relative_path = 'prompt.md',
    category = 'prompt'
WHERE pack_id = (SELECT pack_id FROM helioscta_agents.analysis_packs WHERE slug = 'agt_pipe_balance')
  AND file_path = 'prompt.md';

COMMIT;
