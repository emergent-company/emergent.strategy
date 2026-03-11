package cmd

import (
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/agent"
)

// Task 4.4: CLI command tests for agents

func TestGetAgentTypeIcon(t *testing.T) {
	tests := []struct {
		agentType agent.AgentType
		wantIcon  string
	}{
		{agent.AgentTypeGuide, "🧭"},
		{agent.AgentTypeStrategist, "🎯"},
		{agent.AgentTypeSpecialist, "🔧"},
		{agent.AgentTypeArchitect, "🏗️"},
		{agent.AgentTypeReviewer, "🔍"},
		{agent.AgentType("unknown"), "🤖"},
	}

	for _, tt := range tests {
		t.Run(string(tt.agentType), func(t *testing.T) {
			got := getAgentTypeIcon(tt.agentType)
			if got != tt.wantIcon {
				t.Errorf("getAgentTypeIcon(%q) = %q, want %q", tt.agentType, got, tt.wantIcon)
			}
		})
	}
}

func TestPrintAgentsJSON(t *testing.T) {
	// Verify that printAgentsJSON handles empty list without panic
	agents := []*agent.AgentInfo{}
	// This should not panic
	printAgentsJSON(agents)
}

func TestPrintAgentJSON(t *testing.T) {
	a := &agent.AgentInfo{
		Name:           "test-agent",
		Type:           agent.AgentTypeStrategist,
		DisplayName:    "Test Agent",
		Description:    "A test agent",
		Source:         agent.SourceFramework,
		TriggerPhrases: []string{"test trigger"},
		LegacyFormat:   true,
		Content:        "# Test prompt content",
	}

	// Should not panic (nil skill loader is fine — just skips scope aggregation)
	printAgentJSON(a, nil)
}

func TestPrintAgentRecommendationJSON(t *testing.T) {
	rec := &agent.Recommendation{
		Agent: &agent.AgentInfo{
			Name:        "pathfinder",
			Type:        agent.AgentTypeStrategist,
			Description: "Strategy pathfinder",
		},
		Confidence: "high",
		Reason:     "Task matches pathfinder capabilities",
		Alternatives: []*agent.AlternativeRecommendation{
			{
				AgentName: "synthesizer",
				Reason:    "Also handles strategy analysis",
			},
		},
	}

	// Should not panic
	printAgentRecommendationJSON("analyze market", rec)
}

func TestAgentsCmd_Structure(t *testing.T) {
	// Verify the agents command has expected subcommands
	if agentsCmd == nil {
		t.Fatal("agentsCmd is nil")
	}

	if agentsCmd.Use != "agents" {
		t.Errorf("agentsCmd.Use = %q, want %q", agentsCmd.Use, "agents")
	}

	// Check subcommands
	subcommandNames := map[string]bool{
		"list":      false,
		"show":      false,
		"recommend": false,
		"scaffold":  false,
	}

	for _, sub := range agentsCmd.Commands() {
		if _, ok := subcommandNames[sub.Use]; ok {
			subcommandNames[sub.Use] = true
		} else {
			// Check for commands with args like "show <name>"
			for name := range subcommandNames {
				if len(sub.Use) >= len(name) && sub.Use[:len(name)] == name {
					subcommandNames[name] = true
				}
			}
		}
	}

	for name, found := range subcommandNames {
		if !found {
			t.Errorf("agentsCmd missing subcommand %q", name)
		}
	}
}

func TestListAgentsCmd_Flags(t *testing.T) {
	// Verify list command has expected flags
	flags := listAgentsCmd.Flags()

	if flags.Lookup("phase") == nil {
		t.Error("listAgentsCmd missing --phase flag")
	}
	if flags.Lookup("type") == nil {
		t.Error("listAgentsCmd missing --type flag")
	}
	if flags.Lookup("json") == nil {
		t.Error("listAgentsCmd missing --json flag")
	}
}

func TestShowAgentCmd_Flags(t *testing.T) {
	flags := showAgentCmd.Flags()

	if flags.Lookup("content-only") == nil {
		t.Error("showAgentCmd missing --content-only flag")
	}
	if flags.Lookup("json") == nil {
		t.Error("showAgentCmd missing --json flag")
	}
}

func TestScaffoldAgentCmd_Flags(t *testing.T) {
	flags := scaffoldAgentCmd.Flags()

	if flags.Lookup("type") == nil {
		t.Error("scaffoldAgentCmd missing --type flag")
	}
	if flags.Lookup("display-name") == nil {
		t.Error("scaffoldAgentCmd missing --display-name flag")
	}
	if flags.Lookup("description") == nil {
		t.Error("scaffoldAgentCmd missing --description flag")
	}
	if flags.Lookup("output") == nil {
		t.Error("scaffoldAgentCmd missing --output flag")
	}
}

func TestRecommendAgentCmd_RequiresArg(t *testing.T) {
	if recommendAgentCmd.Args == nil {
		t.Error("recommendAgentCmd.Args should not be nil (expects ExactArgs(1))")
	}
}

func TestShowAgentCmd_RequiresArg(t *testing.T) {
	if showAgentCmd.Args == nil {
		t.Error("showAgentCmd.Args should not be nil (expects ExactArgs(1))")
	}
}

func TestScaffoldAgentCmd_RequiresArg(t *testing.T) {
	if scaffoldAgentCmd.Args == nil {
		t.Error("scaffoldAgentCmd.Args should not be nil (expects ExactArgs(1))")
	}
}
