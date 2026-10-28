package strategy

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategyread"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// ViewNames lists the question-shaped views, in documentation order.
var ViewNames = []string{"competitor", "objectives", "key_result", "personas"}

// ViewPart is one source of a view. A part that is not defined is reported with
// its reason, never skipped.
type ViewPart struct {
	Name string `json:"name"`
	*SectionResult
}

// ViewResult composes sections of one or more artifacts into the answer to a
// question, within one shared budget.
type ViewResult struct {
	View      string            `json:"view"`
	Args      map[string]string `json:"args,omitempty"`
	Parts     []ViewPart        `json:"parts"`
	Truncated bool              `json:"truncated"`
	MaxChars  int               `json:"max_chars"`
	Labels    map[string]string `json:"labels,omitempty"`
	Hints     []string          `json:"hints,omitempty"`
}

// ReadView resolves a named view. The error is for an unknown view, a missing
// or malformed argument, or a failed query.
func (s *Service) ReadView(ctx context.Context, instanceID uuid.UUID, view string, args map[string]string, maxChars int) (*ViewResult, error) {
	budget, capped := strategyread.NormaliseBudget(maxChars)
	out := &ViewResult{View: view, Args: args, MaxChars: budget}
	if capped {
		out.Hints = append(out.Hints, fmt.Sprintf("max_chars was capped at %d", strategyread.HardMaxChars))
	}

	var err error
	switch view {
	case "competitor":
		err = s.competitorView(ctx, instanceID, args, budget, out)
	case "objectives":
		err = s.objectivesView(ctx, instanceID, args, budget, out)
	case "key_result":
		err = s.keyResultView(ctx, instanceID, args, budget, out)
	case "personas":
		err = s.personasView(ctx, instanceID, budget, out)
	default:
		return nil, apperror.ErrBadRequest.WithDetail(fmt.Sprintf("unknown view %q; valid views: %s", view, strings.Join(ViewNames, ", ")))
	}
	if err != nil {
		return nil, err
	}

	var contents []any
	for i := range out.Parts {
		p := &out.Parts[i]
		if p.Truncated {
			out.Truncated = true
		}
		if p.Content != nil {
			contents = append(contents, p.Content)
		}
		p.Labels = nil
	}
	if idx, ierr := s.labelIndex(ctx, instanceID); ierr == nil {
		out.Labels = strategyread.LabelsFor(contents, idx)
	}
	if out.Truncated {
		out.Hints = append(out.Hints, "a part did not fit the shared budget; read it with get_section using its children[].path, or raise max_chars")
	}
	return out, nil
}

// sharer hands out the shared budget: each part gets an equal share of what is
// left.
type sharer struct {
	remaining int
	left      int
}

func (b *sharer) next() int {
	share := b.remaining
	if b.left > 1 {
		share = b.remaining / b.left
	}
	return share
}

func (b *sharer) spend(p ViewPart) {
	used := 0
	switch {
	case p.SectionResult == nil:
	case p.Content != nil:
		used = len(mustMarshalString(p.Content))
	}
	b.remaining -= used
	if b.remaining < 0 {
		b.remaining = 0
	}
	b.left--
}

func mustMarshalString(v any) string {
	raw, err := json.Marshal(v)
	if err != nil {
		return ""
	}
	return string(raw)
}

// firstDefined reads each candidate path until one is defined; when none is,
// it returns the first candidate's result so the reason is reported.
func (s *Service) firstDefined(ctx context.Context, instanceID uuid.UUID, artifact string, candidates []string, share int) (*SectionResult, error) {
	var first *SectionResult
	for _, path := range candidates {
		res, err := s.ReadSection(ctx, instanceID, artifact, path, share)
		if err != nil {
			return nil, err
		}
		if first == nil {
			first = res
		}
		if res.Defined {
			return res, nil
		}
	}
	return first, nil
}

func selectorSafe(name string) error {
	if strings.ContainsAny(name, "[]") {
		return apperror.ErrBadRequest.WithDetail(fmt.Sprintf("name %q must not contain [ or ]", name))
	}
	return nil
}

func (s *Service) competitorView(ctx context.Context, instanceID uuid.UUID, args map[string]string, budget int, out *ViewResult) error {
	name := strings.TrimSpace(args["name"])
	if name == "" {
		return apperror.ErrBadRequest.WithDetail("the competitor view needs a name argument")
	}
	if err := selectorSafe(name); err != nil {
		return err
	}
	sources := []struct {
		part, artifact string
		paths          []string
	}{
		{"positioning_vs_competitor", "strategy_formula", []string{"competitive_moat.vs_competitors[name=" + name + "]"}},
		{"landscape_entry", "insight_analyses", []string{
			"competitive_landscape.direct_competitors[name=" + name + "]",
			"competitive_landscape.indirect_competitors[name=" + name + "]",
		}},
		{"positioning_statement", "strategy_formula", []string{"positioning"}},
	}
	b := &sharer{remaining: budget, left: len(sources)}
	for _, src := range sources {
		res, err := s.firstDefined(ctx, instanceID, src.artifact, src.paths, b.next())
		if err != nil {
			return err
		}
		part := ViewPart{Name: src.part, SectionResult: res}
		out.Parts = append(out.Parts, part)
		b.spend(part)
	}
	return nil
}

