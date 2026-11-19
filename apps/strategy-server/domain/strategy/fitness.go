package strategy

// KR-target fitness: do the roadmap's Key Results and the instance's features
// aim at the same parts of the value model?
//
// A Key Result declares a value_model_target (a component path). A feature or
// definition declares contributes_to paths. Both resolve to a node of a value
// model: a layer, a component or a sub-component. Two nodes are related when
// one is the other or an ancestor of it.
//
//   - kr.no_component_path: the Key Result names no component_path.
//   - kr.path_not_in_value_model: its path resolves in no value model.
//   - kr.reached_only_by_parent: it is served only at an ancestor of its
//     target. Something contributes to the component, nothing to the
//     sub-component the Key Result is about.
//   - feature.reaches_no_kr: none of a feature's resolved paths is related to
//     any Key Result target, so the feature serves no measured outcome.
//
// A Key Result that nothing serves at all is deliberately not a finding here:
// the specification names four rules, and a fifth would be a new public rule id.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategyread"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/valuemodel"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// Fitness rule ids. They are a public contract: consumers baseline on them.
const (
	RuleKRNoComponentPath     = "kr.no_component_path"
	RuleKRPathNotInModel      = "kr.path_not_in_value_model"
	RuleKRReachedOnlyByParent = "kr.reached_only_by_parent"
	RuleFeatureReachesNoKR    = "feature.reaches_no_kr"
)

// FitnessFinding is one result of the check. Severity is "error", "warning" or
// "info".
type FitnessFinding struct {
	Severity string
	Rule     string
	Key      string // artifact key the finding is about
	Path     string // location inside it
	Message  string
}

// FitnessReport is the outcome of a KR-target fitness check. Every count has a
// denominator established independently of the finding it qualifies.
type FitnessReport struct {
	KRsTotal      int // every Key Result in the roadmap, with or without a target
	KRsWithPath   int // of those, how many name a component_path
	KRsResolved   int // of those, how many resolve in a value model
	KRsServed     int // of those, how many have a contributor at or below the target
	FeaturesTotal int
	// FeaturesReaching is how many features have a resolved path related to a KR target.
	FeaturesReaching int
	Findings         []FitnessFinding
}

// FitnessModel is a value model with the artifact key it came from. The key
// keeps two models of one track (a multi-product portfolio) apart.
type FitnessModel struct {
	Key   string
	Model valuemodel.Model
}

// FitnessContributor is a definition that may contribute to a value model:
// a feature, or a strategy, org_ops or commercial definition.
type FitnessContributor struct {
	Key     string
	Type    string
	Status  string // the definition's own status ("draft", "in-progress", ...)
	Payload map[string]any
}

// node is a position in a value model. Empty ids mean "not at that level".
type node struct {
	model, layer, comp, sub string
}

// within reports whether n is a (or lies under) k: k is n itself or an ancestor.
func (n node) within(k node) bool {
	if n.model != k.model {
		return false
	}
	switch {
	case k.comp == "":
		return n.layer == k.layer
	case k.sub == "":
		return n.layer == k.layer && n.comp == k.comp
	}
	return n == k
}

func (n node) related(k node) bool { return n.within(k) || k.within(n) }

// resolveNode places a path in the models. Resolve reads Layer.Component and
// Component.Sub forms; a path naming only a layer falls back to ResolveLayer.
func resolveNode(path string, models []FitnessModel) (node, error) {
	var firstErr error
	for _, fm := range models {
		m, err := fm.Model.Resolve(path)
		if err != nil {
			m, err = fm.Model.ResolveLayer(path)
		}
		if err == nil {
			return node{fm.Key, m.LayerID, m.ComponentID, m.SubID}, nil
		}
		if firstErr == nil {
			firstErr = err
		}
	}
	if firstErr == nil {
		return node{}, errors.New("the instance has no value model")
	}
	return node{}, firstErr
}

