-- Add cost tracking columns to messages table
-- Run against helioscta database

ALTER TABLE helioscta_agents.messages
  ADD COLUMN IF NOT EXISTS request_type VARCHAR(64),
  ADD COLUMN IF NOT EXISTS workspace_id INTEGER,
  ADD COLUMN IF NOT EXISTS estimated_cost_usd NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS context_tokens INTEGER;

-- Index for daily cost aggregation per user
CREATE INDEX IF NOT EXISTS idx_msg_user_cost
  ON helioscta_agents.messages(user_email, created_at)
  WHERE estimated_cost_usd IS NOT NULL;

-- Index for model-level reporting
CREATE INDEX IF NOT EXISTS idx_msg_model_cost
  ON helioscta_agents.messages(model, created_at)
  WHERE estimated_cost_usd IS NOT NULL;
