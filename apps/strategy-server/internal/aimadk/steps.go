// Package aimadk adapts the engine-neutral AIM cycle steps for execution as an
// ADK workflow graph.
//
// It exists so that neither side has to know about the other: domain/aim keeps
// its steps free of any engine's types, and internal/adk keeps no dependency on
// the AIM domain. The coupling lives here, in one place, at the wiring layer.
package aimadk

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/aim"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/adk"
)

// Steps converts the AIM cycle steps into the shape the ADK graph executes.
func Steps(steps []aim.Step) []adk.AIMStep {
	out := make([]adk.AIMStep, len(steps))
	for i, step := range steps {
		out[i] = adk.AIMStep{
			Name:      step.Name,
			HumanGate: step.HumanGate,
			Run:       runFunc(step),
		}
	}
	return out
}

// runFunc bridges one step's calling convention. The only real translation is
// the instance id: ADK session state is JSON, so it travels as a string and is
// parsed back here rather than in every step body.
func runFunc(step aim.Step) func(context.Context, adk.AIMStepInput) (adk.AIMStepResult, error) {
	return func(ctx context.Context, in adk.AIMStepInput) (adk.AIMStepResult, error) {
		instanceID, err := uuid.Parse(in.InstanceID)
		if err != nil {
			return adk.AIMStepResult{}, fmt.Errorf("aim step %s: invalid instance id %q: %w", step.Name, in.InstanceID, err)
		}

		out, err := step.Run(ctx, aim.StepInput{
			RunID:      in.RunID,
			InstanceID: instanceID,
			Params:     in.Params,
			Prior:      priorSteps(in.Prior),
		})
		if err != nil {
			return adk.AIMStepResult{}, err
		}

		return adk.AIMStepResult{
			Step:    out.Step,
			BatchID: out.BatchID,
			Meta:    out.Meta,
		}, nil
	}
}

func priorSteps(prior []adk.AIMStepResult) []aim.StepOutput {
	out := make([]aim.StepOutput, len(prior))
	for i, p := range prior {
		out[i] = aim.StepOutput{Step: p.Step, BatchID: p.BatchID, Meta: p.Meta}
	}
	return out
}
