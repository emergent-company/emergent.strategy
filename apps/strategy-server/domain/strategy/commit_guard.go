package strategy

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// requiredRoadmapTracks reads the tracks the roadmap schema requires, so the
// guard follows canonical and not a copy of its list.
var requiredRoadmapTracks = sync.OnceValues(func() ([]string, error) {
	file, ok := embedded.SchemaForType("roadmap_recipe")
	if !ok {
		return nil, fmt.Errorf("no schema registered for roadmap_recipe")
	}
	raw, err := embedded.GetSchema(file)
	if err != nil {
		return nil, fmt.Errorf("load %s: %w", file, err)
	}
	var schema struct {
		Properties struct {
			Roadmap struct {
				Properties struct {
					Tracks struct {
						Required []string `json:"required"`
					} `json:"tracks"`
				} `json:"properties"`
			} `json:"roadmap"`
		} `json:"properties"`
	}
	if err := json.Unmarshal(raw, &schema); err != nil {
		return nil, fmt.Errorf("parse %s: %w", file, err)
	}
	tracks := schema.Properties.Roadmap.Properties.Tracks.Required
	if len(tracks) == 0 {
		return nil, fmt.Errorf("%s lists no required tracks", file)
	}
	return tracks, nil
})

// checkRoadmapTracks refuses a batch that would store a roadmap without a track
// the schema requires. A committed roadmap replaces the stored one, so a missing
// track disappears from every view with nothing to say it was dropped. Other
// schema problems stay warnings after the commit; this one loses content.
func (s *Service) checkRoadmapTracks(ctx context.Context, batchID uuid.UUID) error {
	var mutations []*domain.StrategyMutation
	if err := s.db.NewSelect().
		Model((*domain.StrategyMutation)(nil)).
		Where("batch_id = ? AND status = ? AND artifact_type = ? AND action IN (?, ?)",
			batchID, domain.MutationStatusStaged, "roadmap_recipe",
			domain.MutationActionCreate, domain.MutationActionUpdate).
		Scan(ctx, &mutations); err != nil {
		return fmt.Errorf("load staged roadmaps: %w", err)
	}
	if len(mutations) == 0 {
		return nil
	}
	required, err := requiredRoadmapTracks()
	if err != nil {
		return fmt.Errorf("required roadmap tracks: %w", err)
	}
	for _, m := range mutations {
		if missing := missingTracks(m.Payload, required); len(missing) > 0 {
			return apperror.ErrValidationFailed.WithDetail(fmt.Sprintf(
				"%s is missing required tracks: %s. Committing would drop them from every view. "+
					"Add the tracks, or commit anyway with confirm_missing_tracks=true",
				m.ArtifactKey, strings.Join(missing, ", ")))
		}
	}
	return nil
}

// missingTracks returns the required tracks absent from a roadmap payload, in
// the schema's order. A payload that is not a roadmap object has none.
func missingTracks(payload json.RawMessage, required []string) []string {
	var doc struct {
		Roadmap struct {
			Tracks map[string]json.RawMessage `json:"tracks"`
		} `json:"roadmap"`
	}
	if err := json.Unmarshal(payload, &doc); err != nil {
		return nil
	}
	var missing []string
	for _, name := range required {
		if _, ok := doc.Roadmap.Tracks[name]; !ok {
			missing = append(missing, name)
		}
	}
	return missing
}
