// Package navigation provides types, loading, validation, and execution
// for EPF navigation graph artifacts.
package navigation

// Graph represents a parsed navigation graph artifact.
type Graph struct {
	Name         string        `yaml:"name" json:"name"`
	Title        string        `yaml:"title" json:"title"`
	Description  string        `yaml:"description,omitempty" json:"description,omitempty"`
	EntryContext string        `yaml:"entry_context" json:"entry_context"`
	Contexts     []Context     `yaml:"contexts" json:"contexts"`
	Transitions  []Transition  `yaml:"transitions" json:"transitions"`
	Guards       []Guard       `yaml:"guards,omitempty" json:"guards,omitempty"`
	Groups       []Group       `yaml:"groups,omitempty" json:"groups,omitempty"`
	Menus        []Menu        `yaml:"menus,omitempty" json:"menus,omitempty"`
	Imports      []Import      `yaml:"imports,omitempty" json:"imports,omitempty"`
	PortalEdges  []PortalEdge  `yaml:"portal_edges,omitempty" json:"portal_edges,omitempty"`
}

// Context represents an interaction context — a meaningful place a user can be.
type Context struct {
	ID                  string            `yaml:"id" json:"id"`
	Title               string            `yaml:"title" json:"title"`
	Description         string            `yaml:"description,omitempty" json:"description,omitempty"`
	Parent              string            `yaml:"parent,omitempty" json:"parent,omitempty"`
	Group               string            `yaml:"group,omitempty" json:"group,omitempty"`
	Category            string            `yaml:"category,omitempty" json:"category,omitempty"`
	Mode                string            `yaml:"mode,omitempty" json:"mode,omitempty"`
	Scoped              bool              `yaml:"scoped,omitempty" json:"scoped,omitempty"`
	DataRequirements    []DataRequirement `yaml:"data_requirements,omitempty" json:"data_requirements,omitempty"`
	ImplementationHints []string          `yaml:"implementation_hints,omitempty" json:"implementation_hints,omitempty"`
	ContributesTo       []string          `yaml:"contributes_to,omitempty" json:"contributes_to,omitempty"`
	Properties          map[string]any    `yaml:"properties,omitempty" json:"properties,omitempty"`
}

// DataRequirement describes data a context needs to function.
type DataRequirement struct {
	Type      string `yaml:"type" json:"type"`
	Qualifier string `yaml:"qualifier,omitempty" json:"qualifier,omitempty"`
}

// Transition represents a directed edge between contexts.
type Transition struct {
	ID       string `yaml:"id" json:"id"`
	From     string `yaml:"from" json:"from"`
	To       string `yaml:"to" json:"to"`
	Label    string `yaml:"label,omitempty" json:"label,omitempty"`
	Guard    string `yaml:"guard,omitempty" json:"guard,omitempty"`
	Category string `yaml:"category,omitempty" json:"category,omitempty"`
}

// Guard represents a named precondition that governs transition access.
type Guard struct {
	ID         string `yaml:"id" json:"id"`
	Description string `yaml:"description" json:"description"`
	Type       string `yaml:"type,omitempty" json:"type,omitempty"`
	GuardGroup string `yaml:"guard_group,omitempty" json:"guard_group,omitempty"`
	Fallback   string `yaml:"fallback,omitempty" json:"fallback,omitempty"`
	Message    string `yaml:"message,omitempty" json:"message,omitempty"`
}

// Group represents a logical grouping of contexts.
type Group struct {
	ID              string `yaml:"id" json:"id"`
	Title           string `yaml:"title" json:"title"`
	Order           int    `yaml:"order,omitempty" json:"order,omitempty"`
	VisibilityGuard string `yaml:"visibility_guard,omitempty" json:"visibility_guard,omitempty"`
}

// Menu represents context-specific action sets.
type Menu struct {
	Context string     `yaml:"context" json:"context"`
	Title   string     `yaml:"title,omitempty" json:"title,omitempty"`
	Items   []MenuItem `yaml:"items" json:"items"`
}

// MenuItem represents a single action within a menu.
type MenuItem struct {
	TransitionID string `yaml:"transition_id" json:"transition_id"`
	Label        string `yaml:"label" json:"label"`
	Description  string `yaml:"description,omitempty" json:"description,omitempty"`
}

// Import represents a service sub-graph import for multi-service composition.
type Import struct {
	Service string `yaml:"service" json:"service"`
	Path    string `yaml:"path" json:"path"`
}

// PortalEdge represents a cross-service transition.
type PortalEdge struct {
	ID     string `yaml:"id" json:"id"`
	Source string `yaml:"source" json:"source"`
	Target string `yaml:"target" json:"target"`
	Guard  string `yaml:"guard,omitempty" json:"guard,omitempty"`
	Label  string `yaml:"label,omitempty" json:"label,omitempty"`
}
