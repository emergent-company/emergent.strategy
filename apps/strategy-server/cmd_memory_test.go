package main

import (
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/config"
)

func TestRunMemory_NeedsASubcommand(t *testing.T) {
	err := runMemory(&config.Config{Memory: &config.MemoryCmd{}})
	if err == nil || !strings.Contains(err.Error(), "sweep") {
		t.Errorf("err = %v, want a message naming the sweep command", err)
	}
}

func TestRunMemory_SweepRefusesToRunWithoutMemory(t *testing.T) {
	cfg := &config.Config{Memory: &config.MemoryCmd{Sweep: &config.MemorySweepCmd{Apply: true}}}
	err := runMemory(cfg)
	if err == nil || !strings.Contains(err.Error(), "EPF_MEMORY_URL") {
		t.Errorf("err = %v, want a message naming the missing Memory settings", err)
	}
}
