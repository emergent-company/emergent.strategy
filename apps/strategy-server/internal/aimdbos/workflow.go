package aimdbos

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/dbos-inc/dbos-transact-golang/dbos"
	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/aim"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
)

// cycleInput is the DBOS workflow's input. Confirmed by direct probe that
// DBOS persists workflow input/output via gob encoding, so every field must
// be a plain, gob-friendly type — no interfaces, no function values.
//
// WorkflowName lets one registered DBOS function serve every AIM-shaped
// workflow this engine is asked to run: DBOS's own registration model
// allows at most one registration per Go function value (a bound method
// like e.cycleWorkflow counts as one), so dispatch happens inside the
// function body by looking WorkflowName up in e.steps, rather than by
// registering a distinct DBOS function per workflow name the way
// BuildAIMGraph did per ADK graph.
type cycleInput struct {
	WorkflowName string
	RunID        string
	InstanceID   string
	Params       map[string]any
	// PlannedSteps is the ordered step-name plan resolved once, in host
	// code, by StartRun before this workflow ever begins — see StartRun's
	// doc comment for why that (and not a memoized in-workflow planning
	// step) is what "decided once at cycle start" means concretely. The
	// workflow may still replace its own local copy mid-execution via
	// checkReplan, but the plan this field held at start is never itself
	// mutated (DBOS persists workflow input once).
	PlannedSteps []string
}

// replanSignal is sent by DBOSEngine.Replan and received by checkReplan.
// It carries no payload: re-planning always re-derives the new plan from
// the registered aim.Planner, not from anything the sender supplies — the
// sender is asking "please reconsider," not dictating what the answer
// should be.
type replanSignal struct{}

// replanTopic is fixed, not per-run: dbos.Recv only ever sees messages
// addressed to its own workflow's ID (confirmed by the same probe that
// established gateTopic does not need a run ID embedded either), so one
// topic name serves every run.
const replanTopic = "replan"

// replanRecvGrace bounds how long checkReplan waits for the signal once
// RunStore reports one pending. DBOSEngine.Replan sets the flag
// immediately before sending, so this is a safety margin for the (already
// vanishingly unlikely, since both calls happen back to back in the same
// host-code function) race where the flag commits before the message
// does — not a real waiting period in the normal case.
const replanRecvGrace = 5 * time.Second

// gateVerdict is what Send/Recv carries across a human gate. StepName
// guards against a stray or duplicate message resolving the wrong gate:
// each gate already uses its own topic (gateTopic), so this should be
// unreachable in practice, but the check costs nothing and mirrors the
// carefulness ADK's fresh-interrupt-ID-per-pause discipline had for exactly
// this class of mistake (a resume landing on the wrong, already-resolved
// gate).
type gateVerdict struct {
	StepName  string
	Committed bool
}

// errGateAbandoned reports that a gate's Recv timed out with nobody having
// responded — DBOS's own timeout mechanism doubling as the abandoned-gate
// sweep ADK needed a separate ticker for (design.md, probe 4).
//
// Per design.md's gob-encoding finding: this sentinel's concrete type does
// not survive a crash-and-recover round trip through DBOS's own
// persistence — only the message string does, since an unregistered error
// type loses its identity on the way back out. It is only ever inspected
// via errors.Is immediately after drive() observes the workflow finish
// within the same process. Do not assume errors.Is against it still works
// after a process restart without re-verifying.
var errGateAbandoned = errors.New("aimdbos: gate abandoned — no response before the deadline")

// ErrCycleDiscarded reports that a reviewer rejected a staged batch. Mirrors
// internal/adk.ErrCycleDiscarded's role for the ADK engine: a normal
// outcome, not a fault.
var ErrCycleDiscarded = errors.New("aimdbos: aim cycle discarded by reviewer")

func gateTopic(stepName string) string { return "gate:" + stepName }

