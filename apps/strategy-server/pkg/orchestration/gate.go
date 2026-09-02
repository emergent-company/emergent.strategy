package orchestration

import "time"

// AbandonedGate describes a run parked at a human gate past a threshold.
// Backend-agnostic: any store that can list its awaiting_human runs can use
// FindAbandonedGates to decide which ones to release, without reimplementing
// the clock-fallback logic below.
type AbandonedGate struct {
	Run         *Run
	StepIndex   int
	ParkedSince time.Time
}

// OpenGate locates the step holding a run open and when its wait began.
// StepIndex is -1 when no step is marked awaiting_human, which can happen for
// a run whose status and step log disagree.
//
// The clock starts at the gate's own GateOpenedAt where it is known. Runs
// written before that field existed fall back to CreatedAt, which is a
// conservative lower bound on how long they have been parked — UpdatedAt is
// unsuitable because unrelated writes touch it: a run parked in the dev
// database for three months carried an UpdatedAt from a few days prior for
// exactly that reason.
func OpenGate(run *Run) (stepIndex int, parkedSince time.Time) {
	for i := range run.Steps {
		if run.Steps[i].Status != "awaiting_human" {
			continue
		}
		if opened := run.Steps[i].GateOpenedAt; opened != nil {
			return i, *opened
		}
		return i, run.CreatedAt
	}
	return -1, run.CreatedAt
}

// FindAbandonedGates filters a set of awaiting_human runs down to those
// parked longer than olderThan. Callers supply the candidate set (typically
// "all runs with status = awaiting_human") since fetching that set is a
// store-specific, backend-specific concern; deciding which of them are
// abandoned is not.
func FindAbandonedGates(runs []*Run, olderThan time.Duration, now time.Time) []AbandonedGate {
	var abandoned []AbandonedGate
	for _, run := range runs {
		stepIndex, parkedSince := OpenGate(run)
		if now.Sub(parkedSince) <= olderThan {
			continue
		}
		abandoned = append(abandoned, AbandonedGate{
			Run:         run,
			StepIndex:   stepIndex,
			ParkedSince: parkedSince,
		})
	}
	return abandoned
}
