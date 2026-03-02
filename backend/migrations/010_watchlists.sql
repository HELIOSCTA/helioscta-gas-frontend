-- 010_watchlists.sql
-- Watchlist definitions: named sets of location_role_id values for Genscape noms tracking.

CREATE TABLE IF NOT EXISTS helioscta_agents.genscape_noms_watchlists (
    watchlist_id    SERIAL PRIMARY KEY,
    slug            VARCHAR(100) UNIQUE NOT NULL,
    display_name    VARCHAR(255) NOT NULL,
    location_role_ids INTEGER[] NOT NULL DEFAULT '{}',
    created_by      VARCHAR(255),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the existing KRS watchlist
INSERT INTO helioscta_agents.genscape_noms_watchlists (slug, display_name, location_role_ids)
VALUES ('krs', 'KRS Watchlist', ARRAY[406012,446913,109286,144064,109289,146226,109285,146228,109288,146238,109292,146236,109287,109301,146241,109297])
ON CONFLICT (slug) DO NOTHING;
