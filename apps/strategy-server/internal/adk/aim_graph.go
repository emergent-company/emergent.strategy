package adk

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/workflowagent"
	"google.golang.org/adk/v2/session"
	"google.golang.org/adk/v2/workflow"
)

// Session-state keys. Run context cannot be threaded through node I/O: a gate
// returns workflow.ErrNodeInterrupted rather than a value, and on resume the
// node downstream of it receives the reviewer's reply instead of the gate's
// output. Session state is the only channel that survives a pause.
//
// InstanceID, RunID and Params are seeded by the caller when the session is
// created. StepResults is accumulated by the graph as steps complete.
const (
	StateKeyInstanceID  = "instance_id"
	StateKeyRunID       = "run_id"
	StateKeyParams      = "params"
	StateKeyStepResults = "step_results"
)

// gateReplyKey is the field a reviewer's reply must carry to say whether the
// staged batch was committed.
const gateReplyKey = "committed"

// ErrCycleDiscarded reports that a reviewer rejected a staged batch. It is a
// normal outcome rather than a fault; the engine layer translates it into an
// aborted run, matching the legacy engine's Resume(committed=false) behaviour.
var ErrCycleDiscarded = errors.New("adk: aim cycle discarded by reviewer")

// AIMStepResult is what one step produces. A step that stages no mutations
// leaves BatchID empty, which lets the gate downstream auto-advance.
type AIMStepResult struct {
	Step    string         `json:"step"`
	BatchID string         `json:"batch_id,omitempty"`
	Meta    map[string]any `json:"meta,omitempty"`
}

// AIMStepInput is everything a step is given. It mirrors what the legacy
// engine exposed through its Run record, so the same step bodies satisfy both.
type AIMStepInput struct {
	// RunID identifies the cycle. Stable across pauses, unlike an ADK
	// invocation ID, which changes on every resume turn.
	RunID string
	// InstanceID is the EPF instance the cycle runs against.
	InstanceID string
	// Params are the caller's run inputs (the legacy Run.Input).
	Params map[string]any
	// Prior holds the results of completed steps, in order. snapshot_cycle
	// reads it to recover the calibration decision recorded by earlier steps.
	Prior []AIMStepResult
}

// AIMStep is one unit of cycle work. Run is injected by the caller so this
// package holds no dependency on domain/aim, and so both the legacy engine and
// this graph can drive the same step bodies rather than two parallel
// implementations that have to be kept honest by hand.
type AIMStep struct {
	Name      string
	HumanGate bool
	Run       func(ctx context.Context, in AIMStepInput) (AIMStepResult, error)
}

// autoAdvanced is handed downstream by a gate that declined to pause because
// its step staged nothing. It is distinct from a reviewer's reply so the next
// step can tell "nobody was asked" apart from "somebody approved".
type autoAdvanced struct {
	From string
}

// BuildAIMGraph wires steps into an ADK workflow agent.
//
// Each gated step becomes two nodes rather than one:
//
//	work → gate → work → gate → …
//
// The single-node HITL pattern (NodeConfig.RerunOnResume with
// workflow.ResumeOrRequestInput) re-runs the node body once the reviewer
// answers. AIM steps call an LLM and stage a mutation batch before pausing, so
// that pattern would repeat the call and stage a second batch on every
// approval. Splitting the pause into its own node keeps the work node from
// running twice.
func BuildAIMGraph(name string, steps []AIMStep) (agent.Agent, error) {
	if name == "" {
		return nil, errors.New("adk: aim graph requires a name")
	}
	if len(steps) == 0 {
		return nil, errors.New("adk: aim graph requires at least one step")
	}

	nodes := make([]workflow.Node, 0, len(steps)*2+1)
	nodes = append(nodes, workflow.Start)

	seen := make(map[string]bool, len(steps))
	for i, step := range steps {
		switch {
		case step.Name == "":
			return nil, errors.New("adk: aim step requires a name")
		case step.Run == nil:
			return nil, fmt.Errorf("adk: aim step %q requires a Run function", step.Name)
		case seen[step.Name]:
			return nil, fmt.Errorf("adk: duplicate aim step %q", step.Name)
		}
		seen[step.Name] = true

		// Whether a step has to settle a review before it runs is known here,
		// statically, from the shape of the graph. Deciding it at runtime by
		// inspecting the input would be guesswork: ADK hands the first node
		// the user message that triggered the run, which is indistinguishable
		// by type from a reviewer's reply.
		followsGate := i > 0 && steps[i-1].HumanGate

		nodes = append(nodes, newWorkNode(step, followsGate))
		if step.HumanGate {
			nodes = append(nodes, newGateNode(step.Name))
		}
	}

	return workflowagent.New(workflowagent.Config{
		Name:        name,
		Description: "AIM cycle",
		Edges:       workflow.Chain(nodes...),
	})
}

