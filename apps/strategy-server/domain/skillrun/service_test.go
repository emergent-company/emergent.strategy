package skillrun

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

func TestCreateAndGetByID(t *testing.T) {
	db := database.TestDB(t)
	svc := NewService(db)
	ctx := context.Background()

	instID := seedInstance(t, db)

	runID, err := svc.Create(ctx, CreateParams{
		InstanceID:     instID,
		SkillName:      "adapt-strategy",
		ChunkCount:     4,
		Model:          "gemini-2.5-flash",
		Trigger:        TriggerManual,
		TriggerContext: map[string]any{"source": "test"},
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if runID == uuid.Nil {
		t.Fatal("expected non-nil run ID")
	}

	run, err := svc.GetByID(ctx, runID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if run.SkillName != "adapt-strategy" {
		t.Errorf("SkillName = %q, want adapt-strategy", run.SkillName)
	}
	if run.Status != StatusRunning {
		t.Errorf("Status = %q, want running", run.Status)
	}
	if run.ChunkCount != 4 {
		t.Errorf("ChunkCount = %d, want 4", run.ChunkCount)
	}
	if run.Trigger != TriggerManual {
		t.Errorf("Trigger = %q, want manual", run.Trigger)
	}
	if run.Model != "gemini-2.5-flash" {
		t.Errorf("Model = %q, want gemini-2.5-flash", run.Model)
	}
}

func TestUpdateChunk(t *testing.T) {
	db := database.TestDB(t)
	svc := NewService(db)
	ctx := context.Background()

	instID := seedInstance(t, db)
	runID, _ := svc.Create(ctx, CreateParams{
		InstanceID: instID,
		SkillName:  "adapt-foundations",
		ChunkCount: 4,
	})

	err := svc.UpdateChunk(ctx, runID, ChunkEntry{
		Chunk:        1,
		OutputKey:    "north_star",
		ArtifactType: "north_star",
		Status:       "staged",
		StartedAt:    time.Now().UTC().Format(time.RFC3339),
		CompletedAt:  time.Now().UTC().Format(time.RFC3339),
		Attempts:     2,
		InputTokens:  4200,
		OutputTokens: 1800,
		Errors:       []string{"maxLength: got 173, want 150"},
	})
	if err != nil {
		t.Fatalf("UpdateChunk: %v", err)
	}

	run, _ := svc.GetByID(ctx, runID)
	if run.ChunksCompleted != 1 {
		t.Errorf("ChunksCompleted = %d, want 1", run.ChunksCompleted)
	}
	if run.TotalInputTokens != 4200 {
		t.Errorf("TotalInputTokens = %d, want 4200", run.TotalInputTokens)
	}
	if run.TotalOutputTokens != 1800 {
		t.Errorf("TotalOutputTokens = %d, want 1800", run.TotalOutputTokens)
	}

	// Verify chunk_log contains the entry.
	var entries []ChunkEntry
	if err := json.Unmarshal(run.ChunkLog, &entries); err != nil {
		t.Fatalf("unmarshal chunk_log: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("chunk_log has %d entries, want 1", len(entries))
	}
	if entries[0].OutputKey != "north_star" {
		t.Errorf("chunk_log[0].OutputKey = %q, want north_star", entries[0].OutputKey)
	}
	if entries[0].Attempts != 2 {
		t.Errorf("chunk_log[0].Attempts = %d, want 2", entries[0].Attempts)
	}
}

func TestCompleteAndFail(t *testing.T) {
	db := database.TestDB(t)
	svc := NewService(db)
	ctx := context.Background()

	instID := seedInstance(t, db)

	// Test Complete.
	runID, _ := svc.Create(ctx, CreateParams{
		InstanceID: instID,
		SkillName:  "adapt-strategy",
		ChunkCount: 1,
	})
	batchID := uuid.New()
	if err := svc.Complete(ctx, runID, batchID); err != nil {
		t.Fatalf("Complete: %v", err)
	}
	run, _ := svc.GetByID(ctx, runID)
	if run.Status != StatusCompleted {
		t.Errorf("Status = %q, want completed", run.Status)
	}
	if run.BatchID == nil || *run.BatchID != batchID {
		t.Errorf("BatchID = %v, want %s", run.BatchID, batchID)
	}
	if run.CompletedAt == nil {
		t.Error("CompletedAt should be set")
	}

	// Test Fail.
	runID2, _ := svc.Create(ctx, CreateParams{
		InstanceID: instID,
		SkillName:  "adapt-foundations",
		ChunkCount: 4,
	})
	if err := svc.Fail(ctx, runID2, "chunk 3 validation exhausted"); err != nil {
		t.Fatalf("Fail: %v", err)
	}
	run2, _ := svc.GetByID(ctx, runID2)
	if run2.Status != StatusFailed {
		t.Errorf("Status = %q, want failed", run2.Status)
	}
	if run2.Error == nil || *run2.Error != "chunk 3 validation exhausted" {
		t.Errorf("Error = %v, want 'chunk 3 validation exhausted'", run2.Error)
	}
}

func TestListByInstance(t *testing.T) {
	db := database.TestDB(t)
	svc := NewService(db)
	ctx := context.Background()

	instID := seedInstance(t, db)

	// Create 3 runs with different statuses.
	r1, _ := svc.Create(ctx, CreateParams{InstanceID: instID, SkillName: "adapt-strategy", ChunkCount: 4, Trigger: TriggerAIMCycle})
	r2, _ := svc.Create(ctx, CreateParams{InstanceID: instID, SkillName: "adapt-foundations", ChunkCount: 4, Trigger: TriggerRipple})
	svc.Complete(ctx, r1, uuid.New())
	svc.Fail(ctx, r2, "test error")
	svc.Create(ctx, CreateParams{InstanceID: instID, SkillName: "adapt-strategy", ChunkCount: 4, Trigger: TriggerManual})

	// List all.
	runs, err := svc.ListByInstance(ctx, instID, ListParams{})
	if err != nil {
		t.Fatalf("ListByInstance: %v", err)
	}
	if len(runs) != 3 {
		t.Errorf("got %d runs, want 3", len(runs))
	}

	// Filter by status.
	running, _ := svc.ListByInstance(ctx, instID, ListParams{Status: StatusRunning})
	if len(running) != 1 {
		t.Errorf("running: got %d, want 1", len(running))
	}

	// Filter by trigger.
	ripple, _ := svc.ListByInstance(ctx, instID, ListParams{Trigger: TriggerRipple})
	if len(ripple) != 1 {
		t.Errorf("ripple: got %d, want 1", len(ripple))
	}
}

func TestActiveForInstance(t *testing.T) {
	db := database.TestDB(t)
	svc := NewService(db)
	ctx := context.Background()

	instID := seedInstance(t, db)

	// No runs — should return nil.
	run, err := svc.ActiveForInstance(ctx, instID)
	if err != nil {
		t.Fatalf("ActiveForInstance: %v", err)
	}
	if run != nil {
		t.Error("expected nil when no runs exist")
	}

	// Create a running run.
	svc.Create(ctx, CreateParams{InstanceID: instID, SkillName: "adapt-strategy", ChunkCount: 4})

	run, err = svc.ActiveForInstance(ctx, instID)
	if err != nil {
		t.Fatalf("ActiveForInstance: %v", err)
	}
	if run == nil {
		t.Error("expected non-nil running run")
	}
}

func TestGetUsage(t *testing.T) {
	db := database.TestDB(t)
	svc := NewService(db)
	ctx := context.Background()

	instID := seedInstance(t, db)

	// Create and complete two runs with tokens.
	r1, _ := svc.Create(ctx, CreateParams{InstanceID: instID, SkillName: "adapt-strategy", ChunkCount: 1})
	svc.UpdateChunk(ctx, r1, ChunkEntry{Chunk: 1, OutputKey: "sf", Status: "staged", InputTokens: 1000, OutputTokens: 500})
	svc.Complete(ctx, r1, uuid.New())

	r2, _ := svc.Create(ctx, CreateParams{InstanceID: instID, SkillName: "adapt-foundations", ChunkCount: 1})
	svc.UpdateChunk(ctx, r2, ChunkEntry{Chunk: 1, OutputKey: "ns", Status: "staged", InputTokens: 2000, OutputTokens: 800})
	svc.Complete(ctx, r2, uuid.New())

	usage, err := svc.GetUsage(ctx, instID, nil, nil)
	if err != nil {
		t.Fatalf("GetUsage: %v", err)
	}
	if len(usage) != 2 {
		t.Fatalf("got %d usage rows, want 2", len(usage))
	}

	total := 0
	for _, u := range usage {
		total += u.InputTokens
	}
	if total != 3000 {
		t.Errorf("total input tokens = %d, want 3000", total)
	}
}

// seedInstance creates a minimal org + workspace + instance for testing.
func seedInstance(t *testing.T, db *bun.DB) uuid.UUID {
	t.Helper()
	ctx := context.Background()

	orgID := uuid.New()
	_, err := db.ExecContext(ctx,
		"INSERT INTO orgs (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())",
		orgID, "Skillrun Test Org", "sr-org-"+orgID.String()[:8])
	if err != nil {
		t.Fatalf("seed org: %v", err)
	}

	wsID := uuid.New()
	_, err = db.NewInsert().Model(&domain.Workspace{
		ID: wsID, GithubOwner: "sr-ws-" + wsID.String()[:8], OrgID: orgID,
	}).Exec(ctx)
	if err != nil {
		t.Fatalf("seed workspace: %v", err)
	}

	instID := uuid.New()
	_, err = db.NewInsert().Model(&domain.StrategyInstance{
		ID: instID, WorkspaceID: wsID, Name: "sr-test", Status: domain.InstanceStatusActive,
	}).Exec(ctx)
	if err != nil {
		t.Fatalf("seed instance: %v", err)
	}
	return instID
}
