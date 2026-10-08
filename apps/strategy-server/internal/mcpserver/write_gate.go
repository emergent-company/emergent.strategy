package mcpserver

import (
	"context"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/langs"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/web"
)

// Access classes for MCP tools.
const (
	// AccessRead — the handler only reads, derives, or computes. No
	// persisted state changes.
	AccessRead = "read"

	// AccessSession — the handler changes only the caller's own transient
	// view (which tool categories this MCP session can see). Nothing
	// persisted, nothing visible to any other caller.
	//
	// A distinct class rather than folding into read because these tools are
	// not reads — they mutate — but refusing them to a read-only client
	// would make the catalogue unnavigable: set_tool_filter is how a client
	// reaches anything outside the default core set, so denying it would
	// leave a read-only token unable to see most of the tools it may use.
	AccessSession = "session"

	// AccessWrite — the handler changes durable state: database rows, staged
	// or committed mutations, Memory graph branches, GitHub branches and
	// pull requests, installed packs.
	AccessWrite = "write"
)

// ToolAccess classifies every registered tool by what it mutates.
//
// # Why this exists as data rather than a naming rule
//
// Classification is by observed effect, never by name prefix. The prefix is
// wrong often enough to be dangerous in both directions, and each of the
// cases below was verified by reading the handler:
//
//   - coherence_check INSERTs ripple signals (register_ripple_tools.go:102,
//     :129). A "check" that writes rows.
//   - describe_batch UPDATEs strategy_mutations.
//   - draft_aim_assessment / draft_aim_calibration "draft" *into the
//     database* — they stage a batch, they do not return a draft.
//   - run_app and run_skill (mode=autonomous) stage mutations.
//   - import_from_github can open a pull request on the remote.
//   - run_scenario / commit_scenario / discard_scenario create, merge and
//     delete durable Memory branches.
//   - Conversely scaffold_skill is pure string templating — it is registered
//     with `_ Services` and so cannot reach the database at all.
//   - generate_ripple_batch, despite the name, only assembles context from
//     signals it reads; unlike coherence_check it persists nothing.
//   - propose_change analyses blast radius without saving the signals.
//   - get_sync_state and scan_github_repos read GitHub; scan_github_repos'
//     cache is an in-memory map, not a table.
//
// # Default is write
//
// AccessFor returns AccessWrite for any tool absent from this map, so a newly
// added tool is refused to read-only credentials until someone classifies it.
// Erring toward denial makes the failure mode a visible 'permission denied'
// on a new tool rather than a silent privilege grant.
// TestEveryToolIsClassified keeps the map honest at build time.
var ToolAccess = map[string]string{
	// ── Session (mutates only the caller's own view) ────────────────────
	"set_tool_filter":      AccessSession,
	"list_tool_categories": AccessSession,
	"get_agent_for_task":   AccessSession,

	// ── Core ────────────────────────────────────────────────────────────
	"list_workspaces":       AccessRead,
	"get_workspace":         AccessRead,
	"list_instances":        AccessRead,
	"get_instance":          AccessRead,
	"find_instance_by_repo": AccessRead,
	"health_check":          AccessRead,
	"commit_batch":          AccessWrite,
	"discard_batch":         AccessWrite,
	"list_pending_batches":  AccessRead,
	"describe_batch":        AccessWrite, // UPDATEs strategy_mutations
	"search_strategy":       AccessRead,

	// ── Strategy reads ──────────────────────────────────────────────────
	"get_strategy_context":              AccessRead,
	"get_product_vision":                AccessRead,
	"get_personas":                      AccessRead,
	"get_competitive_position":          AccessRead,
	"get_roadmap":                       AccessRead,
	"get_persona_details":               AccessRead,
	"get_strategic_context_for_feature": AccessRead,
	"explain_value_path":                AccessRead,
	"get_coverage_analysis":             AccessRead,
	"get_value_propositions":            AccessRead,
	"get_assumptions":                   AccessRead,
	"get_feature_dependencies":          AccessRead,

	// ── Features ────────────────────────────────────────────────────────
	"list_features":          AccessRead,
	"get_feature":            AccessRead,
	"create_feature":         AccessWrite,
	"update_feature":         AccessWrite,
	"archive_feature":        AccessWrite,
	"list_artifacts":         AccessRead,
	"list_relationships":     AccessRead,
	"add_relationship":       AccessWrite,
	"suggest_relationships":  AccessRead, // derives suggestions, saves none
	"list_mutations":         AccessRead,
	"get_mutation":           AccessRead,
	"stage_artifact":         AccessWrite,
	"batch_create_artifacts": AccessWrite,
	"list_definitions":       AccessRead,
	"get_definition":         AccessRead,
	"get_phase_artifacts":    AccessRead,

	// ── Authoring (all stage mutations) ─────────────────────────────────
	"update_north_star":           AccessWrite,
	"update_strategy_foundations": AccessWrite,
	"update_insight_analyses":     AccessWrite,
	"update_strategy_formula":     AccessWrite,
	"update_roadmap":              AccessWrite,
	"update_value_model":          AccessWrite,

	// ── Work packages ───────────────────────────────────────────────────
	"list_work_packages":         AccessRead,
	"get_work_package":           AccessRead,
	"get_work_package_footprint": AccessRead,
	"create_work_package":        AccessWrite,
	"update_work_package":        AccessWrite,
	"approve_work_package":       AccessWrite,
	"transition_work_package":    AccessWrite,

	// ── AIM ─────────────────────────────────────────────────────────────
	"create_lra":            AccessWrite,
	"update_lra":            AccessWrite,
	"get_lra":               AccessRead,
	"create_aim_report":     AccessWrite,
	"get_aim_summary":       AccessRead,
	"draft_aim_assessment":  AccessWrite, // "draft" means staged into the DB
	"draft_aim_calibration": AccessWrite,
	"apply_aim_calibration": AccessWrite,
	"list_aim_cycles":       AccessRead,
	"aim_start_cycle":       AccessWrite,
	"aim_get_run":           AccessRead,
	"validate_assumptions":  AccessRead,
	"stage_calibration":     AccessWrite,

	// ── Ripple ──────────────────────────────────────────────────────────
	"propose_change":          AccessRead,  // analyses, persists nothing
	"coherence_check":         AccessWrite, // INSERTs signals despite the name
	"list_signals":            AccessRead,
	"acknowledge_signal":      AccessWrite,
	"resolve_signal":          AccessWrite,
	"dismiss_signal":          AccessWrite,
	"generate_ripple_batch":   AccessRead, // assembles context only
	"get_ripple_config":       AccessRead, // returns defaults, no lazy insert
	"update_ripple_config":    AccessWrite,
	"get_equilibrium_status":  AccessRead,
	"get_convergence_history": AccessRead,

	// ── Evidence ────────────────────────────────────────────────────────
	"ingest_evidence": AccessWrite,
	"list_evidence":   AccessRead,
	"get_evidence":    AccessRead,
	"link_evidence":   AccessWrite,
	"update_evidence": AccessWrite,

	// ── Semantic ────────────────────────────────────────────────────────
	"detect_contradictions": AccessRead,
	"get_neighbors":         AccessRead,
	"run_scenario":          AccessWrite, // creates a durable Memory branch
	"evaluate_scenario":     AccessRead,
	"commit_scenario":       AccessWrite, // merges into the main graph
	"discard_scenario":      AccessWrite, // deletes a branch

	// ── Validation (all pure) ───────────────────────────────────────────
	"validate_artifact":          AccessRead,
	"validate_instance":          AccessRead,
	"validate_relationships":     AccessRead,
	"check_content_readiness":    AccessRead,
	"validate_with_plan":         AccessRead,
	"validate_value_model_links": AccessRead,
	"export_instance_yaml":       AccessRead,
	"export_feature_yaml":        AccessRead,
	"export_report":              AccessRead,

	// ── Admin ───────────────────────────────────────────────────────────
	"create_workspace":        AccessWrite,
	"import_instance":         AccessWrite,
	"scaffold_instance":       AccessWrite,
	"activate_instance":       AccessWrite,
	"archive_instance":        AccessWrite,
	"delete_instance":         AccessWrite,
	"delete_workspace":        AccessWrite,
	"assign_workspace_to_org": AccessWrite,
	"create_org":              AccessWrite,
	"update_org":              AccessWrite,
	"list_orgs":               AccessRead,
	"invite_member":           AccessWrite,
	"remove_member":           AccessWrite,
	"list_members":            AccessRead,
	// Token administration. All three are refused to any token-authenticated
	// caller by assertOrgAdmin regardless of class, so the read classification
	// on list_access_tokens cannot become a route to self-inspection.
	"mint_access_token":         AccessWrite,
	"revoke_access_token":       AccessWrite,
	"list_access_tokens":        AccessRead,
	"publish_version":           AccessWrite,
	"list_versions":             AccessRead,
	"get_version":               AccessRead,
	"diff_versions":             AccessRead,
	"restore_version":           AccessWrite,
	"sync_to_github":            AccessWrite,
	"get_sync_status":           AccessRead,
	"import_from_github":        AccessWrite, // may open a PR on the remote
	"get_sync_state":            AccessRead,
	"update_instance":           AccessWrite,
	"list_consumer_repos":       AccessRead,
	"register_consumer_repo":    AccessWrite,
	"unregister_consumer_repo":  AccessWrite,
	"list_github_installations": AccessRead,
	"scan_github_repos":         AccessRead, // in-memory cache, not a table

	// ── Knowledge (embedded filesystem reads) ───────────────────────────
	"list_schemas":   AccessRead,
	"get_schema":     AccessRead,
	"list_templates": AccessRead,
	"get_template":   AccessRead,
	"list_agents":    AccessRead,
	"get_agent":      AccessRead,
	"list_skills":    AccessRead,
	"get_skill":      AccessRead,
	"list_wizards":   AccessRead,
	"get_wizard":     AccessRead,

	// ── Packs ───────────────────────────────────────────────────────────
	"list_installed_skills": AccessRead,
	"get_installed_skill":   AccessRead,
	"run_skill":             AccessWrite, // mode=autonomous stages a batch
	"scaffold_skill":        AccessRead,  // pure templating, no Services
	"install_pack":          AccessWrite,
	"list_packs":            AccessRead,
	"get_pack":              AccessRead,
	"uninstall_pack":        AccessWrite,
	"list_apps":             AccessRead,
	"run_app":               AccessWrite,
	"describe_pack_format":  AccessRead,

	// ── Observability ───────────────────────────────────────────────────
	"list_activities":        AccessRead,
	"list_skill_runs":        AccessRead,
	"get_skill_run":          AccessRead,
	"get_llm_usage":          AccessRead,
	"list_heartbeat_signals": AccessRead,
	"acknowledge_heartbeat":  AccessWrite,
	"list_cycle_proposals":   AccessRead,
	"approve_cycle_proposal": AccessWrite,
	"defer_cycle_proposal":   AccessWrite,
}

