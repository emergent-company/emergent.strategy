package agentcard

// AuthoringBot returns a forward-declared card for the artifact authoring
// assistant proposed by openspec/changes/add-artifact-assistant-bot.
// Status is StatusPlanned — this agent has not shipped; see that field's
// doc comment for why publishing an unmarked card here would be dishonest.
//
// Skills are sourced from that proposal's own committed §3 write-tool
// list (propose_patch, propose_evidence_link, propose_skill_run) — not
// invented for this card. Deliberately not generated from running code the
// way AIM's card is (agentcard.AIM), because there is no running code yet;
// this is authored metadata describing an intended shape, and is honest
// about being exactly that via Status.
//
// This is the vehicle for task 4's structural claim: AIM and the authoring
// bot must differ only in who plans the chain (AIM: fixed six-step
// sequence; authoring bot: an LLM tool-loop deciding per turn) and in write
// set (AIM: whole-artifact regeneration across six steps, two of which
// auto-commit; authoring bot: narrower, patch-level, every skill gated) —
// nowhere else in the type system. See card_test.go's
// TestAIMAndAuthoringBot_DifferOnlyInChainPlanningAndWriteSet for the
// executable proof.
func AuthoringBot() Card {
	skills := []Skill{
		{
			ID:          "propose_patch",
			Name:        "propose_patch",
			Description: "Prepare a JSON-Pointer patch against a single artifact sub-object (a belief, a value-model component, a KR) for human review.",
			Tags:        []string{"authoring", "patch"},
			HumanGate:   true,
		},
		{
			ID:          "propose_evidence_link",
			Name:        "propose_evidence_link",
			Description: "Prepare a link between an artifact and a piece of evidence for human review.",
			Tags:        []string{"authoring", "evidence"},
			HumanGate:   true,
		},
		{
			ID:          "propose_skill_run",
			Name:        "propose_skill_run",
			Description: "Prepare a full-artifact skill run (the existing AI-draft-and-review path) for human review.",
			Tags:        []string{"authoring", "skill"},
			HumanGate:   true,
		},
	}

	return Card{
		SchemaVersion: SchemaVersion,
		Name:          "artifact_authoring_bot",
		Description:   "Context-aware conversational assistant for editing strategy artifacts: reads broadly (artifacts, evidence, signals), writes narrowly (proposes sub-object patches, evidence links, or skill runs) — every write staged for human review, never committed.",
		Version:       "0.0.0", // unshipped — no released version yet
		Provider:      Provider{Org: "Emergent", URL: "https://emergent-company.ai"},
		URL:           "", // no endpoint yet — not reachable
		Status:        StatusPlanned,
		Capabilities: Capabilities{
			Streaming:              true, // planned: reuses the existing SSE activity fanout, per the proposal
			PushNotifications:      false,
			StateTransitionHistory: false, // planned: conversation turns, not a step sequence — no run/step history the way AIM has
			Extensions:             []string{"x-emergent-write-capability", "x-emergent-status"},
		},
		DefaultInputModes:  []string{"application/json", "text/plain"},
		DefaultOutputModes: []string{"application/json", "text/plain"},
		Skills:             skills,
		WriteCapability:    WriteCapability{Writes: WritesStages},
	}
}
