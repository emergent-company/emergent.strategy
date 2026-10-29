// Package ingest projects committed strategy artifacts into the Memory graph.
//
// PostgreSQL is the source of truth; the graph is derived from it. Writers mark
// an instance dirty (internal/changemark) and notify this service, which runs
// at most one ingest per instance at a time and collapses bursts of changes.
// Ingests are serialised across processes with a Postgres advisory lock. A lost
// notification is recovered through the durable dirty flag.
package ingest

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/decompose"
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

// Service projects strategy artifacts into the Memory graph.
type Service struct {
	db       *bun.DB
	client   *memory.Client
	exporter InstanceExporter // optional — enables decomposed layer ingest

	co *coalescer
}

// NewService creates an ingestion service. If client is nil, all operations are no-ops.
func NewService(db *bun.DB, client *memory.Client) *Service {
	return &Service{db: db, client: client}
}

// SetExporter configures the strategy exporter used for decomposed-layer ingest.
// Must be called before Start(). If not set, decomposed ingest is skipped.
func (s *Service) SetExporter(e InstanceExporter) {
	s.exporter = e
}

// Start launches the ingestion workers. Call Stop() on shutdown.
func (s *Service) Start(workers int) {
	if s.client == nil {
		slog.Info("ingest: Memory client not configured, ingestion disabled")
		return
	}
	s.co = newCoalescer(100, workers, s.processInstance)
	slog.Info("ingest: started workers", "workers", workers)
}

// Stop lets queued and running ingests finish and waits for the workers.
func (s *Service) Stop() {
	if s.co == nil {
		return
	}
	s.co.stop()
	slog.Info("ingest: workers stopped")
}

// IsConfigured returns true when a Memory client is wired.
func (s *Service) IsConfigured() bool {
	return s.client != nil
}

// InstanceChanged implements changemark.Notifier. It never blocks and may be
// called many times per change; triggers for one instance are coalesced.
func (s *Service) InstanceChanged(_ context.Context, instanceID uuid.UUID) {
	s.EnqueueInstance(instanceID)
}

// EnqueueInstance schedules an ingest of one instance. Non-blocking.
func (s *Service) EnqueueInstance(instanceID uuid.UUID) {
	if s.client == nil || s.co == nil {
		return
	}
	s.co.schedule(instanceID)
}

// dirtyGrace is how long a change may sit unprocessed before the heartbeat
// re-enqueues the instance. Normal ingests finish well within it.
const dirtyGrace = time.Minute

// maxPurgesPerSweep bounds the purge work one sweep schedules.
const maxPurgesPerSweep = 50

type logger interface {
	Info(msg string, args ...any)
	Warn(msg string, args ...any)
}

// EnqueueAllInstances is the startup sweep. It schedules every active instance
// whose graph may be stale: dirty, never ingested, or whose artifacts no longer
// match the hash stored at its last full ingest. It also schedules purges that
// are still owed. Runs once at startup so Memory converges after restarts.
func (s *Service) EnqueueAllInstances(ctx context.Context, db *bun.DB, log logger) {
	if s.client == nil {
		return
	}
	stale, err := s.staleInstances(ctx, db, 0)
	if err != nil {
		log.Warn("ingest: startup sweep: failed to load instances", "err", err)
		return
	}
	purges, err := s.pendingPurges(ctx, db)
	if err != nil {
		log.Warn("ingest: startup sweep: failed to load pending purges", "err", err)
	}
	if len(stale) == 0 && len(purges) == 0 {
		log.Info("ingest: startup sweep: all instances unchanged, skipping")
		return
	}
	log.Info("ingest: startup sweep: queuing work", "ingest", len(stale), "purge", len(purges))
	for _, id := range stale {
		s.EnqueueInstance(id)
	}
	for _, id := range purges {
		s.EnqueueInstance(id)
	}
}

