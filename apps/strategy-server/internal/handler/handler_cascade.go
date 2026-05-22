package handler

import (
	"bytes"
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// handleGetCascade returns the cascade tracker panel as an HTMX partial.
// GET /strategies/:id/cascade
//
// The panel is polled by the InstanceChrome SSE handler after skill activity
// events and returned as raw HTML for direct inner-HTML swap.
func (s *Server) handleGetCascade(c echo.Context) error {
	instanceID := c.Param("id")
	ctx := c.Request().Context()

	data := s.loadCascadeData(ctx, instanceID)

	var buf bytes.Buffer
	if err := ui.CascadeTrackerPanel(data).Render(ctx, &buf); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "render cascade panel")
	}

	c.Response().Header().Set("Content-Type", "text/html; charset=utf-8")
	return c.String(http.StatusOK, buf.String())
}
