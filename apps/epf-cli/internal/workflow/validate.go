package workflow

import "fmt"

// ValidationError represents a structural validation error.
type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

func (e ValidationError) Error() string {
	return fmt.Sprintf("%s: %s", e.Field, e.Message)
}

// Validate performs structural validation on a state machine definition
// beyond what the JSON schema enforces.
func Validate(sm *StateMachine) []ValidationError {
	var errs []ValidationError

	// 1. initial_state must be in the states list.
	if !sm.StateExists(sm.InitialState) {
		errs = append(errs, ValidationError{
			Field:   "initial_state",
			Message: fmt.Sprintf("initial state %q is not in the states list", sm.InitialState),
		})
	}

	// 2. Unique states (schema enforces uniqueItems but we double-check).
	seen := make(map[string]bool)
	for _, s := range sm.States {
		if seen[s] {
			errs = append(errs, ValidationError{
				Field:   "states",
				Message: fmt.Sprintf("duplicate state %q", s),
			})
		}
		seen[s] = true
	}

	// 3. All transition from/to reference valid states.
	for i, t := range sm.Transitions {
		for _, from := range t.From.Values {
			if !sm.StateExists(from) {
				errs = append(errs, ValidationError{
					Field:   fmt.Sprintf("transitions[%d].from", i),
					Message: fmt.Sprintf("transition %q references unknown source state %q", t.Name, from),
				})
			}
		}
		if !sm.StateExists(t.To) {
			errs = append(errs, ValidationError{
				Field:   fmt.Sprintf("transitions[%d].to", i),
				Message: fmt.Sprintf("transition %q references unknown target state %q", t.Name, t.To),
			})
		}
	}

	// 4. Unique transition names.
	transNames := make(map[string]bool)
	for i, t := range sm.Transitions {
		if transNames[t.Name] {
			errs = append(errs, ValidationError{
				Field:   fmt.Sprintf("transitions[%d].name", i),
				Message: fmt.Sprintf("duplicate transition name %q", t.Name),
			})
		}
		transNames[t.Name] = true
	}

	// 5. No unreachable states (every non-initial state must have at least
	// one inbound transition).
	for _, s := range sm.States {
		if s == sm.InitialState {
			continue
		}
		if len(sm.TransitionsTo(s)) == 0 {
			errs = append(errs, ValidationError{
				Field:   "states",
				Message: fmt.Sprintf("state %q has no inbound transitions (unreachable)", s),
			})
		}
	}

	// 6. No orphan transitions (from states that don't appear in the states list).
	// This is already covered by check 3, but we also verify that from arrays
	// don't have duplicates.
	for i, t := range sm.Transitions {
		if t.From.IsMulti() {
			fromSeen := make(map[string]bool)
			for _, from := range t.From.Values {
				if fromSeen[from] {
					errs = append(errs, ValidationError{
						Field:   fmt.Sprintf("transitions[%d].from", i),
						Message: fmt.Sprintf("transition %q has duplicate source state %q", t.Name, from),
					})
				}
				fromSeen[from] = true
			}
		}
	}

	return errs
}
