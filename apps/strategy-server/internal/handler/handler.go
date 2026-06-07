// Package handler contains the web HTTP handlers for the strategy-server UI.
// Handlers are thin adapters: they load data from domain services and render
// templ components. No business logic lives here.
package handler

import (
	"context"
	"log/slog"

	"github.com/emergent-company/go-daisy/components/layout"
	"github.com/emergent-company/go-daisy/render"
	"github.com/labstack/echo/v4"
	"github.com/uptrace/bun"

	activitydom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/activity"
	aimdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/aim"
	evidencedom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/evidence"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/heartbeat"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ripple"
	schemadom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/schema"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/semantic"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/skillexec"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/skillrun"
	strategydom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	syncdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/sync"
	userdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/user"
	ghclient "github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/github"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/version"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/langs"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/navigation"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
)

// navGraph is the singleton navigation graph.
var navGraph = navigation.DefaultGraph()

// Server holds dependencies for web handlers.
type Server struct {
	db                  *bun.DB
	log                 *slog.Logger
	semanticSvc         *semantic.Service
	rippleSvc           *ripple.Service
	strategySvc         *strategydom.Service  // required for index derivation on batch commit
	versionSvc          *version.Service
	syncSvc             *syncdom.Service      // nil when GitHub App not configured
	userSvc             *userdom.Service      // for GitHub token storage
	aimSvc              *aimdom.Service       // nil when AIM service not configured
	heartbeatSvc        *heartbeat.Service    // nil when heartbeat not configured
	orchestrationEngine *orchestration.Engine // nil when orchestration not configured
	activitySvc         *activitydom.Service  // nil when activity stream not configured
	skillRunSvc         *skillrun.Service     // nil when skill run ledger not configured
	skillExecutor       *skillexec.Executor   // nil when no LLM provider is wired
	schemaSvc           *schemadom.Service    // nil when schema registry is not configured
	evidenceSvc         *evidencedom.Service  // nil when evidence service not configured
	postCommitPipeline  *PostCommitPipeline   // nil when ripple is not configured
	llmEnabled          bool                  // true when an LLM provider is wired
	githubAppInstallURL string                // set when GITHUB_APP_SLUG is configured
	githubOAuth         *ghclient.OAuthConfig // nil when OAuth App not configured
}

// New creates a new web handler Server.
func New(db *bun.DB, log *slog.Logger, semanticSvc *semantic.Service) *Server {
	return &Server{
		db:          db,
		log:         log,
		semanticSvc: semanticSvc,
	}
}

// WithRipple wires the ripple service into the handler server.
func (s *Server) WithRipple(svc *ripple.Service) *Server {
	s.rippleSvc = svc
	s.rebuildPostCommitPipeline()
	return s
}

// WithStrategy wires the strategy service into the handler server.
// Required for proper strategic index derivation when committing batches via the web UI.
func (s *Server) WithStrategy(svc *strategydom.Service) *Server {
	s.strategySvc = svc
	s.rebuildPostCommitPipeline()
	return s
}

// WithVersion wires the version service into the handler server.
func (s *Server) WithVersion(svc *version.Service) *Server {
	s.versionSvc = svc
	s.rebuildPostCommitPipeline()
	return s
}

// WithSync wires the sync service into the handler server (optional).
func (s *Server) WithSync(svc *syncdom.Service) *Server {
	s.syncSvc = svc
	return s
}

// WithGithubAppInstallURL sets the GitHub App install URL for the connect flow.
func (s *Server) WithGithubAppInstallURL(url string) *Server {
	s.githubAppInstallURL = url
	return s
}

// WithUserSvc wires the user service for GitHub token storage.
func (s *Server) WithUserSvc(svc *userdom.Service) *Server {
	s.userSvc = svc
	return s
}

// WithGithubOAuth wires the GitHub OAuth App config for the user authorization flow.
func (s *Server) WithGithubOAuth(cfg *ghclient.OAuthConfig) *Server {
	s.githubOAuth = cfg
	return s
}

// WithAIM wires the AIM service into the handler server (optional).
func (s *Server) WithAIM(svc *aimdom.Service) *Server {
	s.aimSvc = svc
	return s
}