// cycleWorkflow is the single DBOS workflow function this engine registers.
// DBOS re-invokes it verbatim on every recovery or fork (confirmed by
// direct probe: log lines from before a Recv call printed again after a
// simulated crash), so everything here that is not itself a
// dbos.RunAsStep call must be safe to execute repeatedly with no
// observable effect beyond the first time — see design.md's "Replay and
// idempotent bookkeeping". The loop and its branching are the only "bare"
// code; every side effect, including this engine's own run-metadata
// bookkeeping, is wrapped in RunAsStep so it is itself memoized.
func (e *DBOSEngine) cycleWorkflow(ctx dbos.Context, in cycleInput) (string, error) {
	runID, err := uuid.Parse(in.RunID)
	if err != nil {
		return "", fmt.Errorf("aimdbos: invalid run id %q: %w", in.RunID, err)
	}
	instanceID, err := uuid.Parse(in.InstanceID)
	if err != nil {
		return "", fmt.Errorf("aimdbos: invalid instance id %q: %w", in.InstanceID, err)
	}

	e.mu.RLock()
	registry := e.steps[in.WorkflowName]
	planner := e.planners[in.WorkflowName]
	e.mu.RUnlock()
	if len(registry) == 0 {
		return "", fmt.Errorf("aimdbos: unknown workflow %q", in.WorkflowName)
	}

	var prior []aim.StepOutput
	remaining := append([]string(nil), in.PlannedSteps...)
	for len(remaining) > 0 {
		name := remaining[0]
		remaining = remaining[1:]

		step, ok := registry[name]
		if !ok {
			return "", fmt.Errorf("aimdbos: planner selected unknown step %q", name)
		}

		out, stepErr := dbos.RunAsStep(ctx, func(stepCtx context.Context) (result aim.StepOutput, err error) {
			// A step body panicking (a real bug in domain/skillexec code,
			// for instance) must not be allowed to propagate: RunAsStep
			// executes this closure in DBOS's own internal goroutine
			// (confirmed by direct crash — a nil-pointer panic here took
			// down the entire test binary, not just the one workflow, with
			// no "recovered" frame anywhere in the trace, meaning DBOS
			// itself does not catch step panics). Converting it to a
			// normal error here is what keeps one AIM step's bug from
			// being a strategy-server-wide outage.
			defer func() {
				if r := recover(); r != nil {
					err = fmt.Errorf("%s: panicked: %v", step.Name, r)
				}
			}()
			return step.Run(stepCtx, aim.StepInput{
				RunID:      in.RunID,
				InstanceID: instanceID,
				Params:     in.Params,
				Prior:      prior,
			})
		}, dbos.WithStepName(step.Name))
		if stepErr != nil {
			_ = e.recordFailure(ctx, runID, step.Name, stepErr)
			return "", fmt.Errorf("%s: %w", step.Name, stepErr)
		}
		out.Step = step.Name
		prior = append(prior, out)

		if err := e.recordStepDone(ctx, runID, out); err != nil {
			return "", err
		}

		if step.HumanGate && out.BatchID != "" {
			if err := e.recordGateOpened(ctx, runID, step.Name); err != nil {
				return "", err
			}

			verdict, recvErr := dbos.Recv[gateVerdict](ctx, gateTopic(step.Name), e.cfg.AbandonGatesAfter)
			switch {
			case errors.Is(recvErr, dbos.ErrTimeout):
				_ = e.recordGateAbandoned(ctx, runID, step.Name)
				return "", errGateAbandoned
			case recvErr != nil:
				return "", fmt.Errorf("%s: recv gate verdict: %w", step.Name, recvErr)
			case verdict.StepName != step.Name:
				// Should be unreachable — each gate has its own topic — but
				// silently proceeding on a mismatch would apply the wrong
				// verdict to the wrong step.
				return "", fmt.Errorf("%s: gate verdict for %q arrived on this step's topic", step.Name, verdict.StepName)
			}

			if err := e.recordGateCleared(ctx, runID, step.Name, verdict.Committed); err != nil {
				return "", err
			}
			if !verdict.Committed {
				return "", ErrCycleDiscarded
			}
		}

		// Step boundary: check for an explicit re-plan request before
		// deciding what runs next. This never runs mid-step — step.Run and
		// any gate above it have both already fully resolved by this
		// point — matching Planner's contract that re-planning influences
		// only what comes next, never work already in flight.
		newRemaining, err := e.checkReplan(ctx, runID, instanceID, in.WorkflowName, planner, step.Name, prior, remaining)
		if err != nil {
			return "", err
		}
		remaining = newRemaining
	}

	if err := e.recordCompleted(ctx, runID); err != nil {
		return "", err
	}
	return "done", nil
}