// staleInstances returns active instances that need an ingest: dirty for longer
// than grace, never ingested (NULL hash), or hash different from the current
// artifacts.
func (s *Service) staleInstances(ctx context.Context, db *bun.DB, grace time.Duration) ([]uuid.UUID, error) {
	type row struct {
		ID          uuid.UUID  `bun:"id"`
		Dirty       *time.Time `bun:"memory_dirty_since"`
		ContentHash *string    `bun:"memory_content_hash"`
		CurrentHash string     `bun:"current_hash"`
	}
	var rows []row
	err := db.NewSelect().
		TableExpr("strategy_instances AS si").
		ColumnExpr("si.id, si.memory_dirty_since, si.memory_content_hash").
		ColumnExpr(`COALESCE((
			SELECT md5(string_agg(a.artifact_key || ':' || a.payload::text, '|' ORDER BY a.artifact_key))
			FROM strategy_artifacts a
			WHERE a.instance_id = si.id AND a.status != 'archived'
		), md5('')) AS current_hash`).
		Join("JOIN workspaces AS w ON w.id = si.workspace_id").
		Where("si.deleted_at IS NULL").
		Where("si.status != ?", "archived").
		Where("w.deleted_at IS NULL").
		Where("w.github_owner NOT LIKE ?", "e2e-%").
		Where("w.github_owner NOT LIKE ?", "ripple-%").
		Where("w.github_owner NOT LIKE ?", "aim-ripple-%").
		Scan(ctx, &rows)
	if err != nil {
		return nil, fmt.Errorf("load instances: %w", err)
	}
	cutoff := time.Now().Add(-grace)
	var ids []uuid.UUID
	for _, r := range rows {
		switch {
		case r.Dirty != nil && !r.Dirty.After(cutoff):
			ids = append(ids, r.ID)
		case r.ContentHash == nil || *r.ContentHash != r.CurrentHash:
			ids = append(ids, r.ID)
		}
	}
	return ids, nil
}

// pendingPurges returns deleted instances that were synced to Memory and whose
// objects have not been removed yet.
func (s *Service) pendingPurges(ctx context.Context, db *bun.DB) ([]uuid.UUID, error) {
	var ids []uuid.UUID
	err := db.NewSelect().
		TableExpr("strategy_instances AS si").
		Column("si.id").
		Where("si.deleted_at IS NOT NULL").
		Where("si.memory_purged_at IS NULL").
		Where("si.memory_sync_status IS NOT NULL").
		Limit(maxPurgesPerSweep).
		Scan(ctx, &ids)
	if err != nil {
		return nil, fmt.Errorf("load pending purges: %w", err)
	}
	return ids, nil
}

// RepairMemoryDrift implements heartbeat.MemoryDriftRepairer. It re-enqueues
// instances whose changes have sat unprocessed (a dropped notification or a
// failed ingest), instances synced before the Memory server last started (a
// restart can wipe the graph), and purges that are still owed.
func (s *Service) RepairMemoryDrift(ctx context.Context) {
	if s.client == nil {
		return
	}

	dirty, err := s.dirtyInstances(ctx)
	if err != nil {
		slog.WarnContext(ctx, "ingest: drift check: dirty query failed", "err", err)
	}
	for _, id := range dirty {
		s.EnqueueInstance(id)
	}
	if len(dirty) > 0 {
		slog.InfoContext(ctx, "ingest: re-queued dirty instances", "count", len(dirty))
	}

	purges, err := s.pendingPurges(ctx, s.db)
	if err != nil {
		slog.WarnContext(ctx, "ingest: drift check: purge query failed", "err", err)
	}
	for _, id := range purges {
		s.EnqueueInstance(id)
	}

	status, err := s.client.Health(ctx)
	if err != nil {
		slog.WarnContext(ctx, "ingest: drift check: memory unhealthy, skipping restart check", "err", err)
		return
	}

	var restarted []uuid.UUID
	err = s.db.NewSelect().
		TableExpr("strategy_instances si").
		Join("JOIN workspaces w ON w.id = si.workspace_id").
		Column("si.id").
		Where("si.deleted_at IS NULL").
		Where("si.status != ?", "archived").
		Where("w.deleted_at IS NULL").
		Where("si.memory_object_count > 0").
		Where("si.memory_last_synced_at < ?", status.StartedAt).
		Scan(ctx, &restarted)
	if err != nil {
		slog.WarnContext(ctx, "ingest: drift check: restart query failed", "err", err)
		return
	}
	if len(restarted) == 0 {
		return
	}
	slog.InfoContext(ctx, "ingest: memory restart detected, re-queuing instances",
		"count", len(restarted), "memory_started_at", status.StartedAt.Format(time.RFC3339))
	for _, id := range restarted {
		s.forceNextIngest(ctx, id)
		s.EnqueueInstance(id)
	}
}

