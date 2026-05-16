// Package ingest converts committed strategy artifacts into Memory graph objects.
// Ingestion runs asynchronously after a batch is committed — failures do not
// roll back the commit. The PostgreSQL ledger is the source of truth; Memory is
// a derived view.
package ingest

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
)

// Service converts committed strategy artifacts into Memory graph objects.
type Service struct {
	db     *bun.DB
	client *memory.Client

	// Worker pool for async ingestion.
	jobs chan ingestJob
	wg   sync.WaitGroup
}

type ingestJob struct {
	InstanceID uuid.UUID
	BatchID    uuid.UUID
}

// NewService creates an ingestion service. If client is nil, all operations are no-ops.
func NewService(db *bun.DB, client *memory.Client) *Service {
	s := &Service{
		db:     db,
		client: client,
		jobs:   make(chan ingestJob, 100),
	}
	return s
}

// Start launches the ingestion worker pool. Call Stop() on shutdown.
func (s *Service) Start(workers int) {
	if s.client == nil {
		slog.Info("ingest: Memory client not configured, ingestion disabled")
		return
	}
	if workers <= 0 {
		workers = 2
	}
	for range workers {
		s.wg.Add(1)
		go s.worker()
	}
	slog.Info("ingest: started worker pool", "workers", workers)
}

// Stop drains the job queue and waits for workers to finish.
func (s *Service) Stop() {
	close(s.jobs)
	s.wg.Wait()
	slog.Info("ingest: worker pool stopped")
}

// EnqueueBatch enqueues a batch for async ingestion after commit.
// Non-blocking — returns immediately. If the queue is full, the job is dropped
// with a warning (it can be recovered via re-ingest).
func (s *Service) EnqueueBatch(instanceID, batchID uuid.UUID) {
	if s.client == nil {
		return
	}
	select {
	case s.jobs <- ingestJob{InstanceID: instanceID, BatchID: batchID}:
		slog.Debug("ingest: enqueued batch", "instance_id", instanceID, "batch_id", batchID)
	default:
		slog.Warn("ingest: job queue full, batch dropped (recover via re-ingest)",
			"instance_id", instanceID, "batch_id", batchID)
	}
}

// worker processes ingestion jobs from the queue.
func (s *Service) worker() {
	defer s.wg.Done()
	for job := range s.jobs {
		if err := s.ingestBatch(context.Background(), job); err != nil {
			slog.Error("ingest: batch failed", "instance_id", job.InstanceID,
				"batch_id", job.BatchID, "err", err)
			// Retry with exponential backoff.
			s.retryIngest(job)
		}
	}
}

// retryIngest retries a failed ingestion job with exponential backoff.
func (s *Service) retryIngest(job ingestJob) {
	delays := []time.Duration{5 * time.Second, 15 * time.Second, 60 * time.Second}
	for i, delay := range delays {
		time.Sleep(delay)
		slog.Info("ingest: retry attempt", "attempt", i+1, "instance_id", job.InstanceID)
		if err := s.ingestBatch(context.Background(), job); err != nil {
			slog.Warn("ingest: retry failed", "attempt", i+1, "err", err)
			continue
		}
		slog.Info("ingest: retry succeeded", "attempt", i+1, "instance_id", job.InstanceID)
		return
	}
	slog.Error("ingest: all retries exhausted", "instance_id", job.InstanceID,
		"batch_id", job.BatchID)
}

// ingestBatch processes a single committed batch: loads the affected artifacts
// and upserts them into Memory as graph objects.
func (s *Service) ingestBatch(ctx context.Context, job ingestJob) error {
	// Load committed mutations for this batch.
	var mutations []domain.StrategyMutation
	err := s.db.NewSelect().
		Model(&mutations).
		Where("batch_id = ?", job.BatchID).
		Where("status = ?", domain.MutationStatusCommitted).
		Scan(ctx)
	if err != nil {
		return fmt.Errorf("load mutations: %w", err)
	}

	if len(mutations) == 0 {
		return nil
	}

	// For each mutation, upsert the current artifact state as a Memory object.
	for _, m := range mutations {
		if m.Action == domain.MutationActionArchive {
			// Archived artifacts: delete from Memory.
			if err := s.deleteGraphObject(ctx, m.InstanceID, m.ArtifactKey); err != nil {
				slog.Warn("ingest: delete archived object failed",
					"artifact_key", m.ArtifactKey, "err", err)
			}
			continue
		}

		// Load the current artifact state.
		var artifact domain.StrategyArtifact
		err := s.db.NewSelect().
			Model(&artifact).
			Where("instance_id = ?", m.InstanceID).
			Where("artifact_key = ?", m.ArtifactKey).
			Scan(ctx)
		if err != nil {
			slog.Warn("ingest: load artifact failed",
				"artifact_key", m.ArtifactKey, "err", err)
			continue
		}

		if _, err := s.upsertGraphObject(ctx, artifact); err != nil {
			return fmt.Errorf("upsert %s: %w", artifact.ArtifactKey, err)
		}
	}

	// Ingest relationships for affected artifacts.
	artifactKeys := make([]string, 0, len(mutations))
	for _, m := range mutations {
		artifactKeys = append(artifactKeys, m.ArtifactKey)
	}
	if err := s.ingestRelationships(ctx, job.InstanceID, artifactKeys); err != nil {
		slog.Warn("ingest: relationship ingestion failed", "err", err)
	}

	slog.Info("ingest: batch complete",
		"instance_id", job.InstanceID,
		"batch_id", job.BatchID,
		"mutations", len(mutations))

	return nil
}