func (s *Service) personasView(ctx context.Context, instanceID uuid.UUID, budget int, out *ViewResult) error {
	res, err := s.ReadSection(ctx, instanceID, "insight_analyses", "target_users", budget)
	if err != nil {
		return err
	}
	if items, ok := res.Content.([]any); ok && len(items) < 2 {
		out.Hints = append(out.Hints, fmt.Sprintf("only %d persona is defined in the strategy", len(items)))
	}
	out.Parts = append(out.Parts, ViewPart{Name: "personas", SectionResult: res})
	return nil
}

// roadmapPart loads the authored roadmap and applies build to its payload. A
// missing or framework roadmap is reported as not defined.
func (s *Service) roadmapPart(ctx context.Context, instanceID uuid.UUID, name, path string, build func(payload any) (content any, reason string)) (ViewPart, error) {
	res := &SectionResult{Source: SectionSource{InstanceID: instanceID, ArtifactKey: "roadmap_recipe", ArtifactType: "roadmap_recipe", Path: path}}
	res.CiteAs = strategyread.CiteAs("roadmap_recipe", path)
	part := ViewPart{Name: name, SectionResult: res}

	row, err := s.currentRow(ctx, instanceID, "roadmap_recipe")
	if err != nil {
		return part, err
	}
	if row == nil {
		res.Reason = `no artifact "roadmap_recipe" in this instance`
		return part, nil
	}
	if reason, ok := frameworkReason(row); ok {
		res.Reason = reason
		res.Integrity = &IntegrityInfo{Class: deref(row.IntegrityClass), Ref: deref(row.IntegrityRef)}
		return part, nil
	}
	payload, err := decodePayload(row)
	if err != nil {
		return part, err
	}
	content, reason := build(payload)
	if reason != "" {
		res.Reason = reason
		return part, nil
	}
	res.Defined = true
	res.Content = content
	res.SizeChars = len(mustMarshalString(content))
	return part, nil
}

// fitOrOutline keeps a computed part within its share; when it does not fit it
// returns the sections instead and says so.
func fitOrOutline(p *ViewPart, share int, sections []strategyread.Child) {
	if !p.Defined || p.SizeChars <= share {
		return
	}
	p.Truncated = true
	p.Content = nil
	p.Children = sections
}

func (s *Service) objectivesView(ctx context.Context, instanceID uuid.UUID, args map[string]string, budget int, out *ViewResult) error {
	track := strings.TrimSpace(args["track"])
	part, err := s.roadmapPart(ctx, instanceID, "objectives", "tracks", func(payload any) (any, string) {
		tracks := strategyread.Objectives(payload, track)
		if len(tracks) == 0 {
			if track != "" {
				return nil, fmt.Sprintf("no track %q in the roadmap", track)
			}
			return nil, "the roadmap has no tracks"
		}
		return tracks, ""
	})
	if err != nil {
		return err
	}
	if part.Defined && part.SizeChars > budget {
		var sections []strategyread.Child
		tracks, _ := part.Content.([]strategyread.TrackObjectives)
		for _, t := range tracks {
			sections = append(sections, strategyread.Child{
				Key: t.Track, Path: "tracks." + t.Track, Kind: "object",
				SizeChars: len(mustMarshalString(t)), Gist: fmt.Sprintf("%d objectives", len(t.Objectives)),
			})
		}
		fitOrOutline(&part, budget, sections)
		out.Hints = append(out.Hints, "pass track=<name> to get one track's objectives")
	}
	out.Parts = append(out.Parts, part)
	return nil
}

func (s *Service) keyResultView(ctx context.Context, instanceID uuid.UUID, args map[string]string, budget int, out *ViewResult) error {
	id := strings.TrimSpace(args["id"])
	if id == "" {
		return apperror.ErrBadRequest.WithDetail("the key_result view needs an id argument, for example kr-c-001")
	}
	part, err := s.roadmapPart(ctx, instanceID, "key_result", "tracks.*.okrs[*].key_results[id="+id+"]", func(payload any) (any, string) {
		detail, ok := strategyread.KeyResult(payload, id)
		if !ok {
			return nil, fmt.Sprintf("no key result with id %q in the roadmap", id)
		}
		return detail, ""
	})
	if err != nil {
		return err
	}
	if part.Defined && part.SizeChars > budget {
		part.Truncated = true
		part.Content = nil
		out.Hints = append(out.Hints, "the key result is larger than max_chars; raise max_chars")
	}
	out.Parts = append(out.Parts, part)
	return nil
}
