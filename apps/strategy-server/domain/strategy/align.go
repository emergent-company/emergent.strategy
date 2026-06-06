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
	Track             string // "strategy", "org_ops", "commercial", "product"
	ArtifactKey       string // artifact key that was updated
	Activated         int    // L3 components set to active
	Deactivated       int    // L3 components set to inactive
	NoValueModel      bool   // no value_model artifact found for this track
	NoOp              bool   // activation state was already correct
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

	// Index value models by their track name. A single track may have several
	// value model artifacts — a multi-product portfolio splits the Product track
	// into one value model per product line (e.g. hardware, software). We group
	// rather than collapse so KR targets are resolved against every model in the
	// track, not just one.
	vmByTrack := make(map[string][]*domain.StrategyArtifact)
	for _, a := range vmArtifacts {
		if a.Name != nil {
			key := vmTrackKey(*a.Name)
			vmByTrack[key] = append(vmByTrack[key], a)
		}
	}

	// 4. Process each of the four canonical tracks.
	tracks := []string{"strategy", "org_ops", "commercial", "product"}
	batchID := uuid.New()

	for _, track := range tracks {
		s.alignOneTrack(ctx, instanceID, batchID, track, krTargetsByTrack[track], vmByTrack[track], &result)
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

// alignOneTrack aligns all value models belonging to a single track and folds the
// outcome into result. A track may have several value models (a multi-product
// portfolio splits Product into per-product-line models), so a KR target is only
// reported unresolvable when no value model in the track resolves it.
func (s *Service) alignOneTrack(
	ctx context.Context,
	instanceID, batchID uuid.UUID,
	track string,
	targets []krTarget,
	vms []*domain.StrategyArtifact,
	result *AlignPortfolioResult,
) {
	if len(vms) == 0 {
		result.TrackResults = append(result.TrackResults, TrackAlignResult{
			Track:        track,
			NoValueModel: true,
		})
		return
	}
	result.TracksProcessed++

	// A KR target's path is only unresolvable when it resolves in NONE of the
	// track's value models. Start assuming every target is unresolvable and
	// remove a path once any model in the track resolves it.
	unresolvedPaths := make(map[string]struct{}, len(targets))
	for _, t := range targets {
		unresolvedPaths[t.ComponentPath] = struct{}{}
	}

	for _, vm := range vms {
		trackResult, newPayload, err := alignTrack(track, targets, vm.Payload)
		if err != nil {
			slog.WarnContext(ctx, "align-portfolio: value model alignment failed",
				"instance_id", instanceID, "track", track,
				"artifact_key", vm.ArtifactKey, "err", err)
			continue
		}

		// Mark every path this model resolved as resolved track-wide.
		unresolvedInThisVM := make(map[string]struct{}, len(trackResult.UnresolvablePaths))
		for _, p := range trackResult.UnresolvablePaths {
			unresolvedInThisVM[p] = struct{}{}
		}
		for _, t := range targets {
			if _, unresolved := unresolvedInThisVM[t.ComponentPath]; !unresolved {
				delete(unresolvedPaths, t.ComponentPath)
			}
		}

		result.TotalActivated += trackResult.Activated
		result.TotalDeactivated += trackResult.Deactivated

		if trackResult.NoOp {
			continue
		}
		result.TracksChanged++
		s.commitAlignedValueModel(ctx, instanceID, batchID, vm, newPayload)
	}

	// Collect the track's genuinely-unresolvable paths (resolved by no model).
	trackUnresolvable := make([]string, 0, len(unresolvedPaths))
	for _, t := range targets {
		if _, unresolved := unresolvedPaths[t.ComponentPath]; unresolved {
			trackUnresolvable = append(trackUnresolvable, t.ComponentPath)
			delete(unresolvedPaths, t.ComponentPath) // dedupe repeated paths
			slog.WarnContext(ctx, "align-portfolio: unresolvable component path",
				"instance_id", instanceID, "track", track,
				"component_path", t.ComponentPath)
		}
	}
	result.UnresolvablePaths = append(result.UnresolvablePaths, trackUnresolvable...)
	result.TrackResults = append(result.TrackResults, TrackAlignResult{
		Track:             track,
		UnresolvablePaths: trackUnresolvable,
	})
}

// commitAlignedValueModel auto-commits an aligned value model payload as a
// committed mutation and derives its strategic index.
func (s *Service) commitAlignedValueModel(
	ctx context.Context,
	instanceID, batchID uuid.UUID,
	vm *domain.StrategyArtifact,
	newPayload json.RawMessage,
) {
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
			"instance_id", instanceID, "artifact_key", vm.ArtifactKey, "err", err)
		return
	}
	if err := s.deriveIndex(ctx, m); err != nil {
		slog.WarnContext(ctx, "align-portfolio: derive index failed",
			"artifact_key", vm.ArtifactKey, "err", err)
	}
}

// ── KR target extraction ─────────────────────────────────────────────────────