// AnalyzeKRFitness is the check itself, free of storage so it can be tested on
// literal data. roadmap is a decoded roadmap_recipe payload.
func AnalyzeKRFitness(roadmap any, models []FitnessModel, contributors []FitnessContributor) FitnessReport {
	var rep FitnessReport
	targets := strategyread.KeyResultTargets(roadmap)
	rep.KRsTotal = len(targets)

	type resolvedKR struct {
		t    strategyread.KRTarget
		node node
	}
	var krs []resolvedKR
	for _, t := range targets {
		if t.ComponentPath == "" {
			rep.Findings = append(rep.Findings, FitnessFinding{
				Severity: "warning", Rule: RuleKRNoComponentPath, Key: "roadmap_recipe", Path: krPath(t),
				Message: fmt.Sprintf("key result %s declares no value_model_target.component_path, so no part of the value model is measured by it", krLabel(t)),
			})
			continue
		}
		rep.KRsWithPath++
		n, err := resolveNode(t.ComponentPath, models)
		if err != nil {
			rep.Findings = append(rep.Findings, FitnessFinding{
				Severity: "error", Rule: RuleKRPathNotInModel, Key: "roadmap_recipe", Path: krPath(t),
				Message: fmt.Sprintf("key result %s targets %q, which names nothing in any value model: %v", krLabel(t), t.ComponentPath, err),
			})
			continue
		}
		rep.KRsResolved++
		krs = append(krs, resolvedKR{t, n})
	}

	type contributed struct {
		c     FitnessContributor
		nodes []node
	}
	var all []contributed
	for _, c := range contributors {
		var nodes []node
		for _, p := range valuemodel.ContributesTo(c.Payload) {
			if n, err := resolveNode(p, models); err == nil {
				nodes = append(nodes, n)
			}
		}
		all = append(all, contributed{c, nodes})
	}

	for _, kr := range krs {
		served, parentOnly := false, false
		for _, a := range all {
			for _, n := range a.nodes {
				switch {
				case n.within(kr.node):
					served = true
				case kr.node.within(n):
					parentOnly = true
				}
			}
		}
		switch {
		case served:
			rep.KRsServed++
		case parentOnly:
			rep.Findings = append(rep.Findings, FitnessFinding{
				Severity: "warning", Rule: RuleKRReachedOnlyByParent, Key: "roadmap_recipe", Path: krPath(kr.t),
				Message: fmt.Sprintf("key result %s targets %q, but only definitions contributing to a broader part of the value model serve it; nothing contributes to the target itself", krLabel(kr.t), kr.t.ComponentPath),
			})
		}
	}

	krNodes := make([]node, len(krs))
	for i, kr := range krs {
		krNodes[i] = kr.node
	}
	for _, a := range all {
		if a.c.Type != domain.ArtifactTypeFeature {
			continue
		}
		rep.FeaturesTotal++
		if reachesAnyKR(a.nodes, krNodes) {
			rep.FeaturesReaching++
			continue
		}
		rep.Findings = append(rep.Findings, FitnessFinding{
			Severity: featureSeverity(a.c.Status), Rule: RuleFeatureReachesNoKR, Key: a.c.Key, Path: "/strategic_context/contributes_to",
			Message: featureMessage(a.c, len(a.nodes), len(valuemodel.ContributesTo(a.c.Payload)), len(krNodes)),
		})
	}

	sort.SliceStable(rep.Findings, func(i, j int) bool {
		if rep.Findings[i].Rule != rep.Findings[j].Rule {
			return rep.Findings[i].Rule < rep.Findings[j].Rule
		}
		if rep.Findings[i].Key != rep.Findings[j].Key {
			return rep.Findings[i].Key < rep.Findings[j].Key
		}
		return rep.Findings[i].Path < rep.Findings[j].Path
	})
	return rep
}

func reachesAnyKR(feature, krs []node) bool {
	for _, f := range feature {
		for _, k := range krs {
			if f.related(k) {
				return true
			}
		}
	}
	return false
}

// featureSeverity: the work in flight is held to the standard, a draft is only
// warned, and a delivered feature is context. Status values come from the
// feature_definition schema (draft, ready, in-progress, delivered).
func featureSeverity(status string) string {
	switch status {
	case "in-progress":
		return "error"
	case "delivered":
		return "info"
	}
	return "warning"
}

