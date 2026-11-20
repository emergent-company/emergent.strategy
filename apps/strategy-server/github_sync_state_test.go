package main

import (
	"errors"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/config"
	syncdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/sync"
	ghclient "github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/github"
)

func quietLog() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

func TestGitHubSyncNotConfigured_NamesTheMissingSetting(t *testing.T) {
	cases := []struct {
		name string
		cfg  config.Config
		want string
	}{
		{"nothing set", config.Config{}, "GITHUB_APP_ID"},
		{"id without a key", config.Config{GithubAppID: 42}, "GITHUB_APP_PRIVATE_KEY"},
		{"key without an id", config.Config{GithubAppPrivateKey: "pem"}, "GITHUB_APP_ID"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc, got := setupGitHubSync(&tc.cfg, quietLog(), nil, nil, nil, nil)

			if svc != nil || got.State != syncdom.AvailabilityDisabled {
				t.Fatalf("service = %v, state = %q, want no service and disabled", svc, got.State)
			}
			if !strings.Contains(got.Reason, tc.want) || !strings.Contains(got.Reason, "not configured") {
				t.Errorf("reason = %q, want it to say %s is not configured", got.Reason, tc.want)
			}
			if got.CheckedAt.IsZero() {
				t.Error("CheckedAt is zero, want the time the server looked")
			}
		})
	}
}

func TestGitHubSyncKeyFileMissing_SaysSoWithoutTheDirectory(t *testing.T) {
	cfg := &config.Config{GithubAppID: 42, GithubAppPrivateKeyPath: filepath.Join(t.TempDir(), "private-key.pem")}

	svc, got := setupGitHubSync(cfg, quietLog(), nil, nil, nil, nil)

	if svc != nil || got.State != syncdom.AvailabilityDisabled {
		t.Fatalf("service = %v, state = %q, want no service and disabled", svc, got.State)
	}
	if !strings.Contains(got.Reason, "private-key.pem") || !strings.Contains(got.Reason, "no such file") {
		t.Errorf("reason = %q, want the key file name and why it failed", got.Reason)
	}
	if strings.Contains(got.Reason, os.TempDir()) {
		t.Errorf("reason = %q leaks the directory the key was looked for in; any MCP client can read this", got.Reason)
	}
}

func TestGitHubSyncKeyNotAKey_SaysSo(t *testing.T) {
	path := filepath.Join(t.TempDir(), "k.pem")
	if err := os.WriteFile(path, []byte("not a pem"), 0o600); err != nil {
		t.Fatal(err)
	}

	svc, got := setupGitHubSync(&config.Config{GithubAppID: 42, GithubAppPrivateKeyPath: path}, quietLog(), nil, nil, nil, nil)

	if svc != nil || got.State != syncdom.AvailabilityDisabled || !strings.Contains(got.Reason, "private key") {
		t.Errorf("service = %v, availability = %+v, want disabled with a reason about the private key", svc, got)
	}
}

func TestGitHubSyncAvailabilityFromProbe(t *testing.T) {
	full := &ghclient.AppCapability{Slug: "app", Permissions: map[string]string{"contents": "write", "pull_requests": "write"}}
	noWrite := &ghclient.AppCapability{Slug: "app", Permissions: map[string]string{"contents": "read"}}

	t.Run("verified with the needed permissions", func(t *testing.T) {
		got := availabilityFromProbe(full, nil)
		if got.State != syncdom.AvailabilityEnabled || got.Reason != "" {
			t.Errorf("got %+v, want enabled with no reason", got)
		}
	})
	t.Run("missing permissions", func(t *testing.T) {
		got := availabilityFromProbe(noWrite, nil)
		if got.State != syncdom.AvailabilityDegraded ||
			!strings.Contains(got.Reason, "contents:write") || !strings.Contains(got.Reason, "pull_requests:write") {
			t.Errorf("got %+v, want degraded naming both missing permissions", got)
		}
	})
	t.Run("could not verify", func(t *testing.T) {
		got := availabilityFromProbe(nil, errors.New("dial tcp: i/o timeout"))
		if got.State != syncdom.AvailabilityDegraded || !strings.Contains(got.Reason, "i/o timeout") {
			t.Errorf("got %+v, want degraded with the probe error", got)
		}
	})
}
