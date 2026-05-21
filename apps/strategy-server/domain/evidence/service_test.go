package evidence_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/evidence"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func seedOrg(t *testing.T, db *bun.DB) uuid.UUID {
	t.Helper()
	orgID := uuid.New()
	_, err := db.ExecContext(context.Background(),
		"INSERT INTO orgs (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())",
		orgID, "Test Org", "test-ev-"+orgID.String()[:8])
	if err != nil {
		t.Fatalf("seed org: %v", err)
	}
	return orgID
}

func seedInstance(t *testing.T, db *bun.DB) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	orgID := seedOrg(t, db)

	wsID := uuid.New()
	_, err := db.NewInsert().Model(&domain.Workspace{
		ID:          wsID,
		GithubOwner: "test-ev-" + wsID.String()[:8],
		OrgID:       orgID,
	}).Exec(ctx)
	if err != nil {
		t.Fatalf("seed workspace: %v", err)
	}

	instID := uuid.New()
	_, err = db.NewInsert().Model(&domain.StrategyInstance{
		ID:          instID,
		WorkspaceID: wsID,
		Name:        "ev-test-instance",
		Status:      domain.InstanceStatusActive,
	}).Exec(ctx)
	if err != nil {
		t.Fatalf("seed instance: %v", err)
	}
	return instID
}

// ---------------------------------------------------------------------------
// TestIngest_BasicItem
// ---------------------------------------------------------------------------

// TestIngest_BasicItem verifies that an evidence item is stored and retrievable.
func TestIngest_BasicItem(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	svc := evidence.NewService(db)

	key, err := svc.Ingest(ctx, evidence.IngestRequest{
		InstanceID:  instID,
		Source:      evidence.Source{Name: "Q1 NPS Survey", Type: "survey"},
		CollectedAt: time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC),
		Content:     map[string]any{"nps_score": 42},
		Summary:     "Net promoter score improved to 42",
		Tags:        []string{"metric", "user-feedback"},
	})
	if err != nil {
		t.Fatalf("Ingest: %v", err)
	}
	if key == "" {
		t.Fatal("expected non-empty artifact key")
	}

	// Retrieve and verify.
	item, err := svc.Get(ctx, instID, key)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if item.Source.Name != "Q1 NPS Survey" {
		t.Errorf("source.name = %q, want %q", item.Source.Name, "Q1 NPS Survey")
	}
	if item.Summary != "Net promoter score improved to 42" {
		t.Errorf("summary = %q, want %q", item.Summary, "Net promoter score improved to 42")
	}
	if item.ProcessingStatus != "unprocessed" {
		t.Errorf("processing_status = %q, want %q", item.ProcessingStatus, "unprocessed")
	}
	if len(item.Tags) != 2 {
		t.Errorf("tags count = %d, want 2", len(item.Tags))
	}
}

// ---------------------------------------------------------------------------
// TestIngest_RequiresSourceName
// ---------------------------------------------------------------------------

// TestIngest_RequiresSourceName verifies that source.name is required.
func TestIngest_RequiresSourceName(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	svc := evidence.NewService(db)

	_, err := svc.Ingest(ctx, evidence.IngestRequest{
		InstanceID: instID,
		Source:     evidence.Source{Name: "", Type: "survey"},
		Content:    "some data",
	})
	if err == nil {
		t.Fatal("expected error for missing source.name")
	}
}

// ---------------------------------------------------------------------------
// TestList_FiltersWork
// ---------------------------------------------------------------------------

// TestList_FiltersWork seeds multiple evidence items and verifies that filters
// narrow the result correctly.
func TestList_FiltersWork(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	svc := evidence.NewService(db)

	// Seed 3 items with different tags and source names.
	_, _ = svc.Ingest(ctx, evidence.IngestRequest{
		InstanceID: instID,
		Source:     evidence.Source{Name: "Sales Call A", Type: "sales_call"},
		Content:    "deal notes",
		Tags:       []string{"sales", "competitive"},
	})
	_, _ = svc.Ingest(ctx, evidence.IngestRequest{
		InstanceID: instID,
		Source:     evidence.Source{Name: "Analytics Export", Type: "analytics"},
		Content:    "funnel metrics",
		Tags:       []string{"metric"},
	})
	_, _ = svc.Ingest(ctx, evidence.IngestRequest{
		InstanceID: instID,
		Source:     evidence.Source{Name: "Sales Call B", Type: "sales_call"},
		Content:    "more deal notes",
		Tags:       []string{"sales"},
	})

	// -- Tag filter (OR) --
	items, err := svc.List(ctx, instID, evidence.ListFilters{Tags: []string{"competitive"}})
	if err != nil {
		t.Fatalf("List with tag filter: %v", err)
	}
	if len(items) != 1 {
		t.Errorf("expected 1 item with 'competitive' tag, got %d", len(items))
	}

	// -- Source name filter --
	items, err = svc.List(ctx, instID, evidence.ListFilters{SourceName: "Analytics Export"})
	if err != nil {
		t.Fatalf("List with source filter: %v", err)
	}
	if len(items) != 1 {
		t.Errorf("expected 1 item from 'Analytics Export', got %d", len(items))
	}

	// -- Processing status filter --
	items, err = svc.List(ctx, instID, evidence.ListFilters{ProcessingStatus: "unprocessed"})
	if err != nil {
		t.Fatalf("List with status filter: %v", err)
	}
	if len(items) != 3 {
		t.Errorf("expected 3 unprocessed items, got %d", len(items))
	}

	// -- No filters — all 3 returned --
	items, err = svc.List(ctx, instID, evidence.ListFilters{})
	if err != nil {
		t.Fatalf("List without filters: %v", err)
	}
	if len(items) != 3 {
		t.Errorf("expected 3 total items, got %d", len(items))
	}
}

