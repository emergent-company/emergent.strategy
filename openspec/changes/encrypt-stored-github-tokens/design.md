## Decisions

1. **AES-256-GCM, versioned envelope.** Stored text is `enc:v1:<key id>:<base64
   nonce+ciphertext>`. A random 96-bit nonce per value; the user id is bound as
   additional authenticated data, so a value copied from one row to another does
   not decrypt.
2. **Key from configuration**, `EPF_DATA_ENCRYPTION_KEYS` as a list of
   `id:base64key` pairs, the first one used for writing, all for reading. That
   makes rotation a config change plus a backfill. In development a missing key
   disables encryption (with a log line); in production
   `ValidateProduction` requires it when GitHub OAuth is configured.
3. **No schema change.** The column stays TEXT; the `enc:` prefix tells a new value
   from a legacy one. Legacy plain text is read, and replaced on the next read or
   by the backfill (a startup step run once and idempotent). After the backfill a
   setting turns the plain-text read off.
4. **Where the key lives is not decided here.** A Cloud Run secret is the likely
   home (`deploy-strategy-server` already resolves secrets); this change only
   reads an environment variable.
5. **Scope.** `repo` is the narrowest classic OAuth scope that lists private
   repositories and reads their contents, but it also writes. The alternatives are
   a GitHub App user-to-server token (permissions per repository, expiring) or a
   split of read and write. That is a product decision with a migration cost;
   this change records the answer and does not implement it.

## As built

6. **Package.** `internal/seal`; the additional authenticated data is the column
   name and the user id (`users.github_access_token:<uuid>`).
7. **One reader and writer.** `domain/user/github_token.go`. `domain.User` has no
   field for the column, so signing in (a whole-row update) can no longer write a
   stale value over a cleared or re-sealed one.
8. **Unreadable values are kept.** Unknown key, wrong row, altered text, or plain
   text when refused give `ErrTokenUnreadable`: the web UI offers to connect
   again, the MCP tools answer `needs_github_connection`, and nothing deletes the
   value, so a wrong key setting is recoverable.
9. **Start-up.** The backfill runs before the server takes requests and also moves
   older keys to the first one. A database error stops the start; an unreadable
   row is logged by user id and skipped. Updates apply only while the value read
   is still stored. A read re-seals the same way.
10. **Settings.** `EPF_DATA_ENCRYPTION_KEYS` is parsed in every environment, so a
    bad value never starts a server. `EPF_DATA_ENCRYPTION_REFUSE_PLAINTEXT`
    (default off) refuses plain values; it needs a key.

## Scope (task 3.1, open)

The scopes are unchanged (`repo`, `read:user`, `read:org`). `repo` is kept until
the owner decides otherwise. For the decision: strategy-server never pushes with
a user token (every write goes through the GitHub App), so the write half of
`repo` is unused, but classic OAuth has no read-only scope for private
repositories. Removing it means moving to a GitHub App user token, which only
reaches repositories where the App is installed.

## Risks

- Losing the key loses every stored token. Users reconnect (the revoked-token path
  of `fix-github-connect-authorization` handles a token that no longer works),
  so the impact is a re-authorization, not data loss.
- A backfill that fails halfway leaves a mix of both forms; the read path
  accepts both, so this is safe to resume.

## Open questions

- Which secret store holds the key, and who rotates it?
- Keep `repo` for now (default) or move to a GitHub App user token?
