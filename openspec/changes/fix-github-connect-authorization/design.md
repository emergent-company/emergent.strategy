## Context

The web UI was built as a single-tenant tool: the dashboard, the lists and the
import handler read and write across all organisations. The MCP side already has
org-membership helpers (`internal/mcpserver/access.go`) but the three GitHub
tools do not use them, and the web side has no equivalent. Roles are
`org_admin` and `org_viewer`; there is no workspace-level membership.

## Decisions

1. **One authorization package.** Move `IsMember`-based helpers
   (`workspace access`, `instance access`, `instance write`, `org admin`,
   `user org ids`) to `internal/authz`, taking a small interface for the org and
   workspace lookups so web and MCP share them and tests can fake them. The MCP
   package keeps thin wrappers, so its tests and tool behaviour do not change.
   Web handlers get an adapter that reads the principal from the request context.
2. **Fail closed, answer not-found.** As in the MCP helpers: a caller without
   access to a workspace or instance gets the same answer as for one that does not
   exist, so ids cannot be probed.
3. **Import needs `org_admin` of the target organisation.** Importing creates and
   activates an instance and writes artifacts; a viewer must not. (Open question
   below.)
4. **Inline creation never joins.** The inline path creates a new organisation
   named by the user and makes the caller its `org_admin` (what `Create` already
   does). If the name is taken it returns a conflict; it never calls
   `GetOrCreate` and never adds the caller to an organisation they did not create.
   `GetWorkspaceByOwner` is no longer a fallback: it looked a workspace up by
   GitHub owner with no organisation scope.
5. **No silent membership writes.** `AddMember` stays an upsert (other callers
   rely on it) but the connect flow stops using it. A new `EnsureMember` that
   inserts and does nothing on conflict is added for flows that must not change
   an existing role.
6. **Existing instance for the same repository.** Look it up as today. If the
   caller can write to it, re-import into it; moving it to another workspace is
   allowed only when the caller administers both organisations. Otherwise return
   a conflict ("already connected in another organisation") that names nothing.
7. **MCP GitHub tools use the caller's own token.** The App's JWT lists every
   installation of the App; the user's token (`ListUserInstallations`, which
   exists and is unused) lists only theirs. `list_github_installations` returns
   those; `scan_github_repos(owner)` requires the owner to be among them. A caller
   with no stored token gets a structured `needs_github_connection` response, not
   an error and not the server-wide list.
8. **Revoked token.** A new `sync.TokenRevokedError`, produced from a 401 in
   `ListUserRepos` pass 1 and from any 401 in pass 2, mapped in the adapter like `RateLimitError`. The repos
   handler clears the token (`ClearGithubToken`), drops the cache entry and
   renders the authorize state. Other pass-2 errors mark the result partial with
   the failing org names logged, instead of being dropped.
9. **Cache key.** `user:<user id>:<sha256(token) first 16 bytes hex>`. A token
   change (re-authorize) misses the cache; one user never reads another's entry.
10. **The connect page's markers.** Annotation of a repository linked in an
    organisation the caller cannot access is a boolean
    `connected_elsewhere`; no instance id, name, organisation, workspace or sync
    data.

## Risks and trade-offs

- A user who administers no organisation sees an empty dropdown and the inline
  "create organisation" path only. That is intended.
- `connected_elsewhere` reveals that some tenant links the repository. The user
  can already see the repository; the alternative (a silent failure on import)
  is worse for the user.
- Scoping the MCP tools to the caller's token means an agent without a connected
  GitHub account cannot list installations. It can still import into an instance
  it has write access to.

## Open questions (defaults above stand until answered)

- Is `org_admin` the right bar for import, or should any member import? Default:
  `org_admin`.
- Is the server deployed for more than one user today? Nothing in the repo says
  so; `deploy-strategy-server` is not done. This sets urgency, not the design.
