package config_test

import (
	"os"
	"strings"
	"testing"

	"github.com/alexflint/go-arg"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/config"
)

// parseWithEnv parses the config under a controlled environment.
//
// Deliberately goes through go-arg rather than building a Config literal.
// The zero value has Env == "", which is neither "development" nor
// "production", so a literal would exercise a state the running server never
// reaches and would miss the struct-tag defaults entirely — the trap recorded
// in config_gate_test.go.
func parseWithEnv(t *testing.T, env map[string]string) config.Config {
	t.Helper()

	// Clear everything the guard reads, so a developer's own .env.local or
	// shell cannot change the result of these tests.
	for _, key := range []string{
		"ENV", "AUTH_ENABLED", "ZITADEL_DEBUG_TOKEN",
		"ZITADEL_ISSUER", "ZITADEL_CLIENT_ID",
	} {
		t.Setenv(key, "")
		if err := os.Unsetenv(key); err != nil {
			t.Fatalf("unset %s: %v", key, err)
		}
	}
	for k, v := range env {
		t.Setenv(k, v)
	}

	saved := os.Args
	t.Cleanup(func() { os.Args = saved })
	os.Args = []string{"strategy-server"}

	var cfg config.Config
	parser, err := arg.NewParser(arg.Config{}, &cfg)
	if err != nil {
		t.Fatalf("new parser: %v", err)
	}
	if err := parser.Parse(nil); err != nil {
		t.Fatalf("parse: %v", err)
	}
	return cfg
}

// prodBase is a production config that passes every guard. Each failure test
// breaks exactly one thing, so a test cannot pass for the wrong reason.
func prodBase() map[string]string {
	return map[string]string{
		"ENV":               "production",
		"AUTH_ENABLED":      "true",
		"ZITADEL_ISSUER":    "https://auth.example.com",
		"ZITADEL_CLIENT_ID": "client-123",
	}
}

func withEnv(base map[string]string, overrides map[string]string) map[string]string {
	out := make(map[string]string, len(base)+len(overrides))
	for k, v := range base {
		out[k] = v
	}
	for k, v := range overrides {
		out[k] = v
	}
	return out
}

// TestValidateProduction_DevelopmentDefaultsBoot is the regression that would
// break every developer, so it comes first.
//
// A plain `strategy-server server` with no environment at all must start.
func TestValidateProduction_DefaultsBoot(t *testing.T) {
	cfg := parseWithEnv(t, nil)

	if cfg.Env != "development" {
		t.Fatalf("default ENV = %q, want development — the guard's premise is wrong", cfg.Env)
	}
	if cfg.AuthEnabled {
		t.Fatal("default AUTH_ENABLED = true; this test no longer covers the dev path")
	}
	if err := cfg.ValidateProduction(); err != nil {
		t.Fatalf("a default development start was refused: %v", err)
	}
}

// TestValidateProduction_DevelopmentIsUnguarded: the checks must not leak into
// development, where a debug token and disabled auth are the point.
func TestValidateProduction_DevelopmentIsUnguarded(t *testing.T) {
	cfg := parseWithEnv(t, map[string]string{
		"ENV":                 "development",
		"AUTH_ENABLED":        "false",
		"ZITADEL_DEBUG_TOKEN": "local-debug",
	})
	if err := cfg.ValidateProduction(); err != nil {
		t.Fatalf("development start refused: %v", err)
	}
}

func TestValidateProduction_RequiresAuth(t *testing.T) {
	cfg := parseWithEnv(t, withEnv(prodBase(), map[string]string{"AUTH_ENABLED": "false"}))

	err := cfg.ValidateProduction()
	if err == nil {
		t.Fatal("production booted with AUTH_ENABLED=false")
	}
	if !strings.Contains(err.Error(), "AUTH_ENABLED") {
		t.Errorf("error does not name the offending setting: %v", err)
	}
}

func TestValidateProduction_ForbidsDebugToken(t *testing.T) {
	cfg := parseWithEnv(t, withEnv(prodBase(), map[string]string{
		"ZITADEL_DEBUG_TOKEN": "a-total-bypass",
	}))

	err := cfg.ValidateProduction()
	if err == nil {
		t.Fatal("production booted with ZITADEL_DEBUG_TOKEN set")
	}
	if !strings.Contains(err.Error(), "ZITADEL_DEBUG_TOKEN") {
		t.Errorf("error does not name the offending setting: %v", err)
	}
	// The message must not echo the token itself — error strings reach logs.
	if strings.Contains(err.Error(), "a-total-bypass") {
		t.Error("the error message leaked the debug token value")
	}
}

func TestValidateProduction_RequiresConfiguredZitadel(t *testing.T) {
	for _, tc := range []struct {
		name     string
		override map[string]string
	}{
		{"no issuer", map[string]string{"ZITADEL_ISSUER": ""}},
		{"no client id", map[string]string{"ZITADEL_CLIENT_ID": ""}},
		{"neither", map[string]string{"ZITADEL_ISSUER": "", "ZITADEL_CLIENT_ID": ""}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			cfg := parseWithEnv(t, withEnv(prodBase(), tc.override))
			err := cfg.ValidateProduction()
			if err == nil {
				t.Fatal("production booted with Zitadel unconfigured")
			}
			if !strings.Contains(err.Error(), "ZITADEL_ISSUER") {
				t.Errorf("error does not say what is missing: %v", err)
			}
		})
	}
}

// TestValidateProduction_FullyConfiguredProductionBoots is the control: the
// guard must be satisfiable, or it is just a refusal to run in production.
func TestValidateProduction_FullyConfiguredProductionBoots(t *testing.T) {
	cfg := parseWithEnv(t, prodBase())
	if err := cfg.ValidateProduction(); err != nil {
		t.Fatalf("a correctly configured production start was refused: %v", err)
	}
}

// TestValidateProduction_UnrecognisedEnvIsRefused covers the failure mode the
// whole guard turns on.
//
// IsDev and IsProduction both use exact equality, so ENV=prod is neither. If
// an unrecognised value fell through to "not production", a single typo in a
// deployment variable would silently disable every check above — the most
// likely way this guard gets defeated in practice.
func TestValidateProduction_UnrecognisedEnvIsRefused(t *testing.T) {
	for _, env := range []string{"prod", "Production", "PRODUCTION", "staging", "dev", ""} {
		t.Run("ENV="+env, func(t *testing.T) {
			cfg := parseWithEnv(t, map[string]string{"ENV": env, "AUTH_ENABLED": "false"})

			// An empty ENV parses back to the "development" default, which is
			// correct and must still boot.
			if cfg.Env == "development" {
				if err := cfg.ValidateProduction(); err != nil {
					t.Fatalf("the development default was refused: %v", err)
				}
				return
			}

			err := cfg.ValidateProduction()
			if err == nil {
				t.Fatalf("ENV=%q was accepted; a typo would disable every guard", env)
			}
			if !strings.Contains(err.Error(), "unrecognised ENV") {
				t.Errorf("error does not explain the unrecognised value: %v", err)
			}
		})
	}
}

// TestIsProduction pins the predicate the dev-seeding guard and the debug
// token gate both depend on.
func TestIsProduction(t *testing.T) {
	for _, tc := range []struct {
		env  string
		want bool
	}{
		{"production", true},
		{"development", false},
		{"prod", false},
		{"", false},
	} {
		cfg := config.Config{Env: tc.env}
		if got := cfg.IsProduction(); got != tc.want {
			t.Errorf("IsProduction(ENV=%q) = %v, want %v", tc.env, got, tc.want)
		}
	}
}
