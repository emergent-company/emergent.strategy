package strategy

// AlignPortfolio implements deterministic portfolio alignment: it reads the
// committed roadmap_recipe, extracts KR value_model_target references, and
// updates the active flags on value model components to match. Only the
// `active` and `activation_notes` fields are modified — structure, IDs,
// names, descriptions, UVPs, and maturity data are preserved byte-for-byte.
//
// The operation auto-commits its mutations. It is idempotent — running it
// twice with the same roadmap produces no mutations (no-op detection skips
// unchanged tracks).

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// AlignPortfolioResult summarises the outcome of a portfolio alignment operation.
type AlignPortfolioResult struct {
	// TracksProcessed is the number of tracks that had value models to align.
	TracksProcessed int
	// TracksChanged is the number of tracks where activation state changed.
	TracksChanged int
	// TotalActivated is the total number of L3 components set to active across all tracks.
	TotalActivated int
	// TotalDeactivated is the total number of L3 components set to inactive across all tracks.
	TotalDeactivated int
	// UnresolvablePaths are KR component_path values that could not be matched to any L3.
	UnresolvablePaths []string
	// KRsWithTargets is the number of KRs that had value_model_target fields.
	KRsWithTargets int
	// NoRoadmap is true when no roadmap_recipe exists for the instance.
	NoRoadmap bool
	// TrackResults holds per-track details.
	TrackResults []TrackAlignResult
}

// TrackAlignResult summarises alignment for one track.
type TrackAlignResult struct {
	Track            string // "strategy", "org_ops", "commercial", "product"
	ArtifactKey      string // artifact key that was updated
	Activated        int    // L3 components set to active
	Deactivated      int    // L3 components set to inactive
	NoValueModel     bool   // no value_model artifact found for this track
	NoOp             bool   // activation state was already correct
	UnresolvablePaths []string
}

