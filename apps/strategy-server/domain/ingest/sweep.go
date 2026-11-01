package ingest

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"sort"
	"strings"

	"github.com/google/uuid"
	"github.com/uptrace/bun/dialect/pgdialect"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
)

// Sweep classes. Every object the sweep removes is in exactly one.
const (
	SweepNoOwner       = "no_owner"
	SweepUnknownOwner  = "unknown_owner"
	SweepNotInManifest = "not_in_manifest"
	SweepLegacyKey     = "legacy_key"
)

// Reasons an instance's objects are left alone.
const (
	SweepSkipLocked     = "locked"
	SweepSkipNoManifest = "no_manifest"
)

const sweepSampleSize = 5

// SweepReport is the outcome of one sweep. Counts and Samples cover the objects
// the sweep would remove (dry run) or tried to remove (apply); objects of a
// skipped instance are in Skipped only.
type SweepReport struct {
	Applied     bool                `json:"applied"`
	Scanned     int                 `json:"scanned"`
	Counts      map[string]int      `json:"counts"`
	Samples     map[string][]string `json:"samples"`
	Deleted     int                 `json:"deleted"`
	AlreadyGone int                 `json:"already_gone"`
	Failed      int                 `json:"failed"`
	Skipped     []SweepSkip         `json:"skipped"`
}

// SweepSkip is an instance whose objects the sweep left alone.
type SweepSkip struct {
	InstanceID string `json:"instance_id"`
	Reason     string `json:"reason"`
	Objects    int    `json:"objects"`
}

func (r *SweepReport) add(class, key string) {
	r.Counts[class]++
	if len(r.Samples[class]) < sweepSampleSize {
		r.Samples[class] = append(r.Samples[class], key)
	}
}

type sweepObject struct {
	id  string
	key string
}

// SweepOrphans finds the objects in the Memory project that no instance's
// projection accounts for and, with apply, deletes them. Without apply it
// deletes nothing.
//
// It pages through every object once, then classifies:
//
//   - no_owner: no instance label and no instance_id property, or the two
//     disagree (ingest never writes that);
//   - unknown_owner: the owner is not the id of a live instance (deleted,
//     nonexistent, or not a UUID). Archived instances keep their data and are
//     owners;
//   - legacy_key: owned by a live instance but the key does not start with the
//     owner's key prefix;
//   - not_in_manifest: owned and correctly keyed, but not in the instance's
//     manifest.
//
// An instance is classified and swept under its instance lock, so a running
// ingest is never raced; if the lock is held, or the instance has no manifest
// yet (it may not have been ingested under the fenced scheme, and its objects
// may be the only copy), its objects are skipped and reported. Deletes are
// sequential. A failed delete is counted and the sweep carries on; running it
// again retries what is left. Cancelling ctx stops it with the report so far.
func (s *Service) SweepOrphans(ctx context.Context, apply bool) (*SweepReport, error) {
	if s.client == nil {
		return nil, fmt.Errorf("ingest: Memory client not configured")
	}
	rep := &SweepReport{Applied: apply, Counts: map[string]int{}, Samples: map[string][]string{}, Skipped: []SweepSkip{}}

	byOwner, loose, err := s.scanForSweep(ctx, rep)
	if err != nil {
		return rep, err
	}

	owners := make([]string, 0, len(byOwner))
	for o := range byOwner {
		owners = append(owners, o)
	}
	live, err := s.liveInstances(ctx, owners)
	if err != nil {
		return rep, err
	}

	var victims []victim
	victims = append(victims, loose...)
	sort.Strings(owners)
	var perInstance []uuid.UUID
	for _, o := range owners {
		id, perr := uuid.Parse(o)
		if perr != nil || !live[id] {
			for _, obj := range byOwner[o] {
				victims = append(victims, victim{obj, SweepUnknownOwner})
			}
			continue
		}
		perInstance = append(perInstance, id)
	}

	for _, v := range victims {
		rep.add(v.class, v.key)
	}
	if apply {
		if err := s.deleteVictims(ctx, rep, victims); err != nil {
			return rep, err
		}
	}

	for _, id := range perInstance {
		if err := s.sweepInstance(ctx, rep, id, byOwner[id.String()], apply); err != nil {
			return rep, err
		}
	}

	slog.Info("ingest: sweep complete", "applied", apply, "scanned", rep.Scanned, "counts", rep.Counts,
		"deleted", rep.Deleted, "already_gone", rep.AlreadyGone, "failed", rep.Failed, "skipped_instances", len(rep.Skipped))
	return rep, nil
}

type victim struct {
	sweepObject
	class string
}

