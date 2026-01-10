# Design: Cache Introspection Failures

## Architecture

No architectural changes. The existing `PostgresCacheService` will be used to store negative results.

## Caching Strategy

- **Active Tokens:** Continue using `exp` claim from token, defaulting to 5 minutes if missing.
- **Inactive Tokens:** Cache with a fixed TTL (e.g., 5 minutes) to prevent DoS from invalid tokens.

## Implementation Details

- In `ZitadelService.introspect`:
  - Remove the condition `if (result.active)` wrapping the cache set logic.
  - Determine `expiresAt` for inactive tokens.
