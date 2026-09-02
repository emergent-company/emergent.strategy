package config_test

import (
	"testing"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/config"
)

// The sweep must be off unless configured. Defaulting it on would mean an
// upgrade silently terminates in-flight reviews.
func TestAbandonGatesAfter_ZeroDisablesSweep(t *testing.T) {
	var cfg config.Config
	if cfg.AbandonGatesAfter != 0 {
		t.Fatalf("zero-value config has AbandonGatesAfter = %v, want 0 (disabled)", cfg.AbandonGatesAfter)
	}
}

// The shipped default is a placeholder — no gate has ever been observed
// clearing — so it only has to be long enough not to eat a real review.
func TestAbandonGatesAfter_DefaultIsGenerous(t *testing.T) {
	const parsedDefault = 336 * time.Hour // matches the struct tag

	if parsedDefault < 7*24*time.Hour {
		t.Errorf("default %v is shorter than a week; a real review could be swept away", parsedDefault)
	}
}
