package workpackage

import "github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/index"

// Footprint derives a work package's footprint from its payload: the
// de-duplicated, sorted union of targets.value_model_paths and
// targets.definition_ids. kr_ids are excluded.
//
// This delegates to internal/index.WorkPackageFootprint so the derivation has a
// single source of truth shared with the strategic-index pipeline.
func Footprint(payload []byte) []string {
	return index.WorkPackageFootprint(payload)
}
