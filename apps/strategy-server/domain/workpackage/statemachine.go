// Package workpackage holds the domain logic for work packages — the bounded,
// four-track statement-of-work execution unit (canonical-epf work_package
// schema). It owns the status state-machine and footprint derivation. These are
// pure functions with no database or transport dependencies so they can be
// tested in isolation and reused by the MCP layer.
package workpackage

import (
	"fmt"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// allowedTransitions encodes the work package status state-machine.
//
//	proposed → approved → scheduled → executing → done
//
// cancelled is a terminal state reachable from any non-terminal state.
// done and cancelled are terminal (no outgoing transitions).
var allowedTransitions = map[string][]string{
	domain.WorkPackageStatusProposed:  {domain.WorkPackageStatusApproved, domain.WorkPackageStatusCancelled},
	domain.WorkPackageStatusApproved:  {domain.WorkPackageStatusScheduled, domain.WorkPackageStatusCancelled},
	domain.WorkPackageStatusScheduled: {domain.WorkPackageStatusExecuting, domain.WorkPackageStatusCancelled},
	domain.WorkPackageStatusExecuting: {domain.WorkPackageStatusDone, domain.WorkPackageStatusCancelled},
	domain.WorkPackageStatusDone:      {}, // terminal
	domain.WorkPackageStatusCancelled: {}, // terminal
}

// validStatuses is the set of all recognised work package statuses.
var validStatuses = map[string]bool{
	domain.WorkPackageStatusProposed:  true,
	domain.WorkPackageStatusApproved:  true,
	domain.WorkPackageStatusScheduled: true,
	domain.WorkPackageStatusExecuting: true,
	domain.WorkPackageStatusDone:      true,
	domain.WorkPackageStatusCancelled: true,
}

// IsValidStatus reports whether s is a recognised work package status.
func IsValidStatus(s string) bool { return validStatuses[s] }

// IsTerminal reports whether s is a terminal status (done or cancelled).
func IsTerminal(s string) bool {
	return s == domain.WorkPackageStatusDone || s == domain.WorkPackageStatusCancelled
}

// CanTransition reports whether moving from → to is a legal transition.
// A no-op transition (from == to) is not considered legal — callers that allow
// idempotent updates should special-case it.
func CanTransition(from, to string) bool {
	for _, allowed := range allowedTransitions[from] {
		if allowed == to {
			return true
		}
	}
	return false
}

// ValidateTransition returns a structured error if from → to is not a legal
// transition, or nil if it is. The error messages are deterministic so callers
// can surface them to MCP clients.
func ValidateTransition(from, to string) error {
	if !IsValidStatus(from) {
		return fmt.Errorf("invalid current status %q", from)
	}
	if !IsValidStatus(to) {
		return fmt.Errorf("invalid target status %q", to)
	}
	if from == to {
		return fmt.Errorf("status is already %q", to)
	}
	if IsTerminal(from) {
		return fmt.Errorf("work package is in terminal status %q and cannot transition to %q", from, to)
	}
	if !CanTransition(from, to) {
		return fmt.Errorf("illegal transition %q → %q (allowed from %q: %v)", from, to, from, allowedTransitions[from])
	}
	return nil
}

// NextStatuses returns the statuses reachable from the given status.
func NextStatuses(from string) []string {
	return allowedTransitions[from]
}
