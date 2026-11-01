package ingest

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"time"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
)

// Verification statuses of one instance.
const (
	VerifyOK       = "ok"
	VerifyMismatch = "mismatch"
	VerifyRepaired = "repaired"
	VerifySkipped  = "skipped"
	VerifyError    = "error"
)

// Reasons an instance is not verified.
const (
	VerifySkipLocked     = "locked"
	VerifySkipDirty      = "dirty"
	VerifySkipNoManifest = "no_manifest"
)

// verifyInterval is how often the heartbeat compares one instance with Memory.
// A comparison pages through the instance's objects, so it is not done on every
// tick.
const verifyInterval = 15 * time.Minute

// InstanceVerification is how one instance's objects in Memory compare with its
// manifest.
type InstanceVerification struct {
	InstanceID string `json:"instance_id"`
	Name       string `json:"name"`
	Status     string `json:"status"`
	SkipReason string `json:"skip_reason,omitempty"`
	Error      string `json:"error,omitempty"`
	// Manifest is how many objects the instance's projection lists, InMemory how
	// many objects Memory holds that the instance owns.
	Manifest int `json:"manifest"`
	InMemory int `json:"in_memory"`
	// Missing are manifest objects Memory does not hold. Extra are owned objects
	// outside the manifest.
	Missing       int      `json:"missing"`
	Extra         int      `json:"extra"`
	MissingSample []string `json:"missing_sample,omitempty"`
	ExtraSample   []string `json:"extra_sample,omitempty"`
}

// VerifyReport is the outcome of verifying every ingested instance.
type VerifyReport struct {
	Repaired  bool                   `json:"repaired"`
	Instances []InstanceVerification `json:"instances"`
}

// Unresolved counts the instances that disagree with Memory, or could not be
// checked or repaired because of an error. Skipped instances are not counted.
func (r *VerifyReport) Unresolved() int {
	n := 0
	for _, v := range r.Instances {
		if v.Status == VerifyMismatch || v.Status == VerifyError {
			n++
		}
	}
	return n
}

type verifyTarget struct {
	ID   uuid.UUID `bun:"id"`
	Name string    `bun:"name"`
}

func (s *Service) verifyTargets(ctx context.Context) ([]verifyTarget, error) {
	var targets []verifyTarget
	err := s.db.NewSelect().
		TableExpr("strategy_instances AS si").
		ColumnExpr("si.id, si.name").
		Apply(ingestable).
		OrderExpr("si.name, si.id").
		Scan(ctx, &targets)
	if err != nil {
		return nil, fmt.Errorf("verify: load instances: %w", err)
	}
	return targets, nil
}

// VerifyInstances compares, for every ingested instance, the objects Memory
// holds under its owner label with its manifest. This catches damage that
// changes neither the instance's rows nor its dirty flag, for instance objects
// deleted by an older build after a rollback.
//
// Only a missing object counts as a mismatch: an extra one is outside what the
// instance projects and the orphan sweep removes it. An instance that is
// dirty, locked or without a manifest is skipped; an ingest is about to settle
// it. With repair, an instance with missing objects is re-ingested in full
// before the call returns.
func (s *Service) VerifyInstances(ctx context.Context, repair bool) (*VerifyReport, error) {
	if s.client == nil {
		return nil, fmt.Errorf("ingest: Memory client not configured")
	}
	targets, err := s.verifyTargets(ctx)
	if err != nil {
		return nil, err
	}
	rep := &VerifyReport{Repaired: repair, Instances: []InstanceVerification{}}
	for _, t := range targets {
		if err := ctx.Err(); err != nil {
			return rep, fmt.Errorf("verify: stopped: %w", err)
		}
		v := s.verifyInstance(ctx, t)
		if repair && v.Status == VerifyMismatch {
			if err := s.ReingestInstance(ctx, t.ID); err != nil {
				v.Status, v.Error = VerifyError, fmt.Sprintf("re-ingest: %v", err)
			} else {
				v.Status = VerifyRepaired
			}
		}
		rep.Instances = append(rep.Instances, v)
	}
	return rep, nil
}