// dirtyInstances returns active instances with a change older than dirtyGrace.
func (s *Service) dirtyInstances(ctx context.Context) ([]uuid.UUID, error) {
	var ids []uuid.UUID
	err := s.db.NewSelect().
		TableExpr("strategy_instances si").
		Join("JOIN workspaces w ON w.id = si.workspace_id").
		Column("si.id").
		Where("si.deleted_at IS NULL").
		Where("si.status != ?", "archived").
		Where("w.deleted_at IS NULL").
		Where("si.memory_dirty_since IS NOT NULL").
		Where("si.memory_dirty_since < ?", time.Now().Add(-dirtyGrace)).
		Scan(ctx, &ids)
	if err != nil {
		return nil, fmt.Errorf("load dirty instances: %w", err)
	}
	return ids, nil
}

// forceNextIngest makes the next processInstance run a full ingest even though
// the artifacts did not change, by clearing the stored hash.
func (s *Service) forceNextIngest(ctx context.Context, id uuid.UUID) {
	if _, err := s.db.NewUpdate().
		TableExpr("strategy_instances").
		Set("memory_content_hash = NULL").
		Where("id = ?", id).
		Exec(ctx); err != nil {
		slog.WarnContext(ctx, "ingest: failed to invalidate content hash", "instance_id", id, "err", err)
	}
}

// ingestState is the bookkeeping read before and after an ingest.
type ingestState struct {
	Deleted bool       `bun:"deleted"`
	Status  string     `bun:"status"`
	Dirty   *time.Time `bun:"memory_dirty_since"`
	Seq     int64      `bun:"memory_change_seq"`
	Hash    *string    `bun:"memory_content_hash"`
}

func (s *Service) loadState(ctx context.Context, id uuid.UUID) (*ingestState, error) {
	var st ingestState
	err := s.db.NewRaw(`SELECT deleted_at IS NOT NULL AS deleted, status, memory_dirty_since,
			memory_change_seq, memory_content_hash
		FROM strategy_instances WHERE id = ?`, id).Scan(ctx, &st)
	if err != nil {
		return nil, fmt.Errorf("load instance state %s: %w", id, err)
	}
	return &st, nil
}

// processInstance is the coalescer's job: bring one instance's graph in line
// with Postgres. A deleted instance is purged instead. It does nothing when
// another replica already ingested the current content.
func (s *Service) processInstance(ctx context.Context, id uuid.UUID) error {
	lock, err := lockInstance(ctx, s.db, id)
	if err != nil {
		return err
	}
	defer s.release(ctx, lock, id)

	st, err := s.loadState(ctx, id)
	if err != nil {
		return err
	}
	if st.Deleted {
		return s.purgeLocked(ctx, id)
	}
	if st.Status == "archived" {
		return nil
	}
	if st.Dirty == nil && st.Hash != nil {
		current, err := s.computeContentHash(ctx, id)
		if err == nil && current == *st.Hash {
			return nil
		}
	}
	return s.ingestLocked(ctx, id, st)
}

func (s *Service) release(ctx context.Context, l *instanceLock, id uuid.UUID) {
	if err := l.release(ctx); err != nil {
		slog.WarnContext(ctx, "ingest: failed to release instance lock", "instance_id", id, "err", err)
	}
}

