package handler

import (
	"context"
	"log/slog"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/semantic"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory/memtest"
)

// 3.7: the settings page shows per-instance counts from the instance row. The
// Memory project is shared by every instance, so the page must not ask it for a
// project-wide object count, which would show other instances' data.
func TestProbeMemoryHealth_NeverCountsObjectsProjectWide(t *testing.T) {
	mem := memtest.New(t)
	mem.Version = "v0.87.4"
	svc := semantic.NewService(semantic.Config{URL: mem.URL, Project: "p", Token: "t"})
	s := New(nil, slog.Default(), svc)

	got := s.probeMemoryHealth(context.Background())
	if !got.Configured || !got.Healthy || got.Version != "v0.87.4" {
		t.Fatalf("status = %+v, want a healthy, configured Memory at v0.87.4", got)
	}
	for _, r := range mem.Requests() {
		if r.Path != "/health" {
			t.Errorf("the settings page called Memory with %s %s?%s; it must only check health", r.Method, r.Path, r.Query)
		}
	}
}
