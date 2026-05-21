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
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/pkg/decompose"
	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
)

// InstanceExporter produces YAML files for a strategy instance.
// Implemented by domain/strategy.Service — passed in to avoid a circular import.
type InstanceExporter interface {
	ExportInstance(ctx context.Context, instanceID uuid.UUID) (*ExportResult, error)
}

// ExportResult is a minimal mirror of strategy.ExportResult so this package
// has no import dependency on domain/strategy.
type ExportResult struct {
	Files []ExportFile
}

// ExportFile is one artifact YAML file.
type ExportFile struct {
	RelPath string
	Content string
}

// syncResult holds counts to write back to the DB after a successful ingest.
type syncResult struct {
	objectCount           int
	edgeCount             int
	decomposedObjectCount int
	decomposedEdgeCount   int
}

// Service converts committed strategy artifacts into Memory graph objects.
type Service struct {
	db       *bun.DB
	client   *memory.Client
	exporter InstanceExporter // optional — enables decomposed layer ingest

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

// SetExporter configures the strategy exporter used for decomposed-layer ingest.
// Must be called before Start(). If not set, decomposed ingest is skipped.
func (s *Service) SetExporter(e InstanceExporter) {
	s.exporter = e
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

// EnqueueAllInstances enqueues a full re-ingest for every non-archived strategy
// instance. Called once at startup so Memory stays current after restarts.
// Runs in a goroutine; logs errors but never returns them.
func (s *Service) EnqueueAllInstances(ctx context.Context, db *bun.DB, log interface {
	Info(msg string, args ...any)
	Warn(msg string, args ...any)
}) {
	if s.client == nil {
		return
	}

	var ids []struct {
		ID uuid.UUID `bun:"id"`
	}
	err := db.NewSelect().
		TableExpr("strategy_instances AS si").
		ColumnExpr("si.id").
		Join("JOIN workspaces AS w ON w.id = si.workspace_id").
		Where("si.status != ?", "archived").
		Where("w.deleted_at IS NULL").
		Where("w.github_owner NOT LIKE ?", "e2e-%").
		Where("w.github_owner NOT LIKE ?", "ripple-%").
		Where("w.github_owner NOT LIKE ?", "aim-ripple-%").
		Scan(ctx, &ids)
	if err != nil {
		log.Warn("ingest: startup sweep: failed to load instances", "err", err)
		return
	}

	log.Info("ingest: startup sweep: queuing re-ingest", "instance_count", len(ids))
	for _, row := range ids {
		// Use a nil batchID to signal a full re-ingest, not a batch update.
		select {
		case s.jobs <- ingestJob{InstanceID: row.ID, BatchID: uuid.Nil}:
		default:
			log.Warn("ingest: startup sweep: queue full, skipping instance", "instance_id", row.ID)
		}
	}
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
		var err error
		if job.BatchID == uuid.Nil {
			// Full re-ingest (startup sweep or manual trigger).
			err = s.ReingestInstance(context.Background(), job.InstanceID)
		} else {
			err = s.ingestBatch(context.Background(), job)
		}
		if err != nil {
			slog.Error("ingest: job failed", "instance_id", job.InstanceID,
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
		var err error
		if job.BatchID == uuid.Nil {
			err = s.ReingestInstance(context.Background(), job.InstanceID)
		} else {
			err = s.ingestBatch(context.Background(), job)
		}
		if err != nil {
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

	// Update sync status and counts in Postgres.
	res := s.countIngested(ctx, job.InstanceID)
	s.updateSyncStatus(ctx, job.InstanceID, res)

	return nil
}

// artifactToSubgraphObject converts a strategy artifact into a SubgraphObject
// for use in CreateSubgraph. The _ref is caller-assigned for cross-linking.
func artifactToSubgraphObject(a domain.StrategyArtifact, ref string) memory.SubgraphObject {
	props := map[string]any{
		"artifact_type": a.ArtifactType,
		"instance_id":   a.InstanceID.String(),
		"status":        a.Status,
	}
	var payload map[string]any
	if err := json.Unmarshal(a.Payload, &payload); err == nil {
		if name, ok := payload["name"].(string); ok {
			props["name"] = name
		}
		if desc, ok := payload["description"].(string); ok {
			props["description"] = desc
		}
		if title, ok := payload["title"].(string); ok {
			if props["name"] == nil {
				props["name"] = title
			}
		}
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
	return memory.SubgraphObject{
		Ref:        ref,
		Type:       a.ArtifactType,
		Key:        a.ArtifactKey,
		Status:     a.Status,
		Labels:     []string{"layer:artifact"},
		Properties: props,
	}
}

// upsertGraphObject creates or updates a Memory graph object from a strategy artifact.
// Returns the upserted object (for key index building) or nil on error.
// Used by ingestBatch (small incremental updates). Full re-ingest uses CreateSubgraph.
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

		// Evidence-specific properties — enable tag/source/status filtering in Memory.
		if a.ArtifactType == "evidence" {
			if ps, ok := payload["processing_status"].(string); ok {
				props["processing_status"] = ps
			}
			if collectedAt, ok := payload["collected_at"].(string); ok {
				props["collected_at"] = collectedAt
			}
			if src, ok := payload["source"].(map[string]any); ok {
				if srcName, ok := src["name"].(string); ok {
					props["source_name"] = srcName
					if props["name"] == nil {
						props["name"] = srcName
					}
				}
				if srcType, ok := src["type"].(string); ok {
					props["source_type"] = srcType
				}
			}
			if tags, ok := payload["tags"].([]any); ok {
				tagStrs := make([]string, 0, len(tags))
				for _, t := range tags {
					if s, ok := t.(string); ok {
						tagStrs = append(tagStrs, s)
					}
				}
				if len(tagStrs) > 0 {
					props["tags"] = tagStrs
				}
			}
			if summary, ok := payload["summary"].(string); ok && summary != "" {
				props["snippet"] = summary // use summary as snippet for semantic search
			}
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
		Labels:     []string{"layer:artifact"},
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
		Where("source_key IN (?)", bun.List(artifactKeys)).
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
// It uses CreateSubgraph for bulk ingestion — one API call per 500-object batch
// instead of N individual UpsertObject calls.
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

	// Build the subgraph objects and an artifact_key → _ref index.
	subgraphObjs := make([]memory.SubgraphObject, 0, len(artifacts))
	refByKey := make(map[string]string, len(artifacts)) // artifact_key -> _ref
	for i, a := range artifacts {
		ref := fmt.Sprintf("art-%d", i)
		refByKey[a.ArtifactKey] = ref
		// Also index the short prefix (e.g. "fd-001") for relationship resolution.
		if idx := strings.Index(a.ArtifactKey, "_"); idx > 0 {
			prefix := a.ArtifactKey[:idx]
			if _, exists := refByKey[prefix]; !exists {
				refByKey[prefix] = ref
			}
		}
		subgraphObjs = append(subgraphObjs, artifactToSubgraphObject(a, ref))
	}

	// Load all relationships to include in the subgraph.
	var rels []domain.StrategyRelationship
	err = s.db.NewSelect().
		Model(&rels).
		Where("instance_id = ?", instanceID).
		Scan(ctx)
	if err != nil {
		return fmt.Errorf("load relationships: %w", err)
	}

	// Build subgraph relationship list — only include edges where both sides are known refs.
	subgraphRels := make([]memory.SubgraphRelationship, 0, len(rels))
	for _, rel := range rels {
		srcRef := refByKey[rel.SourceKey]
		dstRef := refByKey[rel.TargetKey]
		if srcRef == "" || dstRef == "" {
			continue // one side not in this batch — skip
		}
		subgraphRels = append(subgraphRels, memory.SubgraphRelationship{
			Type:    rel.Relationship,
			FromRef: srcRef,
			ToRef:   dstRef,
			Properties: map[string]any{
				"instance_id": instanceID.String(),
			},
		})
	}

	// CreateSubgraph in batches of 500 objects (API limit).
	idx := newObjectKeyIndex()
	objBatchSize := 500
	for batchStart := 0; batchStart < len(subgraphObjs); batchStart += objBatchSize {
		end := batchStart + objBatchSize
		if end > len(subgraphObjs) {
			end = len(subgraphObjs)
		}
		batchObjs := subgraphObjs[batchStart:end]

		// Include only relationships where both refs are in this object batch.
		batchRefSet := make(map[string]bool, len(batchObjs))
		for _, o := range batchObjs {
			batchRefSet[o.Ref] = true
		}
		batchRels := make([]memory.SubgraphRelationship, 0)
		for _, r := range subgraphRels {
			if batchRefSet[r.FromRef] && batchRefSet[r.ToRef] {
				batchRels = append(batchRels, r)
			}
		}

		result, err := s.client.CreateSubgraph(ctx, memory.SubgraphRequest{
			Objects:       batchObjs,
			Relationships: batchRels,
		})
		if err != nil {
			slog.Warn("ingest: CreateSubgraph batch failed, falling back to per-object upsert",
				"instance_id", instanceID, "batch_start", batchStart, "err", err)
			// Fallback: upsert objects individually for this batch.
			for artIdx := batchStart; artIdx < batchStart+len(batchObjs) && artIdx < len(artifacts); artIdx++ {
				obj, uErr := s.upsertGraphObject(ctx, artifacts[artIdx])
				if uErr != nil {
					slog.Warn("ingest: fallback upsert failed", "artifact_key", artifacts[artIdx].ArtifactKey, "err", uErr)
					continue
				}
				if obj != nil {
					idx.add(artifacts[artIdx].ArtifactKey, obj.StableID())
				}
			}
			continue
		}

		// Index the returned object IDs by their _ref to build the key index.
		for _, obj := range result.Objects {
			// result.Objects are in the same order as request.Objects.
			// Use RefMap if available (API returns ref → ID mapping).
			if result.RefMap != nil {
				continue // handled below
			}
			if obj.Key != "" {
				idx.add(obj.Key, obj.StableID())
			}
		}
		// If the API returns a ref_map, use that for more reliable mapping.
		if result.RefMap != nil {
			// RefMap: _ref → object stable ID
			for ref, objID := range result.RefMap {
				// Find the artifact key for this ref.
				for key, r := range refByKey {
					if r == ref {
						idx.add(key, objID)
						break
					}
				}
			}
		}
	}

	// Any relationships where one or both sides weren't in an object batch
	// (e.g. cross-batch edges) — create them now using the index.
	crossBatchRels := make([]domain.StrategyRelationship, 0)
	for _, rel := range rels {
		srcRef := refByKey[rel.SourceKey]
		dstRef := refByKey[rel.TargetKey]
		if srcRef == "" || dstRef == "" {
			crossBatchRels = append(crossBatchRels, rel)
		}
	}
	if len(crossBatchRels) > 0 {
		s.createRelationshipsIndexed(ctx, instanceID, crossBatchRels, idx)
	}

	slog.Info("ingest: re-ingest complete", "instance_id", instanceID,
		"artifacts", len(artifacts), "relationships", len(rels))

	// Ingest the decomposed layer if an exporter is configured.
	res := s.countIngested(ctx, instanceID)
	if s.exporter != nil {
		dObjs, dEdges, dErr := s.ReingestInstanceDecomposed(ctx, instanceID)
		if dErr != nil {
			slog.Warn("ingest: decomposed layer failed (non-fatal)", "instance_id", instanceID, "err", dErr)
		} else {
			res.decomposedObjectCount = dObjs
			res.decomposedEdgeCount = dEdges
		}
	}

	// Update sync status and counts in Postgres.
	s.updateSyncStatus(ctx, instanceID, res)

	return nil
}

// updateSyncStatus writes sync metadata back to strategy_instances after a
// successful ingest. Called at the end of ingestBatch and ReingestInstance.
func (s *Service) updateSyncStatus(ctx context.Context, instanceID uuid.UUID, res syncResult) {
	now := time.Now()
	synced := "synced"
	_, err := s.db.NewUpdate().
		TableExpr("strategy_instances").
		Set("memory_sync_status = ?", synced).
		Set("memory_last_synced_at = ?", now).
		Set("memory_object_count = ?", res.objectCount).
		Set("memory_edge_count = ?", res.edgeCount).
		Set("memory_decomposed_object_count = ?", res.decomposedObjectCount).
		Set("memory_decomposed_edge_count = ?", res.decomposedEdgeCount).
		Set("updated_at = ?", now).
		Where("id = ?", instanceID).
		Exec(ctx)
	if err != nil {
		slog.Warn("ingest: failed to update sync status", "instance_id", instanceID, "err", err)
	}
}

// countIngested returns the current object and edge counts in Memory for an
// instance by counting artifacts in the DB (objects written = non-archived
// artifacts) and relationships (edges written). This avoids a per-instance
// Memory API call and is accurate immediately after a successful ingest.
func (s *Service) countIngested(ctx context.Context, instanceID uuid.UUID) syncResult {
	objCount, err := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		Where("instance_id = ?", instanceID).
		Where("status != ?", domain.ArtifactStatusArchived).
		Count(ctx)
	if err != nil {
		slog.Warn("ingest: count artifacts failed", "instance_id", instanceID, "err", err)
	}
	edgeCount, err := s.db.NewSelect().
		TableExpr("strategy_relationships").
		Where("instance_id = ?", instanceID).
		Count(ctx)
	if err != nil {
		slog.Warn("ingest: count relationships failed", "instance_id", instanceID, "err", err)
	}
	return syncResult{objectCount: int(objCount), edgeCount: int(edgeCount)}
}

// ReingestInstanceDecomposed exports instance artifacts to YAML, runs the
// decomposer, and upserts the resulting sub-entity objects and relationships
// into Memory under the "layer:decomposed" label.
// Returns (objectCount, edgeCount, error).
func (s *Service) ReingestInstanceDecomposed(ctx context.Context, instanceID uuid.UUID) (int, int, error) {
	if s.client == nil {
		return 0, 0, fmt.Errorf("ingest: Memory client not configured")
	}
	if s.exporter == nil {
		return 0, 0, fmt.Errorf("ingest: no exporter configured for decomposed layer")
	}

	// Export all artifacts to a temporary directory.
	export, err := s.exporter.ExportInstance(ctx, instanceID)
	if err != nil {
		return 0, 0, fmt.Errorf("export instance for decompose: %w", err)
	}

	tmpDir, err := os.MkdirTemp("", "ingest-decompose-*")
	if err != nil {
		return 0, 0, fmt.Errorf("create temp dir: %w", err)
	}
	defer func() {
		if rmErr := os.RemoveAll(tmpDir); rmErr != nil {
			slog.Warn("ingest: failed to remove temp dir", "dir", tmpDir, "err", rmErr)
		}
	}()

	// Write each artifact YAML to the expected EPF directory layout.
	for _, f := range export.Files {
		dest := filepath.Join(tmpDir, f.RelPath)
		if mkErr := os.MkdirAll(filepath.Dir(dest), 0o750); mkErr != nil {
			return 0, 0, fmt.Errorf("mkdir for %s: %w", f.RelPath, mkErr)
		}
		if writeErr := os.WriteFile(dest, []byte(f.Content), 0o600); writeErr != nil {
			return 0, 0, fmt.Errorf("write %s: %w", f.RelPath, writeErr)
		}
	}

	// Run the decomposer.
	d := decompose.New(tmpDir)
	result, err := d.DecomposeInstance()
	if err != nil {
		return 0, 0, fmt.Errorf("decompose instance: %w", err)
	}
	for _, w := range result.Warnings {
		slog.Debug("ingest: decompose warning", "instance_id", instanceID, "msg", w)
	}

	slog.Info("ingest: decompose complete",
		"instance_id", instanceID,
		"objects", len(result.Objects),
		"relationships", len(result.Relationships))

	// Build SubgraphObjects for all decomposed objects.
	subObjs := make([]memory.SubgraphObject, 0, len(result.Objects))
	refByDecompKey := make(map[string]string, len(result.Objects))
	for i, obj := range result.Objects {
		ref := fmt.Sprintf("d-%d", i)
		refByDecompKey[obj.Key] = ref

		labels := append(obj.Labels, "layer:decomposed") //nolint:gocritic
		props := obj.Properties
		if props == nil {
			props = make(map[string]any)
		}
		props["instance_id"] = instanceID.String()

		subObjs = append(subObjs, memory.SubgraphObject{
			Ref:        ref,
			Type:       obj.Type,
			Key:        obj.Key,
			Status:     obj.Status,
			Labels:     labels,
			Properties: props,
		})
	}

	// Build SubgraphRelationships.
	subRels := make([]memory.SubgraphRelationship, 0, len(result.Relationships))
	relSkipped := 0
	for _, rel := range result.Relationships {
		fromRef, ok1 := refByDecompKey[rel.FromKey]
		toRef, ok2 := refByDecompKey[rel.ToKey]
		if !ok1 || !ok2 {
			relSkipped++
			continue
		}
		props := rel.Properties
		if props == nil {
			props = map[string]any{}
		}
		props["instance_id"] = instanceID.String()
		subRels = append(subRels, memory.SubgraphRelationship{
			Type:       rel.Type,
			FromRef:    fromRef,
			ToRef:      toRef,
			Properties: props,
		})
	}

	// CreateSubgraph in batches of 500.
	const batchSize = 500
	upserted, relCreated := 0, 0
	keyToID := make(map[string]string, len(result.Objects))

	for bStart := 0; bStart < len(subObjs); bStart += batchSize {
		end := bStart + batchSize
		if end > len(subObjs) {
			end = len(subObjs)
		}
		bObjs := subObjs[bStart:end]

		bRefSet := make(map[string]bool, len(bObjs))
		for _, o := range bObjs {
			bRefSet[o.Ref] = true
		}
		bRels := make([]memory.SubgraphRelationship, 0)
		for _, r := range subRels {
			if bRefSet[r.FromRef] && bRefSet[r.ToRef] {
				bRels = append(bRels, r)
			}
		}

		bResult, bErr := s.client.CreateSubgraph(ctx, memory.SubgraphRequest{
			Objects:       bObjs,
			Relationships: bRels,
		})
		if bErr != nil {
			slog.Warn("ingest: decompose CreateSubgraph batch failed, falling back to per-object upsert",
				"instance_id", instanceID, "batch_start", bStart, "err", bErr)
			// Fallback: upsert individually.
			for _, o := range bObjs {
				created, uErr := s.client.UpsertObject(ctx, memory.UpsertObjectRequest{
					Type:       o.Type,
					Key:        o.Key,
					Status:     o.Status,
					Labels:     o.Labels,
					Properties: o.Properties,
				})
				if uErr != nil {
					slog.Debug("ingest: decompose fallback upsert failed", "key", o.Key, "err", uErr)
					continue
				}
				keyToID[o.Key] = created.StableID()
				upserted++
			}
			continue
		}

		// Index returned objects by key.
		for _, obj := range bResult.Objects {
			if obj.Key != "" {
				keyToID[obj.Key] = obj.StableID()
			}
		}
		if bResult.RefMap != nil {
			for ref, objID := range bResult.RefMap {
				for key, r := range refByDecompKey {
					if r == ref {
						keyToID[key] = objID
						break
					}
				}
			}
		}
		upserted += len(bResult.Objects)
		relCreated += len(bResult.Relationships)
	}

	slog.Info("ingest: decompose objects upserted via CreateSubgraph",
		"instance_id", instanceID, "upserted", upserted, "rel_created", relCreated, "rel_skipped", relSkipped)

	return upserted, relCreated, nil
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
