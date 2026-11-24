# Design: GitHub Connect Flow

## Context

The GitHub App already provides write access. The gap is discovery and first-time
connection. The key design insight is the separation of two concerns that are
easy to conflate:

- **Access:** Which App installation token do I need? → determined by the GitHub
  owner prefix of the repo slug (`owner/repo` → `owner`).
- **Ownership:** Which 21st-id company owns this strategy? → determined by which
  workspace/org the user puts the instance in when importing.

These are independent. A single GitHub org (e.g. an agency) can contain repos
belonging to many different companies. The company identity lives in the
strategy-server's org model, not in GitHub.

## Decisions

### 1. No org-level GitHub owner field

**Decision:** Drop the previously proposed `github_owner` column on orgs.

**Rationale:** GitHub owners are access credentials, not organizational identities.
The mapping "which GitHub installation do I need?" is answered by the repo slug
itself — take the owner prefix of `owner/repo`. The mapping "which company owns
this strategy?" is answered by the instance's workspace → org chain, which is
already set at import time.

Adding `github_owner` to orgs would imply a 1:1 relationship between a company
and a GitHub identity that does not hold in practice. An agency, a freelancer,
or a developer using a personal account for client work all break this assumption.

### 2. No new DB migration

**Decision:** No new tables or columns needed for the ownership model.

The existing model already encodes repo-to-company ownership:
```
instance.github_repo → "owner/repo"
instance.workspace_id → workspace
workspace.org_id → org (the company)
```

When the user imports a repo, they choose which org/workspace receives the
instance. That choice IS the company assignment. The repo doesn't need to
"claim" an org; the instance's placement in the org hierarchy is the claim.

### 3. App installation listing as the access entry point

**Decision:** The connect flow starts with "pick a GitHub installation" (not
"pick a company"). The user selects which GitHub account to scan, then assigns
the resulting instance to a company afterward.

**Why installation-first:** The user knows which GitHub account their repos live
in — that's the natural starting point. They may not know which company "owns"
a repo until after they see its contents. The assignment is a second step.

**Implementation:** `GET /app/installations` lists all installations (with
pagination). Each installation has `account.login` (the owner) and
`account.type` ("Organization" or "User"). This is cached in-memory for 5 minutes.

### 4. EPF detection — non-recursive first, recursive fallback

**Decision:** Two-pass detection per repo.

Pass 1 (non-recursive root scan — one API call):
```
GET /repos/{owner}/{repo}/git/trees/HEAD?recursive=0
```
Check for: `READY/` tree entry, `_meta.yaml`, `_epf.yaml`, `north_star.yaml`,
`00_north_star.yaml`.

Pass 2 (recursive — one API call, only if pass 1 fails):
```
GET /repos/{owner}/{repo}/git/trees/HEAD?recursive=1
```
Find the first path prefix where `READY/` appears as a directory.

**Why two passes:** Most EPF instances live at root. Non-recursive is ~10x faster
and avoids the 100,000-entry limit that GitHub imposes on recursive tree responses
for large repos. The recursive fallback catches "strategy buried in a monorepo."

**Multiple instances per repo:** The recursive scan can find multiple `READY/`
directories at different paths. Each is returned as a separate `DetectedInstance`.
The UI expands the repo entry to show all detected instances.

**Concurrency:** Scan repos concurrently, max 5 goroutines. GitHub's rate limit
for authenticated App requests is 5,000/hour — at ~2 calls per repo (install +
tree), this supports ~2,500 repos per hour per installation.

### 5. Scan result caching

**Decision:** In-memory cache, keyed by `github_owner`, TTL 5 minutes.

**Implementation:** `sync.Map` with expiry timestamps. No DB table needed for v1.
The cache is per-server-process, so a restart clears it. This is acceptable — the
scan is fast enough to re-run.

### 6. Connect flow — assignment is explicit

**Decision:** When importing from the connect flow, the user explicitly selects
which workspace (and therefore which org) receives the instance.

**Why explicit, not inferred:** The GitHub owner doesn't determine the company.
A repo named `acme-corp-strategy` in the personal account of a freelancer should
go into the `Acme Corp` org on the server, not the freelancer's personal org.
The user makes this decision at import time.

**UI:** A dropdown of workspaces the user has access to. Pre-selected if there's
only one. Grouped by org if the user belongs to multiple orgs.

### 7. Config — App slug for install link

**Decision:** Add `GITHUB_APP_SLUG` to config. This is the GitHub App's public
name (e.g. `emergent-strategy-app`) used to construct the installation URL:
`https://github.com/apps/{GITHUB_APP_SLUG}/installations/new`.

This is different from `GITHUB_APP_ID` (numeric internal ID). The slug is the
human-readable name visible in GitHub URLs.

## Data Flow

```
User opens "Connect GitHub"
  ↓
GET /app/installations → list installations (owner, type)
User picks owner = "acme-agency"
  ↓
GET installation token for "acme-agency"
GET /installation/repositories → list repos
For each repo (concurrently, max 5):
  GET /repos/{owner}/{repo}/git/trees/HEAD?recursive=0
  → found? done. not found?
  GET /repos/{owner}/{repo}/git/trees/HEAD?recursive=1
  → parse DetectedInstances
User sees repo table: "acme-client-a" (EPF at docs/epf), "acme-client-b" (no EPF)
User picks "acme-client-a"
User picks workspace: "Acme Corp" (workspace org_id = acme-corp)
User clicks "Import"
  ↓
update_instance(instance_id, github_repo="acme-agency/acme-client-a", github_base_path="docs/epf")
import_from_github(instance_id)
  ↓
Redirect to instance detail
```

## Risks

- **Rate limits:** 2 API calls per repo × N repos. At 50 repos per installation,
  that's 100 calls. Well within the 5,000/hour App limit. The 5-minute cache
  prevents repeated scans on page refresh.
- **Large tree responses:** GitHub truncates recursive trees at 100,000 entries.
  For a large monorepo, the recursive scan may return a truncated result. Mitigation:
  log a warning, surface "scan may be incomplete" in the UI. The user can still
  set the base path manually.
- **Private repos with no App access:** The App only sees repos it's been granted
  access to. If the admin installed the App on "selected repos" (not all repos),
  some repos won't appear. Mitigation: show an info banner explaining this.