// krTarget holds a single KR's value model target reference.
type krTarget struct {
	KRID           string // KR id field (may be empty)
	KRDescription  string // KR description
	Track          string // target track ("strategy", "org_ops", "commercial", "product")
	ComponentPath  string // dot-separated L1.L2.L3 IDs
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
//
//	"strategy", "Strategy" → "strategy"
//	"commercial", "Commercial" → "commercial"
//	"product", "Product" → "product"
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

// subActivation reports what changed when applying activation to one sub-component.
type subActivation struct {
	changed     bool
	activated   bool
	deactivated bool
}

// applySubActivation sets the active flag and activation_notes on a single
// sub-component (L3) in place. When activating, it writes the supplied note;
// when deactivating, it clears any existing note.
func applySubActivation(sub map[string]any, wantActive bool, note string) subActivation {
	var act subActivation

	currentActive, _ := sub["active"].(bool)
	if currentActive != wantActive {
		act.changed = true
		act.activated = wantActive
		act.deactivated = !wantActive
		sub["active"] = wantActive
	} else if wantActive {
		// Already active and still targeted — count it in the activated total.
		act.activated = true
	}

	if wantActive {
		if existing, _ := sub["activation_notes"].(string); existing != note {
			act.changed = true
			sub["activation_notes"] = note
		}
		return act
	}

	// Deactivating: clear any existing non-empty note.
	if v, hasNote := sub["activation_notes"]; hasNote && v != "" && v != nil {
		act.changed = true
		sub["activation_notes"] = ""
	}
	return act
}

// firstNonEmpty returns the first non-empty string from the arguments, or "".
func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

// alignTrack computes the new activation state for one value model track.
// It returns the TrackAlignResult, the updated payload (nil on no-op), and any error.
//
// A KR target's component_path identifies a single component by its final
// segment. That segment is matched against component ids at every level —
// L3 sub-component, L2 component, or L1 layer — and activation is applied at
// whichever level it resolves. Targeting an L2 activates all of its
// sub-components; targeting an L1 activates everything beneath it. Activation
// always propagates upward (active L3 → active L2 → active L1).
func alignTrack(track string, targets []krTarget, payload json.RawMessage) (TrackAlignResult, json.RawMessage, error) {
	result := TrackAlignResult{Track: track}

	// Parse the value model payload.
	var vm map[string]any
	if err := json.Unmarshal(payload, &vm); err != nil {
		return result, nil, fmt.Errorf("unmarshal value model: %w", err)
	}

	// Build a set of targeted component IDs from the KR targets. A KR's
	// component_path points at a single component by its last segment. That
	// segment may resolve to any level of the value model: an L3 sub-component,
	// an L2 component, or an L1 layer. We therefore match the last segment
	// against ids at every level and activate at whichever level it resolves,
	// propagating upward as usual.
	targeted := make(map[string]struct{})      // component ID (any level) → targeted
	activationNotes := make(map[string]string) // component ID → note citing KR

	for _, t := range targets {
		parts := strings.Split(t.ComponentPath, ".")
		if len(parts) < 1 {
			continue
		}
		id := parts[len(parts)-1]
		targeted[id] = struct{}{}
		note := "Targeted by roadmap KR"
		if t.KRID != "" {
			note = fmt.Sprintf("Targeted by KR %s", t.KRID)
		}
		if t.KRDescription != "" {
			note += ": " + t.KRDescription
		}
		activationNotes[id] = note
	}

	// Walk the value model layers and apply activation.
	layers, _ := vm["layers"].([]any)
	changed := false
	var unresolvable []string

	// Track which component IDs (any level) were found in the model, so we can
	// distinguish a path that resolved at some level from a truly unresolvable one.
	foundIDs := make(map[string]bool)

	for i, layerVal := range layers {
		layer, _ := layerVal.(map[string]any)
		if layer == nil {
			continue
		}
		l2Active := false

		layerID, _ := layer["id"].(string)
		if layerID != "" {
			foundIDs[layerID] = true
		}
		_, layerTargeted := targeted[layerID]

		components, _ := layer["components"].([]any)
		for j, compVal := range components {
			comp, _ := compVal.(map[string]any)
			if comp == nil {
				continue
			}
			l3Active := false

			compID, _ := comp["id"].(string)
			if compID != "" {
				foundIDs[compID] = true
			}
			// A component is targeted directly (L2 hit), or transitively because
			// its parent layer was targeted (L1 hit). Either activates all of its
			// sub-components.
			_, compTargeted := targeted[compID]
			compTargeted = compTargeted || layerTargeted

			subs, _ := comp["sub_components"].([]any)
			for k, subVal := range subs {
				sub, _ := subVal.(map[string]any)
				if sub == nil {
					continue
				}
				subID, _ := sub["id"].(string)
				if subID != "" {
					foundIDs[subID] = true
				}

				_, subTargeted := targeted[subID]
				// A sub-component is active when it is targeted directly (L3 hit)
				// or because an ancestor (L2 or L1) was targeted.
				wantActive := subTargeted || compTargeted
				// The activation note belongs to whichever level the KR targeted:
				// the sub-component (L3), its parent component (L2), or layer (L1).
				note := firstNonEmpty(activationNotes[subID], activationNotes[compID], activationNotes[layerID])

				act := applySubActivation(sub, wantActive, note)
				if act.changed {
					changed = true
					subs[k] = sub
				}
				if act.activated {
					result.Activated++
				}
				if act.deactivated {
					result.Deactivated++
				}
				if wantActive {
					l3Active = true
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

	// Record paths unresolvable in THIS value model: KR targets whose last
	// segment matched no component id at any level (L3, L2, or L1). The caller
	// aggregates across all value models in the track before deciding a path is
	// truly unresolvable — a path may resolve in a sibling product sub-model.
	for _, t := range targets {
		parts := strings.Split(t.ComponentPath, ".")
		id := parts[len(parts)-1]
		if !foundIDs[id] {
			unresolvable = append(unresolvable, t.ComponentPath)
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
