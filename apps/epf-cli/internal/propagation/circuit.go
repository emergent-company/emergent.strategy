package propagation

import (
	"fmt"
	"log"
	"math"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/reasoning"
)

// Circuit is the propagation engine that cascades strategy changes through
// the semantic graph using tiered LLM reasoning.
type Circuit struct {
	graph    *GraphSnapshot
	reasoner reasoning.Reasoner
	config   Config

	// Runtime state for the current cascade.
	evalCounts map[string]int       // key → number of evaluations (oscillation detection)
	evalTimes  map[string]time.Time // key → last evaluation time (temporal damping)
	tokensUsed int                  // cumulative token usage
}

// NewCircuit creates a propagation circuit with the given graph, reasoner, and config.
func NewCircuit(graph *GraphSnapshot, reasoner reasoning.Reasoner, config Config) *Circuit {
	budget := config.TokenBudget
	if budget == 0 {
		budget = TokenBudgetForMode(config.Mode)
	}
	config.TokenBudget = budget

	return &Circuit{
		graph:      graph,
		reasoner:   reasoner,
		config:     config,
		evalCounts: make(map[string]int),
		evalTimes:  make(map[string]time.Time),
	}
}

// propagationSignal is an internal signal queued for processing.
type propagationSignal struct {
	signal reasoning.Signal
	depth  int // hop count from the original change
	wave   int // cascade wave number
}