// ---------------------------------------------------------------------------
// TestLink_CreatesRelationship
// ---------------------------------------------------------------------------

// TestLink_CreatesRelationship verifies that Link creates a strategy_relationship row.
func TestLink_CreatesRelationship(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	svc := evidence.NewService(db)

	key, _ := svc.Ingest(ctx, evidence.IngestRequest{
		InstanceID: instID,
		Source:     evidence.Source{Name: "User Interview", Type: "interview"},
		Content:    "pain points discovered",
	})

	if err := svc.Link(ctx, instID, key, "fd-001", "supports"); err != nil {
		t.Fatalf("Link: %v", err)
	}

	// Verify the relationship was stored.
	var count int
	err := db.NewSelect().
		TableExpr("strategy_relationships").
		ColumnExpr("COUNT(*)").
		Where("instance_id = ?", instID).
		Where("source_key = ?", key).
		Where("target_key = ?", "fd-001").
		Where("relationship = ?", "supports").
		Scan(ctx, &count)
	if err != nil {
		t.Fatalf("count relationship: %v", err)
	}
	if count != 1 {
		t.Errorf("expected 1 relationship, got %d", count)
	}

	// Verify idempotency — second link should not duplicate.
	_ = svc.Link(ctx, instID, key, "fd-001", "supports")
	_ = db.NewSelect().
		TableExpr("strategy_relationships").
		ColumnExpr("COUNT(*)").
		Where("instance_id = ?", instID).
		Where("source_key = ?", key).
		Where("target_key = ?", "fd-001").
		Scan(ctx, &count)
	if count != 1 {
		t.Errorf("expected 1 relationship after idempotent insert, got %d", count)
	}
}

// ---------------------------------------------------------------------------
// TestMarkProcessed_SetsStatus
// ---------------------------------------------------------------------------

// TestMarkProcessed_SetsStatus verifies that MarkProcessed transitions items to 'processed'.
func TestMarkProcessed_SetsStatus(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	svc := evidence.NewService(db)

	key1, _ := svc.Ingest(ctx, evidence.IngestRequest{
		InstanceID: instID,
		Source:     evidence.Source{Name: "Interview A", Type: "interview"},
		Content:    "notes",
	})
	key2, _ := svc.Ingest(ctx, evidence.IngestRequest{
		InstanceID: instID,
		Source:     evidence.Source{Name: "Interview B", Type: "interview"},
		Content:    "more notes",
	})

	if err := svc.MarkProcessed(ctx, instID, []string{key1, key2}, "assessment-2026-q1"); err != nil {
		t.Fatalf("MarkProcessed: %v", err)
	}

	// Verify both items are processed.
	items, _ := svc.List(ctx, instID, evidence.ListFilters{ProcessingStatus: "processed"})
	if len(items) != 2 {
		t.Errorf("expected 2 processed items, got %d", len(items))
	}

	// Unprocessed list should be empty.
	items, _ = svc.List(ctx, instID, evidence.ListFilters{ProcessingStatus: "unprocessed"})
	if len(items) != 0 {
		t.Errorf("expected 0 unprocessed items after MarkProcessed, got %d", len(items))
	}
}

// ---------------------------------------------------------------------------
// TestUpdate_ModifiesFields
// ---------------------------------------------------------------------------

// TestUpdate_ModifiesFields verifies that Update changes the summary and tags.
func TestUpdate_ModifiesFields(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	svc := evidence.NewService(db)

	key, _ := svc.Ingest(ctx, evidence.IngestRequest{
		InstanceID: instID,
		Source:     evidence.Source{Name: "Competitor Analysis", Type: "research"},
		Content:    "raw data",
		Tags:       []string{"competitive"},
	})

	newSummary := "Acme launched new feature — direct competitor to fd-003"
	err := svc.Update(ctx, instID, key, evidence.UpdateRequest{
		Summary: &newSummary,
		Tags:    []string{"competitive", "market"},
	})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}

	item, _ := svc.Get(ctx, instID, key)
	if item.Summary != newSummary {
		t.Errorf("summary = %q, want %q", item.Summary, newSummary)
	}
	if len(item.Tags) != 2 {
		t.Errorf("tags count = %d, want 2", len(item.Tags))
	}
}