// WithHeartbeat wires the heartbeat service into the handler server (optional).
// When set, the proposals inbox and approve/defer actions are active.
func (s *Server) WithHeartbeat(svc *heartbeat.Service) *Server {
	s.heartbeatSvc = svc
	return s
}

// WithOrchestration wires the orchestration engine into the handler server (optional).
func (s *Server) WithOrchestration(eng *orchestration.Engine) *Server {
	s.orchestrationEngine = eng
	return s
}

// WithActivity wires the activity stream service into the handler server (optional).
// When set, the GET /strategies/:id/activity/stream SSE endpoint is active.
func (s *Server) WithActivity(svc *activitydom.Service) *Server {
	s.activitySvc = svc
	return s
}

// WithSkillRun wires the skill run ledger into the handler server (optional).
// When set, the cascade tracker reads active runs and recent completions.
func (s *Server) WithSkillRun(svc *skillrun.Service) *Server {
	s.skillRunSvc = svc
	return s
}

// WithSkillExecutor wires the skill executor into the handler server (optional).
// Required for the Apply Calibration button to call adapt-strategy via the executor.
func (s *Server) WithSkillExecutor(exec *skillexec.Executor) *Server {
	s.skillExecutor = exec
	s.rebuildPostCommitPipeline()
	return s
}

// WithSchema wires the schema service into the handler server (optional).
// When set, the post-commit pipeline runs schema validation warnings.
func (s *Server) WithSchema(svc *schemadom.Service) *Server {
	s.schemaSvc = svc
	s.rebuildPostCommitPipeline()
	return s
}

// WithLLMEnabled records whether an LLM provider is wired to the server.
// This is used to show the correct mode badge in the run panel UI.
func (s *Server) WithLLMEnabled(enabled bool) *Server {
	s.llmEnabled = enabled
	return s
}

func (s *Server) WithEvidence(svc *evidencedom.Service) *Server {
	s.evidenceSvc = svc
	return s
}

// rebuildPostCommitPipeline reconstructs the PostCommitPipeline from the
// current set of wired services. Called by each With* method that the pipeline
// depends on, so callers don't need to worry about order.
func (s *Server) rebuildPostCommitPipeline() {
	if s.rippleSvc == nil || s.strategySvc == nil {
		s.postCommitPipeline = nil
		return
	}
	s.postCommitPipeline = &PostCommitPipeline{
		RippleSvc:   s.rippleSvc,
		SemanticSvc: s.semanticSvc,
		StrategySvc: s.strategySvc,
		VersionSvc:  s.versionSvc,
		SkillExec:   s.skillExecutor,
		SchemaSvc:   s.schemaSvc,
		DB:          s.db,
	}
}

// handlerEntry maps a screen to its GET handler.
type handlerEntry struct {
	GET echo.HandlerFunc
}

// buildHandlerRegistry returns a map of ScreenID → handler functions
// for all screens that have implemented web handlers.
func (s *Server) buildHandlerRegistry() map[navigation.ScreenID]handlerEntry {
	return map[navigation.ScreenID]handlerEntry{
		// Root
		navigation.GlobalDashboard: {GET: s.handleDashboard},
		navigation.Settings:        {GET: s.handleSettings},

		// Execution
		navigation.ExecutionDashboard: {GET: s.handleExecutionDashboard},
		navigation.ActivityOverview:   {GET: s.handleActivityOverview},
		navigation.SkillRuns:          {GET: s.handleSkillRuns},
		navigation.SkillRunDetail:     {GET: s.handleSkillRunDetail},

		// READY
		navigation.ReadyOverview:      {GET: s.handleReadyOverview},
		navigation.NorthStar:          {GET: s.handleArtifactViewByType("north_star")},
		navigation.InsightAnalyses:    {GET: s.handleArtifactViewByType("insight_analyses")},
		navigation.StrategyFoundation: {GET: s.handleArtifactViewByType("strategy_foundations")},
		navigation.InsightOpportunity: {GET: s.handleArtifactViewByType("insight_opportunity")},
		navigation.StrategyFormula:    {GET: s.handleArtifactViewByType("strategy_formula")},
		navigation.RoadmapRecipe:      {GET: s.handleArtifactViewByType("roadmap_recipe")},
		navigation.ProductPortfolio:   {GET: s.handleArtifactViewByType("product_portfolio")},

		// FIRE
		navigation.FireOverview:     {GET: s.handleFireOverview},
		navigation.StrategyTrack:    {GET: s.handleTrackDashboard("strategy")},
		navigation.OrgOpsTrack:      {GET: s.handleTrackDashboard("org_ops")},
		navigation.ProductTrack:     {GET: s.handleTrackDashboard("product")},
		navigation.CommercialTrack:  {GET: s.handleTrackDashboard("commercial")},
		navigation.FeatureDetail:    {GET: s.handleArtifactView},
		navigation.ValueModelDetail: {GET: s.handleArtifactView},
		navigation.DefinitionDetail: {GET: s.handleArtifactView},

		// AIM
		navigation.AimOverview:      {GET: s.handleAimOverview},
		navigation.LRA:              {GET: s.handleArtifactViewByType("living_reality_assessment")},
		navigation.AssessmentReport: {GET: s.handleArtifactViewByType("assessment_report")},
		navigation.Calibration:      {GET: s.handleCalibration},
		navigation.Assumptions:      {GET: s.handleAssumptions},
		navigation.Coherence:        {GET: s.handleCoherence},
		navigation.AimVersions:      {GET: s.handleVersions},
		navigation.AimProposals:     {GET: s.handleAimProposals},
		navigation.AimCycleRuns:     {GET: s.handleListAIMRuns},
		navigation.AimEvidence:      {GET: s.handleEvidencePage},
	}
}

