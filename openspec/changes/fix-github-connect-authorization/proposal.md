# Change: Close the authorization gaps in the GitHub connect flow

## Why

An audit of the connect flow against its specs (PR #225, archived changes
`add-github-user-oauth` and `add-github-connect-flow`) found that it has no
tenant boundary. Each point below was checked in the code.

**1. Any signed-in user can join any organisation.** `POST /github/connect/import`
resolves a workspace inline when none is picked. It calls `GetOrCreate(name)`,
which returns an existing organisation by case-insensitive name, then
`AddMember(org, user, "owner")`. `AddMember` is an upsert, and `"owner"` is not a
defined role (`org_admin`, `org_viewer`). The user therefore becomes a member of
an organisation they only named. Membership is what the MCP access checks
(`assertWorkspaceAccess`, `assertInstanceAccess`) accept, so the user then reads
every instance of that organisation. The same branch also runs for the
"re-import into the existing workspace" choice (`__existing__`), which was meant
to reuse the instance's workspace and instead falls into the create branch.

**2. Any signed-in user can take over another tenant's instance.** When
`workspace_id` is sent it is only parsed as a UUID: there is no check that the
user belongs to that workspace's organisation. In the inline path, when a
workspace for the repository's GitHub owner already exists in *any* organisation,
`GetWorkspaceByOwner` (no organisation scope) returns it and the import goes into
it. When an instance already linked to the repository exists (in any tenant),
`MoveInstance` moves it into the chosen workspace.

**3. The connect page shows other tenants' data.** The workspace dropdown
(`loadWorkspacesForAssignment`) lists every workspace of every organisation. The
repository list is annotated (`annotateConnectedInstances`) with the instance
id, name, organisation, workspace and sync state of any instance linked to the
same repository, whoever owns it.

**4. The MCP GitHub tools check nothing.** `list_github_installations` returns
every installation of the GitHub App for every caller. `scan_github_repos` scans
any owner the App is installed on. `import_from_github` checks read access
(`assertInstanceAccess`) where it writes.

**5. A revoked GitHub token is never handled.** `ClearGithubToken` has no caller;
a 401 from GitHub surfaces as a generic scan failure, and in the second pass of
`ListUserRepos` any error (401 included) is logged and dropped, so a revoked token
can return a partial or empty list without any error.

**6. A prefix of the user's token is the cache key** (`"user:" + token[:16]`).

The web layer has no membership checks at all (see `add-web-tenant-isolation`),
and the token is stored in plaintext (see `encrypt-stored-github-tokens`). This
change closes what is specific to the connect flow and its MCP tools, and builds
the shared authorization package the other two changes use.

## What Changes

- Extract the access helpers of `internal/mcpserver/access.go` into a package
  both the MCP server and the web handlers import (`internal/authz`). Behaviour
  of the MCP tools stays the same.
- `POST /github/connect/import`: the target workspace must belong to an
  organisation in which the caller is `org_admin`; inline creation always creates
  a new organisation and never joins an existing one; an instance already linked
  to the repository in another organisation is never moved or reused; no
  membership is written with an undefined role or over an existing one.
- Connect page: the dropdown lists only workspaces the caller administers; the
  annotations show only instances the caller can access, and a bare "already
  connected in another organisation" marker (no identifiers) for the rest.
- MCP tools: `list_github_installations` and `scan_github_repos` act with the
  caller's own GitHub token (never the App's credentials) and are refused to
  access tokens; `scan_github_repos` lists only the repositories that token can
  see, for one owner; `import_from_github` requires write access.
- A revoked token is detected (typed error from a 401), the stored token is
  cleared and the page returns to the authorize state. A list that could not read
  every organisation says it may be incomplete.
- The scan cache is keyed by a hash of the whole token, not a token prefix.
- Fix the `scan_github_repos` tool text (cache lifetime).

## Impact

- Affected specs: `strategy-auth` (ADDED), `epf-strategy-server` (ADDED).
- Affected code: `internal/handler/handler_github_connect.go`,
  `handler_github_import.go`, `internal/mcpserver/register_sync_tools.go`,
  `access.go`, `domain/sync/scan.go`, `internal/github/{client,adapter}.go`,
  `domain/org/service.go` (a non-overwriting membership call), new
  `internal/authz`.
- Breaking: an import into a workspace the user does not administer now fails;
  the inline "new workspace" path fails when the name is already taken instead of
  joining the existing organisation.
- Must be done before any multi-user deployment (`deploy-strategy-server`).
