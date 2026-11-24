## ADDED Requirements

### Requirement: Revoked GitHub Token Returns the User to Authorization

When GitHub rejects a user's stored OAuth token (HTTP 401) in any step of a
repository or installation listing, the server SHALL remove the stored token,
discard the cached scan for it, and return the user to the authorize state,
instead of showing a generic scan failure. For an HTMX request the redirect SHALL
be an `HX-Redirect`, because the repository list is a fragment.

#### Scenario: Token revoked on GitHub

- **WHEN** a user's stored token has been revoked and the repository scan receives a 401
- **THEN** the stored token is cleared and the cached scan is dropped
- **AND** the browser is sent to `/github/connect`, which shows the "Connect GitHub account" state

#### Scenario: Revoked token in the second scan pass

- **WHEN** listing the user's organisations, or an organisation's repositories, returns a 401 after the user's own repositories were listed
- **THEN** the token is treated as revoked as above and no list is shown

#### Scenario: Other failures keep the token

- **WHEN** the scan fails for any reason other than a 401 or the rate limit
- **THEN** the token stays stored and the page shows the generic scan-failed message

### Requirement: Incomplete Repository Lists Are Reported

A repository list that could not read every organisation SHALL be shown with the
repositories that could be read, and SHALL say that it may be incomplete. An
organisation that answers 403 because it has not approved the OAuth App is
skipped without a notice, as the page already explains how to request access.

#### Scenario: One organisation cannot be listed

- **WHEN** listing the repositories of one organisation fails with a status other than 401 or 403
- **THEN** the other repositories are shown
- **AND** the page says the list may be incomplete, and the failure is logged with the organisation name

#### Scenario: The organisation list cannot be read

- **WHEN** listing the user's organisations fails with a status other than 401
- **THEN** the user's own repositories are shown and the page says the list may be incomplete

#### Scenario: Organisation that restricts the OAuth App

- **WHEN** an organisation answers 403 because it has not approved the OAuth App
- **THEN** its repositories are left out and no incomplete notice is shown

### Requirement: Scan Cache Is Keyed by the Whole Token

The repository scan SHALL cache its result under a key derived from a hash of the
whole token, never a prefix of it, so that no part of the token is stored and
tokens that share a prefix do not share an entry.

#### Scenario: Tokens with a shared prefix

- **WHEN** two users hold tokens that begin with the same 16 characters
- **THEN** each reads only their own cached scan

#### Scenario: Re-authorization

- **WHEN** a user authorizes again and receives a new token
- **THEN** the earlier cached scan is not served

#### Scenario: Invalidation

- **WHEN** a user's scan is invalidated
- **THEN** their per-owner scans are dropped as well, and other users' scans are untouched
