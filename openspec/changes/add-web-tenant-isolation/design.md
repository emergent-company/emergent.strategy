## Context

Routes are registered in `RegisterRoutes` (`handler.go`): the nav-graph loop
registers `/strategies/:id` + pattern for every instance-scoped screen, and about
thirty further routes are registered by hand, nearly all under `/strategies/:id`.
Organisation membership is the only membership (`OrgMembership`: `org_admin`,
`org_viewer`); a workspace belongs to an organisation, an instance to a workspace.
`internal/authz` (from `fix-github-connect-authorization`) holds the checks.

## Decisions

1. **Enforce by route class, not by remembering to call a helper.** A table maps
   each route (method and pattern) to a class. A small middleware wraps the routes
   of each class. A test walks `echo.Routes()` and fails for a route with no class,
   so a new handler cannot ship unprotected. This is the lesson of the MCP side,
   where 41 call sites guard 158 tools and the rest are found by audit.
2. **Instance routes.** Read for GET and HEAD, write for other methods. The
   instance id comes from `:id`; the middleware resolves instance, workspace and
   organisation in one query and stores the instance in the request context so
   handlers do not look it up again.
3. **Not-found, not forbidden.** A caller without access gets the answer for a
   missing instance (404 page). The main spec's HTTP 403 / code 100003 for a
   foreign workspace is dropped for the web: it confirms that the id exists.
4. **Lists filter in the query.** `WHERE org_id IN (caller's organisations)` is
   added to the global queries (`loadWorkspaces`, `loadAllInstances`, counts, the
   search and settings queries), not applied afterwards, so counts and pages agree.
5. **Dev mode.** The dev principal is a member of every organisation the dev
   server creates (`EnsureDevOrg` already adopts unscoped workspaces), so local
   use does not change. A test pins that.
6. **Token principals.** A scoped access token (`add-scoped-readonly-mcp-access`)
   carries instance grants; on the web it is answered by its grants alone, as in
   `assertInstanceAccess`. Whether a token may use the web UI at all is decided
   there, not here.
7. **GitHub identity is dropped as the rule.** The old requirement matched
   `workspace.github_owner` to the user's GitHub login. Organisation membership
   replaces it: the same GitHub owner can appear in several organisations, and
   a user's GitHub login says nothing about the organisation they work for.
   (Confirm below.)

## Risks

- Every route that is classified wrongly is either open or broken for a legitimate
  user. The route table is reviewed once by hand; the test only guarantees that
  each route has a class.
- Handlers that look an instance up again after the middleware run an extra query.
  Acceptable; the context value removes it where it matters.
- Background streams (SSE for AIM runs) check access when they start. A user
  removed from an organisation mid-run keeps the stream until it ends.

## Open questions (defaults stand until answered)

- Is dropping the GitHub-identity rule right? Default: yes.
- Should an `org_viewer` see the pages that start drafts and runs (buttons
  disabled) or not see them? Default: see them, actions return not-found.
