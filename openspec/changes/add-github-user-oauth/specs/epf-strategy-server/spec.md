## ADDED Requirements

### Requirement: GitHub OAuth App Authorization Flow

The server SHALL implement a standard GitHub OAuth 2.0 flow that allows a
user to authorize the platform to read their GitHub installation list. The
resulting access token SHALL be stored server-side and associated with the
user's account.

#### Scenario: Successful OAuth dance

- **WHEN** a user navigates to `GET /github/connect` with no stored GitHub token
- **THEN** the page shows a "Connect your GitHub account" button linking to `/github/connect/authorize`
- **WHEN** the user clicks the button
- **THEN** the server generates a CSRF state, stores it in a signed cookie, and redirects to GitHub's authorize URL
- **WHEN** GitHub redirects to `/github/connect/callback?code=XXX&state=YYY`
- **AND** the state matches the cookie
- **THEN** the server exchanges the code for an access token
- **AND** stores the token against the user's record in the DB
- **AND** redirects to `/github/connect`
- **WHEN** the user arrives at `/github/connect`
- **THEN** they see the installation picker populated with their installations

#### Scenario: CSRF state mismatch rejected

- **WHEN** `/github/connect/callback` is called with a state that does not match the cookie
- **THEN** the server returns HTTP 400
- **AND** no token is stored

#### Scenario: OAuth not configured — graceful degradation

- **WHEN** `GITHUB_OAUTH_CLIENT_ID` is not set
- **AND** a user visits `/github/connect` with no stored token
- **THEN** the page shows an explanatory message: "GitHub OAuth is not configured"
- **AND** no "Connect" button is shown
- **AND** no error is returned

---

### Requirement: User-Scoped Installation Discovery

The connect flow SHALL use `GET /user/installations` (with the user's OAuth
token) instead of `GET /app/installations` (with the App JWT). This ensures
each user sees only the GitHub orgs they personally have access to.

#### Scenario: User sees their own installations

- **WHEN** a user has a stored GitHub OAuth token
- **AND** navigates to `/github/connect`
- **THEN** the installation picker is populated via `GET /user/installations` called with their token
- **AND** only shows installations the user has access to (not all App installations server-wide)

#### Scenario: User A cannot see User B's installations

- **GIVEN** User A has token granting access to `org-a`
- **AND** User B has token granting access to `org-b`
- **WHEN** User A visits `/github/connect`
- **THEN** they see only `org-a`
- **AND** never `org-b`

#### Scenario: Stale token — graceful re-auth

- **WHEN** a user's stored token has been revoked on GitHub
- **AND** `GET /user/installations` returns 401
- **THEN** the server clears the stored token
- **AND** renders the connect page in "needs auth" state
- **AND** shows the "Connect your GitHub account" button again

---

### Requirement: GitHub Token Stored Per-User

The server SHALL store the user's GitHub OAuth access token in the `users`
table (`github_access_token` column). The token is associated with the
authenticated platform user, not with any specific strategy instance.

#### Scenario: Token persists across page loads

- **WHEN** a user completes the OAuth dance
- **AND** later navigates to `/github/connect` in a new browser session
- **THEN** their stored token is loaded from the DB
- **AND** the installation picker is shown immediately (no re-auth required)

#### Scenario: No token for new users

- **WHEN** a user who has never connected GitHub visits `/github/connect`
- **THEN** `users.github_access_token` is NULL for their record
- **AND** the "needs auth" state is shown
