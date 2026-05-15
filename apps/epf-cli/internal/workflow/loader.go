package workflow

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// LoadFile reads a workflow YAML file and returns the parsed artifact.
func LoadFile(path string) (*Artifact, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read workflow file: %w", err)
	}
	return Load(data)
}

// Load parses workflow YAML data and returns the parsed artifact.
// It discriminates between state machine definitions (has initial_state)
// and workflow configurations (has applies_to_machine).
func Load(data []byte) (*Artifact, error) {
	// Probe the raw map to discriminate the oneOf variant.
	var probe map[string]any
	if err := yaml.Unmarshal(data, &probe); err != nil {
		return nil, fmt.Errorf("parse workflow YAML: %w", err)
	}

	if _, ok := probe["initial_state"]; ok {
		var sm StateMachine
		if err := yaml.Unmarshal(data, &sm); err != nil {
			return nil, fmt.Errorf("parse state machine: %w", err)
		}
		return &Artifact{Machine: &sm}, nil
	}

	if _, ok := probe["applies_to_machine"]; ok {
		var cfg Configuration
		if err := yaml.Unmarshal(data, &cfg); err != nil {
			return nil, fmt.Errorf("parse workflow configuration: %w", err)
		}
		return &Artifact{Config: &cfg}, nil
	}

	return nil, fmt.Errorf("workflow YAML matches neither state machine (requires initial_state) nor configuration (requires applies_to_machine)")
}

// StateExists returns true if the state is defined in the machine.
func (sm *StateMachine) StateExists(name string) bool {
	for _, s := range sm.States {
		if s == name {
			return true
		}
	}
	return false
}

// TransitionsFrom returns all transitions that originate from the given state.
func (sm *StateMachine) TransitionsFrom(state string) []Transition {
	var result []Transition
	for _, t := range sm.Transitions {
		for _, from := range t.From.Values {
			if from == state {
				result = append(result, t)
				break
			}
		}
	}
	return result
}

// TransitionsTo returns all transitions that lead to the given state.
func (sm *StateMachine) TransitionsTo(state string) []Transition {
	var result []Transition
	for _, t := range sm.Transitions {
		if t.To == state {
			result = append(result, t)
		}
	}
	return result
}

// TerminalStates returns states with no outgoing transitions.
func (sm *StateMachine) TerminalStates() []string {
	var result []string
	for _, s := range sm.States {
		if len(sm.TransitionsFrom(s)) == 0 {
			result = append(result, s)
		}
	}
	return result
}
