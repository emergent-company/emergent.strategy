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
	"sync"
	"time"

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
	// ArtifactKey names the artifact row the file was exported from, so an
	// object decomposed from the file can take that artifact's integrity class.
	ArtifactKey string
	Content     string
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
// than grace, without a manifest, never ingested (NULL hash), or hash different
// from the current artifacts.
func (s *Service) staleInstances(ctx context.Context, db *bun.DB, grace time.Duration) ([]uuid.UUID, error) {
	type row struct {
		ID          uuid.UUID  `bun:"id"`
		Dirty       *time.Time `bun:"memory_dirty_since"`
		ContentHash *string    `bun:"memory_content_hash"`
		Generation  int64      `bun:"memory_generation"`
		CurrentHash string     `bun:"current_hash"`
	}
	var rows []row
	err := db.NewSelect().
		TableExpr("strategy_instances AS si").
		ColumnExpr("si.id, si.memory_dirty_since, si.memory_content_hash, si.memory_generation").
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
		case r.Generation < 1:
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
	Gen     int64      `bun:"memory_generation"`
	Hash    *string    `bun:"memory_content_hash"`
}

func (s *Service) loadState(ctx context.Context, id uuid.UUID) (*ingestState, error) {
	var st ingestState
	err := s.db.NewRaw(`SELECT deleted_at IS NOT NULL AS deleted, status, memory_dirty_since,
			memory_change_seq, memory_generation, memory_content_hash
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
	if st.Dirty == nil && st.Hash != nil && st.Gen >= 1 {
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

// ingestLocked brings the instance's slice of the Memory graph in line with
// Postgres. The caller holds the instance lock. It:
//
//  1. computes the whole projection (both layers, all relationships) from
//     Postgres, writing nothing yet;
//  2. upserts every object and relationship; any failure returns an error
//     before the manifest is touched, so the previous projection stays in force;
//  3. replaces the manifest, bumps the generation and clears the dirty flag only
//     if no change arrived since the sequence was read, in one transaction;
//  4. removes what the instance owns in Memory but no longer projects.
//
// Nothing per-ingest is written onto Memory objects: unchanged objects are
// no-ops there, so a repeat ingest creates no versions and no embeddings.
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
		OrderExpr("artifact_key").
		Scan(ctx); err != nil {
		return fmt.Errorf("load artifacts: %w", err)
	}
	var rels []domain.StrategyRelationship
	if err := s.db.NewSelect().
		Model(&rels).
		Where("instance_id = ?", instanceID).
		OrderExpr("source_key, target_key, relationship").
		Scan(ctx); err != nil {
		return fmt.Errorf("load relationships: %w", err)
	}
	slog.Info("ingest: ingesting instance", "instance_id", instanceID, "artifact_count", len(artifacts))

	proj := artifactProjection(instanceID, artifacts, rels)
	decomposed := s.exporter != nil
	if decomposed {
		classOf := make(map[string]fileClass, len(artifacts))
		for _, a := range artifacts {
			if a.IntegrityClass != nil && *a.IntegrityClass != "" {
				fc := fileClass{class: *a.IntegrityClass}
				if a.IntegrityRef != nil {
					fc.ref = *a.IntegrityRef
				}
				classOf[a.ArtifactKey] = fc
			}
		}
		res, files, err := s.decomposeInstance(ctx, instanceID, classOf)
		if err != nil {
			return fmt.Errorf("ingest %s: %w", instanceID, err)
		}
		d := decomposedProjection(instanceID, res, files)
		proj.objects = append(proj.objects, d.objects...)
		proj.rels = append(proj.rels, d.rels...)
		proj.decomposedObjects, proj.decomposedRels = d.decomposedObjects, d.decomposedRels
	}

	upsertStart := time.Now()
	bulk, err := s.client.BulkUpsertObjects(ctx, proj.objects, 8)
	if err != nil {
		return fmt.Errorf("ingest %s: bulk upsert: %w", instanceID, err)
	}
	if bulk.Failed > 0 {
		return fmt.Errorf("ingest %s: %d of %d object upserts failed", instanceID, bulk.Failed, len(proj.objects))
	}
	if failed := s.upsertRelationships(ctx, proj.rels, bulk.KeyToID); failed > 0 {
		return fmt.Errorf("ingest %s: %d of %d relationship upserts failed", instanceID, failed, len(proj.rels))
	}

	upsertDur := time.Since(upsertStart)

	objKeys, relKeys := proj.objectKeys(), proj.relKeys()
	old, err := s.loadManifest(ctx, instanceID)
	if err != nil {
		return err
	}
	owned, err := s.listOwned(ctx, instanceID)
	if err != nil {
		return fmt.Errorf("ingest %s: %w", instanceID, err)
	}
	owned, err = s.removeShadowed(ctx, instanceID, proj, owned)
	if err != nil {
		return fmt.Errorf("ingest %s: %w", instanceID, err)
	}
	commitStart := time.Now()
	if err := s.commitProjection(ctx, instanceID, proj, objKeys, relKeys, hash0, seq0); err != nil {
		return err
	}
	commitDur := time.Since(commitStart)

	gcStart := time.Now()
	s.collectGarbage(ctx, instanceID, owned, old, objKeys, relKeys, decomposed)
	slog.Info("ingest: instance complete", "instance_id", instanceID,
		"objects", len(objKeys), "relationships", len(relKeys),
		"upsert_ms", upsertDur.Milliseconds(), "manifest_ms", commitDur.Milliseconds(),
		"gc_ms", time.Since(gcStart).Milliseconds())
	return nil
}

// upsertRelationships writes the relationships between objects already in
// Memory and returns how many failed. ids maps scoped object keys to Memory IDs.
func (s *Service) upsertRelationships(ctx context.Context, rels []relSpec, ids map[string]string) int {
	var (
		mu     sync.Mutex
		failed int
		wg     sync.WaitGroup
	)
	work := make(chan relSpec)
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for r := range work {
				from, ok1 := ids[r.from]
				to, ok2 := ids[r.to]
				var err error
				if !ok1 || !ok2 {
					err = fmt.Errorf("endpoint not written")
				} else {
					_, err = s.client.UpsertRelationship(ctx, memory.UpsertRelationshipRequest{
						Type: r.typ, FromID: from, ToID: to, Properties: r.properties,
					})
				}
				if err != nil {
					slog.Warn("ingest: upsert relationship failed", "type", r.typ, "from", r.from, "to", r.to, "err", err)
					mu.Lock()
					failed++
					mu.Unlock()
				}
			}
		}()
	}
	for _, r := range rels {
		work <- r
	}
	close(work)
	wg.Wait()
	return failed
}

// commitProjection replaces the manifest and records the ingest in one
// transaction. The dirty flag is cleared only if no change arrived since seq0
// was read; otherwise the instance stays dirty and is ingested again. hash is
// the content hash taken before the artifacts were read.
func (s *Service) commitProjection(ctx context.Context, instanceID uuid.UUID, proj *projection, objKeys, relKeys map[string]struct{}, hash string, seq0 int64) error {
	now := time.Now()
	err := s.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewRaw(`DELETE FROM memory_projection WHERE instance_id = ?`, instanceID).Exec(ctx); err != nil {
			return fmt.Errorf("clear manifest: %w", err)
		}
		if err := insertProjection(ctx, tx, instanceID, projectionObject, objKeys); err != nil {
			return fmt.Errorf("write object manifest: %w", err)
		}
		if err := insertProjection(ctx, tx, instanceID, projectionRelationship, relKeys); err != nil {
			return fmt.Errorf("write relationship manifest: %w", err)
		}
		_, err := tx.NewUpdate().
			TableExpr("strategy_instances").
			Set("memory_generation = memory_generation + 1").
			Set("memory_sync_status = ?", "synced").
			Set("memory_last_synced_at = ?", now).
			Set("memory_object_count = ?", proj.artifactObjects).
			Set("memory_edge_count = ?", proj.artifactRels).
			Set("memory_decomposed_object_count = ?", proj.decomposedObjects).
			Set("memory_decomposed_edge_count = ?", proj.decomposedRels).
			Set("memory_content_hash = ?", hash).
			Set("memory_dirty_since = CASE WHEN memory_change_seq = ? THEN NULL ELSE memory_dirty_since END", seq0).
			Set("updated_at = ?", now).
			Where("id = ?", instanceID).
			Exec(ctx)
		return err
	})
	if err != nil {
		return fmt.Errorf("commit projection of %s: %w", instanceID, err)
	}
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

// removeShadowed deletes the owned objects whose key the projection still
// contains but under another type. Memory identifies an object by type and key,
// so an artifact that changes type gets a second object, and the manifest, which
// lists keys, cannot tell the two apart. They are removed before the manifest is
// committed so that two objects never answer for one key. A failed delete fails
// the ingest: the instance stays dirty and the next ingest retries. It returns
// the owned objects that remain.
func (s *Service) removeShadowed(ctx context.Context, instanceID uuid.UUID, proj *projection, owned []memory.Object) ([]memory.Object, error) {
	typeOf := make(map[string]string, len(proj.objects))
	for _, o := range proj.objects {
		typeOf[o.Key] = o.Type
	}
	kept := owned[:0:0]
	for _, o := range owned {
		if want, projected := typeOf[o.Key]; projected && o.Type != want {
			if err := s.client.DeleteObject(ctx, o.StableID(), memory.DeleteObjectRequest{
				Reason: fmt.Sprintf("type of %s changed from %s to %s", o.Key, o.Type, want),
			}); err != nil {
				return nil, fmt.Errorf("remove %s object %q replaced by type %s: %w", o.Type, o.Key, want, err)
			}
			continue
		}
		kept = append(kept, o)
	}
	return kept, nil
}

// collectGarbage removes what the instance owns in Memory but no longer
// projects. owned is the listing of the objects carrying the instance's owner
// label, which covers objects of the previous manifest and any other owned
// leftover, so it cannot touch another instance's data. Relationships of the previous manifest
// that were dropped between surviving objects are deleted by ID; edges of
// deleted objects go with the object. When the decomposed layer was not part of
// this ingest its objects are left alone.
//
// Garbage never affects visibility, which comes from the manifest. Failures are
// logged and the next ingest retries.
func (s *Service) collectGarbage(ctx context.Context, instanceID uuid.UUID, owned []memory.Object, old *manifest, objKeys, relKeys map[string]struct{}, decomposed bool) {
	ids := make(map[string]string, len(owned))
	stale := make(map[string]bool)
	for _, o := range owned {
		ids[o.Key] = o.StableID()
		if _, keep := objKeys[o.Key]; keep {
			continue
		}
		if !decomposed && hasLabel(o, "layer:decomposed") {
			continue
		}
		stale[o.Key] = true
	}

	for relKey := range old.rels {
		if _, keep := relKeys[relKey]; keep {
			continue
		}
		typ, from, to, ok := splitRelationshipKey(relKey, ids)
		if !ok || stale[from] || stale[to] {
			continue
		}
		s.deleteEdge(ctx, instanceID, typ, ids[from], ids[to])
	}

	for _, o := range owned {
		if !stale[o.Key] {
			continue
		}
		if err := s.client.DeleteObject(ctx, o.StableID(), memory.DeleteObjectRequest{
			Reason: fmt.Sprintf("no longer produced by instance %s", instanceID),
		}); err != nil {
			slog.Warn("ingest: failed to delete stale object", "instance_id", instanceID, "key", o.Key, "err", err)
		}
	}
}

// deleteEdge removes the relationship (typ, from, to) between two objects, found
// through the source object's edges.
func (s *Service) deleteEdge(ctx context.Context, instanceID uuid.UUID, typ, fromID, toID string) {
	edges, err := s.client.ObjectEdges(ctx, fromID)
	if err != nil {
		slog.Warn("ingest: failed to read edges for garbage collection", "instance_id", instanceID, "err", err)
		return
	}
	for _, e := range edges.Outgoing {
		if e.Type != typ || e.ToID != toID {
			continue
		}
		if err := s.client.DeleteRelationship(ctx, e.ID); err != nil {
			slog.Warn("ingest: failed to delete stale relationship", "instance_id", instanceID, "type", typ, "err", err)
		}
	}
}

// integrityMetadata returns the Memory property and label that mark an artifact
// as unmodified framework content, so search can exclude it. Authored content
// carries neither.
func integrityMetadata(a domain.StrategyArtifact) (labels []string, props map[string]any) {
	if a.IntegrityClass == nil || *a.IntegrityClass == "" {
		return nil, nil
	}
	props = map[string]any{"integrity_class": *a.IntegrityClass}
	if a.IntegrityRef != nil && *a.IntegrityRef != "" {
		props["integrity_ref"] = *a.IntegrityRef
	}
	return []string{"integrity:" + *a.IntegrityClass}, props
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
	labels := []string{"layer:artifact"}
	intLabels, intProps := integrityMetadata(a)
	labels = append(labels, intLabels...)
	for k, v := range intProps {
		props[k] = v
	}
	return memory.SubgraphObject{
		Ref:        ref,
		Type:       a.ArtifactType,
		Key:        a.ArtifactKey,
		Status:     a.Status,
		Labels:     labels,
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
