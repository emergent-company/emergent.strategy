package decompose

import (
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/memory"
)

// ============================================================
// Cross-cutting structural relationships
// These require multiple artifacts to be decomposed first.
// ============================================================

// addInformsEdges creates Belief/Trend/KeyInsight → Positioning edges.
// Beliefs, Trends, and KeyInsights inform the strategic Positioning — the
// positioning claims are grounded in market intelligence and core beliefs.
func (d *Decomposer) addInformsEdges(result *Result) {
	// Collect source nodes (Beliefs, Trends, KeyInsights) and target nodes (Positioning)
	type sourceNode struct {
		key     string
		objType string
		weight  string
	}
	var sources []sourceNode
	var positioningKeys []string

	for _, obj := range result.Objects {
		switch obj.Type {
		case "Belief":
			sources = append(sources, sourceNode{key: obj.Key, objType: "Belief", weight: "0.6"})
		case "Trend":
			sources = append(sources, sourceNode{key: obj.Key, objType: "Trend", weight: "0.4"})
		case "KeyInsight":
			sources = append(sources, sourceNode{key: obj.Key, objType: "KeyInsight", weight: "0.5"})
		case "Positioning":
			positioningKeys = append(positioningKeys, obj.Key)
		}
	}

	// Each source node informs all positioning claims (broad causal influence)
	// Beliefs have strongest influence (0.6), KeyInsights medium (0.5), Trends lighter (0.4)
	for _, src := range sources {
		for _, pKey := range positioningKeys {
			d.addRel(result, "informs", src.key, src.objType, pKey, "Positioning",
				map[string]any{"strength": src.weight, "weight": src.weight, "edge_source": "causal"})
		}
	}
}

// addConstrainsEdges creates Assumption → Feature edges (reverse of tests_assumption).
// If a Feature tests an Assumption, the Assumption also constrains the Feature.
func (d *Decomposer) addConstrainsEdges(result *Result) {
	// Find existing tests_assumption relationships and create reverse edges
	for _, rel := range result.Relationships {
		if rel.Type != "tests_assumption" {
			continue
		}
		// tests_assumption: Feature/OKR → Assumption
		// constrains: Assumption → Feature/OKR (reverse)
		d.addRel(result, "constrains", rel.ToKey, rel.ToType, rel.FromKey, rel.FromType,
			map[string]any{"strength": "0.8", "weight": "0.8", "edge_source": "causal"})
	}
}

// addValidatesEdges creates Capability → Assumption edges.
// When a Capability has maturity "proven" or "scaled" and the parent Feature
// has assumptions_tested, the capability's evidence validates those assumptions.
func (d *Decomposer) addValidatesEdges(result *Result) {
	// Build a map of feature key → tested assumption keys
	featureAssumptions := map[string][]string{}
	for _, rel := range result.Relationships {
		if rel.Type == "tests_assumption" && rel.FromType == "Feature" {
			featureAssumptions[rel.FromKey] = append(featureAssumptions[rel.FromKey], rel.ToKey)
		}
	}

	// Build a map of feature key → capability objects
	featureCapabilities := map[string][]memory.UpsertObjectRequest{}
	for _, rel := range result.Relationships {
		if rel.Type == "contains" && rel.FromType == "Feature" && rel.ToType == "Capability" {
			for _, obj := range result.Objects {
				if obj.Key == rel.ToKey {
					featureCapabilities[rel.FromKey] = append(featureCapabilities[rel.FromKey], obj)
					break
				}
			}
		}
	}

	// For each feature with tested assumptions, check if any capabilities are proven/scaled
	for featureKey, asmKeys := range featureAssumptions {
		caps := featureCapabilities[featureKey]
		for _, cap := range caps {
			maturity, _ := cap.Properties["maturity"].(string)
			if maturity != "proven" && maturity != "scaled" {
				continue
			}
			evidence, _ := cap.Properties["evidence"].(string)
			for _, asmKey := range asmKeys {
				d.addRel(result, "validates", cap.Key, "Capability", asmKey, "Assumption",
					map[string]any{
						"strength":    "0.9",
						"weight":      "0.9",
						"edge_source": "causal",
						"evidence":    truncate(evidence, 200),
					})
			}
		}
	}
}

