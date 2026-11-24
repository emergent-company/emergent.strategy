## ADDED Requirements

### Requirement: GitHub App Installation Listing

The server SHALL provide the MCP tool `list_github_installations`, which lists
the GitHub orgs and personal accounts where the GitHub App is installed. It
lists every installation of the App on this server; it is not scoped to the
calling user.

#### Scenario: List installations successfully

- **WHEN** a user calls `list_github_installations()` and the GitHub App is configured
- **THEN** the server returns `app_configured: true`, the installations (`owner_login`, `owner_type`, `html_url`, `id`), a `total`, and `app_install_url`

#### Scenario: App not configured

- **WHEN** `list_github_installations()` is called and the App cannot be reached or is not configured
- **THEN** the server returns `app_configured: false` with an explanatory message
- **AND** does not return an error

#### Scenario: No installations

- **WHEN** the App is configured but has no installations
- **THEN** the server returns an empty list
- **AND** `app_install_url` is the installation URL when `GITHUB_APP_SLUG` is set and an empty string otherwise

### Requirement: Repo Discovery with EPF Detection

The server SHALL discover the repositories of a GitHub owner and detect which
contain EPF content, in two passes. Pass 1 reads the root tree and finds a root
`READY/` directory. Pass 2 reads the recursive tree and finds `READY/`
directories in subdirectories, skipping ignored path segments and instances
nested inside another. The MCP tool `scan_github_repos(github_owner)` performs
the scan with the App's installation token. Results are cached for 30 minutes,
per owner for this tool; a failed scan is cached for 60 seconds.

#### Scenario: EPF at the repository root

- **WHEN** `scan_github_repos(github_owner="acme-company")` is called and the repository `acme-company/strategy` has a `READY/` directory at its root
- **THEN** the result for that repository has `has_epf: true` and `detected_instances: [{base_path: "", has_meta_file: <bool>}]`

#### Scenario: EPF in a subdirectory

- **WHEN** a repository has no EPF markers at its root and a recursive scan finds `docs/strategy/READY/` with YAML files
- **THEN** the result has `has_epf: true` and `detected_instances` holds an entry with `base_path: "docs/strategy"`

#### Scenario: Several EPF instances in one repository

- **WHEN** a repository contains both `strategy/product-a/READY/` and `strategy/product-b/READY/`
- **THEN** `detected_instances` has one entry for each base path
- **AND** an instance nested inside another is not listed

#### Scenario: No EPF found

- **WHEN** a repository has no `READY/` directory at its root or in any subdirectory
- **THEN** `has_epf` is false and no instance is detected

#### Scenario: App not installed on the owner

- **WHEN** `scan_github_repos(github_owner="unknown-org")` is called and the App is not installed on that owner
- **THEN** the tool returns `error` with a message that the GitHub App is not installed, `github_owner`, and `app_install_url`

#### Scenario: Cached results

- **WHEN** `scan_github_repos` is called again for the same owner within the cache lifetime
- **THEN** the cached result is returned without further GitHub API calls

#### Scenario: Truncated tree for a large repository

- **WHEN** GitHub reports the recursive tree as truncated
- **THEN** the server logs a warning and returns the partial result
- **AND** the repository carries `scan_truncated: true`

#### Scenario: Repositories that use EPF through a submodule

- **WHEN** a repository mounts an EPF instance as a git submodule (listed in `.gitmodules`)
- **THEN** the scan marks it as a submodule and records which repositories use it
- **AND** a repository that only subscribes to an instance through a submodule skips the recursive pass

### Requirement: Repo-to-Workspace Assignment via Connect Flow

The web UI SHALL provide a connect flow at `/github/connect` in which a user
picks a repository from the list of repositories their own token can see
(see "User-Scoped Repository Discovery"), chooses the workspace that will own
the resulting strategy instance, and either imports the artifacts or only links
the repository. The workspace is chosen explicitly; nothing is inferred from
the repository's owner.

#### Scenario: Import a repository into a workspace

- **WHEN** a user picks a repository with detected EPF content, picks a workspace in the dropdown and clicks Import
- **THEN** the server imports the artifacts using the user's OAuth token, so the App need not be installed on the owner
- **AND** the instance is created in the chosen workspace with `github_repo` and `github_base_path` set, and is activated
- **AND** the user is redirected to the new instance

#### Scenario: Link only

- **WHEN** the user picks a repository and a workspace and clicks "Link only"
- **THEN** the instance is created in that workspace with `github_repo` and `github_base_path` set
- **AND** no artifacts are imported and the instance is not activated

#### Scenario: Repository already connected

- **WHEN** an instance with the same `github_repo` already exists and the user picks a different workspace
- **THEN** the existing instance is moved to that workspace instead of a duplicate being created
- **AND** the list shows the connected instance, its workspace and when it last synced, with a re-import action

#### Scenario: Assign to a different organisation

- **WHEN** a user picks a repository owned by `agency-org` and assigns it to the workspace "Client A Corp", which belongs to another organisation
- **THEN** the instance is created in "Client A Corp" with `github_repo` set to `agency-org/<repository>`

#### Scenario: Personal repository

- **WHEN** a user picks a repository from their personal GitHub account
- **THEN** it can be assigned to any workspace in the dropdown and syncs to that repository

#### Scenario: New workspace on the fly

- **WHEN** the user chooses "new workspace" and enters a name
- **THEN** the server creates the organisation (or reuses it) and a workspace for the repository's owner, makes the user a member, and uses it for the import
- **AND** when no workspace exists yet, the page shows an inline name field instead of a dropdown

#### Scenario: Not connected

- **WHEN** `POST /github/connect/import` is called by a user with no stored GitHub token
- **THEN** the server returns HTTP 401

### Requirement: App Install URL Configuration

The server SHALL support `GITHUB_APP_SLUG` for building the GitHub App
installation URL `https://github.com/apps/{slug}/installations/new`.

#### Scenario: Slug configured

- **WHEN** `GITHUB_APP_SLUG` is set
- **THEN** the connect page shows an "Install GitHub App" link to that URL in its information card
- **AND** the MCP tools `list_github_installations` and `scan_github_repos` return it as `app_install_url`

#### Scenario: Slug not configured

- **WHEN** `GITHUB_APP_SLUG` is not set
- **THEN** no install link is shown and `app_install_url` is an empty string
- **AND** no error is raised
