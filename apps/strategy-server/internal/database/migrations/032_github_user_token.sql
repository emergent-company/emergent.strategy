-- +goose Up
-- Add GitHub OAuth access token to users table.
-- Nullable — only set after the user completes the GitHub OAuth dance.
-- Used by the connect flow to call GET /user/installations with the user's token.
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_access_token TEXT;

-- +goose Down
ALTER TABLE users DROP COLUMN IF EXISTS github_access_token;
