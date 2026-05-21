package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
)

// handleActivityStream opens an SSE connection and streams activity events for
// a strategy instance. Clients connect with:
//
//	new EventSource("/strategies/:id/activity/stream")
//
// Each event is sent as:
//
//	event: activity
//	data: <JSON-encoded activity.Activity object>
//
// The stream stays open until the client disconnects or the server shuts down.
// A keepalive comment (": keepalive") is sent every 30 seconds to prevent
// proxy/CDN timeouts.
func (s *Server) handleActivityStream(c echo.Context) error {
	if s.activitySvc == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "activity stream not configured")
	}

	instanceIDStr := c.Param("id")
	instanceID, err := uuid.Parse(instanceIDStr)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid instance ID")
	}

	ctx := c.Request().Context()
	w := c.Response().Writer

	// Set SSE headers.
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // disable nginx buffering
	c.Response().WriteHeader(http.StatusOK)

	flush := func() {
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
	}

	// Initial keepalive so the browser knows the connection is open.
	_, _ = fmt.Fprintf(w, ": keepalive\n\n")
	flush()

	// Subscribe to the in-process fanout.
	ch := s.activitySvc.Subscribe(instanceID)
	defer s.activitySvc.Unsubscribe(instanceID, ch)

	keepalive := time.NewTicker(30 * time.Second)
	defer keepalive.Stop()

	for {
		select {
		case ev, ok := <-ch:
			if !ok {
				// Channel closed — unsubscribed.
				return nil
			}
			raw, err := json.Marshal(ev)
			if err != nil {
				continue
			}
			_, _ = fmt.Fprintf(w, "event: activity\ndata: %s\n\n", raw)
			flush()

		case <-keepalive.C:
			_, _ = fmt.Fprintf(w, ": keepalive\n\n")
			flush()

		case <-ctx.Done():
			return nil
		}
	}
}
