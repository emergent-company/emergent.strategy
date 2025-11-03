-- Migration: Auth Introspection Cache
-- Description: Creates PostgreSQL-based cache for Zitadel token introspection
-- Date: 2025-11-03
-- Author: AI Assistant
-- Purpose: Enable high-performance token validation with caching to reduce Zitadel API calls

CREATE TABLE IF NOT EXISTS kb.auth_introspection_cache (
    token_hash VARCHAR(128) PRIMARY KEY,
    introspection_data JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient cleanup of expired entries
CREATE INDEX IF NOT EXISTS idx_auth_introspection_cache_expires_at 
    ON kb.auth_introspection_cache(expires_at);

-- Table documentation
COMMENT ON TABLE kb.auth_introspection_cache IS 
    'Caches Zitadel OAuth2 token introspection results to reduce API calls and improve authentication performance';

COMMENT ON COLUMN kb.auth_introspection_cache.token_hash IS 
    'SHA-512 hash of the access token (used as cache key for security)';

COMMENT ON COLUMN kb.auth_introspection_cache.introspection_data IS 
    'Full introspection response from Zitadel stored as JSONB (includes user info, roles, scopes)';

COMMENT ON COLUMN kb.auth_introspection_cache.expires_at IS 
    'Timestamp when cache entry expires (based on token expiry and configured TTL)';

COMMENT ON COLUMN kb.auth_introspection_cache.created_at IS 
    'Timestamp when cache entry was created';

-- Grant permissions to application role
GRANT SELECT, INSERT, UPDATE, DELETE ON kb.auth_introspection_cache TO app_rls;
