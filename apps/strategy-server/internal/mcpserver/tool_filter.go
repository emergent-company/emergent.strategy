// Package mcpserver — tool category filter.
//
// With 150+ MCP tools, sending the full list on every tools/list response
// bloats LLM context windows. This filter groups tools into categories and
// only exposes a small "core" set by default. Clients call
// list_tool_categories to see what's available and set_tool_filter to
// activate a category. The server then sends a tools/list_changed
// notification so the client re-fetches the now-scoped tool list.
//
// # This is a context-window optimisation, NOT an authorization boundary
//
// The filter shapes tools/list and nothing else. Every registered tool stays
// invocable via tools/call regardless of which categories are active — mcp-go
// consults ToolFilterFunc only in its list handler, never in its call handler.
// Do not rely on an inactive category to keep a tool unreachable; enforce
// access in internal/web middleware and in the tool handlers themselves.
//
// That invocable-but-unadvertised state used to be a silent trap: a client
// could successfully call a tool it had never been shown, and therefore had
// no argument schema for, so it guessed the arguments and failed validation
// (reported by opencode-harness against validate_instance). autoActivate
// closes that: calling a tool from an inactive category activates that
// category for the session and emits tools/list_changed, so the very next
// tools/list carries the schema. The call itself is never blocked.
package mcpserver

