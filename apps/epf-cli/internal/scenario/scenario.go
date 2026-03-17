// Package scenario implements "what if?" strategy projection using
// emergent.memory graph branching and the propagation circuit.
//
// Workflow:
//  1. Create a scenario (creates a graph branch)
//  2. Apply modifications to nodes on the branch
//  3. Run the propagation circuit on the branched graph
//  4. Review the cascade diff (branched vs main)
//  5. Commit (merge to main + generate YAML) or discard (delete branch)
package scenario

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/memory"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/propagation"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/reasoning"
)

// Scenario represents a "what if?" strategy exploration on a graph branch.
type Scenario struct {
	ID         string // branch ID in Memory
	Name       string // human-readable name
	Hypothesis string // what strategic question is being explored
	CreatedAt  time.Time
	Status     string // "open", "evaluated", "committed", "discarded"

	// Modifications applied to the branch before running the circuit.
	Modifications []Modification

	// EvaluationResult holds the propagation circuit output (after Evaluate).
	EvaluationResult *propagation.CascadeResult
}

// Modification describes a change to apply to the branched graph.
type Modification struct {
	NodeKey    string         // key of the node to modify
	Changes    map[string]any // property changes
	ChangeType string         // "content_modified", "created", "deleted"
}

// DiffEntry shows how a node differs between the main and branched graphs.
type DiffEntry struct {
	NodeKey      string
	NodeType     string
	Status       string // "modified", "unchanged", "cascade_modified"
	MainValues   map[string]any
	BranchValues map[string]any
	Reasoning    string // from the propagation circuit
}

// Manager handles scenario lifecycle.
type Manager struct {
	client   *memory.Client
	reasoner reasoning.Reasoner
}

// NewManager creates a scenario manager.
func NewManager(client *memory.Client, reasoner reasoning.Reasoner) *Manager {
	return &Manager{client: client, reasoner: reasoner}
}

// Create creates a new scenario with a graph branch.
func (m *Manager) Create(ctx context.Context, name, hypothesis string) (*Scenario, error) {
	branch, err := m.client.CreateBranch(ctx, memory.CreateBranchRequest{
		Name: name,
	})
	if err != nil {
		return nil, fmt.Errorf("create branch: %w", err)
	}

	return &Scenario{
		ID:         branch.ID,
		Name:       name,
		Hypothesis: hypothesis,
		CreatedAt:  time.Now(),
		Status:     "open",
	}, nil
}

// Modify applies a change to a node on the scenario's branch.
func (m *Manager) Modify(ctx context.Context, s *Scenario, mod Modification) error {
	if s.Status != "open" {
		return fmt.Errorf("cannot modify scenario in status %q", s.Status)
	}

	// Get the branch-scoped client
	branchClient := m.client.WithBranch(s.ID)

	// Find the object by key — we need its ID to update it
	objects, _, err := branchClient.ListObjects(ctx, memory.ListOptions{Limit: 200})
	if err != nil {
		return fmt.Errorf("list objects on branch: %w", err)
	}

	var objectID string
	for _, obj := range objects {
		if obj.Key == mod.NodeKey {
			objectID = obj.ID
			break
		}
	}
	if objectID == "" {
		return fmt.Errorf("node %q not found on branch", mod.NodeKey)
	}

	// Apply the modification
	_, err = branchClient.UpdateObject(ctx, objectID, memory.UpdateObjectRequest{
		Properties: mod.Changes,
	})
	if err != nil {
		return fmt.Errorf("update object on branch: %w", err)
	}

	s.Modifications = append(s.Modifications, mod)
	return nil
}

