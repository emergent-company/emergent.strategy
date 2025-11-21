# Proposal: Cache Introspection Failures

## Background

The system is currently experiencing frequent cache misses for Zitadel introspection calls, leading to excessive API requests and potential performance degradation. Analysis reveals that introspection results for invalid/inactive tokens are not being cached, causing repeated API calls for the same invalid token.

## Goal

Reduce excessive calls to Zitadel by caching negative (inactive) introspection results.

## Scope

- Modify `ZitadelService` to cache introspection results even when `active` is false.
- Define appropriate TTL for inactive token cache entries.

## Risks

- Caching a "false negative" (e.g., due to temporary Zitadel error) could prevent a valid user from authenticating for the duration of the cache TTL. However, introspection usually returns `active: false` for definitive reasons (expired, invalid signature).
- Temporary errors (network, 5xx) are already handled by throwing/logging and returning null, so they are NOT cached. Only successful 200 OK responses with `{ active: false }` will be cached.
