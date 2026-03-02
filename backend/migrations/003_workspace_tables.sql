-- Workspace tables for shared file workspace
-- Run against helioscta database

CREATE TABLE IF NOT EXISTS helioscta_agents.workspaces (
    workspace_id    SERIAL PRIMARY KEY,
    slug            VARCHAR(100) UNIQUE NOT NULL,
    display_name    VARCHAR(255) NOT NULL,
    workspace_type  VARCHAR(20) NOT NULL DEFAULT 'agent',  -- 'agent' or 'project'
    agent_id        VARCHAR(64) REFERENCES helioscta_agents.agents(agent_id),
    created_by      VARCHAR(255),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS helioscta_agents.workspace_files (
    file_id         SERIAL PRIMARY KEY,
    workspace_id    INTEGER NOT NULL REFERENCES helioscta_agents.workspaces(workspace_id),
    file_name       VARCHAR(500) NOT NULL,
    blob_path       VARCHAR(1000) NOT NULL UNIQUE,
    file_type       VARCHAR(20) NOT NULL,     -- 'md', 'csv', 'py', 'sql', 'png', 'svg'
    mime_type       VARCHAR(100) NOT NULL,
    size_bytes      BIGINT,
    parent_path     VARCHAR(500) NOT NULL DEFAULT '/',
    source          VARCHAR(50) NOT NULL DEFAULT 'upload',  -- 'upload', 'agent_output', 'plot_generation'
    conversation_id INTEGER REFERENCES helioscta_agents.conversations(conversation_id),
    message_id      INTEGER REFERENCES helioscta_agents.messages(message_id),
    created_by      VARCHAR(255),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wf_workspace
    ON helioscta_agents.workspace_files(workspace_id) WHERE is_active = TRUE;