// addSharedTechnologyEdges creates Feature → Feature edges for features
// that share contributes_to paths to the same ValueModelComponent.
func (d *Decomposer) addSharedTechnologyEdges(result *Result) {
	// Build map: value model key → list of feature keys that contribute to it
	vmToFeatures := map[string][]string{}
	for _, rel := range result.Relationships {
		if rel.Type == "contributes_to" && rel.FromType == "Feature" {
			vmToFeatures[rel.ToKey] = append(vmToFeatures[rel.ToKey], rel.FromKey)
		}
	}

	// For each VMC with 2+ features, create shared_technology edges between all pairs
	seen := map[string]bool{} // avoid duplicate edges
	for vmKey, featureKeys := range vmToFeatures {
		if len(featureKeys) < 2 {
			continue
		}
		// Extract the value model path from the key for metadata
		vmPath := strings.TrimPrefix(vmKey, "ValueModelComponent:value_model:")

		for i := 0; i < len(featureKeys); i++ {
			for j := i + 1; j < len(featureKeys); j++ {
				pairKey := featureKeys[i] + "↔" + featureKeys[j]
				reversePairKey := featureKeys[j] + "↔" + featureKeys[i]
				if seen[pairKey] || seen[reversePairKey] {
					continue
				}
				seen[pairKey] = true
				d.addRel(result, "shared_technology", featureKeys[i], "Feature", featureKeys[j], "Feature",
					map[string]any{
						"weight":           "0.7",
						"edge_source":      "structural",
						"shared_component": vmPath,
					})
			}
		}
	}
}

// ============================================================
// AIM/evidence/ — unstructured reference library
// ============================================================

// evidenceExtensions lists the file extensions that qualify as evidence documents.
var evidenceExtensions = map[string]bool{
	".md":   true,
	".pdf":  true,
	".docx": true,
	".html": true,
}

// validEvidenceCategories are the canonical category subdirectories.
var validEvidenceCategories = map[string]bool{
	"competitive":   true,
	"partner":       true,
	"technical":     true,
	"market":        true,
	"narrative":     true,
	"product-specs": true,
	"internal":      true,
}

// EvidenceDocument represents a scanned evidence file for ingest/sync.
type EvidenceDocument struct {
	Key         string // graph node key
	Name        string // filename
	Category    string // subdirectory name
	SourcePath  string // relative path within instance
	AbsPath     string // absolute path for content upload
	ContentHash string // SHA-256 for change detection
	Format      string // file extension without dot
	FirstLine   string // first non-empty line for description
}

// decomposeEvidence scans AIM/evidence/ for reference documents and creates
// ReferenceDocument graph nodes. Called from DecomposeInstance.
func (d *Decomposer) decomposeEvidence(result *Result) {
	evidenceDir := filepath.Join(d.instancePath, "AIM", "evidence")
	if _, err := os.Stat(evidenceDir); os.IsNotExist(err) {
		return // No evidence directory — not an error
	}

	// Walk the evidence directory
	err := filepath.Walk(evidenceDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}

		ext := strings.ToLower(filepath.Ext(path))
		if !evidenceExtensions[ext] {
			return nil
		}

		// Skip README files
		if strings.EqualFold(info.Name(), "README.md") {
			return nil
		}

		// Determine category from parent directory
		relPath, _ := filepath.Rel(d.instancePath, path)
		parts := strings.Split(relPath, string(filepath.Separator))
		// parts: ["AIM", "evidence", "<category>", "<file>"] or ["AIM", "evidence", "<file>"]
		category := "uncategorized"
		if len(parts) >= 4 {
			category = parts[2] // The subdirectory name
		}

		// Read content for hash and description
		content, err := os.ReadFile(path)
		if err != nil {
			d.warn(result, fmt.Sprintf("evidence: failed to read %s: %v", relPath, err))
			return nil
		}

		hash := fmt.Sprintf("%x", sha256.Sum256(content))
		firstLine := extractFirstLine(string(content))

		docKey := objectKey("ReferenceDocument", fmt.Sprintf("evidence:%s", relPath))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "ReferenceDocument", Key: docKey,
			Properties: map[string]any{
				"name":            info.Name(),
				"description":     truncate(firstLine, 200),
				"category":        category,
				"source_path":     relPath,
				"content_hash":    hash,
				"file_format":     strings.TrimPrefix(ext, "."),
				"inertia_tier":    "2",
				"source_artifact": relPath,
				"section_path":    fmt.Sprintf("AIM/evidence/%s", category),
			},
		})

		// Store evidence doc info for the ingester to upload content later
		result.EvidenceDocuments = append(result.EvidenceDocuments, EvidenceDocument{
			Key:         docKey,
			Name:        info.Name(),
			Category:    category,
			SourcePath:  relPath,
			AbsPath:     path,
			ContentHash: hash,
			Format:      strings.TrimPrefix(ext, "."),
			FirstLine:   firstLine,
		})

		return nil
	})

	if err != nil {
		d.warn(result, fmt.Sprintf("evidence: walk error: %v", err))
	}

	if len(result.EvidenceDocuments) > 0 {
		// Create an Artifact node for the evidence directory itself
		artKey := d.addArtifactNode(result,
			"AIM/evidence/", "evidence_library", "AIM",
			fmt.Sprintf("Evidence library — %d reference documents", len(result.EvidenceDocuments)), "2")

		// Add contains edges from the evidence artifact to each document
		for _, doc := range result.EvidenceDocuments {
			d.addContains(result, artKey, "Artifact", doc.Key, "ReferenceDocument")
		}
	}
}