// GateNodeName is the node that pauses for review after the given step. It is
// exported so handlers can address a specific gate when resuming a run.
func GateNodeName(step string) string { return step + "_gate" }

// newWorkNode runs one step. When the step sits downstream of a gate, its
// input is the reviewer's reply, which it must settle before doing anything
// expensive. Otherwise the input is ignored: it is either the user message
// that started the run or the preceding step's result, and neither says
// anything about whether this step should proceed.
//
// The node emits its result rather than returning it alone, because a
// returned value does not outlive a pause. Neither does a session-state
// write: agent.Context.Actions() is nil inside a workflow node, and
// State.Set reports success while discarding the write. An event carrying
// Actions.StateDelta is the only path that survives, so the accumulated step
// history is recorded that way.
func newWorkNode(step AIMStep, followsGate bool) workflow.Node {
	return workflow.NewEmittingFunctionNode[any, AIMStepResult](step.Name,
		func(ctx agent.Context, in any, emit func(*session.Event) error) (AIMStepResult, error) {
			if followsGate {
				if err := settleGate(in); err != nil {
					return AIMStepResult{}, err
				}
			}

			stepIn, err := stepInputFromState(ctx)
			if err != nil {
				return AIMStepResult{}, err
			}

			res, err := step.Run(ctx, stepIn)
			if err != nil {
				return AIMStepResult{}, fmt.Errorf("%s: %w", step.Name, err)
			}
			res.Step = step.Name

			if err := recordStepResult(ctx, emit, append(stepIn.Prior, res)); err != nil {
				return AIMStepResult{}, fmt.Errorf("%s: %w", step.Name, err)
			}
			return res, nil
		},
		workflow.NodeConfig{},
	)
}

// recordStepResult persists the step history so far.
func recordStepResult(ctx agent.Context, emit func(*session.Event) error, history []AIMStepResult) error {
	ev := session.NewEvent(ctx, ctx.InvocationID())
	if ev.Actions.StateDelta == nil {
		return errors.New("adk: event has no StateDelta; cannot record step history")
	}
	ev.Actions.StateDelta[StateKeyStepResults] = history

	if err := emit(ev); err != nil {
		return fmt.Errorf("record step history: %w", err)
	}
	return nil
}

// newGateNode pauses for human review of the batch its step staged.
func newGateNode(step string) workflow.Node {
	gate := GateNodeName(step)

	return workflow.NewEmittingFunctionNode[AIMStepResult, any](gate,
		func(ctx agent.Context, in AIMStepResult, emit func(*session.Event) error) (any, error) {
			// Nothing was staged, so there is nothing to review. Pass through
			// rather than parking the cycle on an empty prompt.
			if in.BatchID == "" {
				return autoAdvanced{From: step}, nil
			}

			// A fresh InterruptID per pause: reusing one lets a client treat a
			// later run's prompt as already answered.
			err := emit(workflow.NewRequestInputEvent(ctx, session.RequestInput{
				InterruptID: gate + "-" + uuid.NewString(),
				Message:     fmt.Sprintf("Review %s before it is applied.", step),
				// Structured, so a reviewer UI can render the batch rather
				// than parse a sentence.
				Payload: in,
			}))
			if err != nil {
				return nil, fmt.Errorf("%s: request review: %w", gate, err)
			}

			return nil, workflow.ErrNodeInterrupted
		},
		workflow.NodeConfig{},
	)
}