// verifyInstance compares one instance under its lock, so no ingest changes
// either side while it looks.
func (s *Service) verifyInstance(ctx context.Context, t verifyTarget) InstanceVerification {
	v := InstanceVerification{InstanceID: t.ID.String(), Name: t.Name}
	fail := func(err error) InstanceVerification {
		v.Status, v.Error = VerifyError, err.Error()
		return v
	}
	skip := func(reason string) InstanceVerification {
		v.Status, v.SkipReason = VerifySkipped, reason
		return v
	}

	lock, err := tryLockInstance(ctx, s.db, t.ID)
	if err != nil {
		return fail(err)
	}
	if lock == nil {
		return skip(VerifySkipLocked)
	}
	defer s.release(ctx, lock, t.ID)

	st, err := s.loadState(ctx, t.ID)
	if err != nil {
		return fail(err)
	}
	switch {
	case st.Gen < 1:
		return skip(VerifySkipNoManifest)
	case st.Dirty != nil:
		return skip(VerifySkipDirty)
	}
	m, err := s.loadManifest(ctx, t.ID)
	if err != nil {
		return fail(err)
	}
	held, err := s.ownedKeys(ctx, t.ID)
	if err != nil {
		return fail(err)
	}

	var missing, extra []string
	for k := range m.objects {
		if _, ok := held[k]; !ok {
			missing = append(missing, k)
		}
	}
	for k := range held {
		if _, ok := m.objects[k]; !ok {
			extra = append(extra, k)
		}
	}
	sort.Strings(missing)
	sort.Strings(extra)
	v.Manifest, v.InMemory, v.Missing, v.Extra = len(m.objects), len(held), len(missing), len(extra)
	v.MissingSample, v.ExtraSample = sample(missing), sample(extra)
	v.Status = VerifyOK
	if len(missing) > 0 {
		v.Status = VerifyMismatch
	}
	return v
}

func sample(keys []string) []string {
	if len(keys) > sweepSampleSize {
		keys = keys[:sweepSampleSize]
	}
	return keys
}

// ownedKeys pages through the objects carrying the instance's owner label and
// returns the keys of those that really are the instance's: the label and the
// instance_id property agree (see ownerOf).
func (s *Service) ownedKeys(ctx context.Context, id uuid.UUID) (map[string]struct{}, error) {
	keys := map[string]struct{}{}
	cursor := ""
	for range maxListPages {
		page, err := s.client.ListObjects(ctx, memory.ListObjectsOptions{Label: ownerLabel(id), Cursor: cursor, Limit: 200})
		if err != nil {
			return nil, fmt.Errorf("list objects of %s: %w", id, err)
		}
		for i := range page.Items {
			o := &page.Items[i]
			if owner, ok := ownerOf(o); ok && owner == id.String() {
				keys[o.Key] = struct{}{}
			}
		}
		if page.NextCursor == "" {
			return keys, nil
		}
		cursor = page.NextCursor
	}
	return nil, fmt.Errorf("list objects of %s: more than %d pages", id, maxListPages)
}

// verifyDue reports whether the instance has not been compared within
// verifyInterval.
func (s *Service) verifyDue(id uuid.UUID) bool {
	s.verifiedMu.Lock()
	defer s.verifiedMu.Unlock()
	last, ok := s.verifiedAt[id]
	return !ok || time.Since(last) >= verifyInterval
}

func (s *Service) markVerified(id uuid.UUID) {
	s.verifiedMu.Lock()
	defer s.verifiedMu.Unlock()
	if s.verifiedAt == nil {
		s.verifiedAt = map[uuid.UUID]time.Time{}
	}
	s.verifiedAt[id] = time.Now()
}

// healMissingObjects is the heartbeat's share of VerifyInstances. Each instance
// not in skip is compared at most once per verifyInterval, the first time soon
// after a start; one with missing objects is queued for a full ingest. The
// stored content hash is cleared first, as an unchanged instance would
// otherwise be skipped.
func (s *Service) healMissingObjects(ctx context.Context, skip map[uuid.UUID]bool) {
	targets, err := s.verifyTargets(ctx)
	if err != nil {
		slog.WarnContext(ctx, "ingest: drift check: verify query failed", "err", err)
		return
	}
	for _, t := range targets {
		if ctx.Err() != nil {
			return
		}
		if skip[t.ID] || !s.verifyDue(t.ID) {
			continue
		}
		v := s.verifyInstance(ctx, t)
		switch v.Status {
		case VerifyError:
			slog.WarnContext(ctx, "ingest: drift check: could not compare instance with Memory",
				"instance_id", v.InstanceID, "err", v.Error)
		case VerifyMismatch:
			slog.WarnContext(ctx, "ingest: instance is missing objects in Memory, re-queuing a full ingest",
				"instance_id", v.InstanceID, "manifest", v.Manifest, "in_memory", v.InMemory,
				"missing", v.Missing, "sample", v.MissingSample)
			s.forceNextIngest(ctx, t.ID)
			s.EnqueueInstance(t.ID)
			s.markVerified(t.ID)
		case VerifyOK:
			s.markVerified(t.ID)
		}
	}
}