// extractFirstLine returns the first non-empty, non-heading line from content.
func extractFirstLine(content string) string {
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "---") {
			continue
		}
		return line
	}
	return ""
}

// ============================================================
// Additional extraction from roadmap cross_track_dependencies
// ============================================================

type rawCrossTrackDeps struct {
	Roadmap struct {
		CrossTrackDependencies []struct {
			FromKR         string `yaml:"from_kr"`
			ToKR           string `yaml:"to_kr"`
			DependencyType string `yaml:"dependency_type"`
			Description    string `yaml:"description"`
		} `yaml:"cross_track_dependencies"`
		SolutionScaffold struct {
			TechnicalConstraints []string `yaml:"technical_constraints"`
		} `yaml:"solution_scaffold"`
	} `yaml:"roadmap"`
}

// decomposeRoadmapExtras extracts cross-track dependencies and technical constraints
// from the roadmap. These are not in the rawRoadmap struct because it was built
// before these types existed.
func (d *Decomposer) decomposeRoadmapExtras(artKey string, result *Result) {
	var raw rawCrossTrackDeps
	if err := d.readYAML("READY/05_roadmap_recipe.yaml", &raw); err != nil {
		return
	}

	// Cross-track dependencies
	for i, dep := range raw.Roadmap.CrossTrackDependencies {
		if dep.FromKR == "" || dep.ToKR == "" {
			continue
		}
		depID := fmt.Sprintf("ctd-%d-%s-%s", i, dep.FromKR, dep.ToKR)
		depKey := objectKey("CrossTrackDependency", fmt.Sprintf("roadmap:%s", depID))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "CrossTrackDependency", Key: depKey,
			Properties: map[string]any{
				"name":            truncate(dep.Description, 60),
				"description":     dep.Description,
				"from_kr":         dep.FromKR,
				"to_kr":           dep.ToKR,
				"dependency_type": dep.DependencyType,
				"inertia_tier":    "4",
				"source_artifact": "READY/05_roadmap_recipe.yaml",
				"section_path":    fmt.Sprintf("roadmap.cross_track_dependencies[%d]", i),
			},
		})
		d.addContains(result, artKey, "Artifact", depKey, "CrossTrackDependency")

		// converges_at: CrossTrackDependency → to_kr OKR
		toKRKey := objectKey("OKR", fmt.Sprintf("roadmap:%s", dep.ToKR))
		d.addRel(result, "converges_at", depKey, "CrossTrackDependency", toKRKey, "OKR",
			map[string]any{"weight": "1.0", "edge_source": "structural"})

		// Also link from_kr to the dependency via delivers (the from_kr delivers to the to_kr's feature)
		fromKRKey := objectKey("OKR", fmt.Sprintf("roadmap:%s", dep.FromKR))
		d.addRel(result, "converges_at", depKey, "CrossTrackDependency", fromKRKey, "OKR",
			map[string]any{"weight": "1.0", "edge_source": "structural"})
	}

	// Technical constraints from roadmap solution scaffold
	for _, track := range []string{"product", "strategy", "org_ops", "commercial"} {
		d.decomposeTrackConstraints(artKey, track, result)
	}
}

// decomposeTrackConstraints extracts technical constraints from per-track solution scaffolds.
func (d *Decomposer) decomposeTrackConstraints(artKey, track string, result *Result) {
	// Read the raw roadmap to find technical_constraints in each track's solution_scaffold
	type trackScaffold struct {
		Roadmap struct {
			Tracks map[string]struct {
				SolutionScaffold struct {
					TechnicalConstraints []string `yaml:"technical_constraints"`
				} `yaml:"solution_scaffold"`
			} `yaml:"tracks"`
		} `yaml:"roadmap"`
	}
	var raw trackScaffold
	if err := d.readYAML("READY/05_roadmap_recipe.yaml", &raw); err != nil {
		return
	}

	trackData, ok := raw.Roadmap.Tracks[track]
	if !ok {
		return
	}

	for i, constraint := range trackData.SolutionScaffold.TechnicalConstraints {
		if constraint == "" {
			continue
		}
		constraintKey := objectKey("Constraint", fmt.Sprintf("roadmap:%s:constraint-%d", track, i))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "Constraint", Key: constraintKey,
			Properties: map[string]any{
				"name":            truncate(constraint, 60),
				"description":     constraint,
				"constraint_type": "technical",
				"inertia_tier":    "3",
				"source_artifact": "READY/05_roadmap_recipe.yaml",
				"section_path":    fmt.Sprintf("roadmap.tracks.%s.solution_scaffold.technical_constraints[%d]", track, i),
			},
		})
		d.addContains(result, artKey, "Artifact", constraintKey, "Constraint")
	}
}
