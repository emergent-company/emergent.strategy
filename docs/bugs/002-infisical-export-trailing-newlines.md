# Bug Report: Infisical Export Includes Trailing Newlines in Values

**Issue Number:** 002  
**Date Reported:** 2025-11-24  
**Severity:** High  
**Status:** In Progress

## Summary

The `infisical export` command preserves trailing newlines in secret values, causing malformed `.env` files that break OAuth2 authentication and other configurations.

## Impact

- **Authentication Failure:** OAuth2 redirect URIs contain embedded newlines, causing Zitadel to reject login attempts with "invalid_request: The requested redirect_uri is missing in the client configuration"
- **Scope:** Affects all secrets exported from Infisical that have trailing newlines
- **Severity:** Blocks user authentication and application functionality

## Evidence

### Malformed .env File (apps/admin/.env)

```bash
# Current output (with visible byte markers):
VITE_AUTH_MODE='oidc\n'
VITE_ZITADEL_REDIRECT_URI='http://localhost:5176/auth/callback\n
```

### Expected Format

```bash
VITE_AUTH_MODE='oidc'
VITE_ZITADEL_REDIRECT_URI='http://localhost:5176/auth/callback'
```

### Infisical Export Output

```bash
$ infisical export --env=local --path=/admin | grep VITE_AUTH_MODE -A1
VITE_AUTH_MODE='oidc
'
```

### OAuth Error in Browser

```json
{
  "error": "invalid_request",
  "error_description": "The requested redirect_uri is missing in the client configuration."
}
```

**Observed URL:** `http://localhost:8200/oauth/v2/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A5176%2Fauth%2Fcallback%0A`  
**Note:** `%0A` is the URL-encoded newline character

## Root Cause

When secrets are stored in Infisical with trailing newlines (possibly from copy-paste or text editor behavior), the `infisical export` command preserves these newlines verbatim in the dotenv output format.

The `scripts/env-export.sh` script pipes this output directly into `.env` files without sanitization:

```bash
# scripts/env-export.sh:258
infisical export --env "$env" --path "$path" $domain_flag > "$temp_file"
cat "$temp_file" >> "$output"
```

## Affected Variables

Known affected variables in `/admin` path:
- `VITE_AUTH_MODE`
- `VITE_ZITADEL_REDIRECT_URI`
- `VITE_ZITADEL_POST_LOGOUT_REDIRECT_URI`

**Potential scope:** Any Infisical secret with trailing whitespace across all paths (/workspace, /docker, /server, /admin)

## Reproduction Steps

1. Store a secret in Infisical with a trailing newline:
   ```bash
   echo "value\n" | infisical secrets set KEY --stdin
   ```

2. Export to .env file:
   ```bash
   ./scripts/env-export.sh --path=/admin --overwrite
   ```

3. Inspect the output:
   ```bash
   od -c apps/admin/.env | grep -A1 KEY
   ```

4. Observe embedded newline in value

## Proposed Solutions

### Solution 1: Strip Trailing Newlines in env-export.sh (Quick Fix)

**Approach:** Add post-processing to remove trailing whitespace from exported values

```bash
# After infisical export, clean up the output
sed -i '' "s/='\\(.*\\)[[:space:]]\\+$/='\\1'/g" "$temp_file"
```

**Pros:**
- Immediate fix without touching Infisical data
- Works for all future exports
- Backward compatible

**Cons:**
- Doesn't fix root cause in Infisical
- Adds processing overhead
- Complex regex patterns needed

### Solution 2: Clean Infisical Secrets (Root Cause Fix)

**Approach:** Update all secrets in Infisical to remove trailing newlines

```bash
# For each affected secret
infisical secrets get KEY --plain | tr -d '\n' | infisical secrets set KEY --stdin
```

**Pros:**
- Fixes root cause
- Cleaner data in Infisical
- No script modifications needed

**Cons:**
- Manual or scripted cleanup required
- Risk of data loss if not careful
- Need to identify all affected secrets

### Solution 3: Use --format json (Alternative)

**Approach:** Export as JSON and parse properly

```bash
infisical export --format json | jq -r 'to_entries[] | "\(.key)=\(.value | @sh)"'
```

**Pros:**
- JSON parsing handles whitespace correctly
- More robust than text processing
- Structured data format

**Cons:**
- Requires `jq` dependency
- More complex script logic
- May have different escaping behavior

## Recommended Approach

**Immediate:** Implement Solution 1 (strip trailing newlines in env-export.sh)  
**Follow-up:** Implement Solution 2 (clean Infisical secrets)

This provides immediate relief while addressing the root cause for long-term stability.

## Implementation Plan

1. **Phase 1:** Update `scripts/env-export.sh` to strip trailing whitespace
2. **Phase 2:** Create script to audit and clean Infisical secrets
3. **Phase 3:** Document best practices for secret entry in Infisical
4. **Phase 4:** Add validation in bootstrap scripts to detect this issue

## Testing Verification

After fix is applied:

```bash
# 1. Re-export secrets
./scripts/env-export.sh --overwrite

# 2. Verify no embedded newlines
od -c apps/admin/.env | grep -E "(VITE_AUTH|REDIRECT_URI)"

# 3. Restart services
npm run workspace:restart

# 4. Test OAuth flow
# - Navigate to http://localhost:5176
# - Click "Dashboard"
# - Should redirect to Zitadel login page (not error)
```

## Related Files

- `scripts/env-export.sh` - Export script
- `apps/admin/.env` - Malformed output file
- `docs/guides/ENVIRONMENT_SETUP.md` - Environment setup documentation

## References

- Infisical CLI documentation: https://infisical.com/docs/cli/commands/export
- OAuth2 redirect URI specification: https://datatracker.ietf.org/doc/html/rfc6749#section-3.1.2
- Zitadel error codes: https://zitadel.com/docs/apis/openapi/reference