// AccessFor returns a tool's access class, defaulting to write.
//
// The default is the security property: an unclassified tool is treated as
// the most dangerous thing it could be.
func AccessFor(toolName string) string {
	if a, ok := ToolAccess[toolName]; ok {
		return a
	}
	return AccessWrite
}

// writeGateMiddleware refuses write-classified tools to read-only principals.
//
// # Why a middleware and not a check in each handler
//
// There are 158 tools. Adding a check to each is 158 opportunities to forget,
// with no mechanism to stop the 159th from being added without one. This runs
// on the tools/call path for every tool, so a new tool is covered the moment
// it is registered — and because AccessFor defaults to write, it is covered
// in the safe direction before anyone classifies it.
//
// # Why not the tool filter
//
// tool_filter.go shapes tools/list only; every tool stays invocable via
// tools/call whatever the active categories (see the comment at the top of
// that file). Using category visibility as an authorisation boundary would be
// security theatre. TestWriteGateIgnoresToolFilter asserts the gate holds for
// a tool whose category is inactive.
//
// # Relationship to assertInstanceWrite
//
// This is the global half: it knows the tool but not which instance the call
// targets. assertInstanceWrite is the per-instance half. Both are needed —
// a token with write on instance A and read on instance B passes this gate
// and must still be refused when it aims at B.
func writeGateMiddleware(next server.ToolHandlerFunc) server.ToolHandlerFunc {
	return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		p := web.PrincipalFromContext(ctx)

		// No principal, or a principal with full authority: nothing for this
		// gate to do. Absence is not treated as read-only here because
		// per-instance authorisation already fails closed on a missing
		// principal — duplicating that denial here would turn every
		// unauthenticated call into a confusing permission error instead of
		// the not-found the enumeration defence intends.
		if p == nil || !p.ReadOnly {
			return next(ctx, req)
		}

		switch AccessFor(req.Params.Name) {
		case AccessRead, AccessSession:
			return next(ctx, req)
		}

		// Denied before the handler runs, so a refused write has no chance
		// to take effect. Returned as a tool result, never a Go error: a
		// non-nil Go error is a protocol-level failure in MCP, and this is a
		// perfectly well-formed call that is not permitted.
		return mcp.NewToolResultError(langs.T(ctx, "token.read_only")), nil
	}
}
