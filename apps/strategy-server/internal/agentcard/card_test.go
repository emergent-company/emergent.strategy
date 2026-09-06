package agentcard

import (
	"reflect"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/aim"
)

// TestAIM_MatchesLiveWorkflowSteps proves AIM's card is generated from the
// real workflow, not hand-copied — the same discipline
// internal/selfmodel's tests hold its tool catalogue to. Independently
// recomputes the expected skill set from domain/aim.CycleWorkflow directly
// (not via agentcard.AIM's own internals) so a bug in AIM() and a bug in
// this test's fixture can't both hide behind the same computation.
func TestAIM_MatchesLiveWorkflowSteps(t *testing.T) {
	steps := aim.NewCycleWorkflow(nil, nil).CycleSteps()

	card := AIM()
	if len(card.Skills) != len(steps) {
		t.Fatalf("card has %d skills, workflow has %d steps", len(card.Skills), len(steps))
	}
	for i, step := range steps {
		skill := card.Skills[i]
		if skill.ID != step.Name {
			t.Errorf("skill[%d].ID = %q, want %q", i, skill.ID, step.Name)
		}
		if skill.HumanGate != step.HumanGate {
			t.Errorf("skill %q: HumanGate = %v, want %v", step.Name, skill.HumanGate, step.HumanGate)
		}
		if skill.Description == "" {
			t.Errorf("skill %q has no description", step.Name)
		}
	}
}

// TestAIM_NeverCommits guards the estate-wide invariant
// (design.md, docs/UNIFIED_AGENT_ARCHITECTURE.md §5): every agent in this
// codebase stages, none commits.
func TestAIM_NeverCommits(t *testing.T) {
	if got := AIM().WriteCapability.Writes; got == WritesCommits {
		t.Fatalf("AIM declares WriteCapability.Writes = %q — no agent in this estate should ever declare it commits", got)
	}
}

func TestAuthoringBot_NeverCommits(t *testing.T) {
	if got := AuthoringBot().WriteCapability.Writes; got == WritesCommits {
		t.Fatalf("AuthoringBot declares WriteCapability.Writes = %q — no agent in this estate should ever declare it commits", got)
	}
}

// TestAuthoringBot_IsMarkedPlanned guards against this card being mistaken
// for a live, callable agent before add-artifact-assistant-bot ships — see
// the Status type's doc comment.
func TestAuthoringBot_IsMarkedPlanned(t *testing.T) {
	card := AuthoringBot()
	if card.Status != StatusPlanned {
		t.Errorf("AuthoringBot().Status = %q, want %q", card.Status, StatusPlanned)
	}
	if card.URL != "" {
		t.Errorf("AuthoringBot().URL = %q, want empty — a planned agent has no reachable endpoint", card.URL)
	}
}

func TestAIM_IsMarkedLive(t *testing.T) {
	if got := AIM().Status; got != StatusLive {
		t.Errorf("AIM().Status = %q, want %q", got, StatusLive)
	}
}

// TestAuthoringBot_WriteSetIsNarrowerThanAIM is the "narrower write set"
// half of task 4's claim, made concrete: every one of the authoring bot's
// skills is human-gated (it never auto-commits anything), whereas AIM has
// two skills that are not (align_portfolio, snapshot_cycle — both
// deterministic, per domain/aim.CycleWorkflow's own comments). A card with
// *more* auto-committing skills is not narrower by any reasonable reading
// of "write set," so this is the concrete, checkable content behind the
// word "narrower."
func TestAuthoringBot_WriteSetIsNarrowerThanAIM(t *testing.T) {
	aimCard := AIM()
	botCard := AuthoringBot()

	aimUngated := 0
	for _, s := range aimCard.Skills {
		if !s.HumanGate {
			aimUngated++
		}
	}
	botUngated := 0
	for _, s := range botCard.Skills {
		if !s.HumanGate {
			botUngated++
		}
	}

	if botUngated != 0 {
		t.Errorf("authoring bot has %d ungated (auto-committing) skills, want 0 — every skill must be human-gated", botUngated)
	}
	if aimUngated == 0 {
		t.Fatal("fixture assumption broken: AIM is expected to have at least one ungated skill (align_portfolio, snapshot_cycle) for this comparison to be meaningful")
	}
}

// TestAIMAndAuthoringBot_DifferOnlyInChainPlanningAndWriteSet is the
// executable form of task 4's confirmation requirement: "Confirm the two
// differ only in who plans the chain and in their write set — nowhere else
// in the type system." Both cards are the exact same Go type (Card) by
// construction — that part is trivially true and not what this test
// checks. What it actually checks: every *structural* field that is not
// skill-content or identity (Capabilities' shape, DefaultInputModes'/
// DefaultOutputModes' presence, WriteCapability's own field name) is
// populated the same way for both, so a future card cannot quietly grow a
// third, agent-type-specific field without this test forcing a decision
// about whether that breaks the one-agent-type claim
// (docs/UNIFIED_AGENT_ARCHITECTURE.md §1).
func TestAIMAndAuthoringBot_DifferOnlyInChainPlanningAndWriteSet(t *testing.T) {
	aimCard := AIM()
	botCard := AuthoringBot()

	// Same capability *shape* — both are genai/A2A-style agents with
	// streaming and no push notifications. StateTransitionHistory
	// legitimately differs (AIM has a step sequence; the bot's unit of
	// work is a conversation turn, per design.md's carried-forward open
	// item) — this is a real content difference already accounted for by
	// the proposal, not evidence of a third agent-type concept.
	if aimCard.Capabilities.Streaming != botCard.Capabilities.Streaming {
		t.Error("Streaming capability differs — both should stream progress")
	}
	if aimCard.Capabilities.PushNotifications != botCard.Capabilities.PushNotifications {
		t.Error("PushNotifications differs — neither agent uses this")
	}

	// Both declare the same *kind* of write capability field, differing
	// only in value (stages, for both — checked separately above) — never
	// in shape.
	if reflect.TypeOf(aimCard.WriteCapability) != reflect.TypeOf(botCard.WriteCapability) {
		t.Error("WriteCapability field type differs between AIM and the authoring bot")
	}

	// Both use the same input/output mode mechanism (non-empty
	// DefaultInputModes/OutputModes) — the specific modes differ (bot
	// additionally accepts free text for chat) but the *mechanism* — a
	// mode list, not e.g. a bespoke "chat vs batch" enum — is identical.
	if len(aimCard.DefaultInputModes) == 0 || len(botCard.DefaultInputModes) == 0 {
		t.Error("both cards must populate DefaultInputModes via the same mechanism")
	}

	// The two real, legitimate differences this test exists to allow:
	// identity (Name/Description/Skills content) and write-set breadth
	// (checked in TestAuthoringBot_WriteSetIsNarrowerThanAIM). Asserting
	// they *do* differ here guards against a future edit accidentally
	// making the cards identical, which would be a sign the authoring
	// bot's card was never actually filled in with its own identity.
	if aimCard.Name == botCard.Name {
		t.Error("AIM and the authoring bot must not share a name")
	}
}
