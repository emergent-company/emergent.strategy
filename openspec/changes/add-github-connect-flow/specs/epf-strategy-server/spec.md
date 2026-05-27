## ADDED Requirements

### Requirement: GitHub App Installation Listing

The server SHALL provide a way to list all GitHub orgs and personal accounts
where the GitHub App is installed. This is the entry point for repo discovery:
users pick an installation to scan, regardless of which 21st-id company will
ultimately own the resulting strategy instance.

#### Scenario: List installations successfully

- **WHEN** a user calls `list_github_installations()`
- **AND** the GitHub App is configured server-side
- **THEN** the server returns all installations with:
  `owner_login`, `owner_type` ("Organization" or "User"), `html_url`

#### Scenario: App not configured

- **WHEN** `list_github_installations()` is called and `GITHUB_APP_ID` is not set
- **THEN** the server returns `{app_configured: false}` with an explanatory message
- **AND** does not return an error (graceful degradation)

#### Scenario: No installations

- **WHEN** the App exists but has no installations
- **THEN** the server returns an empty list
- **AND** includes `app_install_url` if `GITHUB_APP_SLUG` is configured

---

### Requirement: Repo Discovery with EPF Detection

The server SHALL discover all repositories accessible to the GitHub App
installation for a given GitHub owner (org or personal account), and detect
which repos contain EPF strategy instances.

Detection SHALL use a two-pass approach: non-recursive root tree first (fast,
one API call), recursive full tree as fallback (handles monorepos).

Results SHALL be cached in-memory per `github_owner` for 5 minutes to avoid
redundant API calls on repeated scans.

#### Scenario: Successful scan with EPF at repo root

- **WHEN** `scan_github_repos(github_owner="acme-company")` is called
- **AND** the App is installed on `acme-company`
- **AND** repo `acme-company/strategy` has a `READY/` directory at its root
- **THEN** the result for that repo has `has_epf: true` and
  `detected_instances: [{base_path: "", has_meta_file: false}]`

#### Scenario: EPF detected in subdirectory

- **WHEN** repo `acme-company/monorepo` has no EPF markers at root
- **AND** a recursive scan finds `docs/strategy/READY/` with YAML files
- **THEN** the result has `has_epf: true` and
  `detected_instances: [{base_path: "docs/strategy", has_meta_file: false}]`

#### Scenario: Multiple EPF instances in one repo

- **WHEN** a repo contains both `strategy/product-a/READY/` and `strategy/product-b/READY/`
- **THEN** `detected_instances` contains two entries with their respective base paths

#### Scenario: No EPF found

- **WHEN** a repo contains neither EPF markers at root nor in any subdirectory
- **THEN** `has_epf: false` and `detected_instances: []`

#### Scenario: App not installed on owner

- **WHEN** `scan_github_repos(github_owner="unknown-org")` is called
- **AND** the App is not installed on `unknown-org`
- **THEN** the server returns a structured error:
  `{code: "github_app_not_installed", github_owner: "unknown-org", install_url: "https://github.com/apps/.../installations/new"}`

#### Scenario: Cached results returned

- **WHEN** `scan_github_repos` is called twice within 5 minutes for the same owner
- **THEN** the second call returns the cached result without additional GitHub API calls

#### Scenario: Truncated tree for large monorepo

- **WHEN** the recursive tree response from GitHub has `truncated: true`
- **THEN** the server logs a warning and returns partial results
- **AND** the result includes `scan_truncated: true` so the UI can inform the user

---

### Requirement: Repo-to-Company Assignment via Connect Flow

The server SHALL provide a guided web UI connect flow that allows a user to:
1. Pick a GitHub installation (which account to scan)
2. Browse repos with EPF detection
3. Select a repo and assign it to a specific workspace/org (company)
4. Import or link the repo to a strategy instance

The assignment of a repo to a company is explicit and user-driven. The GitHub
owner of the repo does NOT determine the 21st-id company — the user's workspace
selection does.

#### Scenario: Connect flow — successful repo import

- **WHEN** a user navigates to `/github/connect`
- **AND** selects GitHub owner `agency-org`
- **AND** scans repos and selects `agency-org/client-a-strategy` (EPF detected at `docs/epf`)
- **AND** selects workspace "Client A Corp" from the workspace dropdown
- **AND** clicks "Import artifacts"
- **THEN** the server calls `ImportFromGithub` with the selected repo and base path
- **AND** the resulting instance belongs to the "Client A Corp" org
- **AND** the user is redirected to the new instance's detail page

#### Scenario: Connect flow — link only (genesis flow)

- **WHEN** a user selects a repo and workspace and clicks "Link only"
- **THEN** the server sets `github_repo` and `github_base_path` on the instance
- **AND** does NOT import any artifacts
- **AND** the instance shows sync state "server ahead" (local-only, never synced)

#### Scenario: Connect flow — App not installed

- **WHEN** a user opens the connect page for an owner where the App is not installed
- **THEN** the page shows an "Install GitHub App" button
- **AND** the button links to `https://github.com/apps/{GITHUB_APP_SLUG}/installations/new`
- **AND** no scan is attempted

#### Scenario: Agency assigns repo to client org

- **WHEN** a user with access to multiple orgs selects a repo from owner `agency-github-org`
- **AND** assigns it to workspace "Client XYZ Corp" (a different org than the agency)
- **THEN** the instance is created in the "Client XYZ Corp" org
- **AND** the `github_repo` is set to `agency-github-org/client-xyz-strategy`
- **AND** the company-to-repo mapping is implied by the instance's org placement

#### Scenario: Personal account repos assigned to any org

- **WHEN** a user with a personal GitHub account (`nikolaifasting`) has the App installed
- **AND** they select a repo from their personal account
- **AND** assign it to workspace "Client ABC Inc"
- **THEN** the instance belongs to "Client ABC Inc" org
- **AND** syncs to `nikolaifasting/<repo-name>` on GitHub

---

### Requirement: App Install URL Configuration

The server SHALL support a `GITHUB_APP_SLUG` configuration value that enables
display of a direct GitHub App installation link in the UI. When this value is
set, users who need to install the App see a button linking directly to the
installation page.

#### Scenario: Install URL shown when slug configured

- **WHEN** `GITHUB_APP_SLUG` is set to `"emergent-strategy-app"`
- **AND** the App is not installed for a given owner
- **THEN** the UI shows a button linking to
  `https://github.com/apps/emergent-strategy-app/installations/new`

#### Scenario: Install URL absent when slug not configured

- **WHEN** `GITHUB_APP_SLUG` is not set
- **THEN** the UI shows an explanatory message without an install button
- **AND** no error is returned
