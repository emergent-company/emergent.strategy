package strategy

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategyread"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/integrity"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/integrity/embeddedclassifier"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// readyArtifacts are the strategy documents a company is expected to author, in
// reading order.
var readyArtifacts = []string{
	"north_star",
	"insight_analyses",
	"strategy_foundations",
	"insight_opportunity",
	"strategy_formula",
	"roadmap_recipe",
}

// IsFrameworkClass reports whether an integrity class marks content that ships
// with the framework rather than content the company wrote. Answer-facing reads
// do not present it as the company's strategy.
func IsFrameworkClass(class string) bool {
	switch integrity.Class(class) {
	case integrity.ClassCanonicalReference, integrity.ClassUnmodifiedTemplate, integrity.ClassPackagedDefault:
		return true
	}
	return false
}

// IntegrityInfo says why an artifact is not the company's own content.
type IntegrityInfo struct {
	Class string `json:"class"`
	Ref   string `json:"ref,omitempty"`
}

// ArtifactOutline summarises one authored artifact.
type ArtifactOutline struct {
	Artifact     string `json:"artifact"`
	ArtifactType string `json:"artifact_type"`
	SizeChars    int    `json:"size_chars"`
	// Sections maps each top-level section to its size. It is the compact form
	// used for the whole-instance outline.
	Sections map[string]int `json:"sections,omitempty"`
	// Children describes the sections with gists, when one artifact is asked for.
	Children []strategyread.Child `json:"children,omitempty"`
	ReadWith string               `json:"read_with"`
}

// NotDefined names a strategy document the instance does not define, and why.
type NotDefined struct {
	Artifact string `json:"artifact"`
	Reason   string `json:"reason"`
	Ref      string `json:"ref,omitempty"`
}

// OutlineResult is what an instance defines, how big each part is, and how to
// read it. It never carries content.
type OutlineResult struct {
	Artifacts  []ArtifactOutline `json:"artifacts"`
	NotDefined []NotDefined      `json:"not_defined,omitempty"`
	// OtherArtifacts counts authored artifacts that are not READY documents
	// (features, value models, ...), by type.
	OtherArtifacts map[string]int `json:"other_artifacts,omitempty"`
	// FrameworkContent counts unmodified framework content in the instance by
	// integrity class. It is counted, never listed.
	FrameworkContent map[string]int `json:"framework_content,omitempty"`
	IntegritySource  string         `json:"integrity_source,omitempty"`
	Hints            []string       `json:"hints,omitempty"`
}

// ReadOutline returns what the instance defines. With a non-empty artifact it
// describes that artifact's top-level sections with gists.
func (s *Service) ReadOutline(ctx context.Context, instanceID uuid.UUID, artifact string) (*OutlineResult, error) {
	out := &OutlineResult{Artifacts: []ArtifactOutline{}}
	if c := s.activeClassifier(); c != nil {
		out.IntegritySource = c.Summary()
	}

	if artifact != "" {
		row, err := s.currentRow(ctx, instanceID, artifact)
		if err != nil {
			return nil, err
		}
		if row == nil {
			out.NotDefined = append(out.NotDefined, NotDefined{Artifact: artifact, Reason: "no such artifact in this instance"})
			return out, nil
		}
		if reason, ok := frameworkReason(row); ok {
			out.NotDefined = append(out.NotDefined, notDefinedOf(row, reason))
			return out, nil
		}
		payload, err := decodePayload(row)
		if err != nil {
			return nil, err
		}
		out.Artifacts = append(out.Artifacts, ArtifactOutline{
			Artifact:     row.ArtifactKey,
			ArtifactType: row.ArtifactType,
			SizeChars:    utf8.RuneCount(row.Payload),
			Children:     strategyread.Outline(row.ArtifactType, payload),
			ReadWith:     readWith(row.ArtifactKey, "<path>"),
		})
		out.Hints = []string{"read one section with get_section, using a path from children[].path"}
		return out, nil
	}

	var rows []*domain.StrategyArtifact
	if err := s.db.NewSelect().Model(&rows).
		Where("instance_id = ? AND status != ? AND artifact_type IN (?)", instanceID, domain.ArtifactStatusArchived, bun.List(readyArtifacts)).
		Scan(ctx); err != nil {
		return nil, fmt.Errorf("load READY artifacts: %w", err)
	}
	byKey := map[string]*domain.StrategyArtifact{}
	for _, r := range rows {
		byKey[r.ArtifactKey] = r
	}
	for _, key := range readyArtifacts {
		row := byKey[key]
		if row == nil {
			out.NotDefined = append(out.NotDefined, NotDefined{Artifact: key, Reason: "not present in this instance"})
			continue
		}
		if reason, ok := frameworkReason(row); ok {
			out.NotDefined = append(out.NotDefined, notDefinedOf(row, reason))
			continue
		}
		payload, err := decodePayload(row)
		if err != nil {
			return nil, err
		}
		sections := map[string]int{}
		for _, c := range strategyread.Outline(row.ArtifactType, payload) {
			sections[c.Key] = c.SizeChars
		}
		out.Artifacts = append(out.Artifacts, ArtifactOutline{
			Artifact:     row.ArtifactKey,
			ArtifactType: row.ArtifactType,
			SizeChars:    utf8.RuneCount(row.Payload),
			Sections:     sections,
			ReadWith:     readWith(row.ArtifactKey, "<section>"),
		})
	}

	if err := s.countArtifacts(ctx, instanceID, out); err != nil {
		return nil, err
	}
	out.Hints = []string{
		"get_outline with artifact=<name> describes one artifact's sections with gists",
		"get_section reads one section; framework content is counted here but never listed",
	}
	return out, nil
}

