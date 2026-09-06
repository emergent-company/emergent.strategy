package agentcard

import "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/aim"

// AIM returns AIM's agent card, generated from the real, live
// domain/aim.CycleWorkflow — not hand-copied. Skills and their gate status
// come directly from CycleSteps(), the same method DBOSEngine drives a real
// cycle from (internal/aimdbos/workflow.go), so this card cannot silently
// drift from what a cycle actually does the way a hand-maintained
// description could.
//
// aim.NewCycleWorkflow(nil, nil) is safe here for the same reason
// mcpserver.NewMCPServerForIntrospection() is safe to call with inert
// service stand-ins: CycleSteps() only reads the static step list (Name,
// HumanGate) — it never calls a step's own Run closure, which is the only
// place svc/executor would be dereferenced.
func AIM() Card {
	steps := aim.NewCycleWorkflow(nil, nil).CycleSteps()

	skills := make([]Skill, 0, len(steps))
	for _, step := range steps {
		skills = append(skills, Skill{
			ID:          step.Name,
			Name:        step.Name,
			Description: aimStepDescriptions[step.Name],
			Tags:        []string{"aim", "cycle"},
			HumanGate:   step.HumanGate,
		})
	}

	return Card{
		SchemaVersion:      SchemaVersion,
		Name:               aim.WorkflowName,
		Description:        "Runs the AIM (Assess-Interpret-Move) strategy cycle: drafts an assessment and calibration from current evidence, proposes strategy and foundations adaptations, aligns the portfolio to committed roadmap KRs, and snapshots the result — each step except the deterministic ones stages a batch for human review.",
		Version:            "1.0.0",
		Provider:           Provider{Org: "Emergent", URL: "https://emergent-company.ai"},
		URL:                "/mcp",
		Status:             StatusLive,
		PreferredTransport: "MCP",
		ProtocolVersion:    "0.3.0",
		Capabilities: Capabilities{
			Streaming:              true, // SSE run-panel streaming, internal/handler/handler_aim_orchestrator.go
			PushNotifications:      false,
			StateTransitionHistory: true, // orchestration.Run.Steps — full per-step history
			Extensions:             []string{"x-emergent-write-capability"},
		},
		DefaultInputModes:  []string{"application/json"},
		DefaultOutputModes: []string{"application/json"},
		Skills:             skills,
		WriteCapability:    WriteCapability{Writes: WritesStages},
	}
}

// aimStepDescriptions gives each CycleSteps() name a human-readable
// description. Kept as a lookup table rather than sourced from code
// comments (which Go's reflection cannot read at runtime) — the step
// *names* and *gate status* are generated from live code (the property that
// matters for drift); these descriptions are the same kind of authored
// metadata a Skill's Description field is under A2A itself.
var aimStepDescriptions = map[string]string{
	"draft_assessment":  "Draft a Living Reality Assessment from current evidence and signals.",
	"draft_calibration": "Draft a calibration memo reconciling the assessment against strategy.",
	"adapt_strategy":    "Propose adaptations to the strategy formula based on the calibration.",
	"adapt_foundations": "Propose adaptations to strategy foundations (ICP, positioning) based on the calibration.",
	"align_portfolio":   "Deterministically activate value-model components targeted by committed roadmap KRs. Auto-commits — no human gate.",
	"snapshot_cycle":    "Publish a version snapshot of the cycle's outcome. Auto-commits — no human gate.",
}