// RegisterRoutes registers all web UI routes on the given Echo instance.
// Routes are derived from the navigation graph. Screens with handlers get
// real handlers; screens without get auto-generated placeholder pages.
func (s *Server) RegisterRoutes(e *echo.Echo) {
	handlers := s.buildHandlerRegistry()

	for _, screen := range navGraph.Screens {
		if !screen.WebRoute {
			continue
		}

		entry, hasHandler := handlers[screen.ID]

		if screen.InstanceScoped {
			pattern := "/strategies/:id" + screen.URLPattern
			if hasHandler {
				e.GET(pattern, entry.GET)
			} else {
				e.GET(pattern, s.handlePlaceholderFromGraph(screen))
			}
		} else {
			if hasHandler {
				e.GET(screen.URLPattern, entry.GET)
			}
		}
	}

	// Settings page — registered via the nav graph loop (Settings screen).
	// The POST endpoints for sync and import are registered separately.
	e.POST("/settings/sync", s.handleSettingsSync)
	e.POST("/settings/import", s.handleSettingsImport)
	e.POST("/settings/lang", s.handleSetLang)
	e.POST("/strategies/:id/move", s.handleMoveInstance)
	e.POST("/strategies/:id/delete", s.handleDeleteInstance)

	// GitHub connect flow — repo discovery and instance linking.
	e.GET("/github/connect", s.handleGithubConnect)
	e.GET("/github/connect/repos", s.handleGithubConnectRepos)
	e.GET("/github/connect/authorize", s.handleGithubConnectAuthorize)
	e.GET("/github/connect/callback", s.handleGithubConnectCallback)
	e.POST("/github/connect/scan", s.handleGithubConnectScan)
	e.POST("/github/connect/import", s.handleGithubImportNew)

	// Signal action endpoints — HTMX POST, return the updated card fragment.
	e.POST("/strategies/:id/aim/coherence/signals/:signalID/acknowledge", s.handleSignalAcknowledge)
	e.POST("/strategies/:id/aim/coherence/signals/:signalID/dismiss", s.handleSignalDismiss)
	e.POST("/strategies/:id/aim/coherence/signals/:signalID/resolve", s.handleSignalResolve)

	// Version detail + restore — not in nav graph (detail screen, sub-nav hidden).
	e.GET("/strategies/:id/aim/versions/:versionID", s.handleVersionDetail)
	e.POST("/strategies/:id/aim/versions/:versionID/restore", s.handleVersionRestore)

	// Evidence endpoints — evidence collection and management.
	// Note: GET /strategies/:id/aim/evidence is already registered via the nav graph loop.
	e.GET("/strategies/:id/aim/evidence/interview", s.handleEvidenceInterviewPage)
	e.POST("/strategies/:id/evidence/ingest", s.handleIngestEvidence)
	e.POST("/strategies/:id/evidence/interview", s.handleSubmitInterview)

	// READY bootstrap draft actions — POST /strategies/:id/ready/draft-:key
	e.POST("/strategies/:id/ready/draft-:key", s.handleReadyDraft)

	// FIRE canonical definitions — POST /strategies/:id/fire/install-definitions
	e.POST("/strategies/:id/fire/install-definitions", s.handleInstallDefinitions)

	// AIM agent endpoints — AI-assisted draft generation and review.
	e.POST("/strategies/:id/aim/publish", s.handlePublishVersion)
	e.POST("/strategies/:id/aim/draft-lra", s.handleDraftLRA)
	e.POST("/strategies/:id/aim/draft-assessment", s.handleDraftAssessment)
	e.POST("/strategies/:id/aim/draft-calibration", s.handleDraftCalibration)
	e.POST("/strategies/:id/aim/apply-calibration", s.handleApplyCalibration)
	e.GET("/strategies/:id/aim/draft-review/:batchID", s.handleDraftReview)
	e.POST("/strategies/:id/aim/draft-review/:batchID/commit", s.handleDraftCommit)
	e.POST("/strategies/:id/aim/draft-review/:batchID/discard", s.handleDraftDiscard)

	// Orchestration endpoints — orchestrated AIM cycle with SSE progress streaming.
	e.POST("/strategies/:id/aim/runs", s.handleStartAIMRun)
	e.GET("/strategies/:id/aim/runs/:runID", s.handleGetAIMRun)
	e.GET("/strategies/:id/aim/runs/:runID/stream", s.handleAIMRunStream)
	e.POST("/strategies/:id/aim/runs/:runID/abort", s.handleAbortAIMRun)
	e.POST("/strategies/:id/aim/runs/:runID/retry", s.handleRetryAIMRun)

	// Proposal action endpoints — HTMX POST, return the updated card fragment.
	e.POST("/strategies/:id/aim/proposals/:proposalID/approve", s.handleProposalApprove)
	e.POST("/strategies/:id/aim/proposals/:proposalID/defer", s.handleProposalDefer)
	e.POST("/strategies/:id/aim/proposals/:proposalID/dismiss", s.handleProposalDismiss)

	// Activity stream SSE — pushes JSON-encoded activity events to browser clients.
	// Clients connect with EventSource: new EventSource("/strategies/:id/activity/stream")
	e.GET("/strategies/:id/activity/stream", s.handleActivityStream)

	// Cascade tracker partial — HTMX-compatible fragment for the live cascade panel.
	e.GET("/strategies/:id/cascade", s.handleGetCascade)
}