// ReingestInstance runs a full ingest of one instance now, regardless of
// whether it looks stale. It is the entry point for the CLI.
func (s *Service) ReingestInstance(ctx context.Context, instanceID uuid.UUID) error {
	if s.client == nil {
		return fmt.Errorf("ingest: Memory client not configured")
	}
	lock, err := lockInstance(ctx, s.db, instanceID)
	if err != nil {
		return err
	}
	defer s.release(ctx, lock, instanceID)

	st, err := s.loadState(ctx, instanceID)
	if err != nil {
		return err
	}
	return s.ingestLocked(ctx, instanceID, st)
}

func ownerLabel(instanceID uuid.UUID) string {
	return "instance:" + instanceID.String()
}

// ingestLocked writes every non-archived artifact and relationship of the
// instance to Memory, then removes objects the instance no longer has. The
// caller holds the instance lock.
//
// The change sequence and content hash are read before the artifacts, so a
// change that lands during the ingest leaves the instance dirty. Any failed
// write returns an error and leaves the instance dirty.
func (s *Service) ingestLocked(ctx context.Context, instanceID uuid.UUID, st *ingestState) error {
	seq0 := st.Seq
	hash0, err := s.computeContentHash(ctx, instanceID)
	if err != nil {
		return err
	}

	var artifacts []domain.StrategyArtifact
	if err := s.db.NewSelect().
		Model(&artifacts).
		Where("instance_id = ?", instanceID).
		Where("status != ?", domain.ArtifactStatusArchived).
		Scan(ctx); err != nil {
		return fmt.Errorf("load artifacts: %w", err)
	}
	slog.Info("ingest: ingesting instance", "instance_id", instanceID, "artifact_count", len(artifacts))

	owner := ownerLabel(instanceID)
	upsertReqs := make([]memory.UpsertObjectRequest, 0, len(artifacts))
	artifactKeys := make(map[string]bool, len(artifacts))
	for _, a := range artifacts {
		obj := artifactToSubgraphObject(a, "")
		artifactKeys[obj.Key] = true
		upsertReqs = append(upsertReqs, memory.UpsertObjectRequest{
			Type:       obj.Type,
			Key:        obj.Key,
			Status:     obj.Status,
			Labels:     append(obj.Labels, owner),
			Properties: obj.Properties,
		})
	}

	bulk, err := s.client.BulkUpsertObjects(ctx, upsertReqs, 8)
	if err != nil {
		return fmt.Errorf("bulk upsert artifacts: %w", err)
	}
	if bulk.Failed > 0 {
		return fmt.Errorf("ingest %s: %d of %d artifact upserts failed", instanceID, bulk.Failed, len(upsertReqs))
	}

	keyIdx := newObjectKeyIndex()
	for key, id := range bulk.KeyToID {
		keyIdx.add(key, id)
	}
	for _, a := range artifacts {
		if i := strings.Index(a.ArtifactKey, "_"); i > 0 {
			if id, ok := bulk.KeyToID[a.ArtifactKey]; ok {
				if _, exists := keyIdx.exact[a.ArtifactKey[:i]]; !exists {
					keyIdx.add(a.ArtifactKey[:i], id)
				}
			}
		}
	}

	var rels []domain.StrategyRelationship
	if err := s.db.NewSelect().
		Model(&rels).
		Where("instance_id = ?", instanceID).
		Scan(ctx); err != nil {
		return fmt.Errorf("load relationships: %w", err)
	}
	if failed := s.upsertRelationshipsIndexed(ctx, instanceID, rels, keyIdx); failed > 0 {
		return fmt.Errorf("ingest %s: %d of %d relationship upserts failed", instanceID, failed, len(rels))
	}

	res := s.countIngested(ctx, instanceID)
	var decomposedKeys map[string]bool
	if s.exporter != nil {
		d, dErr := s.ingestDecomposed(ctx, instanceID)
		if dErr != nil {
			slog.Warn("ingest: decomposed layer failed (non-fatal)", "instance_id", instanceID, "err", dErr)
		} else {
			res.decomposedObjectCount = d.objects
			res.decomposedEdgeCount = d.edges
			decomposedKeys = d.keys
		}
	}

	if err := s.updateSyncStatus(ctx, instanceID, res, hash0, seq0); err != nil {
		return err
	}

	s.collectGarbage(ctx, instanceID, artifactKeys, decomposedKeys)
	slog.Info("ingest: instance complete", "instance_id", instanceID,
		"artifacts", len(artifacts), "relationships", len(rels))
	return nil
}

