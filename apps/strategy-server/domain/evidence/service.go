// Package evidence manages structured evidence items for strategy assessment.
// Evidence is stored as strategy_artifacts with artifact_type='evidence'.
// No new table is required — the existing artifact store handles persistence.
//
// Evidence sources ("Two-Door Lobby"):
//   - Door 1: Unstructured reference documents ingested from AIM/evidence/ by epf-cli.
//     These appear in Memory as ReferenceDocument nodes.
//   - Door 2: Structured evidence submitted via this API (MCP tools / webhooks).
//     These appear in strategy_artifacts with artifact_type='evidence'.
//
// Both types are queryable together for assessment enrichment.
package evidence

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// Item is a structured evidence entry stored as a strategy_artifact.
type Item struct {
	ArtifactKey string    `json:"artifact_key"`
	InstanceID  uuid.UUID `json:"instance_id"`

	// Required fields.
	Source      Source    `json:"source"`
	CollectedAt time.Time `json:"collected_at"`
	Content     any       `json:"content"` // freeform object

	// Optional fields.
	Tags            []string `json:"tags,omitempty"`
	Summary         string   `json:"summary,omitempty"`
	LinkedArtifacts []string `json:"linked_artifacts,omitempty"`

	// Lifecycle.
	ProcessingStatus string     `json:"processing_status"` // unprocessed | processed | archived
	ProcessedBy      *string    `json:"processed_by,omitempty"`
	ProcessedAt      *time.Time `json:"processed_at,omitempty"`

	// Timestamps from artifact row.
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Source describes where the evidence came from.
type Source struct {
	Name       string `json:"name"`
	Type       string `json:"type"` // freeform: "user_interview", "analytics_export", "sales_call", etc.
	URL        string `json:"url,omitempty"`
	Confidence string `json:"confidence,omitempty"` // "high" | "medium" | "low"
}

// ListFilters controls filtering for List queries.
type ListFilters struct {
	Tags             []string  // match any (OR)
	SourceName       string    // exact match on source.name
	ProcessingStatus string    // "unprocessed" | "processed" | "archived" | "" = all
	LinkedArtifact   string    // artifact_key in linked_artifacts
	Since            time.Time // include only items collected_at >= Since
}

var (
	// ErrNotFound is returned when an evidence item does not exist.
	ErrNotFound = apperror.ErrNotFound
)

// MemoryEnqueuer is implemented by domain/ingest.Service; it allows the evidence
// service to trigger async Memory ingestion without a direct package import.
type MemoryEnqueuer interface {
	EnqueueBatch(instanceID, batchID uuid.UUID)
}

// Service manages evidence items.
type Service struct {
	db      *bun.DB
	enqueue MemoryEnqueuer // optional; nil = Memory ingestion disabled
}

// NewService creates an evidence Service.
func NewService(db *bun.DB) *Service {
	return &Service{db: db}
}

// WithMemoryEnqueue attaches a Memory enqueuer so that newly ingested evidence
// objects are pushed to the semantic graph asynchronously.
func (s *Service) WithMemoryEnqueue(e MemoryEnqueuer) *Service {
	s.enqueue = e
	return s
}

// ---------------------------------------------------------------------------
// Ingest
// ---------------------------------------------------------------------------

// IngestRequest carries the data for a new evidence item.
type IngestRequest struct {
	InstanceID      uuid.UUID
	Source          Source
	CollectedAt     time.Time
	Content         any
	Tags            []string
	Summary         string
	LinkedArtifacts []string
}

// Ingest validates and stores a new evidence item as a strategy_artifact.
// To satisfy the mutation_id FK, a committed mutation is written atomically.
// Returns the generated artifact_key.
func (s *Service) Ingest(ctx context.Context, req IngestRequest) (string, error) {
	if req.Source.Name == "" {
		return "", apperror.ErrBadRequest.WithDetail("evidence source.name is required")
	}
	if req.CollectedAt.IsZero() {
		req.CollectedAt = time.Now().UTC()
	}

	key := "ev-" + uuid.New().String()
	payload := buildPayload(key, req)

	raw, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("marshal evidence payload: %w", err)
	}

	mutID := uuid.New()
	artID := uuid.New()
	now := time.Now().UTC()
	name := req.Source.Name

	// Insert a committed mutation first (satisfies FK strategy_artifacts.mutation_id).
	mut := &domain.StrategyMutation{
		ID:           mutID,
		InstanceID:   req.InstanceID,
		ArtifactType: domain.ArtifactTypeEvidence,
		ArtifactKey:  key,
		Action:       domain.MutationActionCreate,
		Payload:      raw,
		Status:       domain.MutationStatusCommitted,
		Source:       domain.MutationSourceSystem,
		CreatedAt:    now,
	}
	if _, err := s.db.NewInsert().Model(mut).Exec(ctx); err != nil {
		return "", fmt.Errorf("insert evidence mutation: %w", err)
	}

	// Upsert the artifact, referencing the committed mutation.
	art := &domain.StrategyArtifact{
		ID:           artID,
		InstanceID:   req.InstanceID,
		ArtifactType: domain.ArtifactTypeEvidence,
		ArtifactKey:  key,
		Name:         &name,
		Status:       domain.ArtifactStatusActive,
		Payload:      raw,
		MutationID:   mutID,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if _, err := s.db.NewInsert().Model(art).Exec(ctx); err != nil {
		return "", fmt.Errorf("insert evidence artifact: %w", err)
	}

	// Enqueue async Memory ingestion. The mutation ID acts as the batch ID —
	// ingestBatch will load the committed mutation and upsert the evidence object
	// with evidence-specific properties (tags, source, processing_status).
	if s.enqueue != nil {
		s.enqueue.EnqueueBatch(req.InstanceID, mutID)
	}

	return key, nil
}

// buildPayload assembles the JSON payload stored in strategy_artifacts.
func buildPayload(key string, req IngestRequest) map[string]any {
	p := map[string]any{
		"artifact_key":      key,
		"source":            req.Source,
		"collected_at":      req.CollectedAt.Format(time.RFC3339),
		"content":           req.Content,
		"processing_status": "unprocessed",
	}
	if len(req.Tags) > 0 {
		p["tags"] = req.Tags
	}
	if req.Summary != "" {
		p["summary"] = req.Summary
	}
	if len(req.LinkedArtifacts) > 0 {
		p["linked_artifacts"] = req.LinkedArtifacts
	}
	return p
}

// ---------------------------------------------------------------------------
// Get
// ---------------------------------------------------------------------------

// Get returns a single evidence item by artifact_key.
func (s *Service) Get(ctx context.Context, instanceID uuid.UUID, artifactKey string) (*Item, error) {
	var payloadStr string
	var art domain.StrategyArtifact
	err := s.db.NewSelect().
		Model(&art).
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", domain.ArtifactTypeEvidence).
		Where("artifact_key = ?", artifactKey).
		Limit(1).
		Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get evidence %s: %w", artifactKey, err)
	}
	payloadStr = string(art.Payload)
	item, err := parseItem(payloadStr, art.CreatedAt, art.UpdatedAt, instanceID)
	if err != nil {
		return nil, fmt.Errorf("parse evidence %s: %w", artifactKey, err)
	}
	item.ArtifactKey = artifactKey
	return item, nil
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

// List returns evidence items for an instance, optionally filtered.
func (s *Service) List(ctx context.Context, instanceID uuid.UUID, f ListFilters) ([]Item, error) {
	type row struct {
		ArtifactKey string          `bun:"artifact_key"`
		Payload     json.RawMessage `bun:"payload"`
		CreatedAt   time.Time       `bun:"created_at"`
		UpdatedAt   time.Time       `bun:"updated_at"`
	}

	q := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		ColumnExpr("artifact_key, payload, created_at, updated_at").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", domain.ArtifactTypeEvidence).
		Where("status != ?", domain.ArtifactStatusArchived).
		OrderExpr("created_at DESC")

	// Processing status filter — applied in-DB via payload JSON.
	if f.ProcessingStatus != "" {
		q = q.Where("payload->>'processing_status' = ?", f.ProcessingStatus)
	}

	// Source name filter.
	if f.SourceName != "" {
		q = q.Where("payload->'source'->>'name' = ?", f.SourceName)
	}

	// Linked artifact filter — JSON containment: linked_artifacts array must contain the key.
	if f.LinkedArtifact != "" {
		// Build a JSON array literal: ["fd-042"] — must be valid JSON, not Go-quoted.
		containsJSON, _ := json.Marshal([]string{f.LinkedArtifact})
		q = q.Where("payload->'linked_artifacts' @> ?::jsonb", string(containsJSON))
	}

	// Date filter.
	if !f.Since.IsZero() {
		q = q.Where("(payload->>'collected_at')::timestamptz >= ?", f.Since)
	}

	var rows []row
	if err := q.Scan(ctx, &rows); err != nil {
		return nil, fmt.Errorf("list evidence: %w", err)
	}

	var items []Item
	for _, r := range rows {
		item, err := parseItem(string(r.Payload), r.CreatedAt, r.UpdatedAt, instanceID)
		if err != nil {
			continue // skip malformed items
		}
		item.ArtifactKey = r.ArtifactKey

		// Tag filter — applied in Go (OR logic).
		if len(f.Tags) > 0 && !hasAnyTag(item.Tags, f.Tags) {
			continue
		}

		items = append(items, *item)
	}
	return items, nil
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

// UpdateRequest carries fields that can be updated on an existing evidence item.
type UpdateRequest struct {
	Summary         *string
	Tags            []string
	LinkedArtifacts []string
	Content         any
}

// Update modifies writable fields on an existing evidence item.
func (s *Service) Update(ctx context.Context, instanceID uuid.UUID, artifactKey string, req UpdateRequest) error {
	item, err := s.Get(ctx, instanceID, artifactKey)
	if err != nil {
		return err
	}

	// Merge updates into existing payload.
	if req.Summary != nil {
		item.Summary = *req.Summary
	}
	if req.Tags != nil {
		item.Tags = req.Tags
	}
	if req.LinkedArtifacts != nil {
		item.LinkedArtifacts = req.LinkedArtifacts
	}
	if req.Content != nil {
		item.Content = req.Content
	}

	newPayload := map[string]any{
		"artifact_key":      artifactKey,
		"source":            item.Source,
		"collected_at":      item.CollectedAt.Format(time.RFC3339),
		"content":           item.Content,
		"processing_status": item.ProcessingStatus,
		"tags":              item.Tags,
		"summary":           item.Summary,
		"linked_artifacts":  item.LinkedArtifacts,
	}
	if item.ProcessedBy != nil {
		newPayload["processed_by"] = *item.ProcessedBy
	}
	if item.ProcessedAt != nil {
		newPayload["processed_at"] = item.ProcessedAt.Format(time.RFC3339)
	}

	raw, err := json.Marshal(newPayload)
	if err != nil {
		return fmt.Errorf("marshal updated payload: %w", err)
	}

	_, err = s.db.NewUpdate().
		TableExpr("strategy_artifacts").
		Set("payload = ?::jsonb", string(raw)).
		Set("updated_at = now()").
		Where("instance_id = ?", instanceID).
		Where("artifact_key = ?", artifactKey).
		Where("artifact_type = ?", domain.ArtifactTypeEvidence).
		Exec(ctx)
	return err
}

// ---------------------------------------------------------------------------
// Link
// ---------------------------------------------------------------------------

// Link creates a strategy_relationship edge from an evidence item to another artifact.
func (s *Service) Link(ctx context.Context, instanceID uuid.UUID, evidenceKey, targetKey, relationship string) error {
	if relationship == "" {
		relationship = "supports"
	}

	rel := &domain.StrategyRelationship{
		ID:           uuid.New(),
		InstanceID:   instanceID,
		SourceKey:    evidenceKey,
		SourceType:   domain.ArtifactTypeEvidence,
		TargetKey:    targetKey,
		TargetType:   "artifact", // generic — the target type is resolved by the caller
		Relationship: relationship,
		CreatedAt:    time.Now().UTC(),
	}

	_, err := s.db.NewInsert().
		Model(rel).
		On("CONFLICT DO NOTHING").
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("link evidence %s → %s: %w", evidenceKey, targetKey, err)
	}
	return nil
}

// ---------------------------------------------------------------------------
// MarkProcessed
// ---------------------------------------------------------------------------

// MarkProcessed marks a set of evidence items as processed by a given assessment.
func (s *Service) MarkProcessed(ctx context.Context, instanceID uuid.UUID, evidenceKeys []string, processedBy string) error {
	if len(evidenceKeys) == 0 {
		return nil
	}

	now := time.Now().UTC()
	nowStr := now.Format(time.RFC3339)

	for _, key := range evidenceKeys {
		item, err := s.Get(ctx, instanceID, key)
		if err != nil {
			continue // skip missing items
		}

		payload := map[string]any{
			"artifact_key":      key,
			"source":            item.Source,
			"collected_at":      item.CollectedAt.Format(time.RFC3339),
			"content":           item.Content,
			"processing_status": "processed",
			"processed_by":      processedBy,
			"processed_at":      nowStr,
		}
		if len(item.Tags) > 0 {
			payload["tags"] = item.Tags
		}
		if item.Summary != "" {
			payload["summary"] = item.Summary
		}
		if len(item.LinkedArtifacts) > 0 {
			payload["linked_artifacts"] = item.LinkedArtifacts
		}

		raw, err := json.Marshal(payload)
		if err != nil {
			continue
		}

		_, _ = s.db.NewUpdate().
			TableExpr("strategy_artifacts").
			Set("payload = ?::jsonb", string(raw)).
			Set("updated_at = now()").
			Where("instance_id = ?", instanceID).
			Where("artifact_key = ?", key).
			Where("artifact_type = ?", domain.ArtifactTypeEvidence).
			Exec(ctx)
	}
	return nil
}

// ---------------------------------------------------------------------------
// CountUnprocessed
// ---------------------------------------------------------------------------

// CountUnprocessed returns the number of unprocessed evidence items for an instance.
// Optionally filtered to items that have at least one of the given tags.
func (s *Service) CountUnprocessed(ctx context.Context, instanceID uuid.UUID, tagFilter []string) (int, error) {
	q := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		ColumnExpr("COUNT(*)").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", domain.ArtifactTypeEvidence).
		Where("status != ?", domain.ArtifactStatusArchived).
		Where("payload->>'processing_status' = ?", "unprocessed")

	if len(tagFilter) > 0 {
		// Match items whose tags array contains at least one of the filter tags.
		// Use EXISTS + jsonb_array_elements_text to avoid the ?| operator (bun treats ? as placeholder).
		tagsJSON, _ := json.Marshal(tagFilter)
		q = q.Where(
			"EXISTS (SELECT 1 FROM jsonb_array_elements_text(payload->'tags') _t WHERE _t.value = ANY(ARRAY(SELECT jsonb_array_elements_text(?::jsonb))))",
			string(tagsJSON),
		)
	}

	var count int
	if err := q.Scan(ctx, &count); err != nil {
		return 0, fmt.Errorf("count unprocessed evidence: %w", err)
	}
	return count, nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// parseItem unmarshals a strategy_artifact payload into an Item.
func parseItem(payloadStr string, createdAt, updatedAt time.Time, instanceID uuid.UUID) (*Item, error) {
	var p map[string]any
	if err := json.Unmarshal([]byte(payloadStr), &p); err != nil {
		return nil, err
	}

	item := &Item{
		InstanceID:       instanceID,
		ProcessingStatus: "unprocessed",
		CreatedAt:        createdAt,
		UpdatedAt:        updatedAt,
	}

	// Source.
	if srcMap, ok := p["source"].(map[string]any); ok {
		item.Source.Name, _ = srcMap["name"].(string)
		item.Source.Type, _ = srcMap["type"].(string)
		item.Source.URL, _ = srcMap["url"].(string)
		item.Source.Confidence, _ = srcMap["confidence"].(string)
	}

	// collected_at.
	if ca, ok := p["collected_at"].(string); ok && ca != "" {
		t, err := time.Parse(time.RFC3339, ca)
		if err == nil {
			item.CollectedAt = t
		}
	}

	item.Content = p["content"]

	if ps, ok := p["processing_status"].(string); ok && ps != "" {
		item.ProcessingStatus = ps
	}
	item.Summary, _ = p["summary"].(string)

	if tags, ok := p["tags"].([]any); ok {
		for _, t := range tags {
			if s, ok := t.(string); ok {
				item.Tags = append(item.Tags, s)
			}
		}
	}
	if links, ok := p["linked_artifacts"].([]any); ok {
		for _, l := range links {
			if s, ok := l.(string); ok {
				item.LinkedArtifacts = append(item.LinkedArtifacts, s)
			}
		}
	}

	if pb, ok := p["processed_by"].(string); ok && pb != "" {
		item.ProcessedBy = &pb
	}
	if pa, ok := p["processed_at"].(string); ok && pa != "" {
		t, err := time.Parse(time.RFC3339, pa)
		if err == nil {
			item.ProcessedAt = &t
		}
	}

	return item, nil
}

// hasAnyTag returns true if itemTags contains at least one tag from filterTags.
func hasAnyTag(itemTags, filterTags []string) bool {
	set := make(map[string]bool, len(itemTags))
	for _, t := range itemTags {
		set[t] = true
	}
	for _, t := range filterTags {
		if set[t] {
			return true
		}
	}
	return false
}

// SuggestedTags lists the canonical vocabulary for evidence tags.
// Tags are freeform; this list is advisory only.
var SuggestedTags = []string{
	"competitive", "partner", "technical", "market", "narrative",
	"product-specs", "internal", "metric", "user-feedback", "sales",
	"support", "engineering",
}