func (s *Service) countArtifacts(ctx context.Context, instanceID uuid.UUID, out *OutlineResult) error {
	var counts []struct {
		ArtifactType   string  `bun:"artifact_type"`
		IntegrityClass *string `bun:"integrity_class"`
		N              int     `bun:"n"`
	}
	if err := s.db.NewSelect().
		Model((*domain.StrategyArtifact)(nil)).
		ColumnExpr("artifact_type, integrity_class, count(*) AS n").
		Where("instance_id = ? AND status != ?", instanceID, domain.ArtifactStatusArchived).
		GroupExpr("artifact_type, integrity_class").
		Scan(ctx, &counts); err != nil {
		return fmt.Errorf("count artifacts: %w", err)
	}
	ready := map[string]bool{}
	for _, k := range readyArtifacts {
		ready[k] = true
	}
	for _, c := range counts {
		switch {
		case c.IntegrityClass != nil && IsFrameworkClass(*c.IntegrityClass):
			if out.FrameworkContent == nil {
				out.FrameworkContent = map[string]int{}
			}
			out.FrameworkContent[*c.IntegrityClass] += c.N
		case !ready[c.ArtifactType]:
			if out.OtherArtifacts == nil {
				out.OtherArtifacts = map[string]int{}
			}
			out.OtherArtifacts[c.ArtifactType] += c.N
		}
	}
	return nil
}

// SectionSource says where a section came from.
type SectionSource struct {
	InstanceID   uuid.UUID `json:"instance_id"`
	ArtifactType string    `json:"artifact_type,omitempty"`
	ArtifactKey  string    `json:"artifact_key"`
	Path         string    `json:"path"`
}

// SectionResult is a bounded read of one section with its provenance.
type SectionResult struct {
	strategyread.Slice
	Source SectionSource `json:"source"`
	// CiteAs is a ready-made label for citing the section.
	CiteAs string `json:"cite_as"`
	// Labels maps identifiers in Content to readable names from this instance.
	Labels map[string]string `json:"labels,omitempty"`
	// Available lists the artifacts that can be read, when the one asked for
	// cannot be.
	Available []string       `json:"available,omitempty"`
	Integrity *IntegrityInfo `json:"integrity,omitempty"`
	Hints     []string       `json:"hints,omitempty"`
}