// checkReplan is the step-boundary hook for Part C4's mid-cycle re-plan
// signal. In the overwhelmingly common case — nobody ever calls
// DBOSEngine.Replan for this run — it costs exactly one small, memoized DB
// read (RunStore.ReplanRequested) and nothing else: no dbos.Recv call, and
// therefore none of DBOS's own "timeout reached" WARN logging, at any
// boundary of any ordinary cycle. Only once RunStore reports a pending
// request does it call dbos.Recv at all.
//
// afterStep names the boundary this check sits at (the step that just
// finished, or "" at cycle start were this ever called there — it isn't,
// today), purely so DBOS's own step ledger reads legibly; it has no
// bearing on correctness.
func (e *DBOSEngine) checkReplan(
	ctx dbos.Context,
	runID, instanceID uuid.UUID,
	workflowName string,
	planner aim.Planner,
	afterStep string,
	prior []aim.StepOutput,
	current []string,
) ([]string, error) {
	requested, err := dbos.RunAsStep(ctx, func(stepCtx context.Context) (bool, error) {
		return e.store.ReplanRequested(stepCtx, runID)
	}, dbos.WithStepName(afterStep+"_replan_check"))
	if err != nil {
		return nil, fmt.Errorf("check replan requested: %w", err)
	}
	if !requested {
		return current, nil
	}

	// A request is pending. Consume the signal if it has arrived; a
	// timeout here is treated as "proceed anyway, with whatever Plan says
	// right now" rather than an error — Replan's caller already knows the
	// signal carries no information of its own (replanSignal{} is empty),
	// so a slow or lost delivery is not a reason to fail the whole cycle,
	// only a reason not to wait indefinitely for it.
	_, recvErr := dbos.Recv[replanSignal](ctx, replanTopic, replanRecvGrace)
	if recvErr != nil && !errors.Is(recvErr, dbos.ErrTimeout) {
		return nil, fmt.Errorf("recv replan signal: %w", recvErr)
	}

	newNames, err := dbos.RunAsStep(ctx, func(stepCtx context.Context) ([]string, error) {
		return planner.Plan(stepCtx, instanceID, prior)
	}, dbos.WithStepName(afterStep+"_replanned"))
	if err != nil {
		return nil, fmt.Errorf("aimdbos: workflow %q: re-plan: %w", workflowName, err)
	}

	if err := e.recordReplanned(ctx, runID, newNames); err != nil {
		return nil, err
	}
	return newNames, nil
}

// ── bookkeeping steps ────────────────────────────────────────────────────
//
// Each of these is wrapped in dbos.RunAsStep by its caller inline in
// cycleWorkflow — not here — so that the wrapping is visible at the call
// site rather than hidden a layer down. These functions do the actual
// read-modify-write against RunStore; a fresh read of the run's current
// Steps slice on every call keeps them correct regardless of how many
// other steps have completed since the run was first created, without
// needing an in-memory copy threaded through the workflow function (which
// would itself be a piece of state that has to survive replay correctly).

func (e *DBOSEngine) recordStepDone(ctx dbos.Context, runID uuid.UUID, out aim.StepOutput) error {
	_, err := dbos.RunAsStep(ctx, func(stepCtx context.Context) (struct{}, error) {
		return struct{}{}, e.withRun(stepCtx, runID, func(run *orchestration.Run) {
			idx, ok := stepIndex(run, out.Step)
			// One timestamp for both fields, not a separate dispatch-time
			// capture: unlike ADK's drive(), which observed a dispatch
			// event and a completion event as two distinct points in an
			// external event stream, this recording step only runs once
			// the domain step (a separate, earlier RunAsStep call) has
			// already finished — there is no earlier "dispatched" instant
			// available here to record without adding a second bookkeeping
			// step purely to capture it. Simpler and honest about what it
			// measures, at the cost of not reporting step duration.
			recorded := nowUTC()
			log := orchestration.StepLog{
				Name:       out.Step,
				Status:     "done",
				BatchID:    out.BatchID,
				Meta:       out.Meta,
				StartedAt:  &recorded,
				FinishedAt: &recorded,
			}
			if ok {
				run.Steps[idx] = log
			} else {
				run.Steps = append(run.Steps, log)
			}
			run.CurrentStep = out.Step
			run.Status = orchestration.StatusRunning
		})
	}, dbos.WithStepName(out.Step+"_recorded"))
	return err
}

