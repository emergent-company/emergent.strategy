// Package handler contains the web HTTP handlers for the strategy-server UI.
// Handlers are thin adapters: they load data from domain services and render
// templ components. No business logic lives here.
package handler

import (
	"log/slog"

	"github.com/emergent-company/go-daisy/components/layout"
	"github.com/emergent-company/go-daisy/render"
	"github.com/labstack/echo/v4"
	"github.com/uptrace/bun"

	aimdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/aim"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ripple"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/semantic"
	strategydom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	syncdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/sync"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/version"
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
	strategySvc         *strategydom.Service   // required for index derivation on batch commit
	versionSvc          *version.Service
	syncSvc             *syncdom.Service       // nil when GitHub App not configured
	aimSvc              *aimdom.Service        // nil when AIM service not configured
	orchestrationEngine *orchestration.Engine  // nil when orchestration not configured
	llmEnabled          bool                   // true when an LLM provider is wired
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
	return s
}

// WithStrategy wires the strategy service into the handler server.
// Required for proper strategic index derivation when committing batches via the web UI.
func (s *Server) WithStrategy(svc *strategydom.Service) *Server {
	s.strategySvc = svc
	return s
}

// WithVersion wires the version service into the handler server.
func (s *Server) WithVersion(svc *version.Service) *Server {
	s.versionSvc = svc
	return s
}

// WithSync wires the sync service into the handler server (optional).
func (s *Server) WithSync(svc *syncdom.Service) *Server {
	s.syncSvc = svc
	return s
}

// WithAIM wires the AIM service into the handler server (optional).
func (s *Server) WithAIM(svc *aimdom.Service) *Server {
	s.aimSvc = svc
	return s
}

// WithOrchestration wires the orchestration engine into the handler server (optional).
func (s *Server) WithOrchestration(eng *orchestration.Engine) *Server {
	s.orchestrationEngine = eng
	return s
}

// WithLLMEnabled records whether an LLM provider is wired to the server.
// This is used to show the correct mode badge in the run panel UI.
func (s *Server) WithLLMEnabled(enabled bool) *Server {
	s.llmEnabled = enabled
	return s
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

		// Execution
		navigation.ExecutionDashboard: {GET: s.handleExecutionDashboard},

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

	// Settings page — not in the navigation graph, registered separately.
	e.GET("/settings", s.handleSettings)
	e.POST("/settings/sync", s.handleSettingsSync)

	// Signal action endpoints — HTMX POST, return the updated card fragment.
	e.POST("/strategies/:id/aim/coherence/signals/:signalID/acknowledge", s.handleSignalAcknowledge)
	e.POST("/strategies/:id/aim/coherence/signals/:signalID/dismiss", s.handleSignalDismiss)
	e.POST("/strategies/:id/aim/coherence/signals/:signalID/resolve", s.handleSignalResolve)

	// Version detail + restore — not in nav graph (detail screen, sub-nav hidden).
	e.GET("/strategies/:id/aim/versions/:versionID", s.handleVersionDetail)
	e.POST("/strategies/:id/aim/versions/:versionID/restore", s.handleVersionRestore)

	// AIM agent endpoints — AI-assisted draft generation and review.
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
}

// sidebarGroups builds sidebar navigation groups with instance list.
func (s *Server) sidebarGroups(c echo.Context) []layout.SidebarGroup {
	currentPath := c.Request().URL.Path

	instances, err := s.loadInstanceSummaries(c.Request().Context())
	if err != nil {
		s.log.Error("failed to load instances for sidebar", "err", err)
	}

	return ui.BuildSidebarGroups(currentPath, instances)
}

// strategyTabs builds the strategy tabs, setting the active tab based on
// the navigation graph's tab resolution.
func (s *Server) strategyTabs(instanceID, currentPath string) []ui.TabProps {
	activeTab := navGraph.ResolveTabForPath(instanceID, currentPath)
	tabs := navGraph.InstanceTabGroups()

	result := make([]ui.TabProps, 0, len(tabs))
	for _, tab := range tabs {
		meta := navigation.TabDisplay(tab)
		href := "/strategies/" + instanceID + meta.LandingURL
		result = append(result, ui.TabProps{
			Label:    meta.Label,
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
		return echo.NewHTTPError(404, "Instance not found")
	}

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

		instance, err := s.loadInstance(c.Request().Context(), instanceID)
		if err != nil {
			return err
		}

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