// sidebarGroups builds sidebar navigation groups with instance list.
func (s *Server) sidebarGroups(c echo.Context) []layout.SidebarGroup {
	ctx := c.Request().Context()
	currentPath := c.Request().URL.Path

	instances, err := s.loadInstanceSummaries(ctx)
	if err != nil {
		s.log.Error("failed to load instances for sidebar", "err", err)
	}

	return ui.BuildSidebarGroups(ctx, currentPath, instances)
}

// strategyTabs builds the strategy tabs, setting the active tab based on
// the navigation graph's tab resolution.
func (s *Server) strategyTabs(instanceID, currentPath string) []ui.TabProps {
	return s.strategyTabsCtx(context.Background(), instanceID, currentPath)
}

func (s *Server) strategyTabsCtx(ctx context.Context, instanceID, currentPath string) []ui.TabProps {
	activeTab := navGraph.ResolveTabForPath(instanceID, currentPath)
	tabs := navGraph.InstanceTabGroups()

	result := make([]ui.TabProps, 0, len(tabs))
	for _, tab := range tabs {
		meta := navigation.TabDisplay(tab)
		href := "/strategies/" + instanceID + meta.LandingURL
		result = append(result, ui.TabProps{
			Label:    langs.T(ctx, meta.Label),
			Icon:     meta.Icon,
			URL:      href,
			IsActive: tab == activeTab,
		})
	}
	return result
}

