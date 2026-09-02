package config_test

import (
	"os"
	"testing"
	"time"

	"github.com/alexflint/go-arg"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/config"
)

// parseDefaults parses the config with no flags and no environment, which is
// what the server gets on a plain start.
func parseDefaults(t *testing.T) config.Config {
	t.Helper()

	for _, key := range []string{"ABANDON_GATES_AFTER"} {
		t.Setenv(key, "")
		if err := os.Unsetenv(key); err != nil {
			t.Fatalf("unset %s: %v", key, err)
		}
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

// TestAbandonGatesAfter_SweepIsOnByDefault pins the behaviour of a plain
// server start, which is not the same as the zero value of the struct.
//
// An earlier version of this test asserted only that a zero-value Config has a
// zero threshold. That is trivially true, says nothing about the running
// server, and produced a confident but wrong claim that the sweep was off
// unless explicitly enabled. go-arg applies the struct tag default, so it is
// on.
func TestAbandonGatesAfter_SweepIsOnByDefault(t *testing.T) {
	cfg := parseDefaults(t)

	if cfg.AbandonGatesAfter <= 0 {
		t.Fatalf("AbandonGatesAfter = %v on a plain start; the sweep would be off and parked runs would rot", cfg.AbandonGatesAfter)
	}
	if got, want := cfg.AbandonGatesAfter, 60*24*time.Hour; got != want {
		t.Errorf("default threshold = %v, want %v", got, want)
	}
}

// TestAbandonGatesAfter_DefaultOutlastsAPlausibleReview guards the direction
// that costs data. No gate in this system has ever been observed clearing, so
// the default is a placeholder; it only has to be long enough that a real
// review is not destroyed before we learn what one costs.
func TestAbandonGatesAfter_DefaultOutlastsAPlausibleReview(t *testing.T) {
	cfg := parseDefaults(t)

	if cfg.AbandonGatesAfter < 7*24*time.Hour {
		t.Errorf("default %v is under a week; a genuine review could be swept away before it clears", cfg.AbandonGatesAfter)
	}
}

// TestAbandonGatesAfter_CanBeDisabled — an operator must be able to turn the
// sweep off entirely, which is what the pg backend reads a zero as.
func TestAbandonGatesAfter_CanBeDisabled(t *testing.T) {
	t.Setenv("ABANDON_GATES_AFTER", "0s")

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

	if cfg.AbandonGatesAfter != 0 {
		t.Errorf("ABANDON_GATES_AFTER=0s produced %v, want 0 (sweep disabled)", cfg.AbandonGatesAfter)
	}
}
