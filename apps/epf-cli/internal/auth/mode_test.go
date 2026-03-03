package auth

import (
	"testing"
)

func TestServerMode_String(t *testing.T) {
	tests := []struct {
		mode ServerMode
		want string
	}{
		{ModeLocal, "local"},
		{ModeSingleTenant, "single-tenant"},
		{ModeMultiTenant, "multi-tenant"},
		{ServerMode(99), "unknown"},
	}

	for _, tt := range tests {
		got := tt.mode.String()
		if got != tt.want {
			t.Errorf("ServerMode(%d).String() = %q, want %q", tt.mode, got, tt.want)
		}
	}
}

func TestDetectMode_Local(t *testing.T) {
	// Clear all relevant env vars.
	t.Setenv(EnvOAuthClientID, "")
	t.Setenv("EPF_GITHUB_OWNER", "")
	t.Setenv("EPF_GITHUB_REPO", "")

	got := DetectMode()
	if got != ModeLocal {
		t.Errorf("DetectMode() = %v, want ModeLocal", got)
	}
}

func TestDetectMode_SingleTenant(t *testing.T) {
	t.Setenv(EnvOAuthClientID, "")
	t.Setenv("EPF_GITHUB_OWNER", "my-org")
	t.Setenv("EPF_GITHUB_REPO", "my-repo")

	got := DetectMode()
	if got != ModeSingleTenant {
		t.Errorf("DetectMode() = %v, want ModeSingleTenant", got)
	}
}

func TestDetectMode_SingleTenant_MissingRepo(t *testing.T) {
	// Only OWNER set, not REPO — falls back to local.
	t.Setenv(EnvOAuthClientID, "")
	t.Setenv("EPF_GITHUB_OWNER", "my-org")
	t.Setenv("EPF_GITHUB_REPO", "")

	got := DetectMode()
	if got != ModeLocal {
		t.Errorf("DetectMode() = %v, want ModeLocal (owner without repo)", got)
	}
}

func TestDetectMode_SingleTenant_MissingOwner(t *testing.T) {
	// Only REPO set, not OWNER — falls back to local.
	t.Setenv(EnvOAuthClientID, "")
	t.Setenv("EPF_GITHUB_OWNER", "")
	t.Setenv("EPF_GITHUB_REPO", "my-repo")

	got := DetectMode()
	if got != ModeLocal {
		t.Errorf("DetectMode() = %v, want ModeLocal (repo without owner)", got)
	}
}

func TestDetectMode_MultiTenant(t *testing.T) {
	t.Setenv(EnvOAuthClientID, "my-client-id")
	t.Setenv("EPF_GITHUB_OWNER", "")
	t.Setenv("EPF_GITHUB_REPO", "")

	got := DetectMode()
	if got != ModeMultiTenant {
		t.Errorf("DetectMode() = %v, want ModeMultiTenant", got)
	}
}

func TestDetectMode_MultiTenant_TakesPrecedence(t *testing.T) {
	// OAuth takes precedence over single-tenant vars.
	t.Setenv(EnvOAuthClientID, "my-client-id")
	t.Setenv("EPF_GITHUB_OWNER", "my-org")
	t.Setenv("EPF_GITHUB_REPO", "my-repo")

	got := DetectMode()
	if got != ModeMultiTenant {
		t.Errorf("DetectMode() = %v, want ModeMultiTenant (OAuth takes precedence)", got)
	}
}
