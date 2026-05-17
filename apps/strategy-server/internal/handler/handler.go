// Package handler contains the web HTTP handlers for the strategy-server UI.
// Handlers are thin adapters: they load data from domain services and render
// templ components. No business logic lives here.
package handler

import (
	"log/slog"
	"strings"

	"github.com/emergent-company/go-daisy/components/layout"
	"github.com/emergent-company/go-daisy/render"
	"github.com/labstack/echo/v4"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/navigation"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// Server holds dependencies for web handlers.
type Server struct {
	db  *bun.DB
	log *slog.Logger
}

// New creates a new web handler Server.
func New(db *bun.DB, log *slog.Logger) *Server {
	return &Server{
		db:  db,
		log: log,
	}
}

// RegisterRoutes registers all web UI routes on the given Echo instance.
func (s *Server) RegisterRoutes(e *echo.Echo) {
	// Root pages
	e.GET("/", s.handleDashboard)

	// Strategy-scoped pages (using /strategies/:id)
	e.GET("/strategies/:id", s.handleExecutionDashboard) // default: execution view
	e.GET("/strategies/:id/ready", s.handleReadyOverview)
	e.GET("/strategies/:id/ready/north-star", s.handleArtifactViewByType("north_star"))
	e.GET("/strategies/:id/ready/foundations", s.handleArtifactViewByType("strategy_foundations"))
	e.GET("/strategies/:id/ready/insights", s.handleArtifactViewByType("insight_analyses"))
	e.GET("/strategies/:id/ready/formula", s.handleArtifactViewByType("strategy_formula"))
	e.GET("/strategies/:id/ready/roadmap", s.handleArtifactViewByType("roadmap_recipe"))

	e.GET("/strategies/:id/fire", s.handleFireOverview)
	e.GET("/strategies/:id/fire/product", s.handlePlaceholder("Product Track", "Product features and definitions.", "lucide--code-2"))
	e.GET("/strategies/:id/fire/commercial", s.handlePlaceholder("Commercial Track", "Commercial definitions and pricing.", "lucide--briefcase"))
	e.GET("/strategies/:id/fire/strategy", s.handlePlaceholder("Strategy Track", "Strategic definitions and positioning.", "lucide--navigation"))
	e.GET("/strategies/:id/fire/org-ops", s.handlePlaceholder("Org & Ops Track", "Organisational and operational definitions.", "lucide--container"))

	e.GET("/strategies/:id/aim", s.handleAimOverview)
	e.GET("/strategies/:id/aim/assumptions", s.handlePlaceholder("Assumptions", "Track and test your strategic assumptions.", "lucide--flask-conical"))
	e.GET("/strategies/:id/aim/lra", s.handleArtifactViewByType("living_reality_assessment"))
	e.GET("/strategies/:id/aim/assessment", s.handleArtifactViewByType("assessment_report"))
	e.GET("/strategies/:id/aim/calibration", s.handlePlaceholder("Calibration", "Monitor and calibrate your strategy execution.", "lucide--sliders-horizontal"))
	e.GET("/strategies/:id/aim/coherence", s.handlePlaceholder("Coherence Status", "View the coherence engine signals and equilibrium.", "lucide--shield-check"))

	// Artifact viewer (any artifact by key)
	e.GET("/strategies/:id/artifacts/:key", s.handleArtifactView)
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

// strategyTabs builds the strategy tabs, setting the active tab.
func (s *Server) strategyTabs(instanceID, currentPath string) []ui.TabProps {
	navTabs := navigation.StrategyTabs(instanceID)
	tabs := make([]ui.TabProps, len(navTabs))
	for i, t := range navTabs {
		isActive := currentPath == t.URL || (t.URL != "/strategies/"+instanceID && strings.HasPrefix(currentPath, t.URL))
		tabs[i] = ui.TabProps{
			Label:    t.Label,
			Icon:     t.Icon,
			URL:      t.URL,
			IsActive: isActive,
		}
	}
	return tabs
}

// handlePlaceholder returns a handler that renders a placeholder page.
func (s *Server) handlePlaceholder(title, description, icon string) echo.HandlerFunc {
	return func(c echo.Context) error {
		instanceID := c.Param("id")
		currentPath := c.Request().URL.Path
		tabs := s.strategyTabs(instanceID, currentPath)

		instance, err := s.loadInstance(c.Request().Context(), instanceID)
		if err != nil {
			return err
		}

		content := ui.PlaceholderContent(title, description, icon)

		render.RenderTriple(c.Response().Writer, c.Request(),
			ui.InstancePhaseFullPage(title+" — "+instance.Name, currentPath, s.sidebarGroups(c), instance.Name, tabs, content),
			ui.InstanceChromeWithContent(instance.Name, tabs, currentPath, content),
			content,
		)
		return nil
	}
}
