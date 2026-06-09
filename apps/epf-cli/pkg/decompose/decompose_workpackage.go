package decompose

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// rawWorkPackage mirrors the canonical work_package schema (v1.0.0). It is a
// thin binding contract: it references value model paths, definition ids, and
// KR ids (all many-to-many) but copies none of their content. Tasks and
// scheduling are intentionally out of scope of the schema.
type rawWorkPackage struct {
	ID        string `yaml:"id"`
	Title     string `yaml:"title"`
	Intent    string `yaml:"intent"`
	Track     string `yaml:"track"`
	RiskClass string `yaml:"risk_class"`
	Status    string `yaml:"status"`

	Targets struct {
		ValueModelPaths []string `yaml:"value_model_paths"`
		DefinitionIDs   []string `yaml:"definition_ids"`
		KRIDs           []string `yaml:"kr_ids"`
	} `yaml:"targets"`

	Source struct {
		AuthoringTool string `yaml:"authoring_tool"`
		Reference     string `yaml:"reference"`
	} `yaml:"source"`

	Lifecycle struct {
		CreatedAt   string `yaml:"created_at"`
		TargetClose string `yaml:"target_close"`
		ClosedAt    string `yaml:"closed_at"`
	} `yaml:"lifecycle"`
}

// decomposeWorkPackages scans work_packages/wp-*.yaml at the instance root and
// emits a WorkPackage graph node per file, with structural target edges to the
// value model components, track definitions, and key results it advances.
//
// The footprint (collision key) is the union of value_model_paths +
// definition_ids; kr_ids are targets but not footprint. The footprint is not
// materialised as a property here — it is derived downstream — but the target
// edges it is computed from are all emitted.
func (d *Decomposer) decomposeWorkPackages(result *Result) {
	wpDir := filepath.Join(d.instancePath, "work_packages")
	entries, err := os.ReadDir(wpDir)
	if err != nil {
		return // optional directory
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if !strings.HasPrefix(name, "wp-") {
			continue
		}
		if !strings.HasSuffix(name, ".yaml") && !strings.HasSuffix(name, ".yml") {
			continue
		}
		relPath := fmt.Sprintf("work_packages/%s", name)
		var raw rawWorkPackage
		if err := d.readYAML(relPath, &raw); err != nil {
			continue
		}
		if raw.ID == "" {
			continue
		}
		d.decomposeWorkPackageRaw(result, &raw, relPath)
	}
}

func (d *Decomposer) decomposeWorkPackageRaw(result *Result, raw *rawWorkPackage, relPath string) {
	artKey := d.addArtifactNode(result, relPath, "work_package", "FIRE",
		fmt.Sprintf("work package: %s", raw.Title), "6")

	wpKey := objectKey("WorkPackage", fmt.Sprintf("work_package:%s", raw.ID))
	d.addObject(result, GraphObject{
		Type: "WorkPackage", Key: wpKey,
		Status: raw.Status,
		Properties: map[string]any{
			"name":            raw.Title,
			"description":     raw.Intent,
			"work_package_id": raw.ID,
			"track":           raw.Track,
			"status":          raw.Status,
			"risk_class":      raw.RiskClass,
			"authoring_tool":  raw.Source.AuthoringTool,
			"created_at":      raw.Lifecycle.CreatedAt,
			"target_close":    raw.Lifecycle.TargetClose,
			"inertia_tier":    "6",
			"source_artifact": relPath,
		},
	})
	d.addContains(result, artKey, "Artifact", wpKey, "WorkPackage")

	// targets_value_path → ValueModelComponent (footprint)
	for _, path := range raw.Targets.ValueModelPaths {
		if vmKey, resolved := d.resolveVMCKey(path); resolved {
			d.addRel(result, "targets_value_path", wpKey, "WorkPackage", vmKey, "ValueModelComponent",
				map[string]any{"weight": "1.0", "edge_source": "structural"})
		} else {
			d.warn(result, fmt.Sprintf("work package %s: value_model_path %q does not match any value model component — skipping edge", raw.ID, path))
		}
	}

	// targets_definition → Feature (product) or TrackDefinition (sd/pd/cd) (footprint)
	for _, defID := range raw.Targets.DefinitionIDs {
		toKey, toType := definitionKeyForID(defID)
		d.addRel(result, "targets_definition", wpKey, "WorkPackage", toKey, toType,
			map[string]any{"weight": "1.0", "edge_source": "structural"})
	}

	// targets_kr → KeyResult (NOT footprint)
	for _, krID := range raw.Targets.KRIDs {
		krKey := objectKey("KeyResult", fmt.Sprintf("roadmap:%s", krID))
		d.addRel(result, "targets_kr", wpKey, "WorkPackage", krKey, "KeyResult",
			map[string]any{"weight": "1.0", "edge_source": "structural"})
	}
}

// definitionKeyForID maps a canonical definition id to its graph object key and
// type. Product features (fd-*) are decomposed as Feature nodes; the other three
// tracks (sd/pd/cd) are TrackDefinition nodes.
func definitionKeyForID(defID string) (key, objType string) {
	if strings.HasPrefix(defID, "fd-") {
		return objectKey("Feature", fmt.Sprintf("feature:%s", defID)), "Feature"
	}
	return objectKey("TrackDefinition", fmt.Sprintf("definition:%s", defID)), "TrackDefinition"
}
