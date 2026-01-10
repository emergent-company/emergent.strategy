# Spec: Debug Logging

## MODIFIED Requirements

### Requirement: Detailed Cache Debugging

The system MUST log detailed information about cache keys and states to facilitate debugging.

#### Scenario: Cache Miss Logging

- **Given** a cache miss in `PostgresCacheService`
- **When** `get` is called
- **Then** log the generated token hash
- **And** log the total number of entries currently in the cache table
- **And** log the first 10 characters of the token (for correlation)

#### Scenario: Token Acquisition Debugging

- **Given** `getClientAccessToken` is called
- **When** deciding whether to use cached token or fetch new
- **Then** log the current state of `cachedClientToken` (exists? expired?)
- **And** log the `expires_in` value received from Zitadel
