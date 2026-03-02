-- Create conversations and messages tables
-- Run against helioscta database

CREATE TABLE IF NOT EXISTS helioscta_agents.conversations (
    conversation_id SERIAL PRIMARY KEY,
    agent_id        VARCHAR(64) NOT NULL REFERENCES helioscta_agents.agents(agent_id),
    title           VARCHAR(255),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conv_agent
    ON helioscta_agents.conversations(agent_id) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS helioscta_agents.messages (
    message_id      SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES helioscta_agents.conversations(conversation_id),
    role            VARCHAR(20) NOT NULL,
    content         TEXT NOT NULL,
    user_email      VARCHAR(255),
    model           VARCHAR(100),
    input_tokens    INTEGER,
    output_tokens   INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_msg_conversation
    ON helioscta_agents.messages(conversation_id);