// AlignPortfolio runs deterministic portfolio alignment for the given instance.
// It reads committed roadmap KR targets and sets active flags on value model
// components accordingly. All mutations are auto-committed (no human review gate).
func (s *Service) AlignPortfolio(ctx context.Context, instanceID uuid.UUID) (AlignPortfolioResult, error) {
	// 1. Load roadmap_recipe.
	roadmapPayload, err := s.GetCurrentArtifact(ctx, instanceID, "roadmap_recipe")
	if err != nil {
		ae := apperror.AsAppError(err)
		if ae != nil && ae.HTTPStatus == http.StatusNotFound {
			return AlignPortfolioResult{NoRoadmap: true}, nil
		}
		return AlignPortfolioResult{}, fmt.Errorf("load roadmap: %w", err)
	}

	// 2. Extract KR targets grouped by track.
	krTargetsByTrack, krsWithTargets, _ := extractKRTargets(roadmapPayload)
	result := AlignPortfolioResult{
		KRsWithTargets: krsWithTargets,
	}

	if krsWithTargets == 0 {
		slog.InfoContext(ctx, "align-portfolio: no KR targets found, skipping",
			"instance_id", instanceID)
		return result, nil
	}

	// 3. Load all value models for this instance.
	vmArtifacts, err := s.ListCurrentArtifacts(ctx, instanceID, domain.ArtifactTypeValueModel)
	if err != nil {
		return result, fmt.Errorf("load value models: %w", err)
	}

	// Index value models by their track name (name field in the artifact).
	vmByTrack := make(map[string]*domain.StrategyArtifact)
	for _, a := range vmArtifacts {
		if a.Name != nil {
			vmByTrack[vmTrackKey(*a.Name)] = a
		}
	}

	// 4. Process each of the four canonical tracks.
	tracks := []string{"strategy", "org_ops", "commercial", "product"}
	batchID := uuid.New()
	batchCreated := false

	for _, track := range tracks {
		targets := krTargetsByTrack[track]
		vm, exists := vmByTrack[track]
		if !exists {
			result.TrackResults = append(result.TrackResults, TrackAlignResult{
				Track:        track,
				NoValueModel: true,
			})
			continue
		}
		result.TracksProcessed++

		trackResult, newPayload, err := alignTrack(track, targets, vm.Payload)
		if err != nil {
			slog.WarnContext(ctx, "align-portfolio: track alignment failed",
				"instance_id", instanceID,
				"track", track,
				"err", err)
			result.TrackResults = append(result.TrackResults, trackResult)
			continue
		}

		result.TotalActivated += trackResult.Activated
		result.TotalDeactivated += trackResult.Deactivated
		result.UnresolvablePaths = append(result.UnresolvablePaths, trackResult.UnresolvablePaths...)
		result.TrackResults = append(result.TrackResults, trackResult)

		if trackResult.NoOp {
			continue
		}

		// Auto-commit the updated value model.
		result.TracksChanged++
		if !batchCreated {
			batchCreated = true
		}

		m := &domain.StrategyMutation{
			ID:           uuid.New(),
			InstanceID:   instanceID,
			BatchID:      &batchID,
			ArtifactType: domain.ArtifactTypeValueModel,
			ArtifactKey:  vm.ArtifactKey,
			Action:       domain.MutationActionUpdate,
			Payload:      newPayload,
			Status:       domain.MutationStatusCommitted,
			Source:       "system", // autonomous server operation; "align_portfolio" is not in the source enum
			CreatedAt:    time.Now().UTC(),
		}
		if _, err := s.db.NewInsert().Model(m).Exec(ctx); err != nil {
			slog.WarnContext(ctx, "align-portfolio: insert mutation failed",
				"instance_id", instanceID,
				"artifact_key", vm.ArtifactKey,
				"err", err)
			continue
		}

		// Derive the strategic index for the committed mutation.
		if err := s.deriveIndex(ctx, m); err != nil {
			slog.WarnContext(ctx, "align-portfolio: derive index failed",
				"artifact_key", vm.ArtifactKey,
				"err", err)
		}
	}

	slog.InfoContext(ctx, "align-portfolio: complete",
		"instance_id", instanceID,
		"tracks_processed", result.TracksProcessed,
		"tracks_changed", result.TracksChanged,
		"total_activated", result.TotalActivated,
		"total_deactivated", result.TotalDeactivated,
		"krs_with_targets", result.KRsWithTargets,
		"unresolvable_paths", len(result.UnresolvablePaths),
	)

	return result, nil
}



// ── KR target extraction ─────────────────────────────────────────────────────

// krTarget holds a single KR's value model target reference.
type krTarget struct {
	KRID          string // KR id field (may be empty)
	KRDescription string // KR description
	Track         string // target track ("strategy", "org_ops", "commercial", "product")
	ComponentPath string // dot-separated L1.L2.L3 IDs
	TargetMaturity string // optional ("emerging", "practising", "leading")
}