// upsertGraphObject creates or updates a Memory graph object from a strategy artifact.
// Returns the upserted object (for key index building) or nil on error.
func (s *Service) upsertGraphObject(ctx context.Context, a domain.StrategyArtifact) (*memory.Object, error) {
	// Build properties from the artifact payload.
	props := map[string]any{
		"artifact_type": a.ArtifactType,
		"instance_id":   a.InstanceID.String(),
		"status":        a.Status,
	}

	// Extract name and description from the payload for searchability.
	var payload map[string]any
	if err := json.Unmarshal(a.Payload, &payload); err == nil {
		if name, ok := payload["name"].(string); ok {
			props["name"] = name
		}
		if desc, ok := payload["description"].(string); ok {
			props["description"] = desc
		}
		if title, ok := payload["title"].(string); ok && props["name"] == nil {
			props["name"] = title
		}
		// Include the snippet for search results.
		if snippet := extractSnippet(payload); snippet != "" {
			props["snippet"] = snippet
		}
	}

	if a.Track != nil {
		props["track"] = *a.Track
	}
	if a.Name != nil {
		props["name"] = *a.Name
	}

	obj, err := s.client.UpsertObject(ctx, memory.UpsertObjectRequest{
		Type:       a.ArtifactType,
		Key:        a.ArtifactKey,
		Status:     a.Status,
		Properties: props,
	})
	return obj, err
}

// deleteGraphObject removes a graph object for an archived artifact.
func (s *Service) deleteGraphObject(ctx context.Context, instanceID uuid.UUID, artifactKey string) error {
	obj, err := s.client.GetObjectByKey(ctx, artifactKey)
	if err != nil {
		return fmt.Errorf("lookup %s: %w", artifactKey, err)
	}
	if obj == nil {
		return nil // already gone
	}
	return s.client.DeleteObject(ctx, obj.StableID())
}

// objectKeyIndex caches artifact key → Memory object ID mappings to avoid
// per-relationship API calls. Built once per reingest from all upserted objects.
type objectKeyIndex struct {
	exact  map[string]string // artifact_key -> stable ID (exact match)
	prefix map[string]string // short prefix (e.g. "fd-001") -> stable ID
}

func newObjectKeyIndex() *objectKeyIndex {
	return &objectKeyIndex{
		exact:  make(map[string]string),
		prefix: make(map[string]string),
	}
}

// add registers an artifact key and its Memory object ID.
func (idx *objectKeyIndex) add(artifactKey, objectID string) {
	idx.exact[artifactKey] = objectID

	// For keys like "fd-001_knowledge_graph_engine", also index the short
	// prefix "fd-001" so relationships using short IDs can resolve.
	if i := strings.Index(artifactKey, "_"); i > 0 {
		prefix := artifactKey[:i]
		// Only set if not already claimed by another artifact.
		if _, exists := idx.prefix[prefix]; !exists {
			idx.prefix[prefix] = objectID
		}
	}
}

// resolve looks up a key: exact match first, then prefix match.
func (idx *objectKeyIndex) resolve(key string) string {
	if id, ok := idx.exact[key]; ok {
		return id
	}
	if id, ok := idx.prefix[key]; ok {
		return id
	}
	return ""
}

// resolveObjectID looks up a Memory object by its artifact key using the
// provided index (for batch operations) or an API call (for single lookups).
func (s *Service) resolveObjectID(ctx context.Context, key string) string {
	obj, err := s.client.GetObjectByKey(ctx, key)
	if err != nil {
		slog.Debug("ingest: resolve object failed", "key", key, "err", err)
		return ""
	}
	if obj == nil {
		return ""
	}
	return obj.StableID()
}

// ingestRelationships upserts relationships for the given artifact keys.
func (s *Service) ingestRelationships(ctx context.Context, instanceID uuid.UUID, artifactKeys []string) error {
	var rels []domain.StrategyRelationship
	err := s.db.NewSelect().
		Model(&rels).
		Where("instance_id = ?", instanceID).
		Where("source_key IN (?)", bun.In(artifactKeys)).
		Scan(ctx)
	if err != nil {
		return fmt.Errorf("load relationships: %w", err)
	}

	s.createRelationships(ctx, instanceID, rels)
	return nil
}