// ReadSection returns the section of an artifact at a path within a size
// budget. The error is only for a malformed path or a failed query; a missing
// artifact or section is a result with Defined false.
func (s *Service) ReadSection(ctx context.Context, instanceID uuid.UUID, artifact, path string, maxChars int) (*SectionResult, error) {
	res := &SectionResult{
		Source: SectionSource{InstanceID: instanceID, ArtifactKey: artifact, Path: strings.TrimSpace(path)},
	}
	res.Path = res.Source.Path
	res.CiteAs = strategyread.CiteAs(artifact, path)

	row, err := s.currentRow(ctx, instanceID, artifact)
	if err != nil {
		return nil, err
	}
	if row == nil {
		res.Reason = fmt.Sprintf("no artifact %q in this instance", artifact)
		res.Available = s.availableReadable(ctx, instanceID)
		res.Hints = []string{"call get_outline to see what this instance defines"}
		return res, nil
	}
	res.Source.ArtifactType = row.ArtifactType
	res.CiteAs = strategyread.CiteAs(row.ArtifactType, path)

	if reason, ok := frameworkReason(row); ok {
		res.Reason = reason
		res.Integrity = &IntegrityInfo{Class: deref(row.IntegrityClass), Ref: deref(row.IntegrityRef)}
		res.Hints = []string{"this is framework content, not something this company wrote; do not present it as their strategy"}
		return res, nil
	}

	payload, err := decodePayload(row)
	if err != nil {
		return nil, err
	}
	slice, err := strategyread.Read(row.ArtifactType, payload, path, maxChars)
	if err != nil {
		return nil, apperror.ErrBadRequest.WithDetail(fmt.Sprintf("invalid path: %v", err))
	}
	res.Slice = slice

	if slice.Content != nil {
		if idx, ierr := s.labelIndex(ctx, instanceID); ierr == nil {
			res.Labels = strategyread.LabelsFor(slice.Content, idx)
		}
	}
	res.Hints = sectionHints(res, artifact)
	return res, nil
}

func sectionHints(res *SectionResult, artifact string) []string {
	var hints []string
	switch {
	case !res.Defined && len(res.Suggestions) > 0:
		hints = append(hints, "that path does not exist; suggestions lists where a section with that name does")
	case !res.Defined && len(res.Children) > 0:
		hints = append(hints, "that path does not exist; children lists the nearest valid sections")
	case res.Truncated && res.NextIndex != nil:
		hints = append(hints, fmt.Sprintf("more items follow; read path %q for the rest", fmt.Sprintf("%s[%d:]", basePathOf(res.Source.Path), *res.NextIndex)))
	case res.Truncated && len(res.Children) > 0:
		hints = append(hints, "the section is over budget; read one of children[].path, or raise max_chars (up to the cap)")
	case res.Truncated:
		hints = append(hints, "the content was cut at max_chars; raise max_chars (up to the cap) to read more")
	}
	return hints
}

func basePathOf(p string) string {
	if i := strings.LastIndex(p, "["); i >= 0 && strings.HasSuffix(p, ":]") {
		return p[:i]
	}
	return p
}

func readWith(artifact, path string) string {
	return fmt.Sprintf("get_section(artifact=%q, path=%q)", artifact, path)
}

func frameworkReason(row *domain.StrategyArtifact) (string, bool) {
	if row.IntegrityClass == nil || !IsFrameworkClass(*row.IntegrityClass) {
		return "", false
	}
	ref := deref(row.IntegrityRef)
	if ref != "" {
		ref = " (" + ref + ")"
	}
	return fmt.Sprintf("%q is unmodified framework content, class %s%s, not defined by this company", row.ArtifactKey, *row.IntegrityClass, ref), true
}

func notDefinedOf(row *domain.StrategyArtifact, reason string) NotDefined {
	return NotDefined{Artifact: row.ArtifactKey, Reason: reason, Ref: deref(row.IntegrityRef)}
}

func (s *Service) currentRow(ctx context.Context, instanceID uuid.UUID, key string) (*domain.StrategyArtifact, error) {
	var a domain.StrategyArtifact
	err := s.db.NewSelect().Model(&a).
		Where("instance_id = ? AND artifact_key = ? AND status != ?", instanceID, key, domain.ArtifactStatusArchived).
		Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get artifact %q: %w", key, err)
	}
	return &a, nil
}