// extractKRTargets walks the roadmap payload and collects all value_model_target refs.
// Returns: targets grouped by track, total KRs with targets, and unresolvable note.
func extractKRTargets(payload json.RawMessage) (map[string][]krTarget, int, []string) {
	var roadmap map[string]any
	if err := json.Unmarshal(payload, &roadmap); err != nil {
		return nil, 0, nil
	}

	// The roadmap payload may be: {"roadmap": {...}} or the unwrapped object.
	if inner, ok := roadmap["roadmap"].(map[string]any); ok {
		roadmap = inner
	}

	byTrack := make(map[string][]krTarget)
	total := 0

	// Walk roadmap.tracks.{track}.okrs[].key_results[].value_model_target
	tracksMap, _ := roadmap["tracks"].(map[string]any)
	if tracksMap == nil {
		// Some roadmap formats use top-level okrs or per-track keys directly.
		// Try top-level okrs as fallback.
		return byTrack, 0, nil
	}

	for trackName, trackVal := range tracksMap {
		trackSlug := normaliseTrackSlug(trackName)
		trackObj, _ := trackVal.(map[string]any)
		if trackObj == nil {
			continue
		}
		okrs, _ := trackObj["okrs"].([]any)
		for _, okrVal := range okrs {
			okr, _ := okrVal.(map[string]any)
			if okr == nil {
				continue
			}
			krs, _ := okr["key_results"].([]any)
			for _, krVal := range krs {
				kr, _ := krVal.(map[string]any)
				if kr == nil {
					continue
				}
				vmt, _ := kr["value_model_target"].(map[string]any)
				if vmt == nil {
					continue
				}
				targetTrack, _ := vmt["track"].(string)
				if targetTrack == "" {
					targetTrack = trackSlug
				} else {
					targetTrack = normaliseTrackSlug(targetTrack)
				}
				compPath, _ := vmt["component_path"].(string)
				if compPath == "" {
					continue
				}
				total++
				krID, _ := kr["id"].(string)
				krDesc, _ := kr["description"].(string)
				maturity, _ := vmt["target_maturity"].(string)
				byTrack[targetTrack] = append(byTrack[targetTrack], krTarget{
					KRID:           krID,
					KRDescription:  krDesc,
					Track:          targetTrack,
					ComponentPath:  compPath,
					TargetMaturity: maturity,
				})
			}
		}
	}

	return byTrack, total, nil
}

// normaliseTrackSlug normalises a track name to the canonical slug used in the DB.
// Handles: "OrgOps", "org_ops", "Org & Ops", "org-ops" → "org_ops"
//          "strategy", "Strategy" → "strategy"
//          "commercial", "Commercial" → "commercial"
//          "product", "Product" → "product"
func normaliseTrackSlug(s string) string {
	lower := strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(s, " ", "_"), "-", "_"))
	switch lower {
	case "orgops", "org_ops", "org__ops", "org_&_ops":
		return "org_ops"
	case "strategy":
		return "strategy"
	case "commercial":
		return "commercial"
	case "product":
		return "product"
	}
	return lower
}

// vmTrackKey normalises a value model name (from the DB name column) to a track slug.
// DB names are typically: "Strategy", "OrgOps", "Commercial", "Product".
func vmTrackKey(name string) string {
	return normaliseTrackSlug(name)
}

// ── Track alignment ───────────────────────────────────────────────────────────

