package orchestration

// Workflow defines a named, ordered sequence of steps to be executed by the Engine.
// Callers implement this interface to register a workflow; the Engine knows nothing
// about the domain logic inside each step.
type Workflow interface {
	// Name uniquely identifies this workflow type, e.g. "aim_cycle".
	Name() string

	// Steps returns the ordered list of steps to execute.
	Steps() []Step

	// ConcurrencyKey returns the key used to enforce the one-active-run lock.
	// For AIM this is the instance UUID. Two runs with the same (Name, ConcurrencyKey)
	// pair cannot be active simultaneously.
	ConcurrencyKey(run *Run) string
}