func (s *Service) availableReadable(ctx context.Context, instanceID uuid.UUID) []string {
	var keys []string
	err := s.db.NewSelect().Model((*domain.StrategyArtifact)(nil)).
		Column("artifact_key").
		Where("instance_id = ? AND status != ? AND artifact_type IN (?)", instanceID, domain.ArtifactStatusArchived, bun.List(readyArtifacts)).
		Where("integrity_class IS NULL OR integrity_class NOT IN (?)", bun.List([]string{
			string(integrity.ClassCanonicalReference), string(integrity.ClassUnmodifiedTemplate), string(integrity.ClassPackagedDefault)})).
		Scan(ctx, &keys)
	if err != nil {
		return nil
	}
	sort.Strings(keys)
	return keys
}

// labelIndex builds the identifier-to-name index from the instance's authored
// READY documents.
func (s *Service) labelIndex(ctx context.Context, instanceID uuid.UUID) (map[string]string, error) {
	var rows []*domain.StrategyArtifact
	if err := s.db.NewSelect().Model(&rows).
		Where("instance_id = ? AND status != ? AND artifact_type IN (?)", instanceID, domain.ArtifactStatusArchived, bun.List(readyArtifacts)).
		Scan(ctx); err != nil {
		return nil, fmt.Errorf("load label sources: %w", err)
	}
	var payloads []any
	for _, r := range rows {
		if _, framework := frameworkReason(r); framework {
			continue
		}
		p, err := decodePayload(r)
		if err != nil {
			continue
		}
		payloads = append(payloads, p)
	}
	return strategyread.BuildLabelIndex(payloads...), nil
}

func decodePayload(row *domain.StrategyArtifact) (any, error) {
	var v any
	if err := json.Unmarshal(row.Payload, &v); err != nil {
		return nil, fmt.Errorf("decode payload of %q: %w", row.ArtifactKey, err)
	}
	return v, nil
}

func (s *Service) activeClassifier() *integrity.Classifier {
	if s.classifier != nil {
		return s.classifier
	}
	return embeddedclassifier.Default()
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// ReadAuthoredPayload returns the raw payload of an artifact the company
// authored. For an unmodified template or other framework content it returns a
// structured not-defined result instead, so a template is never read as the
// company's strategy. A missing artifact is an apperror not-found, as before.
func (s *Service) ReadAuthoredPayload(ctx context.Context, instanceID uuid.UUID, key string) (json.RawMessage, *SectionResult, error) {
	row, err := s.currentRow(ctx, instanceID, key)
	if err != nil {
		return nil, nil, err
	}
	if row == nil {
		return nil, nil, apperror.ErrNotFound.WithDetail(fmt.Sprintf("no artifact %q for instance %s", key, instanceID))
	}
	if reason, ok := frameworkReason(row); ok {
		res := &SectionResult{
			Source:    SectionSource{InstanceID: instanceID, ArtifactType: row.ArtifactType, ArtifactKey: key},
			CiteAs:    strategyread.CiteAs(row.ArtifactType, ""),
			Integrity: &IntegrityInfo{Class: deref(row.IntegrityClass), Ref: deref(row.IntegrityRef)},
			Hints:     []string{"this is framework content, not something this company wrote; do not present it as their strategy"},
		}
		res.Reason = reason
		return nil, res, nil
	}
	return json.RawMessage(row.Payload), nil, nil
}

// SectionSize returns the size in characters of a stored section and whether it
// is defined. It is for pointing a search hit at the read that returns it.
func (s *Service) SectionSize(ctx context.Context, instanceID uuid.UUID, artifact, path string) (int, bool) {
	row, err := s.currentRow(ctx, instanceID, artifact)
	if err != nil || row == nil {
		return 0, false
	}
	if _, framework := frameworkReason(row); framework {
		return 0, false
	}
	payload, err := decodePayload(row)
	if err != nil {
		return 0, false
	}
	slice, err := strategyread.Read(row.ArtifactType, payload, path, 1)
	if err != nil || !slice.Defined {
		return 0, false
	}
	return slice.SizeChars, true
}
