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

	// Upsert all decomposed objects and build key→ID index.
	keyToID := make(map[string]string, len(result.Objects))
	upserted, upsertFailed := 0, 0
	for _, obj := range result.Objects {
		labels := append(obj.Labels, "layer:decomposed") //nolint:gocritic
		// Inject instance_id into properties for traceability.
		props := obj.Properties
		if props == nil {
			props = make(map[string]any)
		}
		props["instance_id"] = instanceID.String()

		created, upsertErr := s.client.UpsertObject(ctx, memory.UpsertObjectRequest{
			Type:       obj.Type,
			Key:        obj.Key,
			Status:     obj.Status,
			Labels:     labels,
			Properties: props,
		})
		if upsertErr != nil {
			slog.Debug("ingest: decompose upsert failed", "key", obj.Key, "err", upsertErr)
			upsertFailed++
			continue
		}
		keyToID[obj.Key] = created.StableID()
		upserted++
	}
	slog.Info("ingest: decompose objects upserted",
		"instance_id", instanceID, "upserted", upserted, "failed", upsertFailed)

	// Create relationships using the key index.
	relCreated, relSkipped := 0, 0
	for _, rel := range result.Relationships {
		fromID, ok1 := keyToID[rel.FromKey]
		toID, ok2 := keyToID[rel.ToKey]
		if !ok1 || !ok2 {
			relSkipped++
			continue
		}

		props := rel.Properties
		if props == nil {
			props = map[string]any{}
		}
		props["instance_id"] = instanceID.String()

		_, relErr := s.client.CreateRelationship(ctx, memory.CreateRelationshipRequest{
			Type:   rel.Type,
			FromID: fromID,
			ToID:   toID,
			Properties: props,
		})
		if relErr != nil {
			slog.Debug("ingest: decompose relationship failed",
				"type", rel.Type, "from", rel.FromKey, "to", rel.ToKey, "err", relErr)
			continue
		}
		relCreated++
	}
	slog.Info("ingest: decompose relationships created",
		"instance_id", instanceID, "created", relCreated, "skipped", relSkipped)

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