func (e *DBOSEngine) recordGateOpened(ctx dbos.Context, runID uuid.UUID, stepName string) error {
	_, err := dbos.RunAsStep(ctx, func(stepCtx context.Context) (struct{}, error) {
		return struct{}{}, e.withRun(stepCtx, runID, func(run *orchestration.Run) {
			idx, ok := stepIndex(run, stepName)
			if !ok {
				return
			}
			now := nowUTC()
			run.Steps[idx].Status = "awaiting_human"
			run.Steps[idx].GateOpenedAt = &now
			run.CurrentStep = stepName
			run.Status = orchestration.StatusAwaitingHuman
		})
	}, dbos.WithStepName(stepName+"_gate_opened"))
	return err
}

// recordGateCleared records the reviewer's verdict against the gate's step
// and sets the run's own status in the same write: committed continues the
// cycle (StatusRunning — the next loop iteration, if any, will move it on
// again); discarded ends it (StatusAborted, matching ADKEngine's identical
// mapping). Setting both in one step means the run never has an
// observable moment where the gate is recorded as resolved but the run's
// own status has not caught up yet.
func (e *DBOSEngine) recordGateCleared(ctx dbos.Context, runID uuid.UUID, stepName string, committed bool) error {
	outcome := orchestration.GateDiscarded
	runStatus := orchestration.StatusAborted
	if committed {
		outcome = orchestration.GateCommitted
		runStatus = orchestration.StatusRunning
	}
	_, err := dbos.RunAsStep(ctx, func(stepCtx context.Context) (struct{}, error) {
		return struct{}{}, e.withRun(stepCtx, runID, func(run *orchestration.Run) {
			idx, ok := stepIndex(run, stepName)
			if !ok {
				return
			}
			now := nowUTC()
			run.Steps[idx].GateClearedAt = &now
			run.Steps[idx].GateOutcome = outcome
			run.Steps[idx].Status = "done"
			run.Status = runStatus
		})
	}, dbos.WithStepName(stepName+"_gate_cleared"))
	return err
}

func (e *DBOSEngine) recordGateAbandoned(ctx dbos.Context, runID uuid.UUID, stepName string) error {
	_, err := dbos.RunAsStep(ctx, func(stepCtx context.Context) (struct{}, error) {
		return struct{}{}, e.withRun(stepCtx, runID, func(run *orchestration.Run) {
			idx, ok := stepIndex(run, stepName)
			if ok {
				now := nowUTC()
				run.Steps[idx].GateClearedAt = &now
				run.Steps[idx].GateOutcome = orchestration.GateAbandoned
				run.Steps[idx].Status = "done"
			}
			run.Status = orchestration.StatusFailed
			run.Error = "human review abandoned"
		})
	}, dbos.WithStepName(stepName+"_gate_abandoned"))
	return err
}

// recordFailure marks the run failed when a domain step itself errors — the
// gap that let TestDBOSEngine_Retry_SkipsCompletedSteps_ResumesAtFailure
// hang waiting for StatusFailed during development: every other terminal
// path (completed, gate cleared, gate abandoned) had its own recording
// step, but a plain step error fell through to a bare `return "", err`
// with no bookkeeping call at all, leaving aim_cycle_runs stuck at
// "running" forever. stepErr's message is captured as a plain string, not
// passed to DBOS for persistence itself, so the gob-encoding limitation on
// workflow-level errors (design.md) does not apply to this row.
//
// Also marks the failing step's own StepLog entry — a second gap found
// only by manual testing (a real cycle failing against real data, not a
// synthetic test fixture): this originally set only the run-level Status
// and Error, leaving the failed step's row in run.Steps at whatever status
// it had before (typically "pending", since a step that errors never
// reaches recordStepDone). The run panel's per-step rendering only shows
// an error line for a step whose own Status is "failed"
// (aim_run_panel.templ) — so the timeline silently showed no failure at
// all at the step level, even though the header correctly showed "Failed".
func (e *DBOSEngine) recordFailure(ctx dbos.Context, runID uuid.UUID, stepName string, stepErr error) error {
	msg := stepErr.Error()
	_, err := dbos.RunAsStep(ctx, func(stepCtx context.Context) (struct{}, error) {
		return struct{}{}, e.withRun(stepCtx, runID, func(run *orchestration.Run) {
			run.Status = orchestration.StatusFailed
			run.Error = fmt.Sprintf("%s: %s", stepName, msg)
			run.CurrentStep = stepName

			if idx, ok := stepIndex(run, stepName); ok {
				run.Steps[idx].Status = "failed"
				run.Steps[idx].Error = msg
				now := nowUTC()
				run.Steps[idx].FinishedAt = &now
			}
		})
	}, dbos.WithStepName(stepName+"_failure_recorded"))
	return err
}

