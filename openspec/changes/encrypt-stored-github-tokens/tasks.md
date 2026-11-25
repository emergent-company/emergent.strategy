# Tasks

## 1. Crypto and storage

- [x] 1.1 A small package with `Seal(plaintext, aad)` and `Open(value, aad)` for the
      versioned envelope. Tests first: round trip; wrong key fails; a value moved to
      another user's row fails (additional authenticated data); a tampered value
      fails; two seals of one input differ.
- [x] 1.2 Config: `EPF_DATA_ENCRYPTION_KEYS` parsed and validated (length, id,
      duplicates). `ValidateProduction` refuses to start without a key when GitHub
      OAuth is configured; the production config test covers it.
- [x] 1.3 `StoreGithubToken` seals; `GetGithubToken` opens; legacy plain text is
      returned and re-sealed. Tests with a fake db or the existing user service tests.
- [x] 1.4 A one-time idempotent backfill at startup; a setting that refuses plain
      text afterwards; a test that resumes after a partial run.

## 2. No leaks

- [x] 2.1 A test that the token string appears in no log line, error text or cache
      key of the connect flow (capture slog output through a full connect, scan and
      import with a fake client).
- [x] 2.2 Check backups and exports: the `users` table export, if any, carries only
      the sealed value. The server has no export of `users`; a database backup
      copies the column as stored. Backups taken before the first start with a key
      hold plain text (said in `DEPLOYMENT.md`).

## 3. Scope decision

- [ ] 3.1 Record the decision on the `repo` scope in this change's design and, if it
      changes, open a follow-up change; do not widen or narrow scopes here.

## 4. Verification

- [x] 4.1 `go test ./...`, `task lint`, `openspec validate encrypt-stored-github-tokens --strict`.
- [x] 4.2 Rotation check on a local database: write with key 1, add key 2 first,
      read both, backfill, drop key 1, read. Run with the built binary against a
      throwaway local database, and in `TestSealStoredTokens`.
- [ ] 4.3 `deploy-strategy-server` provides the key as a secret before the first
      multi-user deploy. The workflow binds
      `strategy-server-data-encryption-keys` when it exists; the secret itself is
      not created yet.
