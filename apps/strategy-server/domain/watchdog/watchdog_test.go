package watchdog

import (
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func makeArtifact(artifactType, key string, updatedAt time.Time) *domain.StrategyArtifact {
	return &domain.StrategyArtifact{
		ID:           uuid.New(),
		InstanceID:   uuid.New(),
		ArtifactType: artifactType,
		ArtifactKey:  key,
		Status:       "active",
		UpdatedAt:    updatedAt,
	}
}

func makeRel(sourceKey, targetKey, rel string) *domain.StrategyRelationship {
	return &domain.StrategyRelationship{
		ID:           uuid.New(),
		SourceKey:    sourceKey,
		TargetKey:    targetKey,
		Relationship: rel,
	}
}

func newSvc() *Service {
	// nil DB — we only test pure-logic functions directly.
	return &Service{log: nil}
}

// ---------------------------------------------------------------------------
// Staleness check
// ---------------------------------------------------------------------------

func TestCheckStaleness_NotStale(t *testing.T) {
	svc := newSvc()
	recent := time.Now().Add(-10 * 24 * time.Hour) // 10 days ago
	artifacts := []*domain.StrategyArtifact{
		makeArtifact("north_star", "north_star", recent),
	}
	stale := svc.checkStaleness(artifacts)
	if len(stale) != 0 {
		t.Errorf("expected 0 stale artifacts, got %d", len(stale))
	}
}

func TestCheckStaleness_Stale(t *testing.T) {
	svc := newSvc()
	old := time.Now().Add(-100 * 24 * time.Hour) // 100 days ago — exceeds 90-day threshold
	artifacts := []*domain.StrategyArtifact{
		makeArtifact("north_star", "north_star", old),
	}
	stale := svc.checkStaleness(artifacts)
	if len(stale) != 1 {
		t.Fatalf("expected 1 stale artifact, got %d", len(stale))
	}
	if stale[0].ArtifactKey != "north_star" {
		t.Errorf("expected north_star, got %q", stale[0].ArtifactKey)
	}
	if stale[0].Threshold != 90 {
		t.Errorf("expected threshold=90, got %d", stale[0].Threshold)
	}
}

func TestCheckStaleness_SeverityWarningAtDoubleThreshold(t *testing.T) {
	svc := newSvc()
	veryOld := time.Now().Add(-200 * 24 * time.Hour) // 200 days — double the 90-day threshold
	artifacts := []*domain.StrategyArtifact{
		makeArtifact("north_star", "north_star", veryOld),
	}
	stale := svc.checkStaleness(artifacts)
	if len(stale) != 1 {
		t.Fatalf("expected 1 stale artifact, got %d", len(stale))
	}
	if stale[0].Severity != "warning" {
		t.Errorf("expected severity=warning, got %q", stale[0].Severity)
	}
}

func TestCheckStaleness_UnknownTypeSkipped(t *testing.T) {
	svc := newSvc()
	old := time.Now().Add(-365 * 24 * time.Hour)
	artifacts := []*domain.StrategyArtifact{
		makeArtifact("some_unknown_type", "sk-001", old),
	}
	stale := svc.checkStaleness(artifacts)
	if len(stale) != 0 {
		t.Errorf("unknown type should not be flagged, got %d", len(stale))
	}
}

func TestCheckStaleness_FeatureThreshold60Days(t *testing.T) {
	svc := newSvc()
	// 70 days — exceeds feature threshold of 60
	old := time.Now().Add(-70 * 24 * time.Hour)
	artifacts := []*domain.StrategyArtifact{
		makeArtifact(domain.ArtifactTypeFeature, "fd-001", old),
	}
	stale := svc.checkStaleness(artifacts)
	if len(stale) != 1 {
		t.Fatalf("expected 1 stale feature, got %d", len(stale))
	}
	if stale[0].Threshold != 60 {
		t.Errorf("expected threshold=60 for feature, got %d", stale[0].Threshold)
	}
}

// ---------------------------------------------------------------------------
// Orphan check
// ---------------------------------------------------------------------------

func TestCheckOrphans_Connected(t *testing.T) {
	svc := newSvc()
	recent := time.Now()
	artifacts := []*domain.StrategyArtifact{
		makeArtifact("north_star", "north_star", recent),
		makeArtifact("strategy_formula", "strategy_formula", recent),
	}
	rels := []*domain.StrategyRelationship{
		makeRel("north_star", "strategy_formula", "contributes_to"),
	}
	orphans := svc.checkOrphans(artifacts, rels)
	if len(orphans) != 0 {
		t.Errorf("expected 0 orphans, got %d: %v", len(orphans), orphans)
	}
}

func TestCheckOrphans_Disconnected(t *testing.T) {
	svc := newSvc()
	recent := time.Now()
	artifacts := []*domain.StrategyArtifact{
		makeArtifact("strategy_formula", "strategy_formula", recent),
	}
	orphans := svc.checkOrphans(artifacts, nil)
	if len(orphans) != 1 {
		t.Fatalf("expected 1 orphan, got %d", len(orphans))
	}
	if orphans[0].ArtifactKey != "strategy_formula" {
		t.Errorf("expected strategy_formula, got %q", orphans[0].ArtifactKey)
	}
}

func TestCheckOrphans_EvidenceSkipped(t *testing.T) {
	// Evidence artifacts are intentionally excluded from orphan detection.
	svc := newSvc()
	recent := time.Now()
	artifacts := []*domain.StrategyArtifact{
		makeArtifact("evidence", "ev-001", recent),
	}
	orphans := svc.checkOrphans(artifacts, nil)
	if len(orphans) != 0 {
		t.Errorf("evidence should be excluded from orphan check, got %d", len(orphans))
	}
}

// ---------------------------------------------------------------------------
// Coherence check
// ---------------------------------------------------------------------------

func TestCheckCoherence_UnlinkedFeature(t *testing.T) {
	svc := newSvc()
	recent := time.Now()
	artifacts := []*domain.StrategyArtifact{
		makeArtifact(domain.ArtifactTypeFeature, "fd-001", recent),
	}
	issues := svc.checkCoherence(artifacts, nil)
	if len(issues) != 1 {
		t.Fatalf("expected 1 issue, got %d", len(issues))
	}
	if issues[0].Type != IssueUnlinkedFeature {
		t.Errorf("expected %q, got %q", IssueUnlinkedFeature, issues[0].Type)
	}
	if issues[0].Severity != "warning" {
		t.Errorf("expected severity=warning, got %q", issues[0].Severity)
	}
}

func TestCheckCoherence_LinkedFeatureNoIssue(t *testing.T) {
	svc := newSvc()
	recent := time.Now()
	artifacts := []*domain.StrategyArtifact{
		makeArtifact(domain.ArtifactTypeFeature, "fd-001", recent),
	}
	rels := []*domain.StrategyRelationship{
		makeRel("fd-001", "vm-product/growth", "contributes_to"),
	}
	issues := svc.checkCoherence(artifacts, rels)
	if len(issues) != 0 {
		t.Errorf("linked feature should have no issues, got %d: %v", len(issues), issues)
	}
}

func TestCheckCoherence_StaleEvidence(t *testing.T) {
	svc := newSvc()
	old := time.Now().Add(-45 * 24 * time.Hour) // 45 days, exceeds 30-day threshold
	artifacts := []*domain.StrategyArtifact{
		makeArtifact("evidence", "ev-001", old),
	}
	issues := svc.checkCoherence(artifacts, nil)
	// Should flag the stale evidence
	found := false
	for _, iss := range issues {
		if iss.Type == IssueStaleEvidence {
			found = true
		}
	}
	if !found {
		t.Errorf("expected stale_evidence issue, got: %v", issues)
	}
}

// ---------------------------------------------------------------------------
// Ghost type check
// ---------------------------------------------------------------------------

func TestCheckGhostTypes_DetectsKnownGhosts(t *testing.T) {
	svc := newSvc()
	recent := time.Now()
	artifacts := []*domain.StrategyArtifact{
		makeArtifact("mappings", "mappings-001", recent),
		makeArtifact("north_star", "north_star", recent),
	}
	ghosts := svc.checkGhostTypes(artifacts)
	if len(ghosts) != 1 {
		t.Fatalf("expected 1 ghost type, got %d: %v", len(ghosts), ghosts)
	}
	if ghosts[0] != "mappings" {
		t.Errorf("expected mappings, got %q", ghosts[0])
	}
}

func TestCheckGhostTypes_NoGhosts(t *testing.T) {
	svc := newSvc()
	recent := time.Now()
	artifacts := []*domain.StrategyArtifact{
		makeArtifact("north_star", "north_star", recent),
		makeArtifact(domain.ArtifactTypeFeature, "fd-001", recent),
	}
	ghosts := svc.checkGhostTypes(artifacts)
	if len(ghosts) != 0 {
		t.Errorf("expected 0 ghost types, got %d: %v", len(ghosts), ghosts)
	}
}

// ---------------------------------------------------------------------------
// Summary and overall status
// ---------------------------------------------------------------------------

func TestBuildSummary_Healthy(t *testing.T) {
	report := &HealthReport{}
	summary := buildSummary(report)
	if summary.OverallStatus != "healthy" {
		t.Errorf("empty report should be healthy, got %q", summary.OverallStatus)
	}
}

func TestBuildSummary_WarningFromOrphans(t *testing.T) {
	report := &HealthReport{
		OrphanArtifacts: []OrphanArtifact{{ArtifactKey: "fd-001", ArtifactType: "feature"}},
	}
	summary := buildSummary(report)
	if summary.OverallStatus != "warning" {
		t.Errorf("orphans should set status=warning, got %q", summary.OverallStatus)
	}
	if summary.OrphanCount != 1 {
		t.Errorf("expected OrphanCount=1, got %d", summary.OrphanCount)
	}
}

func TestBuildSummary_CriticalFromCoherenceIssue(t *testing.T) {
	report := &HealthReport{
		CoherenceIssues: []CoherenceIssue{
			{Type: "custom_critical", Message: "bad", Severity: "critical"},
		},
	}
	summary := buildSummary(report)
	if summary.OverallStatus != "critical" {
		t.Errorf("critical issue should set status=critical, got %q", summary.OverallStatus)
	}
}

// ---------------------------------------------------------------------------
// Staleness threshold coverage
// ---------------------------------------------------------------------------

func TestStalenessThresholds_AllReadyArtifactsCovered(t *testing.T) {
	readyTypes := []string{
		"north_star", "strategy_foundations", "insight_analyses",
		"insight_opportunity", "strategy_formula", "roadmap_recipe",
	}
	for _, artType := range readyTypes {
		thresh, ok := stalenessThresholds[artType]
		if !ok {
			t.Errorf("stalenessThresholds missing READY artifact type %q", artType)
		}
		if thresh != 90 {
			t.Errorf("READY artifact %q threshold=%d, want 90", artType, thresh)
		}
	}
}

func TestStalenessThresholds_FeatureIs60Days(t *testing.T) {
	thresh, ok := stalenessThresholds[domain.ArtifactTypeFeature]
	if !ok {
		t.Fatal("stalenessThresholds missing feature")
	}
	if thresh != 60 {
		t.Errorf("feature threshold=%d, want 60", thresh)
	}
}
