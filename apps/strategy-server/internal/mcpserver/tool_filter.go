// Package mcpserver — tool category filter.
//
// With 120+ MCP tools, sending the full list on every tools/list response
// bloats LLM context windows. This filter groups tools into categories and
// only exposes a small "core" set by default. Clients call
// list_tool_categories to see what's available and set_tool_filter to
// activate a category. The server sends a tools/list_changed notification
// so the client re-fetches the now-scoped tool list.
package mcpserver

import (
	"context"
	"sort"
	"sync"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

// ToolCategory groups related tools under a human-readable label.
const (
	CategoryCore        = "core"        // always visible — routing, instance, batch
	CategoryStrategy    = "strategy"    // strategy reads: vision, personas, competitive, roadmap
	CategoryFeatures    = "features"    // feature CRUD, definitions, relationships, dependencies
	CategoryAIM         = "aim"         // AIM lifecycle: LRA, assessment, calibration, cycles
	CategoryRipple      = "ripple"      // coherence engine: signals, equilibrium, convergence
	CategoryEvidence    = "evidence"    // evidence ingestion and management
	CategorySemantic    = "semantic"    // semantic graph: search, contradictions, scenarios
	CategoryAuthoring   = "authoring"   // mutation writes: north star, formula, roadmap, value model
	CategoryValidation  = "validation"  // validation, content readiness, fix plans
	CategoryAdmin       = "admin"       // workspace/instance/org management, sync, versions
	CategoryKnowledge   = "knowledge"   // schemas, templates, agents, skills, wizards
	CategoryPacks       = "packs"       // skill packs, apps, skill authoring
	CategoryObservability = "observability" // activity stream, skill runs, LLM usage, heartbeat
)

// toolCategories maps every tool name to its category.
var toolCategories = map[string]string{
	// ── Core (always visible) ───────────────────────────────────────────
	"get_agent_for_task":    CategoryCore,
	"list_workspaces":       CategoryCore,
	"get_workspace":         CategoryCore,
	"list_instances":        CategoryCore,
	"get_instance":          CategoryCore,
	"health_check":          CategoryCore,
	"commit_batch":          CategoryCore,
	"discard_batch":         CategoryCore,
	"list_pending_batches":  CategoryCore,
	"describe_batch":        CategoryCore,
	"search_strategy":       CategoryCore,
	"list_tool_categories":  CategoryCore,
	"set_tool_filter":       CategoryCore,

	// ── Strategy reads ──────────────────────────────────────────────────
	"get_strategy_context":             CategoryStrategy,
	"get_product_vision":               CategoryStrategy,
	"get_personas":                     CategoryStrategy,
	"get_competitive_position":         CategoryStrategy,
	"get_roadmap":                      CategoryStrategy,
	"get_persona_details":              CategoryStrategy,
	"get_strategic_context_for_feature": CategoryStrategy,
	"explain_value_path":               CategoryStrategy,
	"get_coverage_analysis":            CategoryStrategy,
	"get_value_propositions":           CategoryStrategy,
	"get_assumptions":                  CategoryStrategy,
	"get_feature_dependencies":         CategoryStrategy,

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
	"create_lra":             CategoryAIM,
	"update_lra":             CategoryAIM,
	"get_lra":                CategoryAIM,
	"create_aim_report":      CategoryAIM,
	"get_aim_summary":        CategoryAIM,
	"draft_aim_assessment":   CategoryAIM,
	"draft_aim_calibration":  CategoryAIM,
	"apply_aim_calibration":  CategoryAIM,
	"list_aim_cycles":        CategoryAIM,
	"aim_start_cycle":        CategoryAIM,
	"aim_get_run":            CategoryAIM,
	"validate_assumptions":   CategoryAIM,
	"stage_calibration":      CategoryAIM,

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

	// ── Evidence ────────────────────────────────────────────────────────
	"ingest_evidence":  CategoryEvidence,
	"list_evidence":    CategoryEvidence,
	"get_evidence":     CategoryEvidence,
	"link_evidence":    CategoryEvidence,
	"update_evidence":  CategoryEvidence,

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
	"validate_artifact":       CategoryValidation,
	"validate_instance":       CategoryValidation,
	"validate_relationships":  CategoryValidation,
	"check_content_readiness": CategoryValidation,
	"validate_with_plan":      CategoryValidation,
	"export_instance_yaml":    CategoryValidation,
	"export_feature_yaml":     CategoryValidation,
	"export_report":           CategoryValidation,

	// ── Admin (workspace/org/instance management) ───────────────────────
	"create_workspace":         CategoryAdmin,
	"import_instance":          CategoryAdmin,
	"scaffold_instance":        CategoryAdmin,
	"activate_instance":        CategoryAdmin,
	"archive_instance":         CategoryAdmin,
	"delete_instance":          CategoryAdmin,
	"delete_workspace":         CategoryAdmin,
	"assign_workspace_to_org":  CategoryAdmin,
	"create_org":               CategoryAdmin,
	"update_org":               CategoryAdmin,
	"list_orgs":                CategoryAdmin,
	"invite_member":            CategoryAdmin,
	"remove_member":            CategoryAdmin,
	"list_members":             CategoryAdmin,
	"publish_version":          CategoryAdmin,
	"list_versions":            CategoryAdmin,
	"get_version":              CategoryAdmin,
	"diff_versions":            CategoryAdmin,
	"restore_version":          CategoryAdmin,
	"sync_to_github":              CategoryAdmin,
	"get_sync_status":             CategoryAdmin,
	"import_from_github":          CategoryAdmin,
	"get_sync_state":              CategoryAdmin,
	"update_instance":             CategoryAdmin,
	"list_github_installations":   CategoryAdmin,
	"scan_github_repos":           CategoryAdmin,

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
	"list_activities":         CategoryObservability,
	"list_skill_runs":         CategoryObservability,
	"get_skill_run":           CategoryObservability,
	"get_llm_usage":           CategoryObservability,
	"list_heartbeat_signals":  CategoryObservability,
	"acknowledge_heartbeat":   CategoryObservability,
	"list_cycle_proposals":    CategoryObservability,
	"approve_cycle_proposal":  CategoryObservability,
	"defer_cycle_proposal":    CategoryObservability,
}

// categoryDescriptions maps category names to human-readable descriptions.
var categoryDescriptions = map[string]string{
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
}

// categoryOrder defines the display order of categories.
var categoryOrder = []string{
	CategoryCore, CategoryStrategy, CategoryFeatures, CategoryAuthoring,
	CategoryAIM, CategoryRipple, CategoryEvidence, CategorySemantic,
	CategoryValidation, CategoryAdmin, CategoryKnowledge, CategoryPacks,
	CategoryObservability,
}

// ---------------------------------------------------------------------------
// Filter state — per-server, keyed by session ID
// ---------------------------------------------------------------------------

// toolFilterState holds the active category filters per session.
type toolFilterState struct {
	mu         sync.RWMutex
	categories map[string]map[string]bool // sessionID → set of active categories
}

var filterState = &toolFilterState{
	categories: make(map[string]map[string]bool),
}

// setCategories replaces the active categories for a session.
func (s *toolFilterState) setCategories(sessionID string, cats []string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	m := make(map[string]bool, len(cats))
	for _, c := range cats {
		m[c] = true
	}
	s.categories[sessionID] = m
}

// getCategories returns the active categories for a session.
// Returns nil if no filter is set (= show only core).
func (s *toolFilterState) getCategories(sessionID string) map[string]bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.categories[sessionID]
}

