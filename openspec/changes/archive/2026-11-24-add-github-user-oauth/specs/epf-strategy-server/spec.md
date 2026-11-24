## ADDED Requirements

### Requirement: GitHub OAuth App Authorization Flow

The server SHALL implement a standard GitHub OAuth 2.0 authorization-code flow
that lets a user authorize the platform to read their GitHub repositories. The
resulting access token SHALL be stored server-side against the user's account.
The flow requests the scopes `repo`, `read:user` and `read:org`.

#### Scenario: Successful OAuth dance

- **WHEN** a user opens `GET /github/connect` with no stored GitHub token and the GitHub App is configured
- **THEN** the page shows a "Connect GitHub account" button linking to `/github/connect/authorize`
- **WHEN** the user follows the link
- **THEN** the server generates a CSRF state, stores it in an HMAC-signed, HttpOnly cookie that expires after 10 minutes, and redirects to GitHub's authorize URL
- **WHEN** GitHub redirects to `/github/connect/callback?code=XXX&state=YYY` and the state matches the cookie
- **THEN** the server exchanges the code for an access token, stores it against the user, clears the state cookie and redirects to `/github/connect`
- **AND** the page then loads the user's repositories (see "User-Scoped Repository Discovery")

#### Scenario: CSRF state rejected

- **WHEN** `/github/connect/callback` is called with a missing state cookie, an invalid cookie signature, an empty state parameter, or a state that does not match the cookie
- **THEN** the server returns HTTP 400
- **AND** no token is stored

#### Scenario: Authorization code missing

- **WHEN** `/github/connect/callback` is called with a valid state but without a `code`
- **THEN** the server returns HTTP 400
- **AND** no token is stored

#### Scenario: OAuth not configured

- **WHEN** `GITHUB_OAUTH_CLIENT_ID` is not set
- **AND** a user opens `/github/connect` with no stored token
- **THEN** the page explains that GitHub OAuth is not configured on this server and names the environment variables to set
- **AND** no "Connect" button is shown
- **AND** the page returns HTTP 200
- **WHEN** `/github/connect/authorize` or `/github/connect/callback` is called anyway
- **THEN** the server returns HTTP 503

### Requirement: GitHub Token Stored Per-User

The server SHALL store the user's GitHub OAuth access token in the `users`
table (`github_access_token`, nullable). The token belongs to the authenticated
platform user, not to a strategy instance, and is never serialised in API
responses.

#### Scenario: Token persists across sessions

- **WHEN** a user has completed the OAuth flow
- **AND** later opens `/github/connect` in a new browser session
- **THEN** the token is read from the database and the user is not asked to authorize again

#### Scenario: No token for a new user

- **WHEN** a user has never connected GitHub
- **THEN** the stored value is null and `/github/connect` shows the needs-authorization state

### Requirement: User-Scoped Repository Discovery

The connect page SHALL discover repositories with the user's own OAuth token
(the repositories that user can see on GitHub), not with the GitHub App's
credentials, and SHALL detect EPF content in them asynchronously. The page
renders at once with a loading state and fetches the result from
`GET /github/connect/repos` by HTMX polling.

#### Scenario: User sees the repositories their token can see

- **WHEN** a user with a stored token opens `/github/connect`
- **THEN** the page shows a loading state and polls `/github/connect/repos`
- **AND** the list shows repositories returned for that user's token, each flagged when the GitHub App is installed on its owner

#### Scenario: Results are cached per user

- **WHEN** the repository list was loaded for a token
- **THEN** it is cached under a key derived from that token, so one user's list is never served to another
- **AND** a failed scan is cached for 60 seconds only

#### Scenario: GitHub rate limit

- **WHEN** the scan fails because GitHub's rate limit is exhausted
- **THEN** the page shows a rate-limited state with the time to retry and retries on its own

#### Scenario: Scan failure

- **WHEN** the scan fails for any other reason
- **THEN** the page shows a generic scan-failed message