import (
	"context"
	"log/slog"
	"sync"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

// ToolCategory groups related tools under a human-readable label.
const (
	CategoryCore          = "core"          // always visible — routing, instance, batch
	CategoryStrategy      = "strategy"      // strategy reads: vision, personas, competitive, roadmap
	CategoryFeatures      = "features"      // feature CRUD, definitions, relationships, dependencies
	CategoryAIM           = "aim"           // AIM lifecycle: LRA, assessment, calibration, cycles
	CategoryRipple        = "ripple"        // coherence engine: signals, equilibrium, convergence
	CategoryEvidence      = "evidence"      // evidence ingestion and management
	CategorySemantic      = "semantic"      // semantic graph: search, contradictions, scenarios
	CategoryAuthoring     = "authoring"     // mutation writes: north star, formula, roadmap, value model
	CategoryValidation    = "validation"    // validation, content readiness, fix plans
	CategoryAdmin         = "admin"         // workspace/instance/org management, sync, versions
	CategoryKnowledge     = "knowledge"     // schemas, templates, agents, skills, wizards
	CategoryPacks         = "packs"         // skill packs, apps, skill authoring
	CategoryObservability = "observability" // activity stream, skill runs, LLM usage, heartbeat
	CategoryWork          = "work"          // work packages: SOW contracts, footprint, status transitions
)

// ToolCategories maps every tool name to its category.
var ToolCategories = map[string]string{
	// ── Core (always visible) ───────────────────────────────────────────
	"get_agent_for_task":    CategoryCore,
	"list_workspaces":       CategoryCore,
	"get_workspace":         CategoryCore,
	"list_instances":        CategoryCore,
	"get_instance":          CategoryCore,
	"find_instance_by_repo": CategoryCore,
	"health_check":          CategoryCore,
	"commit_batch":          CategoryCore,
	"discard_batch":         CategoryCore,
	"list_pending_batches":  CategoryCore,
	"describe_batch":        CategoryCore,
	"search_strategy":       CategoryCore,
	"list_tool_categories":  CategoryCore,
	"set_tool_filter":       CategoryCore,

	// ── Strategy reads ──────────────────────────────────────────────────
	"get_strategy_context":              CategoryStrategy,
	"get_product_vision":                CategoryStrategy,
	"get_personas":                      CategoryStrategy,
	"get_competitive_position":          CategoryStrategy,
	"get_roadmap":                       CategoryStrategy,
	"get_persona_details":               CategoryStrategy,
	"get_strategic_context_for_feature": CategoryStrategy,
	"explain_value_path":                CategoryStrategy,
	"get_coverage_analysis":             CategoryStrategy,
	"get_value_propositions":            CategoryStrategy,
	"get_assumptions":                   CategoryStrategy,
	"get_feature_dependencies":          CategoryStrategy,

	// ── Features & definitions ──────────────────────────────────────────
	"list_features":          CategoryFeatures,
	"get_feature":            CategoryFeatures,
	"create_feature":         CategoryFeatures,
	"update_feature":         CategoryFeatures,
	"archive_feature":        CategoryFeatures,
	"list_artifacts":         CategoryFeatures,
	"list_relationships":     CategoryFeatures,
	"add_relationship":       CategoryFeatures,
	"suggest_relationships":  CategoryFeatures,
	"list_mutations":         CategoryFeatures,
	"get_mutation":           CategoryFeatures,
	"stage_artifact":         CategoryFeatures,
	"batch_create_artifacts": CategoryFeatures,
	"list_definitions":       CategoryFeatures,
	"get_definition":         CategoryFeatures,
	"get_phase_artifacts":    CategoryFeatures,

	// ── AIM lifecycle ───────────────────────────────────────────────────
	"create_lra":            CategoryAIM,
	"update_lra":            CategoryAIM,
	"get_lra":               CategoryAIM,
	"create_aim_report":     CategoryAIM,
	"get_aim_summary":       CategoryAIM,
	"draft_aim_assessment":  CategoryAIM,
	"draft_aim_calibration": CategoryAIM,
	"apply_aim_calibration": CategoryAIM,
	"list_aim_cycles":       CategoryAIM,
	"aim_start_cycle":       CategoryAIM,
	"aim_get_run":           CategoryAIM,
	"validate_assumptions":  CategoryAIM,
	"stage_calibration":     CategoryAIM,

	// ── Ripple coherence ────────────────────────────────────────────────
	"propose_change":          CategoryRipple,
	"coherence_check":         CategoryRipple,
	"list_signals":            CategoryRipple,
	"acknowledge_signal":      CategoryRipple,
	"resolve_signal":          CategoryRipple,
	"dismiss_signal":          CategoryRipple,
	"generate_ripple_batch":   CategoryRipple,
	"get_ripple_config":       CategoryRipple,
	"update_ripple_config":    CategoryRipple,
	"get_equilibrium_status":  CategoryRipple,
	"get_convergence_history": CategoryRipple,

	// ── Work packages (execution / orchestration handover) ──────────────
	"list_work_packages":         CategoryWork,
	"get_work_package":           CategoryWork,
	"get_work_package_footprint": CategoryWork,
	"create_work_package":        CategoryWork,
	"update_work_package":        CategoryWork,
	"approve_work_package":       CategoryWork,
	"transition_work_package":    CategoryWork,

	// ── Evidence ────────────────────────────────────────────────────────
	"ingest_evidence": CategoryEvidence,
	"list_evidence":   CategoryEvidence,
	"get_evidence":    CategoryEvidence,
	"link_evidence":   CategoryEvidence,
	"update_evidence": CategoryEvidence,

	// ── Semantic graph ──────────────────────────────────────────────────
	"detect_contradictions": CategorySemantic,
	"get_neighbors":         CategorySemantic,
	"run_scenario":          CategorySemantic,
	"evaluate_scenario":     CategorySemantic,
	"commit_scenario":       CategorySemantic,
	"discard_scenario":      CategorySemantic,

	// ── Authoring (foundation writes) ───────────────────────────────────
	"update_north_star":           CategoryAuthoring,
	"update_strategy_foundations": CategoryAuthoring,
	"update_insight_analyses":     CategoryAuthoring,
	"update_strategy_formula":     CategoryAuthoring,
	"update_roadmap":              CategoryAuthoring,
	"update_value_model":          CategoryAuthoring,

	// ── Validation ──────────────────────────────────────────────────────
	"validate_artifact":          CategoryValidation,
	"validate_instance":          CategoryValidation,
	"validate_relationships":     CategoryValidation,
	"check_content_readiness":    CategoryValidation,
	"validate_with_plan":         CategoryValidation,
	"validate_value_model_links": CategoryValidation,
	"export_instance_yaml":       CategoryValidation,
	"export_feature_yaml":        CategoryValidation,
	"export_report":              CategoryValidation,

	// ── Admin (workspace/org/instance management) ───────────────────────
	"create_workspace":          CategoryAdmin,
	"import_instance":           CategoryAdmin,
	"scaffold_instance":         CategoryAdmin,
	"activate_instance":         CategoryAdmin,
	"archive_instance":          CategoryAdmin,
	"delete_instance":           CategoryAdmin,
	"delete_workspace":          CategoryAdmin,
	"assign_workspace_to_org":   CategoryAdmin,
	"create_org":                CategoryAdmin,
	"update_org":                CategoryAdmin,
	"list_orgs":                 CategoryAdmin,
	"invite_member":             CategoryAdmin,
	"remove_member":             CategoryAdmin,
	"list_members":              CategoryAdmin,
	"publish_version":           CategoryAdmin,
	"list_versions":             CategoryAdmin,
	"get_version":               CategoryAdmin,
	"diff_versions":             CategoryAdmin,
	"restore_version":           CategoryAdmin,
	"sync_to_github":            CategoryAdmin,
	"get_sync_status":           CategoryAdmin,
	"import_from_github":        CategoryAdmin,
	"get_sync_state":            CategoryAdmin,
	"update_instance":           CategoryAdmin,
	"list_consumer_repos":       CategoryAdmin,
	"register_consumer_repo":    CategoryAdmin,
	"unregister_consumer_repo":  CategoryAdmin,
	"list_github_installations": CategoryAdmin,
	"scan_github_repos":         CategoryAdmin,

	// ── Knowledge base ──────────────────────────────────────────────────
	"list_schemas":   CategoryKnowledge,
	"get_schema":     CategoryKnowledge,
	"list_templates": CategoryKnowledge,
	"get_template":   CategoryKnowledge,
	"list_agents":    CategoryKnowledge,
	"get_agent":      CategoryKnowledge,
	"list_skills":    CategoryKnowledge,
	"get_skill":      CategoryKnowledge,
	"list_wizards":   CategoryKnowledge,
	"get_wizard":     CategoryKnowledge,

	// ── Packs & apps ────────────────────────────────────────────────────
	"list_installed_skills": CategoryPacks,
	"get_installed_skill":   CategoryPacks,
	"run_skill":             CategoryPacks,
	"scaffold_skill":        CategoryPacks,
	"install_pack":          CategoryPacks,
	"list_packs":            CategoryPacks,
	"get_pack":              CategoryPacks,
	"uninstall_pack":        CategoryPacks,
	"list_apps":             CategoryPacks,
	"run_app":               CategoryPacks,
	"describe_pack_format":  CategoryPacks,

	// ── Observability ───────────────────────────────────────────────────
	"list_activities":        CategoryObservability,
	"list_skill_runs":        CategoryObservability,
	"get_skill_run":          CategoryObservability,
	"get_llm_usage":          CategoryObservability,
	"list_heartbeat_signals": CategoryObservability,
	"acknowledge_heartbeat":  CategoryObservability,
	"list_cycle_proposals":   CategoryObservability,
	"approve_cycle_proposal": CategoryObservability,
	"defer_cycle_proposal":   CategoryObservability,
}

// CategoryDescriptions maps category names to human-readable descriptions.
var CategoryDescriptions = map[string]string{
	CategoryCore:          "Always visible — routing, instance lookup, batch management, search",
	CategoryStrategy:      "Strategy reads — vision, personas, competitive position, roadmap, coverage analysis",
	CategoryFeatures:      "Feature CRUD, definitions, relationships, dependencies, artifacts",
	CategoryAIM:           "AIM lifecycle — LRA, assessment, calibration, cycles, assumptions",
	CategoryRipple:        "Coherence engine — signals, equilibrium, convergence, ripple config",
	CategoryEvidence:      "Evidence ingestion, linking, and management",
	CategorySemantic:      "Semantic graph — contradictions, neighbors, what-if scenarios",
	CategoryAuthoring:     "Foundation writes — north star, formula, roadmap, value model",
	CategoryValidation:    "Validation, content readiness, fix plans, export",
	CategoryAdmin:         "Workspace, org, instance, version, and GitHub sync management",
	CategoryKnowledge:     "EPF knowledge base — schemas, templates, agents, skills, wizards",
	CategoryPacks:         "Skill packs, apps, skill authoring and execution",
	CategoryObservability: "Activity stream, skill runs, LLM usage, heartbeat, proposals",
	CategoryWork:          "Work packages — SOW contracts, footprint, status transitions (execution handover)",
}

// CategoryOrder defines the display order of categories.
var CategoryOrder = []string{
	CategoryCore, CategoryStrategy, CategoryFeatures, CategoryAuthoring,
	CategoryWork,
	CategoryAIM, CategoryRipple, CategoryEvidence, CategorySemantic,
	CategoryValidation, CategoryAdmin, CategoryKnowledge, CategoryPacks,
	CategoryObservability,
}

// ---------------------------------------------------------------------------
// Filter state — per-server, keyed by session ID
// ---------------------------------------------------------------------------

// toolFilterState holds the active category filters per session.
//
// One instance is created per MCPServer (see newToolFilterState), so two
// servers in the same process — for example the live server and
// NewMCPServerForIntrospection — never share filter state.
type toolFilterState struct {
	mu         sync.RWMutex
	categories map[string]map[string]bool // sessionID → set of active categories
}

func newToolFilterState() *toolFilterState {
	return &toolFilterState{categories: make(map[string]map[string]bool)}
}

// setCategories replaces the active categories for a session.
func (s *toolFilterState) setCategories(sessionID string, cats []string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	m := make(map[string]bool, len(cats)+1)
	for _, c := range cats {
		m[c] = true
	}
	m[CategoryCore] = true
	s.categories[sessionID] = m
}

// activate adds a single category to a session's active set, creating the set
// if the session has not called set_tool_filter yet. It reports whether this
// actually changed anything, so callers only announce a real change.
func (s *toolFilterState) activate(sessionID, category string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	m := s.categories[sessionID]
	if m == nil {
		m = map[string]bool{CategoryCore: true}
		s.categories[sessionID] = m
	}
	if m[category] {
		return false
	}
	m[category] = true
	return true
}

// forget drops a session's filter state. Without this the map grows for the
// lifetime of the process, since sessions are keyed by a per-connection UUID.
func (s *toolFilterState) forget(sessionID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.categories, sessionID)
}

