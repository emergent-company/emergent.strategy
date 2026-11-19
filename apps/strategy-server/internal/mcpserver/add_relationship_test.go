package mcpserver_test

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"

	versiondom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/version"
)

type relEdge struct {
	SourceKey    string `json:"source_key"`
	TargetKey    string `json:"target_key"`
	Relationship string `json:"relationship"`
}

// relationshipsOf runs list_relationships for an artifact key. It uses call ids
// from base upward so a test can issue several without clashing.
func relationshipsOf(t *testing.T, c *mcpClient, instID uuid.UUID, id int, key string) []relEdge {
	t.Helper()
	var rels []relEdge
	c.call(id, "list_relationships", map[string]any{
		"instance_id": instID.String(), "artifact_key": key,
	}).assertOK().decode(&rels)
	return rels
}

func stageAndCommitFeature(t *testing.T, c *mcpClient, instID uuid.UUID, id int, tool, key, name string) {
	t.Helper()
	raw, _ := json.Marshal(map[string]any{"id": key[:6], "name": name, "status": "ready"})
	var sr struct {
		BatchID string `json:"batch_id"`
	}
	c.call(id, tool, map[string]any{
		"instance_id": instID.String(), "feature_key": key, "payload": string(raw),
	}).assertOK().decode(&sr)
	c.call(id+1, "commit_batch", map[string]any{"batch_id": sr.BatchID}).assertOK()
}

func addRelationship(t *testing.T, c *mcpClient, instID uuid.UUID, id int, source, target string) {
	t.Helper()
	var staged struct {
		BatchID string `json:"batch_id"`
	}
	c.call(id, "add_relationship", map[string]any{
		"instance_id": instID.String(), "source_key": source,
		"target_key": target, "relationship": "depends_on",
	}).assertOK().decode(&staged)
	c.call(id+1, "commit_batch", map[string]any{"batch_id": staged.BatchID}).assertOK()
}

func TestMCP_AddRelationship_PersistsTheEdgeOnTheRealSourceAfterCommit(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	_, instID := seedInstance(t, svc, "ar-owner-"+uuid.New().String()[:8], map[string]any{})

	stageAndCommitFeature(t, c, instID, 1, "create_feature", "fd-014_directory", "Directory")
	stageAndCommitFeature(t, c, instID, 3, "create_feature", "fd-015_reports", "Reports")
	addRelationship(t, c, instID, 5, "fd-015_reports", "fd-014_directory")

	rels := relationshipsOf(t, c, instID, 7, "fd-015_reports")
	if len(rels) != 1 || rels[0].SourceKey != "fd-015_reports" || rels[0].TargetKey != "fd-014_directory" || rels[0].Relationship != "depends_on" {
		t.Fatalf("relationships of fd-015_reports after add_relationship + commit = %+v, want one depends_on edge from fd-015_reports to fd-014_directory", rels)
	}

	var vr struct {
		RelationshipsChecked int `json:"relationships_checked"`
		BrokenCount          int `json:"broken_count"`
	}
	c.call(8, "validate_relationships", map[string]any{"instance_id": instID.String()}).assertOK().decode(&vr)
	if vr.RelationshipsChecked == 0 || vr.BrokenCount != 0 {
		t.Errorf("validate_relationships checked=%d broken=%d, want the new edge checked and resolving", vr.RelationshipsChecked, vr.BrokenCount)
	}
}

func TestMCP_AddRelationship_ResolvesAShortSourceIDAndRejectsAnUnknownOne(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	_, instID := seedInstance(t, svc, "ar-owner-"+uuid.New().String()[:8], map[string]any{})

	stageAndCommitFeature(t, c, instID, 1, "create_feature", "fd-014_directory", "Directory")
	stageAndCommitFeature(t, c, instID, 3, "create_feature", "fd-015_reports", "Reports")

	addRelationship(t, c, instID, 5, "fd-015", "fd-014_directory") // short id of the source

	rels := relationshipsOf(t, c, instID, 7, "fd-015_reports")
	if len(rels) != 1 || rels[0].SourceKey != "fd-015_reports" {
		t.Errorf("a short source id must be stored on the full artifact key: %+v", rels)
	}

	c.call(8, "add_relationship", map[string]any{
		"instance_id": instID.String(), "source_key": "fd-999",
		"target_key": "fd-014_directory", "relationship": "depends_on",
	}).assertError()
}

func TestMCP_AddRelationship_SurvivesTheSourceBeingUpdatedAndARestore(t *testing.T) {
	svc := buildSvc(t)
	svc.Version = versiondom.NewService(svc.Strategy.DB())
	c := newMCPClient(t, svc)
	_, instID := seedInstance(t, svc, "ar-owner-"+uuid.New().String()[:8], map[string]any{})

	stageAndCommitFeature(t, c, instID, 1, "create_feature", "fd-014_directory", "Directory")
	stageAndCommitFeature(t, c, instID, 3, "create_feature", "fd-015_reports", "Reports")
	addRelationship(t, c, instID, 5, "fd-015_reports", "fd-014_directory")

	stageAndCommitFeature(t, c, instID, 7, "update_feature", "fd-015_reports", "Reports, revised")
	if rels := relationshipsOf(t, c, instID, 9, "fd-015_reports"); len(rels) != 1 {
		t.Fatalf("the edge must survive its source being updated: %+v", rels)
	}

	var ver struct {
		ID string `json:"id"`
	}
	c.call(10, "publish_version", map[string]any{"instance_id": instID.String()}).assertOK().decode(&ver)
	c.call(11, "restore_version", map[string]any{
		"instance_id": instID.String(), "version_id": ver.ID,
	}).assertOK()

	// After a restore the edge must still be recognised as explicit, or the next
	// commit of its source would delete it.
	stageAndCommitFeature(t, c, instID, 12, "update_feature", "fd-015_reports", "Reports, revised again")
	if rels := relationshipsOf(t, c, instID, 14, "fd-015_reports"); len(rels) != 1 {
		t.Fatalf("the edge must survive a restore and a later update of its source: %+v", rels)
	}
}