// Evaluate runs the propagation circuit on the branched graph.
func (m *Manager) Evaluate(ctx context.Context, s *Scenario) (*propagation.CascadeResult, error) {
	if s.Status != "open" {
		return nil, fmt.Errorf("cannot evaluate scenario in status %q", s.Status)
	}

	branchClient := m.client.WithBranch(s.ID)

	// Load the branched graph
	log.Printf("[scenario] Loading branched graph...")
	graph, err := propagation.LoadGraphSnapshot(ctx, branchClient)
	if err != nil {
		return nil, fmt.Errorf("load branched graph: %w", err)
	}
	log.Printf("[scenario] Loaded %d nodes on branch", len(graph.Nodes))

	// Build a combined signal from all modifications
	if len(s.Modifications) == 0 {
		return nil, fmt.Errorf("no modifications to evaluate — use Modify first")
	}

	// Run the circuit from each modified node
	config := propagation.DefaultConfig()
	config.Mode = propagation.ModeScenario // highest budget for exploration
	config.DryRun = true                   // scenarios never auto-apply

	circuit := propagation.NewCircuit(graph, m.reasoner, config)

	var combined *propagation.CascadeResult
	for _, mod := range s.Modifications {
		node, ok := graph.Nodes[mod.NodeKey]
		if !ok {
			continue
		}

		signal := reasoning.Signal{
			SourceNodeKey:  mod.NodeKey,
			SourceNodeType: node.Type,
			ChangeType:     mod.ChangeType,
			Description:    fmt.Sprintf("Scenario modification: %v", mod.Changes),
			Strength:       1.0,
		}

		result := circuit.Propagate(signal)
		if combined == nil {
			combined = result
		} else {
			// Merge results
			combined.Trace = append(combined.Trace, result.Trace...)
			combined.ProposedChanges = append(combined.ProposedChanges, result.ProposedChanges...)
			combined.SkippedNodes = append(combined.SkippedNodes, result.SkippedNodes...)
			combined.FrozenNodes = append(combined.FrozenNodes, result.FrozenNodes...)
			combined.TotalTokensUsed += result.TotalTokensUsed
			combined.Duration += result.Duration
			if result.BudgetExhausted {
				combined.BudgetExhausted = true
			}
			if result.Waves > combined.Waves {
				combined.Waves = result.Waves
			}
		}
	}

	s.EvaluationResult = combined
	s.Status = "evaluated"
	return combined, nil
}

// Diff compares the branched graph against the main graph, showing
// which nodes differ and why.
func (m *Manager) Diff(ctx context.Context, s *Scenario) ([]DiffEntry, error) {
	if s.Status != "evaluated" {
		return nil, fmt.Errorf("must evaluate before diff — current status: %q", s.Status)
	}

	var entries []DiffEntry

	// Collect all modified nodes (direct modifications + cascade)
	modifiedKeys := make(map[string]string) // key → reasoning
	for _, mod := range s.Modifications {
		modifiedKeys[mod.NodeKey] = "direct modification"
	}
	for _, pc := range s.EvaluationResult.ProposedChanges {
		modifiedKeys[pc.NodeKey] = pc.Reasoning
	}

	for key, reason := range modifiedKeys {
		status := "modified"
		if _, isDirect := directModKey(s.Modifications, key); !isDirect {
			status = "cascade_modified"
		}
		entries = append(entries, DiffEntry{
			NodeKey:   key,
			Status:    status,
			Reasoning: reason,
		})
	}

	return entries, nil
}

// Commit merges the scenario branch into the main graph.
func (m *Manager) Commit(ctx context.Context, s *Scenario) error {
	if s.Status != "evaluated" {
		return fmt.Errorf("must evaluate before commit — current status: %q", s.Status)
	}

	// Merge branch to main (empty target = main branch)
	if err := m.client.MergeBranch(ctx, "", s.ID, false); err != nil {
		return fmt.Errorf("merge branch: %w", err)
	}

	s.Status = "committed"
	return nil
}

// Discard deletes the scenario branch without merging.
func (m *Manager) Discard(ctx context.Context, s *Scenario) error {
	if err := m.client.DeleteBranch(ctx, s.ID); err != nil {
		return fmt.Errorf("delete branch: %w", err)
	}
	s.Status = "discarded"
	return nil
}

func directModKey(mods []Modification, key string) (Modification, bool) {
	for _, m := range mods {
		if m.NodeKey == key {
			return m, true
		}
	}
	return Modification{}, false
}
