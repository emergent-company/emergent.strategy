# Spec: Introspection Caching

## MODIFIED Requirements

### Requirement: Caching introspection results

The system MUST cache introspection results from Zitadel to reduce API load, including both active and inactive results.

#### Scenario: Caching inactive tokens

- **Given** a token that is invalid or expired
- **When** `introspect` is called
- **Then** Zitadel returns `{ active: false }`
- **And** the result is cached in `PostgresCacheService` with a 5-minute TTL
- **And** subsequent calls for the same token return the cached `{ active: false }` result without calling Zitadel

#### Scenario: Caching active tokens

- **Given** a valid token
- **When** `introspect` is called
- **Then** Zitadel returns `{ active: true, exp: ... }`
- **And** the result is cached with TTL matching the `exp` claim (or default 5m)
