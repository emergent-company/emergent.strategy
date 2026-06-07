// Package langs provides i18n support for strategy-server.
//
// Usage in handlers:
//
//	msg := langs.T(ctx, "workspace.not_found")
//
// Usage in templates:
//
//	{langs.T(ctx, "workspace.create")}
package langs

import (
	"context"
	"fmt"
	"math"
	"time"

	"golang.org/x/text/language"
)

type contextKey struct{}

// Locale represents a supported language locale.
type Locale string

const (
	LocaleEN Locale = "en"
	LocaleNB Locale = "nb"
)

// messages holds all translation strings keyed by locale and message key.
// Extend this map as new UI copy is added. Never hard-code user-facing strings outside this file.
var messages = map[Locale]map[string]string{
	LocaleEN: {
		// ---------------------------------------------------------------------------
		// Generic errors (100xxx)
		// ---------------------------------------------------------------------------
		"error.not_found":     "Not found",
		"error.bad_request":   "Bad request",
		"error.forbidden":     "Forbidden",
		"error.unauthorized":  "Unauthorized",
		"error.internal":      "An unexpected error occurred",
		"error.conflict":      "Conflict",
		"error.unprocessable": "Unprocessable request",

		// Domain entity errors
		"error.instance_not_found":    "Strategy instance not found",
		"error.invalid_instance_id":   "Invalid instance ID",
		"error.invalid_batch_id":      "Invalid batch ID",
		"error.invalid_run_id":        "Invalid run ID",
		"error.invalid_version_id":    "Invalid version ID",
		"error.invalid_signal_id":     "Invalid signal ID",
		"error.invalid_proposal_id":   "Invalid proposal ID",
		"error.invalid_workspace_id":    "Invalid workspace ID",
		"error.workspace_name_required": "Workspace name is required",
		"error.batch_not_found":         "Staging batch not found",
		"error.run_not_found":         "Run not found",
		"error.version_not_found":     "Version not found",
		"error.skill_run_not_found":   "Skill run not found",

		// Service availability errors
		"error.aim_not_available":               "AIM service not available",
		"error.aim_cycle_already_running":        "An AIM cycle is already running for this instance",
		"error.aim_cycle_start_failed":           "Failed to start AIM cycle",
		"error.aim_run_abort_failed":             "Failed to abort run",
		"error.orchestration_not_available":      "Orchestration service not available",
		"error.heartbeat_not_available":          "Heartbeat service not available",
		"error.heartbeat_not_configured":         "Heartbeat service not configured",
		"error.ripple_not_available":             "Ripple service not available",
		"error.version_service_not_available":    "Version service not available",
		"error.evidence_service_not_configured":  "Evidence service not configured",
		"error.skill_run_service_not_available":  "Skill run service not available",
		"error.skill_executor_not_available":     "Skill executor not available — LLM provider required for AI drafting",

		// Operation errors
		"error.commit_failed":              "Commit failed",
		"error.discard_failed":             "Discard failed",
		"error.draft_assessment_failed":    "Draft assessment failed",
		"error.draft_calibration_failed":   "Draft calibration failed",
		"error.apply_calibration_failed":   "Apply calibration failed",
		"error.proposal_approve_failed":    "Could not approve proposal",
		"error.proposal_defer_failed":      "Could not defer proposal",
		"error.proposal_dismiss_failed":    "Could not dismiss proposal",
		"error.version_restore_failed":     "Version restore failed",
		"error.version_publish_failed":     "Version publish failed",
		"error.evidence_store_failed":      "Failed to store evidence",
		"error.templates_list_failed":      "Failed to list templates",
		"error.unknown_draft_key":           "Unknown draft key",
		"error.ready_draft_prereq_missing":  "Prerequisite artifact must exist before drafting",
		"error.instance_create_failed":      "Failed to create instance",

		// GitHub errors
		"error.github_sync_not_configured":  "GitHub sync is not configured",
		"error.github_oauth_not_configured": "GitHub OAuth is not configured",
		"error.github_repo_required":        "github_repo is required",
		"error.github_scan_failed":          "Scan failed — please try again",
		"error.oauth_missing_state_cookie":  "Missing state cookie — please try again",
		"error.oauth_invalid_state":         "Invalid OAuth state — possible CSRF attack",
		"error.oauth_state_mismatch":        "State mismatch — please try again",
		"error.oauth_missing_code":          "Missing code parameter",
		"error.oauth_exchange_failed":       "Failed to exchange GitHub authorization code",

		// Parameter validation errors
		"error.instance_id_required":  "instance_id is required",
		"error.invalid_instance_id2":  "Invalid instance_id",
		"error.workspace_id_required": "workspace_id is required",
		"error.source_name_required":  "source_name is required",
		"error.content_required":      "content is required",

		// Memory / settings errors
		"error.memory_client_not_initialized": "Memory client not initialized",
		"error.memory_health_check_failed":    "Health check failed",
		"error.memory_db_not_healthy":         "Memory database subsystem not healthy",

		// ---------------------------------------------------------------------------
		// Actions
		// ---------------------------------------------------------------------------
		"action.save":    "Save",
		"action.cancel":  "Cancel",
		"action.delete":  "Delete",
		"action.edit":    "Edit",
		"action.create":  "Create",
		"action.archive": "Archive",
		"action.commit":  "Commit changes",
		"action.discard": "Discard changes",

		// ---------------------------------------------------------------------------
		// Workspace (110xxx)
		// ---------------------------------------------------------------------------
		"workspace.title":     "Workspaces",
		"workspace.create":    "Create workspace",
		"workspace.not_found": "Workspace not found",
		"workspace.conflict":  "A workspace with this name already exists",

		// ---------------------------------------------------------------------------
		// Instance (111xxx)
		// ---------------------------------------------------------------------------
		"instance.title":     "Strategy instances",
		"instance.create":    "Import instance",
		"instance.not_found": "Strategy instance not found",
		"instance.archived":  "This instance has been archived",

		// ---------------------------------------------------------------------------
		// Mutation / authoring (112xxx)
		// ---------------------------------------------------------------------------
		"mutation.not_found": "Mutation not found",
		"batch.not_found":    "Staging batch not found",
		"batch.conflict":     "A staging batch already exists for this session",
		"validation.failed":  "Artifact validation failed",

		// Authoring actions
		"authoring.staged":    "Changes staged. Review and commit when ready.",
		"authoring.committed": "Changes committed successfully.",
		"authoring.discarded": "Staged changes discarded.",

		// ---------------------------------------------------------------------------
		// Semantic engine (113xxx)
		// ---------------------------------------------------------------------------
		"semantic.unavailable": "Semantic engine unavailable",
		"scenario.not_found":   "Scenario not found",

		// ---------------------------------------------------------------------------
		// Health
		// ---------------------------------------------------------------------------
		"health.ok": "OK",

		// ---------------------------------------------------------------------------
		// Navigation — screen titles
		// ---------------------------------------------------------------------------
		"nav.screen.dashboard":           "Dashboard",
		"nav.screen.execution":           "Execution",
		"nav.screen.activity":            "Activity",
		"nav.screen.skill_runs":          "Skill Runs",
		"nav.screen.skill_run":           "Skill Run",
		"nav.screen.ready":               "READY",
		"nav.screen.north_star":          "North Star",
		"nav.screen.insight_analyses":    "Insight Analyses",
		"nav.screen.strategy_foundations":"Strategy Foundations",
		"nav.screen.insight_opportunity": "Validated Opportunity",
		"nav.screen.strategy_formula":    "Strategy Formula",
		"nav.screen.roadmap_recipe":      "Roadmap Recipe",
		"nav.screen.product_portfolio":   "Product Portfolio",
		"nav.screen.fire":                "FIRE",
		"nav.screen.fire_strategy":       "Strategy",
		"nav.screen.org_ops":             "Org & Ops",
		"nav.screen.product":             "Product",
		"nav.screen.commercial":          "Commercial",
		"nav.screen.feature":             "Feature",
		"nav.screen.value_model":         "Value Model",
		"nav.screen.definition":          "Definition",
		"nav.screen.aim":                 "AIM",
		"nav.screen.coherence":           "Coherence",
		"nav.screen.assumptions":         "Assumptions",
		"nav.screen.versions":            "Versions",
		"nav.screen.proposals":           "Proposals",
		"nav.screen.cycle_runs":          "Cycle Runs",
		"nav.screen.evidence":            "Evidence",
		"nav.screen.lra":                 "Living Reality Assessment",
		"nav.screen.assessment_report":   "Assessment Report",
		"nav.screen.calibration":         "Calibration",
		"nav.screen.draft_review":        "Draft Review",
		"nav.screen.aim_run":             "Run",
		"nav.screen.evidence_interview":  "Evidence Interview",
		"nav.screen.version_detail":      "Version Detail",
		"nav.screen.settings":            "Settings",

		// Navigation — sidebar groups
		"nav.sidebar_group.overview": "Overview",
		"nav.sidebar_group.system":   "System",

		// Navigation — breadcrumbs
		"nav.breadcrumb.strategies":        "Strategies",
		"nav.breadcrumb.strategy_fallback": "Strategy",

		// ---------------------------------------------------------------------------
		// App
		// ---------------------------------------------------------------------------
		"app.name": "Emergent Strategy",

		// ---------------------------------------------------------------------------
		// Artifact labels and subtitles
		// ---------------------------------------------------------------------------
		"artifact.label.north_star":              "North Star",
		"artifact.label.insight_analyses":        "Insight Analyses",
		"artifact.label.strategy_foundations":    "Strategy Foundations",
		"artifact.label.insight_opportunity":     "Insight Opportunity",
		"artifact.label.strategy_formula":        "Strategy Formula",
		"artifact.label.roadmap_recipe":          "Roadmap Recipe",
		"artifact.label.product_portfolio":       "Product Portfolio",
		"artifact.label.living_reality_assessment": "Living Reality Assessment",
		"artifact.label.assessment_report":       "Assessment Report",
		"artifact.label.calibration_memo":        "Calibration Memo",

		"artifact.subtitle.north_star":           "Purpose · Vision · Mission · Values — immovable anchor",
		"artifact.subtitle.insight_analyses":     "Trends · Market · SWOT · User Problems",
		"artifact.subtitle.insight_opportunity":  "Synthesised big opportunity from analyses",
		"artifact.subtitle.strategy_foundations": "Product vision · Value prop · Sequencing · Principles",
		"artifact.subtitle.strategy_formula":     "Positioning · Moat · Value creation · Business model",
		"artifact.subtitle.roadmap_recipe":       "Current cycle priorities — four-track OKRs, assumptions, milestones",

		// ---------------------------------------------------------------------------
		// Calibration decisions
		// ---------------------------------------------------------------------------
		"calibration.decision.persevere":   "Persevere",
		"calibration.decision.pivot":       "Pivot",
		"calibration.decision.pull_the_plug": "Pull the Plug",

		// ---------------------------------------------------------------------------
		// Version labels
		// ---------------------------------------------------------------------------
		"version.initial_label":                 "Initial Strategy",
		"version.initial_description":           "First strategy version — published from the READY dashboard.",
		"version.auto_publish_calibration_desc": "Published after applying AIM calibration",
		"version.published_label":               "Published Version",

		// ---------------------------------------------------------------------------
		// Page titles (rendered in handler data, not navigation graph)
		// ---------------------------------------------------------------------------
		"page.draft_review":      "Draft Review",
		"page.aim_cycle_run":     "AIM Cycle Run",
		"page.version_history":   "Version History",
		"page.strategy_interview":"Strategy Interview",
		"page.skill_run_detail":  "Skill Run Detail",
		"page.settings.title":    "Settings",
		"page.settings.subtitle": "System status and configuration",
		"page.strategy_suffix":   "— Strategy",

		// ---------------------------------------------------------------------------
		// UI — Dashboard
		// ---------------------------------------------------------------------------
		"ui.dashboard.title":            "Strategy Dashboard",
		"ui.dashboard.subtitle":         "Overview of your strategy instances",
		"ui.dashboard.instances_header": "Strategy Instances",
		"ui.dashboard.empty_title":      "No strategy instances yet",
		"ui.dashboard.empty_body":       "Create a workspace and import a strategy instance to get started. Use the MCP tools or CLI to scaffold your first EPF strategy.",

		// UI — Status badges
		"ui.status.healthy":   "Healthy",
		"ui.status.active":    "Active",
		"ui.status.draft":     "Draft",
		"ui.status.archived":  "Archived",
		"ui.status.synced":    "Synced",
		"ui.status.pending":   "Pending",
		"ui.status.failed":    "Failed",
		"ui.status.not_synced":"Not synced",

		// UI — Sync state badges
		"ui.sync_state.in_sync":          "In sync",
		"ui.sync_state.server_ahead":     "Server ahead",
		"ui.sync_state.server_ahead_tip": "Server has unpushed enrichments",
		"ui.sync_state.github_ahead":     "GitHub ahead",
		"ui.sync_state.github_ahead_tip": "GitHub has commits not yet imported",
		"ui.sync_state.diverged":         "Diverged",
		"ui.sync_state.diverged_tip":     "Both sides changed — import will create a safety PR",
		"ui.sync_state.not_linked":       "Not linked",
		"ui.sync_state.never_synced":     "Never synced",

		// UI — Sync status badges
		"ui.sync_status.pr_created": "PR Created",

		// UI — Feature status badges
		"ui.feature_status.delivered":   "Delivered",
		"ui.feature_status.in_progress": "In Progress",
		"ui.feature_status.draft":       "Draft",
		"ui.feature_status.ready":       "Ready",
		"ui.feature_status.active":      "Active",
		"ui.feature_status.placeholder": "Placeholder",

		// UI — Stat chips
		"ui.stat.workspaces":         "Workspaces",
		"ui.stat.strategy_instances": "Strategy Instances",
		"ui.stat.active":             "Active",
		"ui.stat.draft":              "Draft",

		// UI — Instance chips
		"ui.chip.features": "features",
		"ui.chip.evidence": "evidence",
		"ui.chip.tested":   "tested",
		"ui.chip.versions": "versions",

		// UI — Tooltips
		"ui.tooltip.coherence_score":  "Coherence score",
		"ui.tooltip.critical_signals": "Critical coherence signals",
		"ui.tooltip.warning_signals":  "Warning signals",

		// UI — Artifact placeholder
		"ui.artifact.not_authored": "Not yet authored",

		// UI — Cadence labels
		"ui.cadence.years":         "Years",
		"ui.cadence.each_cycle":    "Each cycle",
		"ui.cadence.quarterly":     "Quarterly",
		"ui.cadence.current_cycle": "Current cycle",

		// UI — Draft button labels
		"ui.draft_btn.prereqs_missing": "Prerequisites missing",
		"ui.draft_btn.from_evidence":   "Draft from evidence",
		"ui.draft_btn.with_ai":         "Draft with AI",

		// UI — Evidence hints
		"ui.evidence_hint.ready":   "%d evidence item(s) ready for draft",
		"ui.evidence_hint.add":     "Add evidence to improve AI draft",
		"ui.evidence_hint.add_one": "Add %d evidence to improve draft",
		"ui.evidence_hint.add_two": "Add %d or %d evidence to improve draft",

		// UI — Readiness
		"ui.readiness.all_complete":         "All sections complete",
		"ui.readiness.sections_need_content":"section(s) need content",
		"ui.readiness.develop_hint":         "Develop these to strengthen this artifact",
		"ui.readiness.pts_suffix":           "(+%d pts)",
		"ui.readiness.optional":             "(optional)",

		// UI — READY phase
		"ui.ready.phase_title":         "READY Phase",
		"ui.ready.phase_subtitle":      "Strategic foundation — artifacts are interconnected, not independent",
		"ui.ready.evidence_count":       "%d evidence items loaded",
		"ui.ready.add_evidence_hint":    "Add evidence to improve AI drafts",
		"ui.ready.change_cadence_label": "Change cadence:",
		"ui.ready.score.label":         "Foundation readiness",
		"ui.ready.publish_btn":         "Publish initial version",
		"ui.ready.publish_banner.title":"Your strategy is ready to publish",
		"ui.ready.calibration_feedback":"calibration feeds back ↑",
		"ui.ready.connector.informs":   "informs",
		"ui.ready.connector.constrains":"constrains",
		"ui.ready.connector.evidence_grounds": "evidence grounds",
		"ui.ready.connector.both_synthesise":  "both synthesise",
		"ui.ready.connector.synthesises_into": "synthesises into",
		"ui.ready.connector.sequences":        "sequences",
		"ui.ready.connector.hands_off":        "hands off to",

		// UI — FIRE phase
		"ui.fire.phase_title":    "FIRE Phase",
		"ui.fire.phase_badge":    "Execution → now",
		"ui.fire.phase_subtitle": "Features, value models, and track definitions — where strategy becomes delivery",
		"ui.fire.stat.delivered":     "%d%% delivered",
		"ui.fire.stat.in_progress":   "%d%% in progress",
		"ui.fire.stat.draft":         "%d%% draft",
		"ui.fire.track.roadmap_krs":     "Roadmap KRs",
		"ui.fire.track.no_okrs":         "No OKRs defined",
		"ui.fire.track.value_model":     "Value Model",
		"ui.fire.track.definitions":     "Definitions",
		"ui.fire.track.definitions_hint":"requirements for delivery →",
		"ui.fire.track.traces_back":     "Each traces back to a KR ↑",
		"ui.fire.track.definition_count":"%d definitions",
		"ui.fire.value_model.not_defined": "Not yet defined",
		"ui.fire.value_model.exists":      "Value model exists",
		"ui.fire.connector.data_feeds":    "real-world data feeds",
		"ui.fire.defs_banner.title":       "Canonical definitions not installed",
		"ui.fire.defs_banner.install_btn": "Install definitions",
		"ui.fire.defs_banner.installing":  "Installing…",
		"ui.fire.align_banner.no_value_models":  "Value models not yet defined",
		"ui.fire.align_banner.tracks_missing":   "%d tracks missing value models",

		// UI — AIM phase
		"ui.aim.phase_title":    "AIM Phase",
		"ui.aim.phase_badge":    "Measure → learn",
		"ui.aim.phase_subtitle": "Delivery generates evidence — signals, metrics, and reality checks that feed back to calibrate READY",
		"ui.aim.stat.signals":     "Signals",
		"ui.aim.stat.metrics":     "Metrics",
		"ui.aim.stat.calibration": "Calibration",

		// UI — Roadmap
		"ui.roadmap.cycle_label":     "Cycle %d",
		"ui.roadmap.kr_label":        "KRs",
		"ui.roadmap.okrs_by_track":   "Roadmap OKRs by Track",
		"ui.roadmap.objectives_krs":  "%d objectives, %d key results",

		// UI — Table headers
		"ui.table.key":    "Key",
		"ui.table.name":   "Name",
		"ui.table.status": "Status",

		// UI — Placeholder / coming soon
		"ui.placeholder.coming_soon": "This feature is coming soon.",

		// UI — Warning banner
		"warning.memory_not_configured.title": "Memory not configured",
		"warning.memory_not_configured.body":  "— semantic search, contradiction detection, and graph features are disabled.",

		// ---------------------------------------------------------------------------
		// Settings page
		// ---------------------------------------------------------------------------
		"settings.github_sync.title":    "GitHub Sync",
		"settings.github_sync.subtitle": "Strategy artifact write-back to GitHub repositories",
		"settings.lang.title":    "Language",
		"settings.lang.subtitle": "Choose your preferred display language",
		"settings.lang.save_btn": "Save",
		"settings.github.app_configured":    "App configured",
		"settings.github.not_configured":    "Not configured",
		"settings.github.app_label":         "GitHub App",
		"settings.github.oauth_label":       "GitHub OAuth",
		"settings.github.oauth_available_note": "The user connect flow is available — link a repository with your own GitHub account (no App install required).",
		"settings.github.connect_btn":       "Connect GitHub",
		"settings.github.connect_repo_btn":  "Connect repo",
		"settings.github.no_repo_configured":"No GitHub repo configured",
		"settings.github.view_pr":           "View PR",
		"settings.github.push_btn":          "Push",
		"settings.github.import_btn":        "Import",

		"settings.memory.title":         "Semantic Memory",
		"settings.memory.subtitle":      "emergent.memory — semantic graph for strategy search and contradiction detection",
		"settings.memory.not_configured":"Not configured",
		"settings.memory.connected":     "Connected",
		"settings.memory.unreachable":   "Unreachable",
		"settings.memory.kv.url":             "URL",
		"settings.memory.kv.project_id":      "Project ID",
		"settings.memory.kv.server_version":  "Server version",
		"settings.memory.kv.graph_objects":   "Graph objects (artifacts)",
		"settings.memory.kv.last_error":      "Last error",

		"settings.instances.title":       "Strategy Instances",
		"settings.instances.subtitle":    "Memory graph sync status per instance",
		"settings.instance.synced_at":    "synced",
		"settings.instance.artifact_count": "%d artifacts",
		"settings.instance.graph_counts":   "%d obj · %d edges",
		"settings.instance.decomposed_counts": "+%d obj · %d edges decomposed",

		// ---------------------------------------------------------------------------
		// Evidence interview
		// ---------------------------------------------------------------------------
		"evidence.interview.q_vision":           "What is your product vision? What future are you building toward?",
		"evidence.interview.q_vision_hint":      "One or two paragraphs on the 3-5 year outcome you're after.",
		"evidence.interview.q_problem":          "What problem does your product solve, and for whom?",
		"evidence.interview.q_problem_hint":     "Describe the target persona and the core pain point. Include any evidence you have.",
		"evidence.interview.q_market":           "What is the market opportunity? Size, growth trends, timing.",
		"evidence.interview.q_market_hint":      "Include any market research, analyst reports, or first-hand observations.",
		"evidence.interview.q_competition":      "Who are your main competitors and how do you differentiate?",
		"evidence.interview.q_competition_hint": "List 3-5 competitors, their main strengths, and your edge.",
		"evidence.interview.q_value":            "What is your unique value proposition?",
		"evidence.interview.q_value_hint":       "Why would a customer choose you over alternatives?",
		"evidence.interview.q_team":             "Describe your team and its relevant strengths.",
		"evidence.interview.q_team_hint":        "Relevant experience, unfair advantages, key hires needed.",

		"evidence.source.guided_interview": "Guided Interview",

		// ---------------------------------------------------------------------------
		// Signal
		// ---------------------------------------------------------------------------
		"signal.dismiss_reason_ui": "dismissed via UI",

		// ---------------------------------------------------------------------------
		// MCP tool filter messages (returned as MCP text to AI clients)
		// ---------------------------------------------------------------------------
		"mcp.tool_filter.no_session": "Tool filter set (no session — filter applies to next request).",
		"mcp.tool_filter.updated":    "Tool filter updated. %d categories active, ~%d tools now visible. Call tools/list to see them.",
		"mcp.stage.note":             "Present this batch_id to the user for review. Call commit_batch only after explicit confirmation.",

		// MCP validation errors
		"error.mcp_marshal_categories":       "Failed to marshal categories",
		"error.mcp_task_description_required":"task_description is required",
		"error.mcp_marshal_result":           "Failed to marshal result: %v",
		"error.mcp_unknown_phase":            "unknown phase %q; use READY, FIRE, or AIM",
		"error.mcp_relationship_fields_required": "source_key, target_key, and relationship are required",
		"error.mcp_invalid_relationship_type":    "invalid relationship type %q; use one of: contributes_to, depends_on, tests_assumption, enables, in_tracks, implements",
		"error.mcp_feature_key_required":         "feature_key is required",
		"error.mcp_instance_id_required":         "instance_id is required",
		"error.mcp_scenario_id_required":         "scenario_id is required",
	},
	LocaleNB: {
		// ---------------------------------------------------------------------------
		// Generic errors (100xxx)
		// ---------------------------------------------------------------------------
		"error.not_found":     "Ikke funnet",
		"error.bad_request":   "Ugyldig forespørsel",
		"error.forbidden":     "Forbudt",
		"error.unauthorized":  "Ikke autorisert",
		"error.internal":      "En uventet feil oppstod",
		"error.conflict":      "Konflikt",
		"error.unprocessable": "Kan ikke behandle forespørselen",

		// Domain entity errors
		"error.instance_not_found":    "Strategiinstans ikke funnet",
		"error.invalid_instance_id":   "Ugyldig instans-ID",
		"error.invalid_batch_id":      "Ugyldig batch-ID",
		"error.invalid_run_id":        "Ugyldig kjøre-ID",
		"error.invalid_version_id":    "Ugyldig versjons-ID",
		"error.invalid_signal_id":     "Ugyldig signal-ID",
		"error.invalid_proposal_id":   "Ugyldig forslags-ID",
		"error.invalid_workspace_id":    "Ugyldig arbeidsområde-ID",
		"error.workspace_name_required": "Arbeidsområdenavn er påkrevd",
		"error.batch_not_found":         "Klargjøringsbatch ikke funnet",
		"error.run_not_found":         "Kjøring ikke funnet",
		"error.version_not_found":     "Versjon ikke funnet",
		"error.skill_run_not_found":   "Ferdighetsgjøring ikke funnet",

		// Service availability errors
		"error.aim_not_available":               "AIM-tjenesten er ikke tilgjengelig",
		"error.aim_cycle_already_running":        "En AIM-syklus kjører allerede for denne instansen",
		"error.aim_cycle_start_failed":           "Kunne ikke starte AIM-syklus",
		"error.aim_run_abort_failed":             "Kunne ikke avbryte kjøring",
		"error.orchestration_not_available":      "Orkestreringstjenesten er ikke tilgjengelig",
		"error.heartbeat_not_available":          "Hjerteslagstjenesten er ikke tilgjengelig",
		"error.heartbeat_not_configured":         "Hjerteslagstjenesten er ikke konfigurert",
		"error.ripple_not_available":             "Ripple-tjenesten er ikke tilgjengelig",
		"error.version_service_not_available":    "Versjonstjenesten er ikke tilgjengelig",
		"error.evidence_service_not_configured":  "Bevistjenesten er ikke konfigurert",
		"error.skill_run_service_not_available":  "Ferdighetsgjøringstjenesten er ikke tilgjengelig",
		"error.skill_executor_not_available":     "Ferdighetskjører ikke tilgjengelig — LLM-leverandør kreves for AI-utkast",

		// Operation errors
		"error.commit_failed":              "Bekreftelse feilet",
		"error.discard_failed":             "Forkasting feilet",
		"error.draft_assessment_failed":    "Utkast til vurdering feilet",
		"error.draft_calibration_failed":   "Utkast til kalibrering feilet",
		"error.apply_calibration_failed":   "Kalibreringsanvendelse feilet",
		"error.proposal_approve_failed":    "Kunne ikke godkjenne forslag",
		"error.proposal_defer_failed":      "Kunne ikke utsette forslag",
		"error.proposal_dismiss_failed":    "Kunne ikke avvise forslag",
		"error.version_restore_failed":     "Versjonsgjenoppretting feilet",
		"error.version_publish_failed":     "Versjonsutgivelse feilet",
		"error.evidence_store_failed":      "Kunne ikke lagre bevis",
		"error.templates_list_failed":      "Kunne ikke liste maler",
		"error.unknown_draft_key":           "Ukjent utkastnøkkel",
		"error.ready_draft_prereq_missing":  "Forutsetningsartefakt må eksistere før utkast",
		"error.instance_create_failed":      "Kunne ikke opprette instans",

		// GitHub errors
		"error.github_sync_not_configured":  "GitHub-synkronisering er ikke konfigurert",
		"error.github_oauth_not_configured": "GitHub OAuth er ikke konfigurert",
		"error.github_repo_required":        "github_repo er påkrevd",
		"error.github_scan_failed":          "Skanning mislyktes — prøv igjen",
		"error.oauth_missing_state_cookie":  "Manglende tilstandsinformasjonskapsling — prøv igjen",
		"error.oauth_invalid_state":         "Ugyldig OAuth-tilstand — mulig CSRF-angrep",
		"error.oauth_state_mismatch":        "Tilstandsavvik — prøv igjen",
		"error.oauth_missing_code":          "Manglende kodeparameter",
		"error.oauth_exchange_failed":       "Kunne ikke veksle GitHub-autorisasjonskoden",

		// Parameter validation errors
		"error.instance_id_required":  "instance_id er påkrevd",
		"error.invalid_instance_id2":  "Ugyldig instance_id",
		"error.workspace_id_required": "workspace_id er påkrevd",
		"error.source_name_required":  "source_name er påkrevd",
		"error.content_required":      "content er påkrevd",

		// Memory / settings errors
		"error.memory_client_not_initialized": "Memory-klient ikke initialisert",
		"error.memory_health_check_failed":    "Helsesjekk feilet",
		"error.memory_db_not_healthy":         "Memory-databaseundersystem er ikke sunt",

		// ---------------------------------------------------------------------------
		// Actions
		// ---------------------------------------------------------------------------
		"action.save":    "Lagre",
		"action.cancel":  "Avbryt",
		"action.delete":  "Slett",
		"action.edit":    "Rediger",
		"action.create":  "Opprett",
		"action.archive": "Arkiver",
		"action.commit":  "Bekreft endringer",
		"action.discard": "Forkast endringer",

		// ---------------------------------------------------------------------------
		// Workspace (110xxx)
		// ---------------------------------------------------------------------------
		"workspace.title":     "Arbeidsområder",
		"workspace.create":    "Opprett arbeidsområde",
		"workspace.not_found": "Arbeidsområde ikke funnet",
		"workspace.conflict":  "Et arbeidsområde med dette navnet finnes allerede",

		// ---------------------------------------------------------------------------
		// Instance (111xxx)
		// ---------------------------------------------------------------------------
		"instance.title":     "Strategiinstanser",
		"instance.create":    "Importer instans",
		"instance.not_found": "Strategiinstans ikke funnet",
		"instance.archived":  "Denne instansen er arkivert",

		// ---------------------------------------------------------------------------
		// Mutation / authoring (112xxx)
		// ---------------------------------------------------------------------------
		"mutation.not_found": "Mutasjon ikke funnet",
		"batch.not_found":    "Klargjøringsbatch ikke funnet",
		"batch.conflict":     "En klargjøringsbatch finnes allerede for denne sesjonen",
		"validation.failed":  "Artefaktvalidering feilet",

		// Authoring actions
		"authoring.staged":    "Endringer klargjort. Gjennomgå og bekreft når du er klar.",
		"authoring.committed": "Endringer bekreftet.",
		"authoring.discarded": "Klargjorte endringer forkastet.",

		// ---------------------------------------------------------------------------
		// Semantic engine (113xxx)
		// ---------------------------------------------------------------------------
		"semantic.unavailable": "Semantisk motor utilgjengelig",
		"scenario.not_found":   "Scenario ikke funnet",

		// ---------------------------------------------------------------------------
		// Health
		// ---------------------------------------------------------------------------
		"health.ok": "OK",

		// ---------------------------------------------------------------------------
		// Navigation — screen titles
		// ---------------------------------------------------------------------------
		"nav.screen.dashboard":            "Dashbord",
		"nav.screen.execution":            "Gjennomføring",
		"nav.screen.activity":             "Aktivitet",
		"nav.screen.skill_runs":           "Ferdighetsgjøringer",
		"nav.screen.skill_run":            "Ferdighetsgjøring",
		"nav.screen.ready":                "KLAR",
		"nav.screen.north_star":           "Nordstjerne",
		"nav.screen.insight_analyses":     "Innsiktsanalyser",
		"nav.screen.strategy_foundations": "Strategigrunnlag",
		"nav.screen.insight_opportunity":  "Validert mulighet",
		"nav.screen.strategy_formula":     "Strategiformel",
		"nav.screen.roadmap_recipe":       "Veikartoppskrift",
		"nav.screen.product_portfolio":    "Produktportefølje",
		"nav.screen.fire":                 "UTFØR",
		"nav.screen.fire_strategy":        "Strategi",
		"nav.screen.org_ops":              "Org & Drift",
		"nav.screen.product":              "Produkt",
		"nav.screen.commercial":           "Kommersiell",
		"nav.screen.feature":              "Funksjon",
		"nav.screen.value_model":          "Verdimodell",
		"nav.screen.definition":           "Definisjon",
		"nav.screen.aim":                  "MÅL",
		"nav.screen.coherence":            "Koherens",
		"nav.screen.assumptions":          "Antakelser",
		"nav.screen.versions":             "Versjoner",
		"nav.screen.proposals":            "Forslag",
		"nav.screen.cycle_runs":           "Sykluskjøringer",
		"nav.screen.evidence":             "Bevis",
		"nav.screen.lra":                  "Levende virkelighetsanalyse",
		"nav.screen.assessment_report":    "Vurderingsrapport",
		"nav.screen.calibration":          "Kalibrering",
		"nav.screen.draft_review":         "Utkastgjennomgang",
		"nav.screen.aim_run":              "Kjøring",
		"nav.screen.evidence_interview":   "Bevisintervju",
		"nav.screen.version_detail":       "Versjonsdetalj",
		"nav.screen.settings":             "Innstillinger",

		// Navigation — sidebar groups
		"nav.sidebar_group.overview": "Oversikt",
		"nav.sidebar_group.system":   "System",

		// Navigation — breadcrumbs
		"nav.breadcrumb.strategies":        "Strategier",
		"nav.breadcrumb.strategy_fallback": "Strategi",

		// ---------------------------------------------------------------------------
		// App
		// ---------------------------------------------------------------------------
		"app.name": "Emergent Strategy",

		// ---------------------------------------------------------------------------
		// Artifact labels and subtitles
		// ---------------------------------------------------------------------------
		"artifact.label.north_star":               "Nordstjerne",
		"artifact.label.insight_analyses":         "Innsiktsanalyser",
		"artifact.label.strategy_foundations":     "Strategigrunnlag",
		"artifact.label.insight_opportunity":      "Innsiktsmulighet",
		"artifact.label.strategy_formula":         "Strategiformel",
		"artifact.label.roadmap_recipe":           "Veikartoppskrift",
		"artifact.label.product_portfolio":        "Produktportefølje",
		"artifact.label.living_reality_assessment":"Levende virkelighetsanalyse",
		"artifact.label.assessment_report":        "Vurderingsrapport",
		"artifact.label.calibration_memo":         "Kalibreringsnotat",

		"artifact.subtitle.north_star":           "Formål · Visjon · Misjon · Verdier — uforanderlig anker",
		"artifact.subtitle.insight_analyses":     "Trender · Marked · SWOT · Brukerproblemer",
		"artifact.subtitle.insight_opportunity":  "Syntetisert stor mulighet fra analyser",
		"artifact.subtitle.strategy_foundations": "Produktvisjon · Verdiforslag · Sekvensering · Prinsipper",
		"artifact.subtitle.strategy_formula":     "Posisjonering · Vollgrav · Verdiskaping · Forretningsmodell",
		"artifact.subtitle.roadmap_recipe":       "Gjeldende syklus — fire-spors OKRer, antakelser, milepæler",

		// ---------------------------------------------------------------------------
		// Calibration decisions
		// ---------------------------------------------------------------------------
		"calibration.decision.persevere":     "Fortsett",
		"calibration.decision.pivot":         "Sving",
		"calibration.decision.pull_the_plug": "Avslutt",

		// ---------------------------------------------------------------------------
		// Version labels
		// ---------------------------------------------------------------------------
		"version.initial_label":                 "Innledende strategi",
		"version.initial_description":           "Første strategiversjon — utgitt fra KLAR-dashbordet.",
		"version.auto_publish_calibration_desc": "Utgitt etter anvendelse av AIM-kalibrering",
		"version.published_label":               "Utgitt versjon",

		// ---------------------------------------------------------------------------
		// Page titles
		// ---------------------------------------------------------------------------
		"page.draft_review":       "Utkastgjennomgang",
		"page.aim_cycle_run":      "AIM-sykluskjøring",
		"page.version_history":    "Versjonshistorikk",
		"page.strategy_interview": "Strategiintervju",
		"page.skill_run_detail":   "Ferdighetsgjøringsdetalj",
		"page.settings.title":     "Innstillinger",
		"page.settings.subtitle":  "Systemstatus og konfigurasjon",
		"page.strategy_suffix":    "— Strategi",

		// ---------------------------------------------------------------------------
		// UI — Dashboard
		// ---------------------------------------------------------------------------
		"ui.dashboard.title":            "Strategidashbord",
		"ui.dashboard.subtitle":         "Oversikt over dine strategiinstanser",
		"ui.dashboard.instances_header": "Strategiinstanser",
		"ui.dashboard.empty_title":      "Ingen strategiinstanser ennå",
		"ui.dashboard.empty_body":       "Opprett et arbeidsområde og importer en strategiinstans for å komme i gang. Bruk MCP-verktøyene eller CLI til å stillase din første EPF-strategi.",

		// UI — Status badges
		"ui.status.healthy":    "Sunn",
		"ui.status.active":     "Aktiv",
		"ui.status.draft":      "Utkast",
		"ui.status.archived":   "Arkivert",
		"ui.status.synced":     "Synkronisert",
		"ui.status.pending":    "Venter",
		"ui.status.failed":     "Feilet",
		"ui.status.not_synced": "Ikke synkronisert",

		// UI — Sync state badges
		"ui.sync_state.in_sync":          "Synkronisert",
		"ui.sync_state.server_ahead":     "Server foran",
		"ui.sync_state.server_ahead_tip": "Server har upubliserte berikelser",
		"ui.sync_state.github_ahead":     "GitHub foran",
		"ui.sync_state.github_ahead_tip": "GitHub har commits som ikke er importert",
		"ui.sync_state.diverged":         "Divergert",
		"ui.sync_state.diverged_tip":     "Begge sider har endret seg — import vil opprette en sikkerhetsPR",
		"ui.sync_state.not_linked":       "Ikke koblet",
		"ui.sync_state.never_synced":     "Aldri synkronisert",

		// UI — Sync status badges
		"ui.sync_status.pr_created": "PR opprettet",

		// UI — Feature status badges
		"ui.feature_status.delivered":   "Levert",
		"ui.feature_status.in_progress": "Pågår",
		"ui.feature_status.draft":       "Utkast",
		"ui.feature_status.ready":       "Klar",
		"ui.feature_status.active":      "Aktiv",
		"ui.feature_status.placeholder": "Plassholder",

		// UI — Stat chips
		"ui.stat.workspaces":         "Arbeidsområder",
		"ui.stat.strategy_instances": "Strategiinstanser",
		"ui.stat.active":             "Aktive",
		"ui.stat.draft":              "Utkast",

		// UI — Instance chips
		"ui.chip.features": "funksjoner",
		"ui.chip.evidence": "bevis",
		"ui.chip.tested":   "testet",
		"ui.chip.versions": "versjoner",

		// UI — Tooltips
		"ui.tooltip.coherence_score":  "Koherensscore",
		"ui.tooltip.critical_signals": "Kritiske koherenssignaler",
		"ui.tooltip.warning_signals":  "Advarselsignaler",

		// UI — Artifact placeholder
		"ui.artifact.not_authored": "Ikke forfattet ennå",

		// UI — Cadence labels
		"ui.cadence.years":         "År",
		"ui.cadence.each_cycle":    "Hver syklus",
		"ui.cadence.quarterly":     "Kvartalsvis",
		"ui.cadence.current_cycle": "Gjeldende syklus",

		// UI — Draft button labels
		"ui.draft_btn.prereqs_missing": "Forutsetninger mangler",
		"ui.draft_btn.from_evidence":   "Utkast fra bevis",
		"ui.draft_btn.with_ai":         "Utkast med AI",

		// UI — Evidence hints
		"ui.evidence_hint.ready":   "%d beviselement(er) klar for utkast",
		"ui.evidence_hint.add":     "Legg til bevis for å forbedre AI-utkast",
		"ui.evidence_hint.add_one": "Legg til %d bevis for å forbedre utkast",
		"ui.evidence_hint.add_two": "Legg til %d eller %d bevis for å forbedre utkast",

		// UI — Readiness
		"ui.readiness.all_complete":          "Alle seksjoner fullstendige",
		"ui.readiness.sections_need_content": "seksjoner trenger innhold",
		"ui.readiness.develop_hint":          "Utvikle disse for å styrke artefakten",
		"ui.readiness.pts_suffix":            "(+%d pts)",
		"ui.readiness.optional":              "(valgfritt)",

		// UI — READY phase
		"ui.ready.phase_title":          "KLAR-fase",
		"ui.ready.phase_subtitle":       "Strategisk grunnlag — artefakter er sammenkoblet, ikke uavhengige",
		"ui.ready.evidence_count":        "%d bevis lastet inn",
		"ui.ready.add_evidence_hint":     "Legg til bevis for å forbedre AI-utkast",
		"ui.ready.change_cadence_label":  "Endre kadense:",
		"ui.ready.score.label":          "Grunnlagsklarhet",
		"ui.ready.publish_btn":          "Publiser innledende versjon",
		"ui.ready.publish_banner.title": "Strategien din er klar til publisering",
		"ui.ready.calibration_feedback": "kalibrering mater tilbake ↑",
		"ui.ready.connector.informs":    "informerer",
		"ui.ready.connector.constrains": "begrenser",
		"ui.ready.connector.evidence_grounds": "bevis grunnlegger",
		"ui.ready.connector.both_synthesise":  "begge syntetiserer",
		"ui.ready.connector.synthesises_into": "syntetiserer til",
		"ui.ready.connector.sequences":        "sekvenserer",
		"ui.ready.connector.hands_off":        "overlater til",

		// UI — FIRE phase
		"ui.fire.phase_title":    "UTFØR-fase",
		"ui.fire.phase_badge":    "Gjennomføring → nå",
		"ui.fire.phase_subtitle": "Funksjoner, verdimodeller og spordefinisjoner — der strategi blir leveranse",
		"ui.fire.stat.delivered":     "%d%% levert",
		"ui.fire.stat.in_progress":   "%d%% pågår",
		"ui.fire.stat.draft":         "%d%% utkast",
		"ui.fire.track.roadmap_krs":      "Veikartnøkkelresultater",
		"ui.fire.track.no_okrs":          "Ingen OKRer definert",
		"ui.fire.track.value_model":      "Verdimodell",
		"ui.fire.track.definitions":      "Definisjoner",
		"ui.fire.track.definitions_hint": "krav til leveranse →",
		"ui.fire.track.traces_back":      "Alle sporer tilbake til et KR ↑",
		"ui.fire.track.definition_count": "%d definisjoner",
		"ui.fire.value_model.not_defined": "Ikke definert ennå",
		"ui.fire.value_model.exists":      "Verdimodell eksisterer",
		"ui.fire.connector.data_feeds":    "virkelige datamater",
		"ui.fire.defs_banner.title":       "Kanoniske definisjoner ikke installert",
		"ui.fire.defs_banner.install_btn": "Installer definisjoner",
		"ui.fire.defs_banner.installing":  "Installerer…",
		"ui.fire.align_banner.no_value_models": "Verdimodeller ikke definert ennå",
		"ui.fire.align_banner.tracks_missing":  "%d spor mangler verdimodeller",

		// UI — AIM phase
		"ui.aim.phase_title":    "MÅL-fase",
		"ui.aim.phase_badge":    "Mål → lær",
		"ui.aim.phase_subtitle": "Leveranse genererer bevis — signaler, metrikker og virkelighetssjekker som mates tilbake for å kalibrere KLAR",
		"ui.aim.stat.signals":     "Signaler",
		"ui.aim.stat.metrics":     "Metrikker",
		"ui.aim.stat.calibration": "Kalibrering",

		// UI — Roadmap
		"ui.roadmap.cycle_label":   "Syklus %d",
		"ui.roadmap.kr_label":      "KR",
		"ui.roadmap.okrs_by_track": "Veikartnøkkelresultater per spor",
		"ui.roadmap.objectives_krs":"%d mål, %d nøkkelresultater",

		// UI — Table headers
		"ui.table.key":    "Nøkkel",
		"ui.table.name":   "Navn",
		"ui.table.status": "Status",

		// UI — Placeholder / coming soon
		"ui.placeholder.coming_soon": "Denne funksjonen kommer snart.",

		// UI — Warning banner
		"warning.memory_not_configured.title": "Memory ikke konfigurert",
		"warning.memory_not_configured.body":  "— semantisk søk, deteksjon av motsetninger og grafunksjoner er deaktivert.",

		// ---------------------------------------------------------------------------
		// Settings page
		// ---------------------------------------------------------------------------
		"settings.github_sync.title":    "GitHub-synkronisering",
		"settings.github_sync.subtitle": "Tilbakeskriving av strategiartefakter til GitHub-repositorier",
		"settings.lang.title":    "Språk",
		"settings.lang.subtitle": "Velg foretrukket visningsspråk",
		"settings.lang.save_btn": "Lagre",
		"settings.github.app_configured":     "App konfigurert",
		"settings.github.not_configured":     "Ikke konfigurert",
		"settings.github.app_label":          "GitHub App",
		"settings.github.oauth_label":        "GitHub OAuth",
		"settings.github.oauth_available_note": "Brukerkobling er tilgjengelig — koble et repositorium med din egen GitHub-konto (ingen App-installasjon kreves).",
		"settings.github.connect_btn":        "Koble GitHub",
		"settings.github.connect_repo_btn":   "Koble repo",
		"settings.github.no_repo_configured": "Ingen GitHub-repo konfigurert",
		"settings.github.view_pr":            "Vis PR",
		"settings.github.push_btn":           "Dytt",
		"settings.github.import_btn":         "Importer",

		"settings.memory.title":         "Semantisk minne",
		"settings.memory.subtitle":      "emergent.memory — semantisk graf for strategisøk og motstridingdeteksjon",
		"settings.memory.not_configured":"Ikke konfigurert",
		"settings.memory.connected":     "Tilkoblet",
		"settings.memory.unreachable":   "Utilgjengelig",
		"settings.memory.kv.url":             "URL",
		"settings.memory.kv.project_id":      "Prosjekt-ID",
		"settings.memory.kv.server_version":  "Serverversjon",
		"settings.memory.kv.graph_objects":   "Grafobjekter (artefakter)",
		"settings.memory.kv.last_error":      "Siste feil",

		"settings.instances.title":    "Strategiinstanser",
		"settings.instances.subtitle": "Minnegrafsynkroniseringsstatus per instans",
		"settings.instance.synced_at":          "synkronisert",
		"settings.instance.artifact_count":     "%d artefakter",
		"settings.instance.graph_counts":       "%d obj · %d kanter",
		"settings.instance.decomposed_counts":  "+%d obj · %d kanter dekomponert",

		// ---------------------------------------------------------------------------
		// Evidence interview
		// ---------------------------------------------------------------------------
		"evidence.interview.q_vision":           "Hva er produktvisjonen din? Hvilken fremtid bygger du mot?",
		"evidence.interview.q_vision_hint":      "Et eller to avsnitt om resultatet du sikter mot de neste 3-5 årene.",
		"evidence.interview.q_problem":          "Hvilket problem løser produktet ditt, og for hvem?",
		"evidence.interview.q_problem_hint":     "Beskriv målpersonaen og kjernesmertepunktet. Inkluder bevis du har.",
		"evidence.interview.q_market":           "Hva er markedsmulighetene? Størrelse, veksttrender, timing.",
		"evidence.interview.q_market_hint":      "Inkluder markedsundersøkelser, analyserapporter eller egne observasjoner.",
		"evidence.interview.q_competition":      "Hvem er dine viktigste konkurrenter og hvordan skiller du deg ut?",
		"evidence.interview.q_competition_hint": "List 3-5 konkurrenter, deres styrker og ditt fortrinn.",
		"evidence.interview.q_value":            "Hva er ditt unike verdiforslag?",
		"evidence.interview.q_value_hint":       "Hvorfor ville en kunde velge deg fremfor alternativer?",
		"evidence.interview.q_team":             "Beskriv teamet ditt og dets relevante styrker.",
		"evidence.interview.q_team_hint":        "Relevant erfaring, urettferdige fordeler, nøkkelansettelser som trengs.",

		"evidence.source.guided_interview": "Guidet intervju",

		// ---------------------------------------------------------------------------
		// Signal
		// ---------------------------------------------------------------------------
		"signal.dismiss_reason_ui": "avvist via brukergrensesnitt",

		// ---------------------------------------------------------------------------
		// MCP tool filter messages
		// ---------------------------------------------------------------------------
		"mcp.tool_filter.no_session": "Verktøyfilter satt (ingen sesjon — filter gjelder neste forespørsel).",
		"mcp.tool_filter.updated":    "Verktøyfilter oppdatert. %d kategorier aktive, ~%d verktøy synlige. Kall tools/list for å se dem.",
		"mcp.stage.note":             "Presenter denne batch_id til brukeren for gjennomgang. Kall commit_batch bare etter eksplisitt bekreftelse.",

		// MCP validation errors
		"error.mcp_marshal_categories":           "Kunne ikke serialisere kategorier",
		"error.mcp_task_description_required":    "task_description er påkrevd",
		"error.mcp_marshal_result":               "Kunne ikke serialisere resultat: %v",
		"error.mcp_unknown_phase":                "ukjent fase %q; bruk READY, FIRE eller AIM",
		"error.mcp_relationship_fields_required": "source_key, target_key og relationship er påkrevd",
		"error.mcp_invalid_relationship_type":    "ugyldig relasjonstype %q; bruk en av: contributes_to, depends_on, tests_assumption, enables, in_tracks, implements",
		"error.mcp_feature_key_required":         "feature_key er påkrevd",
		"error.mcp_instance_id_required":         "instance_id er påkrevd",
		"error.mcp_scenario_id_required":         "scenario_id er påkrevd",
	},
}