// Propagate runs the cascade from a source change.
// This is the main entry point for the propagation circuit.
func (c *Circuit) Propagate(signal reasoning.Signal) *CascadeResult {
	start := time.Now()
	result := &CascadeResult{}

	// Seed the queue with the initial signal
	queue := []propagationSignal{
		{signal: signal, depth: 0, wave: 0},
	}

	currentWave := 0

	for len(queue) > 0 {
		// Take the next signal
		ps := queue[0]
		queue = queue[1:]

		if ps.wave > currentWave {
			currentWave = ps.wave
		}

		// Find the source node
		sourceNode, ok := c.graph.Nodes[ps.signal.SourceNodeKey]
		if !ok {
			continue // source node not in graph
		}

		// Get neighbors
		neighbors := sourceNode.Neighbors(c.graph)

		// Evaluate each neighbor
		for _, neighbor := range neighbors {
			// --- Protection Layer 1: Signal Decay ---
			decayedStrength := ps.signal.Strength * math.Pow(c.config.DecayFactor, float64(ps.depth+1))
			if decayedStrength < c.config.MinSignalStrength {
				result.SkippedNodes = append(result.SkippedNodes, SkippedNode{
					NodeKey: neighbor.Key, Reason: "below_threshold", SignalStrength: decayedStrength,
				})
				continue
			}

			// --- Protection Layer 6: Inertia Threshold ---
			// Higher inertia nodes need stronger signals.
			// Threshold = tier / 10 (tier 7 → 0.7, tier 1 → 0.1)
			inertiaThr := float64(neighbor.InertiaTier) / 10.0
			if decayedStrength < inertiaThr {
				result.SkippedNodes = append(result.SkippedNodes, SkippedNode{
					NodeKey: neighbor.Key, Reason: "below_threshold", SignalStrength: decayedStrength,
				})
				continue
			}

			// --- Protection Layer 3: Oscillation Detection ---
			if c.evalCounts[neighbor.Key] >= c.config.MaxEvaluationsPerNode {
				result.FrozenNodes = append(result.FrozenNodes, neighbor.Key)
				result.SkippedNodes = append(result.SkippedNodes, SkippedNode{
					NodeKey: neighbor.Key, Reason: "oscillation_frozen",
				})
				continue
			}

			// --- Protection Layer 2: Temporal Damping ---
			if lastEval, exists := c.evalTimes[neighbor.Key]; exists {
				if time.Since(lastEval) < c.config.DampingInterval {
					result.SkippedNodes = append(result.SkippedNodes, SkippedNode{
						NodeKey: neighbor.Key, Reason: "damping",
					})
					continue
				}
			}

			// --- Protection Layer 4: Token Budget ---
			if c.tokensUsed >= c.config.TokenBudget {
				result.BudgetExhausted = true
				result.SkippedNodes = append(result.SkippedNodes, SkippedNode{
					NodeKey: neighbor.Key, Reason: "budget_exhausted",
				})
				continue
			}

			// Build the evaluation request
			neighborhood := c.buildNeighborhood(neighbor, ps.signal.SourceNodeKey)
			evalReq := reasoning.EvaluationRequest{
				Signal: reasoning.Signal{
					SourceNodeKey:  ps.signal.SourceNodeKey,
					SourceNodeType: ps.signal.SourceNodeType,
					ChangeType:     ps.signal.ChangeType,
					Description:    ps.signal.Description,
					Strength:       decayedStrength,
					Before:         ps.signal.Before,
					After:          ps.signal.After,
				},
				Target: neighbor.ToReasoningNode(c.graph, ps.signal.SourceNodeKey),
			}

			// Add neighborhood context (up to 10 nodes to keep prompt size reasonable)
			for i, n := range neighborhood {
				if i >= 10 {
					break
				}
				evalReq.Neighborhood = append(evalReq.Neighborhood,
					n.ToReasoningNode(c.graph, neighbor.Key))
			}

			// Evaluate
			assessment, err := c.reasoner.Evaluate(evalReq)
			if err != nil {
				log.Printf("[circuit] evaluation failed for %s: %v", neighbor.Key, err)
				continue
			}

			// Record evaluation
			c.evalCounts[neighbor.Key]++
			c.evalTimes[neighbor.Key] = time.Now()
			c.tokensUsed += assessment.TokensUsed.Total()

			nodeEval := NodeEvaluation{
				NodeKey:        neighbor.Key,
				NodeType:       neighbor.Type,
				InertiaTier:    neighbor.InertiaTier,
				SignalStrength: decayedStrength,
				SignalSource:   ps.signal.SourceNodeKey,
				Assessment:     assessment,
				Wave:           ps.wave,
				Timestamp:      time.Now(),
			}
			result.Trace = append(result.Trace, nodeEval)

			// Handle verdict
			switch assessment.Verdict {
			case reasoning.VerdictModified:
				change := ProposedChange{
					NodeKey:        neighbor.Key,
					NodeType:       neighbor.Type,
					Changes:        assessment.ProposedChanges,
					Classification: assessment.Classification,
					Reasoning:      assessment.Reasoning,
					Wave:           ps.wave,
				}

				if c.config.DryRun || assessment.Classification != reasoning.ClassMechanical {
					// Non-mechanical changes or dry-run: propose, don't apply
					change.Applied = false
					result.ProposedChanges = append(result.ProposedChanges, change)
				} else {
					// Mechanical changes in non-dry-run: apply
					change.Applied = true
					result.AppliedChanges = append(result.AppliedChanges, change)
				}

				// Emit new signal from the changed node (propagate further)
				newSignal := reasoning.Signal{
					SourceNodeKey:  neighbor.Key,
					SourceNodeType: neighbor.Type,
					ChangeType:     "content_modified",
					Description:    fmt.Sprintf("Cascaded from %s: %s", ps.signal.SourceNodeKey, assessment.Reasoning),
					Strength:       decayedStrength, // will be decayed further on next hop
				}
				queue = append(queue, propagationSignal{
					signal: newSignal,
					depth:  ps.depth + 1,
					wave:   ps.wave + 1,
				})

			case reasoning.VerdictNeedsReview:
				// Record as proposed change requiring human review
				if assessment.ProposedChanges != nil {
					result.ProposedChanges = append(result.ProposedChanges, ProposedChange{
						NodeKey:        neighbor.Key,
						NodeType:       neighbor.Type,
						Changes:        assessment.ProposedChanges,
						Classification: assessment.Classification,
						Reasoning:      assessment.Reasoning,
						Applied:        false,
						Wave:           ps.wave,
					})
				}

			case reasoning.VerdictUnchanged:
				// No action needed — signal stops here for this branch

			case reasoning.VerdictNeedsCreation:
				// Record as proposed new artifact/relationship
				result.ProposedChanges = append(result.ProposedChanges, ProposedChange{
					NodeKey:        neighbor.Key,
					NodeType:       neighbor.Type,
					Changes:        assessment.ProposedChanges,
					Classification: reasoning.ClassCreative,
					Reasoning:      assessment.Reasoning,
					Applied:        false,
					Wave:           ps.wave,
				})
			}
		}
	}

	result.Waves = currentWave + 1
	result.TotalTokensUsed = c.tokensUsed
	result.Duration = time.Since(start)

	return result
}

// buildNeighborhood returns the semantic neighborhood of a node,
// excluding the signal source (to avoid circular context).
func (c *Circuit) buildNeighborhood(node *GraphNode, excludeKey string) []*GraphNode {
	neighbors := node.Neighbors(c.graph)
	var filtered []*GraphNode
	for _, n := range neighbors {
		if n.Key != excludeKey {
			filtered = append(filtered, n)
		}
	}
	return filtered
}
