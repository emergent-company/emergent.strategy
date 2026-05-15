// Package workflow provides types, loading, validation, and runner
// adaptation for EPF workflow artifacts (state machine definitions
// and workflow configurations).
package workflow

// StateMachine represents a parsed state machine definition artifact.
// It defines states and transitions for a process lifecycle.
type StateMachine struct {
	Name         string       `yaml:"name" json:"name"`
	InitialState string       `yaml:"initial_state" json:"initial_state"`
	States       []string     `yaml:"states" json:"states"`
	Transitions  []Transition `yaml:"transitions" json:"transitions"`
}

// Transition represents a directed edge between states.
// Unlike navigation transitions, workflow transitions use name (not id)
// and from can be a single state or an array of source states.
type Transition struct {
	Name string      `yaml:"name" json:"name"`
	From StringOrArr `yaml:"from" json:"from"`
	To   string      `yaml:"to" json:"to"`
}

// StringOrArr handles the oneOf union: string | []string for the from field.
type StringOrArr struct {
	Values []string
}

// String returns the first value if there is exactly one, or empty string.
func (s StringOrArr) String() string {
	if len(s.Values) == 1 {
		return s.Values[0]
	}
	return ""
}

// IsMulti returns true if from has multiple source states.
func (s StringOrArr) IsMulti() bool {
	return len(s.Values) > 1
}

// UnmarshalYAML handles both string and []string YAML values.
func (s *StringOrArr) UnmarshalYAML(unmarshal func(any) error) error {
	var single string
	if err := unmarshal(&single); err == nil {
		s.Values = []string{single}
		return nil
	}
	var multi []string
	if err := unmarshal(&multi); err != nil {
		return err
	}
	s.Values = multi
	return nil
}

// MarshalJSON serializes as a string if single, array if multi.
func (s StringOrArr) MarshalJSON() ([]byte, error) {
	if len(s.Values) == 1 {
		return []byte(`"` + s.Values[0] + `"`), nil
	}
	// Build JSON array
	out := []byte("[")
	for i, v := range s.Values {
		if i > 0 {
			out = append(out, ',')
		}
		out = append(out, '"')
		out = append(out, []byte(v)...)
		out = append(out, '"')
	}
	out = append(out, ']')
	return out, nil
}

// Configuration represents a workflow configuration that layers operational
// policies on top of a state machine definition.
type Configuration struct {
	Name             string `yaml:"name" json:"name"`
	AppliesToMachine string `yaml:"applies_to_machine" json:"applies_to_machine"`
	// StatePolicies, Migrations, and Notifications are intentionally
	// loosely typed (open objects in the schema).
	StatePolicies []map[string]any `yaml:"state_policies,omitempty" json:"state_policies,omitempty"`
	Migrations    []map[string]any `yaml:"migrations,omitempty" json:"migrations,omitempty"`
	Notifications []map[string]any `yaml:"notifications,omitempty" json:"notifications,omitempty"`
}

// Artifact is a union type that holds either a StateMachine or Configuration.
// Exactly one field is non-nil after loading.
type Artifact struct {
	Machine *StateMachine  `json:"machine,omitempty"`
	Config  *Configuration `json:"config,omitempty"`
}

// IsMachine returns true if this artifact is a state machine definition.
func (a *Artifact) IsMachine() bool {
	return a.Machine != nil
}

// IsConfig returns true if this artifact is a workflow configuration.
func (a *Artifact) IsConfig() bool {
	return a.Config != nil
}