// ---------------------------------------------------------------------------
// TestCountUnprocessed
// ---------------------------------------------------------------------------

// TestCountUnprocessed verifies counting with and without tag filters.
func TestCountUnprocessed(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	svc := evidence.NewService(db)

	_, _ = svc.Ingest(ctx, evidence.IngestRequest{
		InstanceID: instID,
		Source:     evidence.Source{Name: "A", Type: "t"},
		Content:    "x",
		Tags:       []string{"sales"},
	})
	_, _ = svc.Ingest(ctx, evidence.IngestRequest{
		InstanceID: instID,
		Source:     evidence.Source{Name: "B", Type: "t"},
		Content:    "y",
		Tags:       []string{"metric"},
	})
	k3, _ := svc.Ingest(ctx, evidence.IngestRequest{
		InstanceID: instID,
		Source:     evidence.Source{Name: "C", Type: "t"},
		Content:    "z",
		Tags:       []string{"sales", "competitive"},
	})

	// All 3 unprocessed.
	count, err := svc.CountUnprocessed(ctx, instID, nil)
	if err != nil {
		t.Fatalf("CountUnprocessed: %v", err)
	}
	if count != 3 {
		t.Errorf("count = %d, want 3", count)
	}

	// Only "sales" tagged items: 2.
	count, _ = svc.CountUnprocessed(ctx, instID, []string{"sales"})
	if count != 2 {
		t.Errorf("count with sales filter = %d, want 2", count)
	}

	// Mark one processed — now 2 unprocessed total.
	_ = svc.MarkProcessed(ctx, instID, []string{k3}, "assessment-test")
	count, _ = svc.CountUnprocessed(ctx, instID, nil)
	if count != 2 {
		t.Errorf("count after MarkProcessed = %d, want 2", count)
	}
}

// ---------------------------------------------------------------------------
// TestList_NoEvidence_BackwardCompatible
// ---------------------------------------------------------------------------

// TestList_NoEvidence_BackwardCompatible verifies that an instance with no
// evidence items returns an empty slice without error.
func TestList_NoEvidence_BackwardCompatible(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	svc := evidence.NewService(db)

	items, err := svc.List(ctx, instID, evidence.ListFilters{})
	if err != nil {
		t.Fatalf("List on empty instance: %v", err)
	}
	if len(items) != 0 {
		t.Errorf("expected empty/nil items, got %v", items)
	}
}

// ---------------------------------------------------------------------------
// TestGet_NotFound
// ---------------------------------------------------------------------------

// TestGet_NotFound verifies that Get returns ErrNotFound for a missing key.
func TestGet_NotFound(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	svc := evidence.NewService(db)

	_, err := svc.Get(ctx, instID, "ev-does-not-exist")
	if err == nil {
		t.Fatal("expected error for missing evidence key")
	}
}

// ---------------------------------------------------------------------------
// TestEvidenceTrigger_FiresWhenThresholdMet
// ---------------------------------------------------------------------------

// TestEvidenceTrigger_FiresWhenThresholdMet verifies CountUnprocessed can be
// used as a trigger threshold check — returns >= threshold when enough items exist.
func TestEvidenceTrigger_FiresWhenThresholdMet(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	svc := evidence.NewService(db)

	threshold := 3

	// Ingest items below threshold — trigger should NOT fire.
	for i := 0; i < threshold-1; i++ {
		_, _ = svc.Ingest(ctx, evidence.IngestRequest{
			InstanceID: instID,
			Source:     evidence.Source{Name: "Source", Type: "interview"},
			Content:    "data",
		})
	}
	count, err := svc.CountUnprocessed(ctx, instID, nil)
	if err != nil {
		t.Fatalf("CountUnprocessed: %v", err)
	}
	if count >= threshold {
		t.Errorf("expected count < %d (trigger not firing), got %d", threshold, count)
	}

	// Ingest one more to meet threshold — trigger should fire.
	_, _ = svc.Ingest(ctx, evidence.IngestRequest{
		InstanceID: instID,
		Source:     evidence.Source{Name: "Final", Type: "interview"},
		Content:    "more data",
	})
	count, err = svc.CountUnprocessed(ctx, instID, nil)
	if err != nil {
		t.Fatalf("CountUnprocessed: %v", err)
	}
	if count < threshold {
		t.Errorf("expected count >= %d (trigger fires), got %d", threshold, count)
	}
}