// renderInstancePage is the standard render helper for instance-scoped pages.
// It computes tabs and renders using the 3-tier RenderTriple pattern:
//   - Tier 1 (full page): shell + sidebar + chrome + tabs + content
//   - Tier 2 (sidebar swap → #main-content): chrome + tabs + content
//   - Tier 3 (tab/sub-nav swap → #tab-content): tabs + content (re-renders tab bar)
//
// Sub-navigation and breadcrumbs are rendered by each content template.
func (s *Server) renderInstancePage(c echo.Context, pageTitle string, content ui.PhaseRenderData) error {
	instanceID := c.Param("id")
	ctx := c.Request().Context()
	currentPath := c.Request().URL.Path

	instance, err := s.loadInstance(ctx, instanceID)
	if err != nil {
		return echo.NewHTTPError(404, langs.T(ctx, "error.instance_not_found"))
	}

	// Load instance stats for the settings menu and inject into context.
	stats := s.loadInstanceStats(ctx, instance)
	ctx = ui.WithInstanceStats(ctx, stats)
	c.SetRequest(c.Request().WithContext(ctx))

	tabs := s.strategyTabs(instanceID, currentPath)

	render.RenderTriple(c.Response().Writer, c.Request(),
		ui.InstancePhaseFullPage(pageTitle+" — "+instance.Name, currentPath, s.sidebarGroups(c), instance.Name, tabs, content.Content),
		ui.InstanceChromeWithContent(instance.Name, tabs, currentPath, content.Content),
		ui.InstanceTabContent(tabs, currentPath, content.Content),
	)
	return nil
}

// artifactTabGroup returns the tab group for an artifact type.
func artifactTabGroup(artifactType string) string {
	switch artifactType {
	case "north_star", "insight_analyses", "strategy_foundations",
		"insight_opportunity", "strategy_formula", "roadmap_recipe",
		"product_portfolio":
		return "ready"
	case "feature_definition", "feature", "value_model",
		"commercial_def", "strategy_def", "org_ops_def":
		return "fire"
	case "living_reality_assessment", "assessment_report",
		"aim_trigger_config", "calibration_memo", "strategic_reality_check":
		return "aim"
	default:
		return "fire"
	}
}

// artifactScreenID returns the navigation screen ID for an artifact type.
func artifactScreenID(artifactType string) string {
	switch artifactType {
	case "north_star":
		return ui.ScreenNorthStar
	case "insight_analyses":
		return ui.ScreenInsightAnalyses
	case "strategy_foundations":
		return ui.ScreenFoundations
	case "insight_opportunity":
		return ui.ScreenOpportunity
	case "strategy_formula":
		return ui.ScreenFormula
	case "roadmap_recipe":
		return ui.ScreenRoadmap
	case "product_portfolio":
		return ui.ScreenPortfolio
	case "feature_definition", "feature":
		return ui.ScreenFeatureDetail
	case "value_model":
		return ui.ScreenValueModelDetail
	case "living_reality_assessment":
		return ui.ScreenLRA
	case "assessment_report":
		return ui.ScreenAssessment
	default:
		return ui.ScreenDefinitionDetail
	}
}

// handlePlaceholderFromGraph returns a handler that renders a placeholder page
// for a screen defined in the graph but not yet implemented.
func (s *Server) handlePlaceholderFromGraph(screen navigation.ScreenDef) echo.HandlerFunc {
	return func(c echo.Context) error {
		instanceID := c.Param("id")
		currentPath := c.Request().URL.Path
		tabs := s.strategyTabs(instanceID, currentPath)

		ctx := c.Request().Context()
		instance, err := s.loadInstance(ctx, instanceID)
		if err != nil {
			return err
		}

		stats := s.loadInstanceStats(ctx, instance)
		ctx = ui.WithInstanceStats(ctx, stats)
		c.SetRequest(c.Request().WithContext(ctx))

		icon := screen.Icon
		if icon == "" {
			icon = "lucide--circle"
		}

		content := ui.PlaceholderContent(screen.Title, "This feature is coming soon.", icon)

		render.RenderTriple(c.Response().Writer, c.Request(),
			ui.InstancePhaseFullPage(screen.Title+" — "+instance.Name, currentPath, s.sidebarGroups(c), instance.Name, tabs, content),
			ui.InstanceChromeWithContent(instance.Name, tabs, currentPath, content),
			ui.InstanceTabContent(tabs, currentPath, content),
		)
		return nil
	}
}
