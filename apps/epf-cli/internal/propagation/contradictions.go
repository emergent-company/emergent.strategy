package propagation

import (
	"fmt"
	"strings"
)

// Contradiction represents a detected inconsistency in the strategy graph.
type Contradiction struct {
	// Type categorizes the contradiction.
	Type ContradictionType

	// Severity indicates how critical this inconsistency is.
	Severity string // "critical", "warning", "info"

	// Description explains the contradiction in human-readable terms.
	Description string

	// NodeAKey is the first node involved.
	NodeAKey string

	// NodeBKey is the second node involved (empty for single-node issues).
	NodeBKey string

	// Details provides additional context.
	Details map[string]any
}

// ContradictionType categorizes structural contradictions.
type ContradictionType string

const (
	// ContradictionOrphanedRef is a feature referencing a non-existent value model path.
	ContradictionOrphanedRef ContradictionType = "orphaned_reference"

	// ContradictionStatusConflict is a status inconsistency (e.g., delivered feature with hypothetical caps).
	ContradictionStatusConflict ContradictionType = "status_conflict"

	// ContradictionBrokenDep is a dependency pointing to a non-existent feature.
	ContradictionBrokenDep ContradictionType = "broken_dependency"

	// ContradictionMaturityGap is a capability maturity that doesn't match the feature's overall stage.
	ContradictionMaturityGap ContradictionType = "maturity_gap"

	// ContradictionDisconnected is a node with no edges (isolated from the graph).
	ContradictionDisconnected ContradictionType = "disconnected_node"
)

// DetectContradictions analyzes the graph snapshot for structural inconsistencies.
func DetectContradictions(graph *GraphSnapshot) []Contradiction {
	var results []Contradiction

	results = append(results, detectOrphanedReferences(graph)...)
	results = append(results, detectStatusConflicts(graph)...)
	results = append(results, detectBrokenDependencies(graph)...)
	results = append(results, detectMaturityGaps(graph)...)
	results = append(results, detectDisconnectedNodes(graph)...)

	return results
}

// detectOrphanedReferences finds contributes_to and targets edges
// pointing to non-existent value model components.
func detectOrphanedReferences(graph *GraphSnapshot) []Contradiction {
	var results []Contradiction

	for _, node := range graph.Nodes {
		for _, edge := range node.Outgoing {
			if edge.Type == "contributes_to" || edge.Type == "targets" {
				if _, exists := graph.Nodes[edge.TargetKey]; !exists {
					results = append(results, Contradiction{
						Type:     ContradictionOrphanedRef,
						Severity: "warning",
						Description: fmt.Sprintf("%s has %s edge to non-existent node %s",
							node.Key, edge.Type, edge.TargetKey),
						NodeAKey: node.Key,
						NodeBKey: edge.TargetKey,
						Details: map[string]any{
							"edge_type":   edge.Type,
							"source_type": node.Type,
						},
					})
				}
			}
		}
	}

	return results
}

// detectStatusConflicts finds features where the overall status doesn't match
// capability maturity levels.
func detectStatusConflicts(graph *GraphSnapshot) []Contradiction {
	var results []Contradiction

	for _, node := range graph.Nodes {
		if node.Type != "Feature" {
			continue
		}

		featureStatus, _ := node.Properties["status"].(string)
		if featureStatus == "" || featureStatus == "draft" {
			continue
		}

		// Find capabilities contained by this feature
		for _, edge := range node.Outgoing {
			if edge.Type != "contains" {
				continue
			}
			capNode, ok := graph.Nodes[edge.TargetKey]
			if !ok || capNode.Type != "Capability" {
				continue
			}

			capMaturity, _ := capNode.Properties["maturity"].(string)
			if capMaturity == "" {
				capMaturity = "hypothetical"
			}

			// Feature is "delivered" but capability is "hypothetical"
			if featureStatus == "delivered" && capMaturity == "hypothetical" {
				results = append(results, Contradiction{
					Type:     ContradictionStatusConflict,
					Severity: "critical",
					Description: fmt.Sprintf("Feature %s is 'delivered' but capability %s is still 'hypothetical'",
						node.Key, capNode.Key),
					NodeAKey: node.Key,
					NodeBKey: capNode.Key,
					Details: map[string]any{
						"feature_status":      featureStatus,
						"capability_maturity": capMaturity,
					},
				})
			}

			// Feature is "in-progress" but all capabilities are "hypothetical"
			if featureStatus == "in-progress" && capMaturity == "hypothetical" {
				// Only flag if ALL capabilities are hypothetical (check after loop)
			}
		}
	}

	return results
}

