-- Create helioscta_agents schema and agents table
-- Run against helioscta database

CREATE SCHEMA IF NOT EXISTS helioscta_agents;

CREATE TABLE IF NOT EXISTS helioscta_agents.agents (
    agent_id        VARCHAR(64) PRIMARY KEY,
    display_name    VARCHAR(255) NOT NULL,
    description     TEXT,
    system_prompt   TEXT NOT NULL,
    model           VARCHAR(100) NOT NULL DEFAULT 'claude-sonnet-4-6',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
