package handler

import (
	"github.com/emergent-company/go-daisy/render"
	"github.com/labstack/echo/v4"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

func (s *Server) handleDashboard(c echo.Context) error {
	ctx := c.Request().Context()

	workspaces, err := s.loadWorkspaces(ctx)
	if err != nil {
		s.log.Error("failed to load workspaces", "err", err)
	}

	instances, err := s.loadAllInstances(ctx)
	if err != nil {
		s.log.Error("failed to load instances", "err", err)
	}

	data := ui.GlobalDashboardData{
		Workspaces: workspaces,
		Instances:  instances,
	}

	sidebarGroups := s.sidebarGroups(c)
	currentPath := c.Request().URL.Path

	render.RenderAuto(c.Response().Writer, c.Request(),
		ui.GlobalDashboardPage(currentPath, sidebarGroups, data),
		ui.GlobalDashboardContent(data),
	)
	return nil
}
