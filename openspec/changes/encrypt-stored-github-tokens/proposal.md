# Change: Encrypt stored GitHub tokens

## Why

A user's GitHub OAuth token is stored in `users.github_access_token` as plain
text (`032_github_user_token.sql`, `StoreGithubToken`). The OAuth flow requests
the scopes `repo`, `read:user` and `read:org`, so the token can read and write the
user's private repositories. Anyone with read access to the database or a backup
can use every user's token. The `json:"-"` tag on the model only keeps it out of
API responses. The codebase has no encryption at rest for credentials; the only
use of `x/crypto` is `argon2` for the server's own access tokens (a hash, which
cannot serve here because the server must send the token to GitHub).

## What Changes

- Encrypt the token with AES-256-GCM before it is written, with a key from
  configuration. The stored value carries a version and key id so the key can be
  rotated.
- `GetGithubToken` decrypts; values still in plain text are read as before and
  re-encrypted when read or by a one-time backfill, then plain text is refused.
- The key is required whenever GitHub OAuth is configured, and
  `ValidateProduction` refuses to start without it.
- The token never appears in logs, errors or cache keys (the cache key already
  stops using a token prefix in `fix-github-connect-authorization`).
- Decide, and record, whether the `repo` scope is the right one.

## Impact

- Affected specs: `strategy-auth` (ADDED).
- Affected code: `domain/user/service.go`, `config/config.go` (key and the
  production check), a new small crypto package, a migration or startup backfill.
- Needs a deployment secret (the key) before it can ship.