// maxListPages bounds a paged listing so a misbehaving server cannot loop it.
const maxListPages = 500

// listOwned returns every Memory object carrying the instance's owner label.
func (s *Service) listOwned(ctx context.Context, instanceID uuid.UUID) ([]memory.Object, error) {
	var out []memory.Object
	cursor := ""
	for range maxListPages {
		page, err := s.client.ListObjects(ctx, memory.ListObjectsOptions{
			Label: ownerLabel(instanceID), Cursor: cursor, Limit: 200,
		})
		if err != nil {
			return out, fmt.Errorf("list objects of %s: %w", instanceID, err)
		}
		out = append(out, page.Items...)
		if page.NextCursor == "" {
			return out, nil
		}
		cursor = page.NextCursor
	}
	return out, fmt.Errorf("list objects of %s: more than %d pages", instanceID, maxListPages)
}

func hasLabel(o memory.Object, label string) bool {
	for _, l := range o.Labels {
		if l == label {
			return true
		}
	}
	return false
}

// collectGarbage deletes the instance's own objects that its artifacts no
// longer produce. It only ever looks at objects carrying the instance's owner
// label, so it cannot remove another instance's data. decomposedKeys is nil
// when the decomposed layer did not run; its objects are then left alone.
// Failures are logged: the next ingest retries.
func (s *Service) collectGarbage(ctx context.Context, instanceID uuid.UUID, artifactKeys, decomposedKeys map[string]bool) {
	owned, err := s.listOwned(ctx, instanceID)
	if err != nil {
		slog.Warn("ingest: garbage collection skipped", "instance_id", instanceID, "err", err)
		return
	}
	for _, o := range owned {
		var stale bool
		switch {
		case hasLabel(o, "layer:artifact"):
			stale = !artifactKeys[o.Key]
		case hasLabel(o, "layer:decomposed") && decomposedKeys != nil:
			stale = !decomposedKeys[o.Key]
		}
		if !stale {
			continue
		}
		if err := s.client.DeleteObject(ctx, o.StableID(), memory.DeleteObjectRequest{
			Reason: fmt.Sprintf("no longer produced by instance %s", instanceID),
		}); err != nil {
			slog.Warn("ingest: failed to delete stale object", "instance_id", instanceID, "key", o.Key, "err", err)
		}
	}
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
		if title, ok := payload["title"].(string); ok && props["name"] == nil {
			props["name"] = title
		}
		if snippet := extractSnippet(payload); snippet != "" {
			props["snippet"] = snippet
		}
		if a.ArtifactType == "evidence" {
			addEvidenceProperties(props, payload)
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

// addEvidenceProperties adds the fields that let Memory filter evidence by
// tag, source and processing status.
func addEvidenceProperties(props map[string]any, payload map[string]any) {
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
		props["snippet"] = summary
	}
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

// upsertRelationshipsIndexed resolves object IDs using a pre-built local index
// (with prefix matching for short IDs) and upserts the edges. It returns how
// many upserts failed. Edges whose endpoints are not in the graph are skipped:
// that is a data condition, not a failure.
func (s *Service) upsertRelationshipsIndexed(ctx context.Context, instanceID uuid.UUID, rels []domain.StrategyRelationship, idx *objectKeyIndex) int {
	upserted, skipped, failed := 0, 0, 0
	for _, rel := range rels {
		srcID := idx.resolve(rel.SourceKey)
		tgtID := idx.resolve(rel.TargetKey)
		if srcID == "" || tgtID == "" {
			skipped++
			continue
		}
		_, err := s.client.UpsertRelationship(ctx, memory.UpsertRelationshipRequest{
			Type:   rel.Relationship,
			FromID: srcID,
			ToID:   tgtID,
			Properties: map[string]any{
				"instance_id": instanceID.String(),
			},
		})
		if err != nil {
			failed++
			slog.Warn("ingest: upsert relationship failed",
				"type", rel.Relationship, "source", rel.SourceKey, "target", rel.TargetKey, "err", err)
			continue
		}
		upserted++
	}
	if len(rels) > 0 {
		slog.Info("ingest: relationships processed",
			"total", len(rels), "upserted", upserted, "skipped", skipped, "failed", failed)
	}
	return failed
}

// updateSyncStatus records a completed ingest. The dirty flag is cleared only
// if no change arrived since seq0 was read; otherwise the instance stays dirty
// and is ingested again. hash is the content hash taken before the artifacts
// were read.
func (s *Service) updateSyncStatus(ctx context.Context, instanceID uuid.UUID, res syncResult, hash string, seq0 int64) error {
	now := time.Now()
	_, err := s.db.NewUpdate().
		TableExpr("strategy_instances").
		Set("memory_sync_status = ?", "synced").
		Set("memory_last_synced_at = ?", now).
		Set("memory_object_count = ?", res.objectCount).
		Set("memory_edge_count = ?", res.edgeCount).
		Set("memory_decomposed_object_count = ?", res.decomposedObjectCount).
		Set("memory_decomposed_edge_count = ?", res.decomposedEdgeCount).
		Set("memory_content_hash = ?", hash).
		Set("memory_dirty_since = CASE WHEN memory_change_seq = ? THEN NULL ELSE memory_dirty_since END", seq0).
		Set("updated_at = ?", now).
		Where("id = ?", instanceID).
		Exec(ctx)
	if err != nil {
		return fmt.Errorf("update sync status %s: %w", instanceID, err)
	}
	return nil
}

// computeContentHash returns an MD5 hash of all non-archived artifact payloads
// for an instance. An instance without artifacts hashes to md5(”).
func (s *Service) computeContentHash(ctx context.Context, instanceID uuid.UUID) (string, error) {
	var hash string
	err := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		ColumnExpr("COALESCE(md5(string_agg(artifact_key || ':' || payload::text, '|' ORDER BY artifact_key)), md5(''))").
		Where("instance_id = ?", instanceID).
		Where("status != ?", "archived").
		Scan(ctx, &hash)
	if err != nil {
		return "", fmt.Errorf("compute content hash %s: %w", instanceID, err)
	}
	return hash, nil
}

// countIngested returns the object and edge counts for an instance from the
// database (objects written = non-archived artifacts, edges written =
// relationships). It avoids a per-instance Memory call.
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
	return syncResult{objectCount: objCount, edgeCount: edgeCount}
}

// decomposedResult is the outcome of the decomposed-layer ingest.
type decomposedResult struct {
	objects int
	edges   int
	keys    map[string]bool // every key the decomposer produced, written or not
}

// ingestDecomposed exports instance artifacts to YAML, runs the decomposer, and
// upserts the resulting sub-entity objects and relationships into Memory under
// the "layer:decomposed" label.
func (s *Service) ingestDecomposed(ctx context.Context, instanceID uuid.UUID) (*decomposedResult, error) {

	// Export all artifacts to a temporary directory.
	export, err := s.exporter.ExportInstance(ctx, instanceID)
	if err != nil {
		return nil, fmt.Errorf("export instance for decompose: %w", err)
	}

	tmpDir, err := os.MkdirTemp("", "ingest-decompose-*")
	if err != nil {
		return nil, fmt.Errorf("create temp dir: %w", err)
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
			return nil, fmt.Errorf("mkdir for %s: %w", f.RelPath, mkErr)
		}
		if writeErr := os.WriteFile(dest, []byte(f.Content), 0o600); writeErr != nil {
			return nil, fmt.Errorf("write %s: %w", f.RelPath, writeErr)
		}
	}

	// Run the decomposer.
	d := decompose.New(tmpDir)
	result, err := d.DecomposeInstance()
	if err != nil {
		return nil, fmt.Errorf("decompose instance: %w", err)
	}
	for _, w := range result.Warnings {
		slog.Debug("ingest: decompose warning", "instance_id", instanceID, "msg", w)
	}

	slog.Info("ingest: decompose complete",
		"instance_id", instanceID,
		"objects", len(result.Objects),
		"relationships", len(result.Relationships))

	// Build upsert requests for all decomposed objects.
	// Keys are scoped by instance ID to prevent cross-instance collisions —
	// without this, instances sharing canonical templates (e.g. sd-001) would
	// overwrite each other's decomposed objects.
	instancePrefix := instanceID.String()[:8] // short prefix for readable keys
	upsertReqs := make([]memory.UpsertObjectRequest, 0, len(result.Objects))
	// Map original decomposer keys to instance-scoped keys for relationship wiring.
	scopedKeys := make(map[string]string, len(result.Objects))
	producedKeys := make(map[string]bool, len(result.Objects))
	for _, obj := range result.Objects {
		labels := append(append([]string{}, obj.Labels...), "layer:decomposed", ownerLabel(instanceID))
		props := obj.Properties
		if props == nil {
			props = make(map[string]any)
		}
		props["instance_id"] = instanceID.String()
		scopedKey := instancePrefix + "/" + obj.Key
		scopedKeys[obj.Key] = scopedKey
		producedKeys[scopedKey] = true
		upsertReqs = append(upsertReqs, memory.UpsertObjectRequest{
			Type:       obj.Type,
			Key:        scopedKey,
			Status:     obj.Status,
			Labels:     labels,
			Properties: props,
		})
	}

	bulkResult, err := s.client.BulkUpsertObjects(ctx, upsertReqs, 8)
	if err != nil {
		return nil, fmt.Errorf("bulk upsert decomposed objects: %w", err)
	}
	if bulkResult.Failed > 0 {
		slog.Warn("ingest: some decomposed object upserts failed",
			"instance_id", instanceID, "failed", bulkResult.Failed)
	}

	// Upsert relationships using the key→ID map from the bulk upsert.
	// Relationship FromKey/ToKey use original decomposer keys — translate
	// to instance-scoped keys for the lookup.
	relUpserted, relSkipped := 0, 0
	for _, rel := range result.Relationships {
		fromScoped := scopedKeys[rel.FromKey]
		toScoped := scopedKeys[rel.ToKey]
		fromID, ok1 := bulkResult.KeyToID[fromScoped]
		toID, ok2 := bulkResult.KeyToID[toScoped]
		if !ok1 || !ok2 {
			relSkipped++
			continue
		}
		props := rel.Properties
		if props == nil {
			props = map[string]any{}
		}
		props["instance_id"] = instanceID.String()
		_, rErr := s.client.UpsertRelationship(ctx, memory.UpsertRelationshipRequest{
			Type:       rel.Type,
			FromID:     fromID,
			ToID:       toID,
			Properties: props,
		})
		if rErr != nil {
			slog.Debug("ingest: decompose relationship failed",
				"type", rel.Type, "from", rel.FromKey, "to", rel.ToKey, "err", rErr)
			continue
		}
		relUpserted++
	}

	slog.Info("ingest: decompose objects upserted",
		"instance_id", instanceID,
		"upserted", len(bulkResult.Objects),
		"rel_upserted", relUpserted,
		"rel_skipped", relSkipped)

	return &decomposedResult{objects: len(bulkResult.Objects), edges: relUpserted, keys: producedKeys}, nil
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