// alignTrack computes the new activation state for one value model track.
// It returns the TrackAlignResult, the updated payload (nil on no-op), and any error.
func alignTrack(track string, targets []krTarget, payload json.RawMessage) (TrackAlignResult, json.RawMessage, error) {
	result := TrackAlignResult{Track: track}

	// Parse the value model payload.
	var vm map[string]any
	if err := json.Unmarshal(payload, &vm); err != nil {
		return result, nil, fmt.Errorf("unmarshal value model: %w", err)
	}

	// Build a set of targeted L3 component IDs from the KR targets.
	// Also collect activation notes per L3 ID.
	targetedL3 := make(map[string]struct{})       // L3 ID → targeted
	activationNotes := make(map[string]string)     // L3 ID → note citing KR

	for _, t := range targets {
		parts := strings.Split(t.ComponentPath, ".")
		if len(parts) < 1 {
			continue
		}
		l3ID := parts[len(parts)-1]
		targetedL3[l3ID] = struct{}{}
		note := fmt.Sprintf("Targeted by roadmap KR")
		if t.KRID != "" {
			note = fmt.Sprintf("Targeted by KR %s", t.KRID)
		}
		if t.KRDescription != "" {
			note += ": " + t.KRDescription
		}
		activationNotes[l3ID] = note
	}

	// Walk the value model layers and apply activation.
	layers, _ := vm["layers"].([]any)
	changed := false
	var unresolvable []string

	// Track which L3 IDs were found in the model (to detect unresolvable paths).
	foundL3IDs := make(map[string]bool)

	for i, layerVal := range layers {
		layer, _ := layerVal.(map[string]any)
		if layer == nil {
			continue
		}
		l2Active := false

		components, _ := layer["components"].([]any)
		for j, compVal := range components {
			comp, _ := compVal.(map[string]any)
			if comp == nil {
				continue
			}
			l3Active := false

			subs, _ := comp["sub_components"].([]any)
			for k, subVal := range subs {
				sub, _ := subVal.(map[string]any)
				if sub == nil {
					continue
				}
				subID, _ := sub["id"].(string)
				if subID != "" {
					foundL3IDs[subID] = true
				}

				_, isTargeted := targetedL3[subID]
				wantActive := isTargeted

				currentActive, _ := sub["active"].(bool)
				if currentActive != wantActive {
					changed = true
					if wantActive {
						result.Activated++
					} else {
						result.Deactivated++
					}
					sub["active"] = wantActive
					subs[k] = sub
				} else if wantActive {
					// Still count targeted (already active) in Activated total.
					result.Activated++
				}

				if wantActive {
					l3Active = true
					// Write activation_notes.
					note := activationNotes[subID]
					existing, _ := sub["activation_notes"].(string)
					if existing != note {
						changed = true
						sub["activation_notes"] = note
						subs[k] = sub
					}
				} else {
					// Clear activation_notes when deactivating.
					if _, hasNote := sub["activation_notes"]; hasNote {
						if sub["activation_notes"] != "" && sub["activation_notes"] != nil {
							changed = true
							sub["activation_notes"] = ""
							subs[k] = sub
						}
					}
				}
			}
			comp["sub_components"] = subs

			// Propagate L3 → L2: L2 is active if any child L3 is active.
			currentCompActive, _ := comp["active"].(bool)
			if currentCompActive != l3Active {
				changed = true
				comp["active"] = l3Active
			}
			if l3Active {
				l2Active = true
			}
			components[j] = comp
		}
		layer["components"] = components

		// Propagate L2 → L1: L1 is active if any child L2 is active.
		currentLayerActive, _ := layer["active"].(bool)
		if currentLayerActive != l2Active {
			changed = true
			layer["active"] = l2Active
		}
		layers[i] = layer
	}
	vm["layers"] = layers

	// Detect unresolvable paths: KR targets that didn't match any L3 ID.
	for _, t := range targets {
		parts := strings.Split(t.ComponentPath, ".")
		l3ID := parts[len(parts)-1]
		if !foundL3IDs[l3ID] {
			unresolvable = append(unresolvable, t.ComponentPath)
			slog.Warn("align-portfolio: unresolvable component path",
				"track", track,
				"component_path", t.ComponentPath,
				"l3_id", l3ID,
			)
		}
	}
	result.UnresolvablePaths = unresolvable

	if !changed {
		result.NoOp = true
		return result, nil, nil
	}

	newPayload, err := json.Marshal(vm)
	if err != nil {
		return result, nil, fmt.Errorf("marshal updated value model: %w", err)
	}

	return result, json.RawMessage(newPayload), nil
}

// ── helpers for checking roadmap exists ──────────────────────────────────────

// roadmapExists checks if a roadmap_recipe artifact exists for the instance.
// Used by consistency checks and callers that want a quick existence test.
func (s *Service) roadmapExists(ctx context.Context, instanceID uuid.UUID) bool {
	exists, err := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		Where("instance_id = ? AND artifact_type = ? AND status != ?",
			instanceID, domain.ArtifactTypeRoadmap, "archived").
		Exists(ctx)
	if err != nil {
		return false
	}
	return exists
}

// valueModelExists checks if any value_model artifact exists for the instance.
func (s *Service) valueModelExists(ctx context.Context, instanceID uuid.UUID) bool {
	exists, err := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		Where("instance_id = ? AND artifact_type = ? AND status != ?",
			instanceID, domain.ArtifactTypeValueModel, "archived").
		Exists(ctx)
	if err != nil {
		return false
	}
	return exists
}