// createRelationships resolves object IDs by key (via API) and creates edges in Memory.
// Used by ingestBatch for incremental updates.
func (s *Service) createRelationships(ctx context.Context, instanceID uuid.UUID, rels []domain.StrategyRelationship) {
	created, skipped := 0, 0
	for _, rel := range rels {
		srcID := s.resolveObjectID(ctx, rel.SourceKey)
		if srcID == "" {
			skipped++
			continue
		}
		tgtID := s.resolveObjectID(ctx, rel.TargetKey)
		if tgtID == "" {
			skipped++
			continue
		}

		_, err := s.client.CreateRelationship(ctx, memory.CreateRelationshipRequest{
			Type:   rel.Relationship,
			FromID: srcID,
			ToID:   tgtID,
			Properties: map[string]any{
				"instance_id": instanceID.String(),
			},
		})
		if err != nil {
			slog.Warn("ingest: create relationship failed",
				"type", rel.Relationship,
				"source", rel.SourceKey,
				"target", rel.TargetKey,
				"err", err)
		} else {
			created++
		}
	}
	if len(rels) > 0 {
		slog.Info("ingest: relationships processed", "total", len(rels), "created", created, "skipped", skipped)
	}
}

// createRelationshipsIndexed resolves object IDs using a pre-built local index
// (with prefix matching for short IDs). Used by ReingestInstance for bulk operations.
func (s *Service) createRelationshipsIndexed(ctx context.Context, instanceID uuid.UUID, rels []domain.StrategyRelationship, idx *objectKeyIndex) {
	created, skipped := 0, 0
	for _, rel := range rels {
		srcID := idx.resolve(rel.SourceKey)
		if srcID == "" {
			skipped++
			continue
		}
		tgtID := idx.resolve(rel.TargetKey)
		if tgtID == "" {
			skipped++
			continue
		}

		_, err := s.client.CreateRelationship(ctx, memory.CreateRelationshipRequest{
			Type:   rel.Relationship,
			FromID: srcID,
			ToID:   tgtID,
			Properties: map[string]any{
				"instance_id": instanceID.String(),
			},
		})
		if err != nil {
			slog.Warn("ingest: create relationship failed",
				"type", rel.Relationship,
				"source", rel.SourceKey,
				"target", rel.TargetKey,
				"err", err)
		} else {
			created++
		}
	}
	if len(rels) > 0 {
		slog.Info("ingest: relationships processed", "total", len(rels), "created", created, "skipped", skipped)
	}
}

// ReingestInstance does a full re-ingest of all current artifacts for an instance.
func (s *Service) ReingestInstance(ctx context.Context, instanceID uuid.UUID) error {
	if s.client == nil {
		return fmt.Errorf("ingest: Memory client not configured")
	}

	var artifacts []domain.StrategyArtifact
	err := s.db.NewSelect().
		Model(&artifacts).
		Where("instance_id = ?", instanceID).
		Where("status != ?", domain.ArtifactStatusArchived).
		Scan(ctx)
	if err != nil {
		return fmt.Errorf("load artifacts: %w", err)
	}

	slog.Info("ingest: re-ingesting instance", "instance_id", instanceID, "artifact_count", len(artifacts))

	// Upsert all artifacts and build a key index for relationship resolution.
	idx := newObjectKeyIndex()
	for _, a := range artifacts {
		obj, err := s.upsertGraphObject(ctx, a)
		if err != nil {
			slog.Warn("ingest: re-ingest upsert failed", "artifact_key", a.ArtifactKey, "err", err)
			continue
		}
		if obj != nil {
			idx.add(a.ArtifactKey, obj.StableID())
		}
	}

	// Re-ingest all relationships using the local index for fast resolution.
	var rels []domain.StrategyRelationship
	err = s.db.NewSelect().
		Model(&rels).
		Where("instance_id = ?", instanceID).
		Scan(ctx)
	if err != nil {
		return fmt.Errorf("load relationships: %w", err)
	}

	s.createRelationshipsIndexed(ctx, instanceID, rels, idx)

	slog.Info("ingest: re-ingest complete", "instance_id", instanceID,
		"artifacts", len(artifacts), "relationships", len(rels))

	return nil
}

// extractSnippet builds a short text snippet from common artifact fields.
func extractSnippet(payload map[string]any) string {
	// Try description, then summary, then name.
	for _, key := range []string{"description", "summary", "vision_statement", "name", "title"} {
		if v, ok := payload[key].(string); ok && v != "" {
			if len(v) > 200 {
				return v[:200] + "..."
			}
			return v
		}
	}
	return ""
}