func (e *DBOSEngine) recordCompleted(ctx dbos.Context, runID uuid.UUID) error {
	_, err := dbos.RunAsStep(ctx, func(stepCtx context.Context) (struct{}, error) {
		return struct{}{}, e.withRun(stepCtx, runID, func(run *orchestration.Run) {
			run.Status = orchestration.StatusCompleted
			run.CurrentStep = ""
		})
	}, dbos.WithStepName("cycle_completed"))
	return err
}

// recordReplanned updates run.Steps' projection after a mid-cycle re-plan:
// every step already done, awaiting human review, or currently running is
// kept untouched — re-planning must never retroactively rewrite something
// that already happened or is in flight — and the entire pending tail is
// replaced with newRemaining. It also clears the replan_requested flag
// checkReplan found set, in the same step: leaving it set would make every
// following boundary call dbos.Recv again for a signal that has already
// been consumed, reintroducing the timeout-logging cost this whole
// mechanism exists to avoid in the common case.
func (e *DBOSEngine) recordReplanned(ctx dbos.Context, runID uuid.UUID, newRemaining []string) error {
	_, err := dbos.RunAsStep(ctx, func(stepCtx context.Context) (struct{}, error) {
		if err := e.store.SetReplanRequested(stepCtx, runID, false); err != nil {
			return struct{}{}, fmt.Errorf("clear replan_requested: %w", err)
		}
		return struct{}{}, e.withRun(stepCtx, runID, func(run *orchestration.Run) {
			kept := make([]orchestration.StepLog, 0, len(run.Steps)+len(newRemaining))
			for _, s := range run.Steps {
				if s.Status != "pending" {
					kept = append(kept, s) // done, awaiting_human, or running — never rewritten here
				}
			}
			for _, name := range newRemaining {
				kept = append(kept, orchestration.StepLog{Name: name, Status: "pending"})
			}
			run.Steps = kept
		})
	}, dbos.WithStepName("replan_recorded"))
	return err
}

// withRun reads the current run, applies mutate, and persists the result —
// the same read-mutate-write shape internal/aimadk's drive() used inline,
// factored out here since every recording helper above needs it.
func (e *DBOSEngine) withRun(ctx context.Context, runID uuid.UUID, mutate func(*orchestration.Run)) error {
	run, err := e.store.GetByID(ctx, runID)
	if err != nil {
		return fmt.Errorf("aimdbos: load run %s for bookkeeping: %w", runID, err)
	}
	mutate(run)
	if err := e.store.UpdateStatus(ctx, run.ID, run.Status, run.CurrentStep, run.Error, run.Steps); err != nil {
		return fmt.Errorf("aimdbos: persist run %s bookkeeping: %w", runID, err)
	}
	return nil
}

// stepIndex finds name's entry in run.Steps.
func stepIndex(run *orchestration.Run, name string) (int, bool) {
	for i, s := range run.Steps {
		if s.Name == name {
			return i, true
		}
	}
	return 0, false
}

// nowUTC reads the current time. Only ever called from inside a
// dbos.RunAsStep body (every call site above is), which is what makes it
// safe: RunAsStep checkpoints the step's output the first time it actually
// runs, so this read happens once per step, not once per replay — the same
// discipline DBOS's own docs prescribe for any non-deterministic operation.
func nowUTC() time.Time { return time.Now().UTC() }
