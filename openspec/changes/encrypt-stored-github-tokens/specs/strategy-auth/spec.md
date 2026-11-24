## ADDED Requirements

### Requirement: Stored Credentials Are Encrypted at Rest

The server SHALL store a user's GitHub OAuth token only in encrypted form, using
an authenticated cipher with a key from configuration, bound to the owning user.
In production the server SHALL refuse to start without the key when GitHub OAuth
is configured. The token SHALL NOT appear in logs, error messages or cache keys.

#### Scenario: Token is sealed in the database
- **WHEN** a user completes the GitHub OAuth flow
- **THEN** the stored value is an encrypted envelope and the token does not appear in the database as plain text

#### Scenario: Value copied to another user
- **WHEN** a stored value is copied to another user's row
- **THEN** it does not decrypt

#### Scenario: Legacy plain-text value
- **WHEN** a token stored before this change is read
- **THEN** it is returned and replaced by an encrypted value
- **AND** after the backfill a plain-text value is refused

#### Scenario: Production without a key
- **WHEN** the server starts with `ENV=production`, GitHub OAuth configured and no encryption key
- **THEN** it refuses to start and says which setting is missing

#### Scenario: Key rotation
- **WHEN** a new key is added first in the key list
- **THEN** new values use it and values sealed with an older key in the list still decrypt
