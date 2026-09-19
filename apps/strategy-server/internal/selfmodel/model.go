// Package selfmodel publishes a machine-readable description of what this
// service contains and what can be done with it — the MCP tool catalogue,
// EPF artifact schemas by phase, and the web navigation graph — so an agent
// that did not ship with strategy-server can use it competently without
// embedded, hand-maintained knowledge of its shape.
//
// This satisfies openspec/changes/establish-agent-contract's
// agent-contract/spec.md requirement "A service publishes its own model for
// agents to consume." It is deliberately generated, never hand-authored
// (Generate reads the real, live tool registration path and the real
// navigation graph — see generate.go's doc comment) — a hand-copied list is
// exactly the "master list that rots" failure this package exists to avoid.
//
// This is the service's self-model, not an agent card. An agent card
// (openspec/changes/establish-agent-contract §4, not yet implemented)
// describes one agent's identity and write scope; this describes the
// service's own capabilities, artifact types, and navigation — the thing an
// agent card's "how to use me" would point at.
package selfmodel

import "encoding/json"

// committedFilePath is where the generated self-model is committed, relative
// to this package's own directory — mirrors 21st-bot's top-level
// `21st-app.json` precedent (this app's equivalent of "repo root" is
// apps/strategy-server/, since emergent-strategy is a monorepo). Served at
// GET /.well-known/strategy-server-selfmodel.json from the exact same
// Generate()+MarshalIndent() call (cmd_serve.go), so the committed file and
// the served route can never disagree — the same "one exporter, two
// outputs" discipline 21st-bot's design.md documents.
const committedFilePath = "../../self-model.json"

// SchemaVersion is the self-model contract version this package produces.
// Bump on a breaking shape change; a consumer should ignore unknown fields
// and warn (not fail) on a newer major, following 21st-bot's
// ManifestSchemaVersion precedent (internal/platform/manifest.go).
const SchemaVersion = "1.0"

// Model is strategy-server's published self-model.
type Model struct {
	SchemaVersion string     `json:"schema_version"`
	Service       Identity   `json:"service"`
	Categories    []Category `json:"tool_categories"`
	Tools         []Tool     `json:"tools"`
	Phases        []Phase    `json:"phases"`
	Screens       []Screen   `json:"screens"`
}

// Identity is strategy-server's own identity, independent of any specific
// agent running inside it (AIM, the future authoring bot). Mirrors the
// identity fields every reconciled agent-card shape carries
// (research.md §2), projected at the service level.
type Identity struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

// Category is one MCP tool category (internal/mcpserver.CategoryOrder).
// Deliberately has no "active" field — that is per-session filter state
// (mcpserver.CategoryInfo), not a property of the published self-model.
type Category struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	ToolCount   int    `json:"tool_count"`
}

// Tool is one registered MCP tool. InputSchema and OutputSchema are the
// tool's real, live-registered JSON Schemas (marshaled from the mcp-go Tool
// this was introspected from), not hand-projected summaries — a consumer gets
// the same schemas an MCP client validating a call would use.
type Tool struct {
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
	Category    string          `json:"category"`
	InputSchema json.RawMessage `json:"input_schema,omitempty"`

	// OutputSchema is set only for tools that publish one — currently the
	// validation tools, which return a verdict envelope as structuredContent.
	// Omitting it here would defeat the point of declaring it: the whole
	// reason the envelope has a schema is so consumers can discover its shape
	// rather than learn it by folklore, and this document is where they look.
	OutputSchema json.RawMessage `json:"output_schema,omitempty"`
}

// Phase is one EPF phase (READY, FIRE, AIM) and the artifact types that
// belong to it, projected from internal/mcpserver.PhaseArtifacts — the same
// data get_phase_artifacts serves, published here as a static self-model
// rather than requiring a tool call per phase to discover.
type Phase struct {
	Name      string     `json:"name"`
	Artifacts []Artifact `json:"artifacts"`
}

// Artifact describes one EPF artifact type within a phase.
type Artifact struct {
	ArtifactType string `json:"artifact_type"`
	Description  string `json:"description"`
	SchemaFile   string `json:"schema_file,omitempty"`
}

// Screen is one web UI screen, projected from internal/navigation's
// ScreenDef — the fields a remote agent needs to route a human to a
// specific place, not the full internal record (RenderMode, SubNavHidden
// etc. are UI-layout concerns with no meaning outside this codebase).
// Mirrors the shape of 21st-bot's ManifestNav
// (internal/platform/manifest.go), which is the reconciled precedent for
// "project a nav graph into a transport type" per research.md §3.3.
type Screen struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	URL      string `json:"url,omitempty"`
	TabGroup string `json:"tab_group,omitempty"`
	Parent   string `json:"parent,omitempty"`
}