// activeCategories returns a copy of the session's active category set, with
// core always included. It must return a copy: callers mutate the result, and
// handing out the stored map under a released read lock is a concurrent map
// write (two simultaneous tools/list on one session used to crash the server).
func (s *toolFilterState) activeCategories(sessionID string) map[string]bool {
	s.mu.RLock()
	defer s.mu.RUnlock()

	stored := s.categories[sessionID]
	out := make(map[string]bool, len(stored)+1)
	for c := range stored {
		out[c] = true
	}
	// Default and floor: core is always visible.
	out[CategoryCore] = true
	return out
}

// ---------------------------------------------------------------------------
// Tool filter function — passed to server.WithToolFilter
// ---------------------------------------------------------------------------

// filterTools is the WithToolFilter callback. It scopes the tool list to the
// core set plus any categories the session has activated.
func (s *toolFilterState) filterTools(ctx context.Context, tools []mcp.Tool) []mcp.Tool {
	sessionID := ""
	if session := server.ClientSessionFromContext(ctx); session != nil {
		sessionID = session.SessionID()
	}
	activeCats := s.activeCategories(sessionID)

	var filtered []mcp.Tool
	for _, tool := range tools {
		cat, ok := ToolCategories[tool.Name]
		if !ok {
			// Unknown tool — include it (safety net for tools not yet categorized)
			filtered = append(filtered, tool)
			continue
		}
		if activeCats[cat] {
			filtered = append(filtered, tool)
		}
	}
	return filtered
}

