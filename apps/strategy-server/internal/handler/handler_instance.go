package handler

import (
	"github.com/emergent-company/go-daisy/render"
	"github.com/labstack/echo/v4"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/langs"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

func (s *Server) handleReadyOverview(c echo.Context) error {
	return s.renderPhaseContent(c, func(instanceID string, c echo.Context) ui.PhaseRenderData {
		ctx := c.Request().Context()
		data := s.loadReadyPhaseData(ctx, instanceID)
		return ui.PhaseRenderData{
			Title:   langs.T(ctx, "nav.screen.ready"),
			Content: ui.ReadyPhaseContent(data),
		}
	})
}

func (s *Server) handleFireOverview(c echo.Context) error {
	return s.renderPhaseContent(c, func(instanceID string, c echo.Context) ui.PhaseRenderData {
		ctx := c.Request().Context()
		data := s.loadFirePhaseData(ctx, instanceID)
		return ui.PhaseRenderData{
			Title:   langs.T(ctx, "nav.screen.fire"),
			Content: ui.FirePhaseContent(data),
		}
	})
}

func (s *Server) handleAimOverview(c echo.Context) error {
	return s.renderPhaseContent(c, func(instanceID string, c echo.Context) ui.PhaseRenderData {
		ctx := c.Request().Context()
		data := s.loadAimPipelineData(ctx, instanceID)
		return ui.PhaseRenderData{
			Title:   langs.T(ctx, "nav.screen.aim"),
			Content: ui.AimPipelineContent(data),
		}
	})
}

// renderPhaseContent handles the 3-tier rendering for phase pages.
func (s *Server) renderPhaseContent(c echo.Context, loadFn func(string, echo.Context) ui.PhaseRenderData) error {
	instanceID := c.Param("id")
	ctx := c.Request().Context()
	currentPath := c.Request().URL.Path

	instance, err := s.loadInstance(ctx, instanceID)
	if err != nil {
		return echo.NewHTTPError(404, langs.T(ctx, "error.instance_not_found"))
	}

	stats := s.loadInstanceStats(ctx, instance)
	ctx = ui.WithInstanceStats(ctx, stats)
	c.SetRequest(c.Request().WithContext(ctx))

	phaseData := loadFn(instanceID, c)
	tabs := s.strategyTabs(ctx, instanceID, currentPath)
	sidebarGroups := s.sidebarGroups(c)

	render.RenderTriple(c.Response().Writer, c.Request(),
		// Full page: shell + chrome + content
		ui.InstancePhaseFullPage(phaseData.Title+" — "+instance.Name, currentPath, sidebarGroups, instance.Name, tabs, phaseData.Content),
		// Sidebar nav swap: chrome + content
		ui.InstanceChromeWithContent(instance.Name, tabs, currentPath, phaseData.Content),
		// Tab/sub-nav swap: tabs + content (re-renders tab bar)
		ui.InstanceTabContent(tabs, currentPath, phaseData.Content),
	)
	return nil
}
