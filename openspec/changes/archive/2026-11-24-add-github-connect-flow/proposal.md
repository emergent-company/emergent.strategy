# Change: GitHub Connect Flow — Repo Discovery and Org Assignment

## Why

The `add-github-sync-lifecycle` change implemented bidirectional sync, but it
assumes the user already knows the repo slug and types it manually. There is no
way to browse repositories, discover which ones contain EPF instances, or
guide the first-time connection of a GitHub repo to a strategy instance.

Two gaps exist:

1. **Repo discovery:** Users can't browse repos or detect EPF structure. They
   must type `owner/repo` manually, which is error-prone and blocks onboarding.

2. **Connect flow:** There is no guided web UI for "connect a GitHub repo to a
   strategy instance." The user must know to call `update_instance` and then
   `import_from_github` via MCP tools — too much friction for first-time setup.

## Auth Model

**The GitHub App is the auth mechanism — no separate OAuth needed.**

The GitHub App installation grants the server access to all repos in the
org or user account where it is installed. The admin installs the App once;
the server then has permanent read + write access to all repos in that
installation.

Personal GitHub accounts work the same way as GitHub orgs — no special-casing.

The `GithubClientID` / `GithubClientSecret` / `SessionSecret` in config are
legacy remnants from the epf-cli OAuth era and can be ignored.

## Repo ↔ Company Model (Revised)

**One GitHub repo maps to exactly one 21st-id org (company).** The reverse
is not constrained: a 21st-id org can own many repos.

This mapping is NOT made at the GitHub owner level. The GitHub owner
(org slug or personal username) is purely an **access mechanism** — it
determines which App installation token to use. It is not an organizational
identity. An agency might use one GitHub org for all their clients; a developer
might use their personal account for multiple companies. The GitHub owner is
irrelevant to company ownership.

The company-to-repo link is already encoded in the existing data model:

```
strategy_instance.github_repo  →  owner/repo on GitHub
strategy_instance.workspace_id →  workspace
workspace.org_id               →  org (= the 21st-id company)
```

There is no new table or column needed for the ownership mapping. When a user
imports a repo, they choose which org/workspace to put the resulting instance
in — that choice IS the company assignment.

**Consequence:** The `github_owner` field previously proposed for the orgs
table is dropped. GitHub owners are never stored on orgs.

## What Changes

### 1. GitHub App installation listing

Add `ListInstallations(ctx) ([]Installation, error)` to the sync service.
This calls `GET /app/installations` to enumerate all orgs and personal accounts
where the App is installed. The result is used to populate a picker in the
connect flow: "which GitHub account do you want to scan?"

### 2. Repo discovery API

Add `ScanInstallationRepos(ctx, owner string) ([]RepoScanResult, error)` to the
sync service. For the given GitHub owner (org or user):
1. Gets an installation token
2. Calls `GET /installation/repositories` to list all accessible repos
3. For each repo, runs a lightweight EPF detection check (tree scan)
4. Returns repos annotated with: `has_epf`, `detected_instances[]`

**EPF detection heuristic** (checked in order, stop on first match):
- Root tree contains a `READY/` directory entry with YAML files → EPF at root
- Root tree contains `_meta.yaml` or `_epf.yaml` → EPF at root
- Root tree contains `north_star.yaml` or `00_north_star.yaml` → EPF at root
- Recursive scan finds any `READY/` directory with YAML → EPF at that path

Scan runs concurrently (max 5 repos at a time). Results are cached in-memory
for 5 minutes per owner.

### 3. Connect flow web UI

A "Connect GitHub Repo" screen guides the user through first-time setup:

1. **Pick GitHub account** — which GitHub owner to scan (dropdown of App
   installations, e.g. "emergent-company (org)", "nikolaifasting (personal)")
2. **Scan repos** — table of repos with EPF detection badges; user can filter
   to "EPF detected only"
3. **Select repo** — user clicks a repo; shows detected instances with base paths
4. **Assign to company** — which 21st-id org/workspace should own this instance?
   (dropdown of the user's orgs; pre-selected if single org)
5. **Choose action**:
   - "Import artifacts" — import from GitHub into a new or existing instance
   - "Link only" — set `github_repo` without importing (genesis flow: server-first)
6. **Done** — redirect to instance detail

This flow works for both cases:
- GitHub org → one of the user's 21st-id orgs (typical for companies)
- Personal account → one of the user's 21st-id orgs (typical for agencies,
  freelancers, or developers using their personal account for client work)

### 4. App not installed — clear prompt

If the App is not installed on the selected owner, the connect flow shows:

```
GitHub App is not installed on [owner]

Install the Emergent Strategy App to connect repos:
→ [Install App] (links to installations/new)

Already installed? It may take a moment to appear.
```

The App slug is a server config value (`GITHUB_APP_SLUG`).

### 5. MCP tools

Two new MCP tools enable the same flow for AI agents:
- `list_github_installations()` — list all orgs/accounts where the App is installed
- `scan_github_repos(github_owner)` — list repos with EPF detection for an owner

After scanning, agents use the existing `update_instance` + `import_from_github`
to complete the connection.

## Impact

- Affected specs: `epf-strategy-server`
- **No new DB migration needed** (the ownership model uses existing tables)
- Affected code:
  - `internal/github/client.go` — add `ListInstallations`, `ListInstallationRepos`,
    `DetectEPFInRepo`
  - `internal/github/adapter.go` — add to `RepoReader`
  - `domain/sync/service.go` — add `ListInstallations`, `ScanInstallationRepos`
  - `internal/mcpserver/register_sync_tools.go` — add `list_github_installations`,
    `scan_github_repos`
  - `internal/handler/` — new connect flow handler
  - `internal/ui/` — connect flow templ components
  - `internal/navigation/` — add Connect screen to nav graph
  - `config/config.go` — add `GITHUB_APP_SLUG`

## Non-Goals

- **GitHub OAuth**: not needed. App installation is the auth mechanism.
- **Org-level GitHub owner field**: dropped. GitHub owners are access credentials,
  not organizational identities. One agency's GitHub org can serve many companies.
- **Webhook-based sync**: not in scope. Discovery is on-demand.
- **GitHub Enterprise**: not in scope for v1.
- **Automatic detection on push**: not in scope. Pull-based only.
- **Repo claim/lock**: a repo can be imported into multiple instances (for
  scenario analysis or migration). No exclusive ownership enforced at this layer.