// scanForSweep pages through every object once. Objects without a usable owner
// come back as victims; the rest are grouped by the owner string they claim.
func (s *Service) scanForSweep(ctx context.Context, rep *SweepReport) (map[string][]sweepObject, []victim, error) {
	byOwner := map[string][]sweepObject{}
	var loose []victim
	seen := map[string]bool{}
	cursor := ""
	for range maxListPages {
		page, err := s.client.ListObjects(ctx, memory.ListObjectsOptions{Cursor: cursor, Limit: 200})
		if err != nil {
			return nil, nil, fmt.Errorf("sweep: list objects: %w", err)
		}
		for i := range page.Items {
			o := &page.Items[i]
			id := o.StableID()
			if seen[id] {
				continue
			}
			seen[id] = true
			rep.Scanned++
			obj := sweepObject{id: id, key: o.Key}
			if owner, ok := ownerOf(o); ok {
				byOwner[owner] = append(byOwner[owner], obj)
			} else {
				loose = append(loose, victim{obj, SweepNoOwner})
			}
		}
		if page.NextCursor == "" {
			return byOwner, loose, nil
		}
		cursor = page.NextCursor
	}
	return nil, nil, fmt.Errorf("sweep: list objects: more than %d pages", maxListPages)
}

// ownerOf is the instance an object claims: the instance: label and the
// instance_id property agree on one value. An object with none, or with two
// different claims, has no owner.
func ownerOf(o *memory.Object) (string, bool) {
	claims := map[string]struct{}{}
	for _, l := range o.Labels {
		if v, ok := strings.CutPrefix(l, "instance:"); ok {
			claims[v] = struct{}{}
		}
	}
	if v, ok := o.Properties["instance_id"].(string); ok && v != "" {
		claims[v] = struct{}{}
	}
	if len(claims) != 1 {
		return "", false
	}
	for v := range claims {
		return v, true
	}
	return "", false
}

// liveInstances returns the owner ids that belong to an instance that is not
// deleted.
func (s *Service) liveInstances(ctx context.Context, owners []string) (map[uuid.UUID]bool, error) {
	valid := make([]string, 0, len(owners))
	for _, o := range owners {
		if _, err := uuid.Parse(o); err == nil {
			valid = append(valid, o)
		}
	}
	live := map[uuid.UUID]bool{}
	if len(valid) == 0 {
		return live, nil
	}
	var ids []uuid.UUID
	if err := s.db.NewRaw(
		`SELECT id FROM strategy_instances WHERE deleted_at IS NULL AND id = ANY(?::uuid[])`,
		pgdialect.Array(valid),
	).Scan(ctx, &ids); err != nil {
		return nil, fmt.Errorf("sweep: look up owners: %w", err)
	}
	for _, id := range ids {
		live[id] = true
	}
	return live, nil
}

// sweepInstance classifies the objects owned by one live instance and, with
// apply, deletes the ones outside its projection. It holds the instance lock
// for both.
func (s *Service) sweepInstance(ctx context.Context, rep *SweepReport, id uuid.UUID, objs []sweepObject, apply bool) error {
	lock, err := tryLockInstance(ctx, s.db, id)
	if err != nil {
		return err
	}
	if lock == nil {
		rep.Skipped = append(rep.Skipped, SweepSkip{InstanceID: id.String(), Reason: SweepSkipLocked, Objects: len(objs)})
		return nil
	}
	defer s.release(ctx, lock, id)

	var generation int64
	if err := s.db.NewRaw(`SELECT memory_generation FROM strategy_instances WHERE id = ?`, id).Scan(ctx, &generation); err != nil {
		return fmt.Errorf("sweep: load state of %s: %w", id, err)
	}
	if generation < 1 {
		rep.Skipped = append(rep.Skipped, SweepSkip{InstanceID: id.String(), Reason: SweepSkipNoManifest, Objects: len(objs)})
		return nil
	}
	m, err := s.loadManifest(ctx, id)
	if err != nil {
		return err
	}

	prefix := id.String()[:keyPrefixLen] + "/"
	var victims []victim
	for _, o := range objs {
		switch _, kept := m.objects[o.key]; {
		case !strings.HasPrefix(o.key, prefix):
			victims = append(victims, victim{o, SweepLegacyKey})
		case !kept:
			victims = append(victims, victim{o, SweepNotInManifest})
		}
	}
	for _, v := range victims {
		rep.add(v.class, v.key)
	}
	if !apply {
		return nil
	}
	return s.deleteVictims(ctx, rep, victims)
}

func (s *Service) deleteVictims(ctx context.Context, rep *SweepReport, victims []victim) error {
	for i, v := range victims {
		if err := ctx.Err(); err != nil {
			return fmt.Errorf("sweep: stopped after %d deletes: %w", rep.Deleted, err)
		}
		err := s.client.DeleteObject(ctx, v.id, memory.DeleteObjectRequest{Reason: "swept: " + v.class})
		var apiErr *memory.APIError
		switch {
		case err == nil:
			rep.Deleted++
		case errors.As(err, &apiErr) && apiErr.StatusCode == http.StatusNotFound:
			rep.AlreadyGone++
		default:
			rep.Failed++
			slog.Warn("ingest: sweep: failed to delete object", "key", v.key, "class", v.class, "err", err)
		}
		if (i+1)%500 == 0 {
			slog.Info("ingest: sweep progress", "deleted", rep.Deleted, "failed", rep.Failed, "of", len(victims))
		}
	}
	return nil
}
