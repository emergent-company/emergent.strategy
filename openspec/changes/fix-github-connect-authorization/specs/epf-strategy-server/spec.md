## ADDED Requirements

### Requirement: Revoked GitHub Token Returns the User to Authorization

When GitHub rejects a user's stored OAuth token (HTTP 401) the server SHALL
remove the stored token, discard the cached scan for it, and show the authorize
state, instead of a generic scan failure. A scan that could not read every
organisation SHALL be reported as partial, not as complete.

#### Scenario: Token revoked on GitHub

- **WHEN** a user's stored token has been revoked and the repository scan receives a 401
- **THEN** the stored token is cleared
- **AND** the page shows the "Connect GitHub account" state again

#### Scenario: Revoked token in the second scan pass

- **WHEN** listing the repositories of an organisation returns a 401 after the user's own repositories were listed
- **THEN** the token is treated as revoked as above, and no partial list is shown as complete

#### Scenario: One organisation cannot be listed

- **WHEN** listing the repositories of one organisation fails with a status other than 401
- **THEN** the other repositories are shown
- **AND** the result is marked partial and the failure is logged with the organisation name

### Requirement: Scan Cache Is Keyed Per User

The web repository scan SHALL cache its result under a key made of the user's id
and a hash of the token, never a prefix of the token.

#### Scenario: Tokens with a shared prefix

- **WHEN** two users hold tokens that begin with the same 16 characters
- **THEN** each reads only their own cached scan

#### Scenario: Re-authorization

- **WHEN** a user authorizes again and receives a new token
- **THEN** the earlier cached scan is not served
