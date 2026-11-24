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

## Risks

- Losing the key loses every stored token. Users reconnect (the revoked-token path
  of `fix-github-connect-authorization` handles a token that no longer works),
  so the impact is a re-authorization, not data loss.
- A backfill that fails halfway leaves a mix of both forms; the read path
  accepts both, so this is safe to resume.

## Open questions

- Which secret store holds the key, and who rotates it?
- Keep `repo` for now (default) or move to a GitHub App user token?