// clearSession removes filter state for a disconnected session.
func (s *toolFilterState) clearSession(sessionID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.categories, sessionID)
}

// ---------------------------------------------------------------------------
// Tool filter function — passed to server.WithToolFilter
// ---------------------------------------------------------------------------

// toolCategoryFilter is the WithToolFilter callback. It scopes the tool list
// to the core set plus any categories the session has activated.
func toolCategoryFilter(ctx context.Context, tools []mcp.Tool) []mcp.Tool {
	// Get session ID from context
	session := server.ClientSessionFromContext(ctx)
	var activeCats map[string]bool
	if session != nil {
		activeCats = filterState.getCategories(session.SessionID())
	}

	// If no filter set, show only core tools (default — minimal context)
	if len(activeCats) == 0 {
		activeCats = map[string]bool{CategoryCore: true}
	}

	// Always include core
	activeCats[CategoryCore] = true

	var filtered []mcp.Tool
	for _, tool := range tools {
		cat, ok := toolCategories[tool.Name]
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
func buildCategoryList(sessionID string) []CategoryInfo {
	activeCats := filterState.getCategories(sessionID)
	if len(activeCats) == 0 {
		activeCats = map[string]bool{CategoryCore: true}
	}

	// Count tools per category
	counts := make(map[string]int)
	for _, cat := range toolCategories {
		counts[cat]++
	}

	var result []CategoryInfo
	for _, name := range categoryOrder {
		desc := categoryDescriptions[name]
		result = append(result, CategoryInfo{
			Name:        name,
			Description: desc,
			ToolCount:   counts[name],
			Active:      activeCats[name] || name == CategoryCore,
		})
	}
	return result
}

// toolsInCategory returns the names of tools in a given category, sorted.
func toolsInCategory(category string) []string {
	var names []string
	for name, cat := range toolCategories {
		if cat == category {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	return names
}