// detectBrokenDependencies finds depends_on edges pointing to non-existent features.
func detectBrokenDependencies(graph *GraphSnapshot) []Contradiction {
	var results []Contradiction

	for _, node := range graph.Nodes {
		if node.Type != "Feature" {
			continue
		}

		for _, edge := range node.Outgoing {
			if edge.Type != "depends_on" {
				continue
			}
			if _, exists := graph.Nodes[edge.TargetKey]; !exists {
				results = append(results, Contradiction{
					Type:     ContradictionBrokenDep,
					Severity: "warning",
					Description: fmt.Sprintf("Feature %s depends on non-existent feature %s",
						node.Key, edge.TargetKey),
					NodeAKey: node.Key,
					NodeBKey: edge.TargetKey,
				})
			}
		}
	}

	return results
}

// detectMaturityGaps finds value model components where the maturity level
// doesn't match what the contributing features have delivered.
func detectMaturityGaps(graph *GraphSnapshot) []Contradiction {
	var results []Contradiction

	for _, node := range graph.Nodes {
		if node.Type != "ValueModelComponent" {
			continue
		}

		vmMaturity, _ := node.Properties["maturity"].(string)
		if vmMaturity == "" {
			continue // no maturity set — skip
		}

		// Check if any contributing features have capabilities beyond this maturity
		for _, edge := range node.Incoming {
			if edge.Type != "contributes_to" {
				continue
			}
			featureNode, ok := graph.Nodes[edge.TargetKey]
			if !ok || featureNode.Type != "Feature" {
				continue
			}

			featureStatus, _ := featureNode.Properties["status"].(string)
			if featureStatus == "delivered" && maturityLevel(vmMaturity) < maturityLevel("proven") {
				results = append(results, Contradiction{
					Type:     ContradictionMaturityGap,
					Severity: "info",
					Description: fmt.Sprintf("Value model %s has maturity '%s' but feature %s contributing to it is 'delivered'",
						node.Key, vmMaturity, featureNode.Key),
					NodeAKey: node.Key,
					NodeBKey: featureNode.Key,
					Details: map[string]any{
						"vm_maturity":    vmMaturity,
						"feature_status": featureStatus,
					},
				})
			}
		}
	}

	return results
}

// detectDisconnectedNodes finds nodes with no edges at all.
func detectDisconnectedNodes(graph *GraphSnapshot) []Contradiction {
	var results []Contradiction

	for _, node := range graph.Nodes {
		// Skip Artifact nodes (they're the file-level containers, always connected)
		if node.Type == "Artifact" {
			continue
		}

		if len(node.Outgoing) == 0 && len(node.Incoming) == 0 {
			results = append(results, Contradiction{
				Type:     ContradictionDisconnected,
				Severity: "info",
				Description: fmt.Sprintf("%s (%s) is disconnected from the graph — no edges in or out",
					node.Key, node.Type),
				NodeAKey: node.Key,
				Details: map[string]any{
					"node_type":    node.Type,
					"inertia_tier": node.InertiaTier,
				},
			})
		}
	}

	return results
}

// maturityLevel converts maturity strings to ordinal values for comparison.
func maturityLevel(m string) int {
	m = strings.ToLower(m)
	switch m {
	case "hypothetical":
		return 0
	case "emerging":
		return 1
	case "proven":
		return 2
	case "scaled":
		return 3
	default:
		return -1
	}
}
