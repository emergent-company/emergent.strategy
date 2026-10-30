package memory

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"testing"
)

func TestVersionAtLeast(t *testing.T) {
	cases := []struct {
		have, min string
		want, ok  bool
	}{
		{"v0.87.4", "v0.85.0", true, true},
		{"v0.85.0", "v0.85.0", true, true},
		{"0.85.0", "v0.85.0", true, true},
		{"v0.84.9", "v0.85.0", false, true},
		{"v0.35.74", "v0.85.0", false, true},
		{"v1.0.0", "v0.85.0", true, true},
		{"v0.100.0", "v0.85.0", true, true},
		{"v0.88.1-rc1", "v0.85.0", true, true},
		{"v0.88.1+build5", "v0.85.0", true, true},
		{"", "v0.85.0", false, false},
		{"dev", "v0.85.0", false, false},
		{"v0.x.1", "v0.85.0", false, false},
	}
	for _, c := range cases {
		got, ok := VersionAtLeast(c.have, c.min)
		if got != c.want || ok != c.ok {
			t.Errorf("VersionAtLeast(%q, %q) = %v, %v; want %v, %v", c.have, c.min, got, ok, c.want, c.ok)
		}
	}
}

type captureHandler struct{ records []slog.Record }

func (h *captureHandler) Enabled(context.Context, slog.Level) bool { return true }
func (h *captureHandler) Handle(_ context.Context, r slog.Record) error {
	h.records = append(h.records, r)
	return nil
}
func (h *captureHandler) WithAttrs([]slog.Attr) slog.Handler { return h }
func (h *captureHandler) WithGroup(string) slog.Handler      { return h }

func checkWith(t *testing.T, healthBody string, status int) []slog.Record {
	t.Helper()
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(status)
		_, _ = w.Write([]byte(healthBody))
	}))
	h := &captureHandler{}
	c.CheckVersion(context.Background(), slog.New(h))
	return h.records
}

func TestCheckVersion_LogsTheVersionAndWarnsBelowTheMinimum(t *testing.T) {
	recs := checkWith(t, `{"version":"v0.84.0","timestamp":"2026-01-01T00:00:00Z","uptime":"1s"}`, 200)
	if len(recs) != 1 || recs[0].Level != slog.LevelWarn {
		t.Fatalf("records = %v, want one warning", recs)
	}
	if !strings.Contains(recs[0].Message, MinMemoryVersion) {
		t.Errorf("warning does not name the minimum %s: %q", MinMemoryVersion, recs[0].Message)
	}
	found := false
	recs[0].Attrs(func(a slog.Attr) bool {
		if a.Key == "version" && a.Value.String() == "v0.84.0" {
			found = true
		}
		return true
	})
	if !found {
		t.Error("warning does not carry the version it found")
	}
}

func TestCheckVersion_SupportedVersionIsOnlyInformational(t *testing.T) {
	recs := checkWith(t, `{"version":"v0.87.4","timestamp":"2026-01-01T00:00:00Z","uptime":"1s"}`, 200)
	if len(recs) != 1 || recs[0].Level != slog.LevelInfo {
		t.Fatalf("records = %v, want one info line", recs)
	}
}

func TestCheckVersion_UnknownOrUnreachableMemoryWarnsAndNeverPanics(t *testing.T) {
	for name, body := range map[string]string{"no version field": `{"timestamp":"2026-01-01T00:00:00Z","uptime":"1s"}`, "unparseable": `{"version":"dev"}`} {
		recs := checkWith(t, body, 200)
		if len(recs) != 1 || recs[0].Level != slog.LevelWarn {
			t.Errorf("%s: records = %v, want one warning", name, recs)
		}
	}
	recs := checkWith(t, `boom`, 500)
	if len(recs) != 1 || recs[0].Level != slog.LevelWarn {
		t.Errorf("unreachable: records = %v, want one warning", recs)
	}
}
