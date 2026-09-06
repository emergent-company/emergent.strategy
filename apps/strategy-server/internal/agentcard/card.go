// Package agentcard publishes agent cards for the agents strategy-server
// runs — currently AIM (domain/aim.CycleWorkflow), and a forward-declared
// card for the not-yet-built authoring bot
// (openspec/changes/add-artifact-assistant-bot).
//
// The card shape is vendored, not imported, from the A2A protocol's
// AgentCard (github.com/a2aproject/a2a-go/a2a), per
// openspec/changes/establish-agent-contract/research.md §4's decision: A2A
// is the shape ADK's actual remote-invocation path (remoteagent, agenttool)
// consumes, and vendoring — copying the shape, not the dependency — is
// 21st-bot's own precedent (add-platform-self-awareness/design.md's
// adoption checklist item 1: "vendor the manifest contract... do not
// invent a different shape"). This package intentionally has zero
// dependency on any ADK or a2a-go package, so it cannot be pulled into the
// three-ADK-majors conflict docs/AI_RUNTIME_CONSOLIDATION.md §7 describes.
//
// Only the fields this codebase currently has real values for are
// included — Signatures, SecuritySchemes and Security (present in the full
// A2A spec) are omitted rather than published empty/fake, since an absent
// field is honest and a zero-value security declaration is not.
package agentcard

// Card is strategy-server's vendored subset of A2A's AgentCard.
type Card struct {
	// SchemaVersion is this package's own contract version, following
	// 21st-bot's ManifestSchemaVersion / internal/selfmodel.SchemaVersion
	// precedent — independent of A2A's own ProtocolVersion below.
	SchemaVersion string `json:"schema_version"`

	Name                 string       `json:"name"`
	Description          string       `json:"description"`
	Version              string       `json:"version"`
	Provider             Provider     `json:"provider"`
	URL                  string       `json:"url"`
	PreferredTransport   string       `json:"preferredTransport"`
	AdditionalInterfaces []Interface  `json:"additionalInterfaces,omitempty"`
	ProtocolVersion      string       `json:"protocolVersion"`
	Capabilities         Capabilities `json:"capabilities"`
	DefaultInputModes    []string     `json:"defaultInputModes"`
	DefaultOutputModes   []string     `json:"defaultOutputModes"`
	Skills               []Skill      `json:"skills"`

	// WriteCapability is this package's extension on top of A2A's base
	// shape (research.md §4, item 1) — filling the gap A2A itself has no
	// field for: whether this agent stages, commits, or writes nothing.
	// Modeled as A2A's own AgentExtension mechanism would carry it (a
	// namespaced, additive block a generic A2A consumer can ignore), not a
	// top-level field invented ad hoc.
	WriteCapability WriteCapability `json:"x-emergent-write-capability"`

	// Status is this package's own extension — see the Status type's doc
	// comment for why A2A's shape has no equivalent and this needs one.
	Status Status `json:"x-emergent-status"`
}

// Provider identifies the agent's service provider. Mirrors A2A's
// AgentProvider exactly (Org/URL), since this maps 1:1 with no gap to fill.
type Provider struct {
	Org string `json:"organization"`
	URL string `json:"url"`
}

// Interface declares one additional transport+URL combination this agent is
// reachable at, beyond the preferred one named at the top level. A2A's own
// TransportProtocol is documented as non-enum ("custom protocols are
// allowed") — research.md §4 confirms declaring "MCP" here is within spec,
// not a workaround.
type Interface struct {
	Transport string `json:"transport"`
	URL       string `json:"url"`
}

// Capabilities mirrors A2A's AgentCapabilities. Extensions is intentionally
// typed as []string (extension URIs only) rather than A2A's full
// {URI,Params,Required} shape — this package's only real extension today is
// WriteCapability itself, referenced by URI here for A2A-consumer
// discoverability without duplicating its content in two places.
type Capabilities struct {
	Streaming              bool     `json:"streaming"`
	PushNotifications      bool     `json:"pushNotifications"`
	StateTransitionHistory bool     `json:"stateTransitionHistory"`
	Extensions             []string `json:"extensions,omitempty"`
}

// Skill is one distinct capability the agent can perform. Mirrors A2A's
// AgentSkill's core fields (ID/Name/Description/Tags); Examples/InputModes/
// OutputModes/Security are omitted for now — this package has no real data
// for them yet, and publishing them empty would look like "this skill
// accepts no examples" rather than "not populated."
type Skill struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Tags        []string `json:"tags,omitempty"`

	// HumanGate is specific to this codebase's skills, not part of A2A —
	// whether invoking this skill pauses for human review before its
	// effect is committed. Distinct from WriteCapability (agent-level:
	// "does this agent ever commit") — HumanGate is skill-level ("does
	// *this* skill require a gate", since align_portfolio and
	// snapshot_cycle do not, per domain/aim.CycleWorkflow.CycleSteps).
	HumanGate bool `json:"x-emergent-human-gate"`
}

// WriteCapability declares whether this agent stages, commits, or writes
// nothing — the write-capability declaration
// agent-contract/spec.md's "Write capability is declared" scenario
// requires, and research.md §3.1 confirms A2A has no field for.
type WriteCapability struct {
	// Writes is one of "stages", "commits", or "none". Per
	// establish-agent-contract/design.md's framing, "commits" should not
	// appear for any agent in this estate today — every implementation is
	// stage-only. This field exists to make that fact machine-checkable.
	Writes string `json:"writes"`
}

const (
	WritesStages  = "stages"
	WritesCommits = "commits"
	WritesNone    = "none"
)

// Status distinguishes a card describing a live, callable agent from one
// describing a planned agent's intended shape — a distinction A2A itself
// has no field for (its AgentCard assumes the agent it describes already
// exists and is reachable at URL). Needed here specifically because task 4
// asks for a card for the authoring bot
// (openspec/changes/add-artifact-assistant-bot), which has not shipped —
// publishing that card with no way to say "not live yet" would be
// indistinguishable from advertising a callable agent that does not exist.
type Status string

const (
	StatusLive    Status = "live"
	StatusPlanned Status = "planned"
)

// SchemaVersion is this package's own contract version.
const SchemaVersion = "1.0"