// ---------------------------------------------------------------------------
// Auto-activation — closes the invocable-but-unadvertised discovery trap
// ---------------------------------------------------------------------------

// autoActivate returns a tool-handler middleware that activates a tool's
// category for the calling session before running the tool.
//
// It never blocks a call. The filter is a context-window optimisation, not an
// authorization boundary (see the package doc), so the only thing to fix here
// is discovery: once a client has demonstrably used a category, keeping that
// category hidden from its tools/list serves no purpose and costs it the
// argument schemas.
//
// srv is resolved lazily because the middleware is a construction-time option
// and therefore has to be built before the server it notifies exists.
func (s *toolFilterState) autoActivate(srv func() *server.MCPServer) server.ToolHandlerMiddleware {
	return func(next server.ToolHandlerFunc) server.ToolHandlerFunc {
		return func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			s.noteToolUse(ctx, srv, req.Params.Name)
			return next(ctx, req)
		}
	}
}

func (s *toolFilterState) noteToolUse(ctx context.Context, srv func() *server.MCPServer, toolName string) {
	cat, ok := ToolCategories[toolName]
	if !ok || cat == CategoryCore {
		return
	}
	session := server.ClientSessionFromContext(ctx)
	if session == nil {
		return
	}
	if !s.activate(session.SessionID(), cat) {
		return // already active — nothing changed, so announce nothing
	}

	slog.DebugContext(ctx, "tool filter: auto-activated category for session",
		"category", cat, "tool", toolName, "session_id", session.SessionID())

	s.announceToolListChanged(ctx, srv)
}

// announceToolListChanged tells the calling client its tool list has changed.
// Delivery is best-effort: a client that never upgraded to an SSE stream has
// nowhere to receive notifications, which is normal and not an error here.
func (s *toolFilterState) announceToolListChanged(ctx context.Context, srv func() *server.MCPServer) {
	if srv == nil {
		return
	}
	mcpSrv := srv()
	if mcpSrv == nil {
		return
	}
	if err := mcpSrv.SendNotificationToClient(ctx, mcp.MethodNotificationToolsListChanged, nil); err != nil {
		slog.DebugContext(ctx, "tool filter: tools/list_changed not delivered", "err", err)
	}
}

// ---------------------------------------------------------------------------
// Category info helpers
// ---------------------------------------------------------------------------

// CategoryInfo describes a tool category for the list_tool_categories response.
type CategoryInfo struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	ToolCount   int    `json:"tool_count"`
	Active      bool   `json:"active"`
}

// buildCategoryList returns the full category listing with tool counts and
// active status for the given session.
func (s *toolFilterState) buildCategoryList(sessionID string) []CategoryInfo {
	activeCats := s.activeCategories(sessionID)

	// Count tools per category
	counts := make(map[string]int)
	for _, cat := range ToolCategories {
		counts[cat]++
	}

	var result []CategoryInfo
	for _, name := range CategoryOrder {
		desc := CategoryDescriptions[name]
		result = append(result, CategoryInfo{
			Name:        name,
			Description: desc,
			ToolCount:   counts[name],
			Active:      activeCats[name] || name == CategoryCore,
		})
	}
	return result
}
