package handler

import (
	"github.com/emergent-company/go-daisy/render"
	"github.com/labstack/echo/v4"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

func (s *Server) handleReadyOverview(c echo.Context) error {
	return s.renderPhaseContent(c, func(instanceID string, c echo.Context) ui.PhaseRenderData {
		data := s.loadReadyPhaseData(c.Request().Context(), instanceID)
		return ui.PhaseRenderData{
			Title:   "READY",
			Content: ui.ReadyPhaseContent(data),
		}
	})
}

func (s *Server) handleFireOverview(c echo.Context) error {
	return s.renderPhaseContent(c, func(instanceID string, c echo.Context) ui.PhaseRenderData {
		data := s.loadFirePhaseData(c.Request().Context(), instanceID)
		return ui.PhaseRenderData{
			Title:   "FIRE",
			Content: ui.FirePhaseContent(data),
		}
	})
}

func (s *Server) handleAimOverview(c echo.Context) error {
	return s.renderPhaseContent(c, func(instanceID string, c echo.Context) ui.PhaseRenderData {
		data := s.loadAimPhaseData(c.Request().Context(), instanceID)
		return ui.PhaseRenderData{
			Title:   "AIM",
			Content: ui.AimPhaseContent(data),
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
		return echo.NewHTTPError(404, "Instance not found")
	}

	phaseData := loadFn(instanceID, c)
	tabs := s.strategyTabs(instanceID, currentPath)
	sidebarGroups := s.sidebarGroups(c)

	render.RenderTriple(c.Response().Writer, c.Request(),
		// Full page: shell + chrome + content
		ui.InstancePhaseFullPage(phaseData.Title+" — "+instance.Name, currentPath, sidebarGroups, instance.Name, tabs, phaseData.Content),
		// Sidebar nav swap: chrome + content
		ui.InstanceChromeWithContent(instance.Name, tabs, currentPath, phaseData.Content),
		// Tab swap: content only
		phaseData.Content,
	)
	return nil
}