// TestEvidenceTrigger_TagFilter verifies that CountUnprocessed with tag filter
// only counts items whose tags overlap with the filter.
func TestEvidenceTrigger_TagFilter(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	svc := evidence.NewService(db)

	_, _ = svc.Ingest(ctx, evidence.IngestRequest{
		InstanceID: instID, Source: evidence.Source{Name: "A", Type: "t"},
		Content: "x", Tags: []string{"sales"},
	})
	_, _ = svc.Ingest(ctx, evidence.IngestRequest{
		InstanceID: instID, Source: evidence.Source{Name: "B", Type: "t"},
		Content: "y", Tags: []string{"engineering"},
	})
	_, _ = svc.Ingest(ctx, evidence.IngestRequest{
		InstanceID: instID, Source: evidence.Source{Name: "C", Type: "t"},
		Content: "z", Tags: []string{"sales", "metric"},
	})

	// Count all: 3.
	all, _ := svc.CountUnprocessed(ctx, instID, nil)
	if all != 3 {
		t.Errorf("total unprocessed = %d, want 3", all)
	}

	// Tag filter "sales": items A and C = 2.
	salesCount, _ := svc.CountUnprocessed(ctx, instID, []string{"sales"})
	if salesCount != 2 {
		t.Errorf("sales-tagged count = %d, want 2", salesCount)
	}

	// Tag filter "metric": item C only = 1.
	metricCount, _ := svc.CountUnprocessed(ctx, instID, []string{"metric"})
	if metricCount != 1 {
		t.Errorf("metric-tagged count = %d, want 1", metricCount)
	}

	// Tag filter "engineering" OR "metric": B + C = 2.
	mixedCount, _ := svc.CountUnprocessed(ctx, instID, []string{"engineering", "metric"})
	if mixedCount != 2 {
		t.Errorf("engineering|metric count = %d, want 2", mixedCount)
	}

	// Tag filter that matches nothing: 0.
	zeroCount, _ := svc.CountUnprocessed(ctx, instID, []string{"nonexistent"})
	if zeroCount != 0 {
		t.Errorf("nonexistent tag count = %d, want 0", zeroCount)
	}
}

// TestBackwardCompatibility_NoEvidence verifies that instances with no evidence
// behave identically to before the evidence feature was added.
func TestBackwardCompatibility_NoEvidence(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	svc := evidence.NewService(db)

	// All operations should succeed silently with zero/empty results.
	count, err := svc.CountUnprocessed(ctx, instID, nil)
	if err != nil {
		t.Fatalf("CountUnprocessed on empty instance: %v", err)
	}
	if count != 0 {
		t.Errorf("expected 0 unprocessed, got %d", count)
	}

	count, err = svc.CountUnprocessed(ctx, instID, []string{"sales", "metric"})
	if err != nil {
		t.Fatalf("CountUnprocessed with tag filter on empty instance: %v", err)
	}
	if count != 0 {
		t.Errorf("expected 0 with tag filter, got %d", count)
	}

	items, err := svc.List(ctx, instID, evidence.ListFilters{ProcessingStatus: "unprocessed"})
	if err != nil {
		t.Fatalf("List on empty instance: %v", err)
	}
	if len(items) != 0 {
		t.Errorf("expected 0 items on empty instance, got %d", len(items))
	}

	// MarkProcessed on empty key list should be a no-op.
	if err := svc.MarkProcessed(ctx, instID, nil, "test"); err != nil {
		t.Errorf("MarkProcessed(nil) should be no-op: %v", err)
	}
	if err := svc.MarkProcessed(ctx, instID, []string{}, "test"); err != nil {
		t.Errorf("MarkProcessed([]) should be no-op: %v", err)
	}
}

// ---------------------------------------------------------------------------
// TestList_LinkedArtifactFilter
// ---------------------------------------------------------------------------

// TestList_LinkedArtifactFilter verifies filtering by linked_artifact.
func TestList_LinkedArtifactFilter(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	svc := evidence.NewService(db)

	_, _ = svc.Ingest(ctx, evidence.IngestRequest{
		InstanceID:      instID,
		Source:          evidence.Source{Name: "Interview", Type: "interview"},
		Content:         "pain points",
		LinkedArtifacts: []string{"fd-042"},
	})
	_, _ = svc.Ingest(ctx, evidence.IngestRequest{
		InstanceID: instID,
		Source:     evidence.Source{Name: "Survey", Type: "survey"},
		Content:    "general feedback",
		// No linked artifacts.
	})

	items, err := svc.List(ctx, instID, evidence.ListFilters{LinkedArtifact: "fd-042"})
	if err != nil {
		t.Fatalf("List with linked_artifact filter: %v", err)
	}
	if len(items) != 1 {
		t.Errorf("expected 1 item linked to fd-042, got %d", len(items))
	}
}