// settleGate decides whether the cycle continues past a review.
//
// Committing the reviewed batch is the caller's job, done before the run is
// resumed; the graph only observes the verdict. That keeps this package free
// of any dependency on the mutation store and leaves one writer for staged
// batches rather than two.
func settleGate(in any) error {
	// The gate declined to pause because its step staged nothing to review.
	if _, ok := in.(autoAdvanced); ok {
		return nil
	}

	committed, err := replyCommitted(in)
	if err != nil {
		return err
	}
	if !committed {
		return ErrCycleDiscarded
	}
	return nil
}

// replyCommitted reads a reviewer's verdict. Unrecognised shapes are an error
// rather than a default: guessing "committed" here would apply a batch nobody
// approved.
func replyCommitted(reply any) (bool, error) {
	switch r := reply.(type) {
	case bool:
		return r, nil

	case map[string]any:
		raw, ok := r[gateReplyKey]
		if !ok {
			return false, fmt.Errorf("adk: gate reply is missing %q", gateReplyKey)
		}
		committed, ok := raw.(bool)
		if !ok {
			return false, fmt.Errorf("adk: gate reply %q must be a bool, got %T", gateReplyKey, raw)
		}
		return committed, nil

	default:
		return false, fmt.Errorf("adk: unrecognised gate reply of type %T", reply)
	}
}

// stepInputFromState assembles a step's input from session state.
func stepInputFromState(ctx agent.Context) (AIMStepInput, error) {
	instanceID, err := requiredString(ctx, StateKeyInstanceID)
	if err != nil {
		return AIMStepInput{}, err
	}

	prior, err := priorResults(ctx)
	if err != nil {
		return AIMStepInput{}, err
	}

	// RunID and Params are optional: a caller may drive a cycle that needs
	// neither. A storage failure is still reported, though — only absence is
	// tolerated.
	runID, err := optionalValue[string](ctx, StateKeyRunID)
	if err != nil {
		return AIMStepInput{}, err
	}
	params, err := optionalValue[map[string]any](ctx, StateKeyParams)
	if err != nil {
		return AIMStepInput{}, err
	}

	return AIMStepInput{
		RunID:      runID,
		InstanceID: instanceID,
		Params:     params,
		Prior:      prior,
	}, nil
}

// priorResults reads the accumulated step history. State round-trips through
// JSON on its way to the database, so a history written as []AIMStepResult
// reads back as []any of maps. Re-decoding through JSON normalises both.
func priorResults(ctx agent.Context) ([]AIMStepResult, error) {
	raw, err := ctx.State().Get(StateKeyStepResults)
	switch {
	// Absent on the first step, which is not a fault.
	case errors.Is(err, session.ErrStateKeyNotExist):
		return nil, nil
	case err != nil:
		return nil, fmt.Errorf("adk: read %q from session state: %w", StateKeyStepResults, err)
	case raw == nil:
		return nil, nil
	}

	encoded, err := json.Marshal(raw)
	if err != nil {
		return nil, fmt.Errorf("adk: encode %q from session state: %w", StateKeyStepResults, err)
	}

	var history []AIMStepResult
	if err := json.Unmarshal(encoded, &history); err != nil {
		return nil, fmt.Errorf("adk: decode %q from session state: %w", StateKeyStepResults, err)
	}
	return history, nil
}

func requiredString(ctx agent.Context, key string) (string, error) {
	raw, err := ctx.State().Get(key)
	if err != nil {
		return "", fmt.Errorf("adk: read %q from session state: %w", key, err)
	}

	value, ok := raw.(string)
	if !ok {
		return "", fmt.Errorf("adk: session state %q must be a string, got %T", key, raw)
	}
	if value == "" {
		return "", fmt.Errorf("adk: session state %q is empty", key)
	}
	return value, nil
}

// optionalValue reads a key that a caller need not have set. An absent key
// yields the zero value; a storage failure is reported. A present value of the
// wrong type is also tolerated as absent, since these keys are advisory.
func optionalValue[T any](ctx agent.Context, key string) (T, error) {
	var zero T

	raw, err := ctx.State().Get(key)
	switch {
	case errors.Is(err, session.ErrStateKeyNotExist):
		return zero, nil
	case err != nil:
		return zero, fmt.Errorf("adk: read %q from session state: %w", key, err)
	}

	value, ok := raw.(T)
	if !ok {
		return zero, nil
	}
	return value, nil
}