// WithLocale returns a context that carries the given locale.
func WithLocale(ctx context.Context, locale Locale) context.Context {
	return context.WithValue(ctx, contextKey{}, locale)
}

// LocaleFromContext returns the locale stored in ctx, defaulting to English.
func LocaleFromContext(ctx context.Context) Locale {
	if l, ok := ctx.Value(contextKey{}).(Locale); ok {
		return l
	}
	return LocaleEN
}

// T returns the translated string for the given key in the locale stored in ctx.
// Falls back to English, then to the key itself if no translation is found.
func T(ctx context.Context, key string) string {
	locale := LocaleFromContext(ctx)
	if m, ok := messages[locale]; ok {
		if s, ok := m[key]; ok {
			return s
		}
	}
	// Fallback to English
	if locale != LocaleEN {
		if m, ok := messages[LocaleEN]; ok {
			if s, ok := m[key]; ok {
				return s
			}
		}
	}
	return key
}

// Tf returns a translated string with fmt.Sprintf formatting.
func Tf(ctx context.Context, key string, args ...any) string {
	return fmt.Sprintf(T(ctx, key), args...)
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

// supportedMatcher matches Accept-Language tags against supported locales.
var supportedMatcher = language.NewMatcher([]language.Tag{
	language.English,
	language.Norwegian,
})

// ParseAcceptLanguage parses an Accept-Language header and returns the best
// matching supported locale.
func ParseAcceptLanguage(header string) Locale {
	tags, _, err := language.ParseAcceptLanguage(header)
	if err != nil || len(tags) == 0 {
		return LocaleEN
	}
	_, idx, _ := supportedMatcher.Match(tags...)
	switch idx {
	case 1:
		return LocaleNB
	default:
		return LocaleEN
	}
}

// FormatInt formats an integer with locale-appropriate thousands separators.
func FormatInt(ctx context.Context, n int64) string {
	switch LocaleFromContext(ctx) {
	case LocaleNB:
		return formatIntSep(n, '\u00a0') // non-breaking space
	default:
		return formatIntSep(n, ',')
	}
}

// FormatDate formats a time.Time as a long date string for the locale.
func FormatDate(ctx context.Context, t time.Time) string {
	switch LocaleFromContext(ctx) {
	case LocaleNB:
		return t.Format("2. January 2006")
	default:
		return t.Format("January 2, 2006")
	}
}

// FormatDateShort formats a time.Time as a short date string for the locale.
func FormatDateShort(ctx context.Context, t time.Time) string {
	switch LocaleFromContext(ctx) {
	case LocaleNB:
		return t.Format("02.01.2006")
	default:
		return t.Format("2006-01-02")
	}
}

func formatIntSep(n int64, sep rune) string {
	if n < 0 {
		return "-" + formatIntSep(-n, sep)
	}
	if n < 1000 {
		return fmt.Sprintf("%d", n)
	}
	mag := int64(math.Pow10(int(math.Log10(float64(n)/1000))*3 + 3))
	return fmt.Sprintf("%d%c%s", n/mag, sep, formatIntSep(n%mag, sep))
}
