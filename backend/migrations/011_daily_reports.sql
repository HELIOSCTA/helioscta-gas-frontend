-- Daily reports table for persisting AI-generated structured reports
CREATE TABLE IF NOT EXISTS helioscta_agents.daily_reports (
    report_id       SERIAL PRIMARY KEY,
    conversation_id INTEGER,
    agent_id        VARCHAR(64),
    title           VARCHAR(512) NOT NULL,
    trade_date      DATE NOT NULL,
    report_json     JSONB NOT NULL,
    overall_signal  VARCHAR(32),
    created_by      VARCHAR(256),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_reports_date
    ON helioscta_agents.daily_reports (trade_date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_reports_agent
    ON helioscta_agents.daily_reports (agent_id);