func featureMessage(c FitnessContributor, resolved, declared, krTargets int) string {
	switch {
	case krTargets == 0:
		return fmt.Sprintf("feature %s (%s) reaches no Key Result because no Key Result in the roadmap resolves to a value model target; fix the Key Result targets first", c.Key, statusOrUnset(c.Status))
	case declared == 0:
		return fmt.Sprintf("feature %s (%s) declares no contributes_to path, so it serves no Key Result", c.Key, statusOrUnset(c.Status))
	case resolved == 0:
		return fmt.Sprintf("feature %s (%s): none of its %d contributes_to paths resolves in a value model, so it serves no Key Result", c.Key, statusOrUnset(c.Status), declared)
	}
	return fmt.Sprintf("feature %s (%s) contributes to parts of the value model that no Key Result targets", c.Key, statusOrUnset(c.Status))
}

func statusOrUnset(s string) string {
	if s == "" {
		return "no status"
	}
	return s
}

func krLabel(t strategyread.KRTarget) string {
	if t.ID == "" {
		return "(no id) in " + t.Track
	}
	return t.ID
}

func krPath(t strategyread.KRTarget) string {
	return "/tracks/" + t.Track + "/" + t.Group + "/" + t.ObjectiveID + "/key_results/" + t.ID
}

// KRTargetFitness runs the check on the committed artifacts of an instance. It
// returns apperror.ErrBadRequest when there is nothing to check against: a
// missing roadmap or value model is not the same answer as "everything fits".
func (s *Service) KRTargetFitness(ctx context.Context, instanceID uuid.UUID) (FitnessReport, error) {
	raw, err := s.GetCurrentArtifact(ctx, instanceID, domain.ArtifactTypeRoadmap)
	if err != nil {
		if ae := apperror.AsAppError(err); ae != nil && ae.HTTPStatus == 404 {
			return FitnessReport{}, apperror.ErrBadRequest.WithDetail("the instance has no roadmap_recipe: there are no Key Results to check")
		}
		return FitnessReport{}, fmt.Errorf("load roadmap: %w", err)
	}
	var roadmap map[string]any
	if err := json.Unmarshal(raw, &roadmap); err != nil {
		return FitnessReport{}, fmt.Errorf("decode roadmap: %w", err)
	}

	vms, err := s.ListCurrentArtifacts(ctx, instanceID, domain.ArtifactTypeValueModel)
	if err != nil {
		return FitnessReport{}, fmt.Errorf("load value models: %w", err)
	}
	if len(vms) == 0 {
		return FitnessReport{}, apperror.ErrBadRequest.WithDetail("the instance has no value_model artifacts: there is nothing to resolve targets against")
	}
	var models []FitnessModel
	tracks := map[string]bool{}
	for _, vm := range vms {
		var p map[string]any
		if err := json.Unmarshal(vm.Payload, &p); err != nil {
			return FitnessReport{}, fmt.Errorf("value model %s: %w", vm.ArtifactKey, err)
		}
		m := valuemodel.ParseModel(p)
		models = append(models, FitnessModel{Key: vm.ArtifactKey, Model: m})
		tracks[valuemodel.NormalizeTrack(m.Track)] = true
	}

	types := map[string]bool{}
	for track := range tracks {
		if t, ok := valuemodel.DefinitionTypes[track]; ok {
			types[t] = true
		}
	}
	typeNames := make([]string, 0, len(types))
	for t := range types {
		typeNames = append(typeNames, t)
	}
	sort.Strings(typeNames)

	var contributors []FitnessContributor
	for _, t := range typeNames {
		defs, err := s.ListCurrentArtifacts(ctx, instanceID, t)
		if err != nil {
			return FitnessReport{}, fmt.Errorf("load %s artifacts: %w", t, err)
		}
		for _, d := range defs {
			var p map[string]any
			if err := json.Unmarshal(d.Payload, &p); err != nil {
				continue
			}
			status, _ := p["status"].(string)
			contributors = append(contributors, FitnessContributor{Key: d.ArtifactKey, Type: t, Status: status, Payload: p})
		}
	}
	return AnalyzeKRFitness(roadmap, models, contributors), nil
}
