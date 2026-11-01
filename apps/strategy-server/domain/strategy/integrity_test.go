package strategy_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
	"gopkg.in/yaml.v3"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/changemark/changemarktest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/integrity"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/integrity/integritytest"
)

func embeddedPayload(t *testing.T, fragment string) map[string]any {
	t.Helper()
	return integritytest.Payload(t, fragment)
}

func seedIntegrityInstance(t *testing.T, db *bun.DB) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	orgID := seedTestOrg(t, db)
	wsID := uuid.New()
	if _, err := db.NewInsert().Model(&domain.Workspace{
		ID: wsID, GithubOwner: "integrity-" + wsID.String()[:8], OrgID: orgID,
	}).Exec(ctx); err != nil {
		t.Fatalf("seed workspace: %v", err)
	}
	instID := uuid.New()
	if _, err := db.NewInsert().Model(&domain.StrategyInstance{
		ID: instID, WorkspaceID: wsID, Name: "integrity", Status: domain.InstanceStatusActive,
	}).Exec(ctx); err != nil {
		t.Fatalf("seed instance: %v", err)
	}
	return instID
}

func commitAuto(t *testing.T, svc *strategy.Service, inst uuid.UUID, typ, key, action string, payload any) {
	t.Helper()
	if _, err := svc.CommitAuto(context.Background(), strategy.CommitAutoParams{
		InstanceID: inst, ArtifactType: typ, ArtifactKey: key, Action: action, Payload: payload,
	}); err != nil {
		t.Fatalf("CommitAuto %s: %v", key, err)
	}
}

func artifactRow(t *testing.T, db *bun.DB, inst uuid.UUID, key string) domain.StrategyArtifact {
	t.Helper()
	var a domain.StrategyArtifact
	if err := db.NewSelect().Model(&a).
		Where("instance_id = ? AND artifact_key = ?", inst, key).
		Scan(context.Background()); err != nil {
		t.Fatalf("select artifact %s: %v", key, err)
	}
	return a
}

func TestDeriveIndex_ClassifiesCanonicalContent(t *testing.T) {
	db := database.TestDB(t)
	svc := strategy.NewService(db)
	inst := seedIntegrityInstance(t, db)

	commitAuto(t, svc, inst, "definition", "sd-canonical", domain.MutationActionCreate,
		embeddedPayload(t, "FIRE/definitions/strategy/"))
	commitAuto(t, svc, inst, "north_star", "north_star", domain.MutationActionCreate,
		map[string]any{"north_star": map[string]any{"organization": "Acme", "vision": map[string]any{"statement": "Fair widgets"}}})

	def := artifactRow(t, db, inst, "sd-canonical")
	if def.IntegrityClass == nil || *def.IntegrityClass != string(integrity.ClassCanonicalReference) {
		t.Fatalf("canonical definition class = %v, want %s", deref(def.IntegrityClass), integrity.ClassCanonicalReference)
	}
	if def.IntegrityRef == nil || !strings.Contains(*def.IntegrityRef, "@") {
		t.Errorf("integrity_ref = %v, want path@release", deref(def.IntegrityRef))
	}
	if def.IntegrityCheckedWith == nil || *def.IntegrityCheckedWith == "" {
		t.Error("integrity_checked_with must record which manifest classified the row")
	}

	authored := artifactRow(t, db, inst, "north_star")
	if authored.IntegrityClass != nil {
		t.Errorf("authored artifact class = %v, want NULL", *authored.IntegrityClass)
	}
	if authored.IntegrityCheckedWith == nil {
		t.Error("an authored artifact must still record that it was checked, to tell it from never classified")
	}
}

func TestDeriveIndex_EditingCanonicalContentClearsTheClass(t *testing.T) {
	db := database.TestDB(t)
	svc := strategy.NewService(db)
	inst := seedIntegrityInstance(t, db)

	payload := embeddedPayload(t, "FIRE/definitions/strategy/")
	commitAuto(t, svc, inst, "definition", "sd-edited", domain.MutationActionCreate, payload)
	if artifactRow(t, db, inst, "sd-edited").IntegrityClass == nil {
		t.Fatal("precondition: the unmodified definition should be classified")
	}

	payload["company_specific_policy"] = "we decided this ourselves"
	commitAuto(t, svc, inst, "definition", "sd-edited", domain.MutationActionUpdate, payload)

	if got := artifactRow(t, db, inst, "sd-edited").IntegrityClass; got != nil {
		t.Errorf("edited definition still classified as %s", *got)
	}
}

func TestDeriveIndex_ArchiveKeepsClass(t *testing.T) {
	db := database.TestDB(t)
	svc := strategy.NewService(db)
	inst := seedIntegrityInstance(t, db)

	payload := embeddedPayload(t, "FIRE/definitions/strategy/")
	commitAuto(t, svc, inst, "definition", "sd-archived", domain.MutationActionCreate, payload)
	commitAuto(t, svc, inst, "definition", "sd-archived", domain.MutationActionArchive, payload)

	row := artifactRow(t, db, inst, "sd-archived")
	if row.Status != domain.ArtifactStatusArchived {
		t.Fatalf("status = %s, want archived", row.Status)
	}
	if row.IntegrityClass == nil {
		t.Error("archiving must not drop the integrity class")
	}
}

func deref(s *string) string {
	if s == nil {
		return "<nil>"
	}
	return *s
}

// Classification of existing rows hashes a payload read back from jsonb. That
// must give the same hash as the source file for every canonical file.
func TestJSONBRoundTripPreservesHash(t *testing.T) {
	db := database.TestDB(t)
	paths, err := embedded.ListTemplates()
	if err != nil {
		t.Fatalf("ListTemplates: %v", err)
	}
	checked := 0
	for _, p := range paths {
		data, err := embedded.GetTemplate(p)
		if err != nil {
			t.Fatalf("GetTemplate: %v", err)
		}
		want, err := integrity.HashYAML(data)
		if err != nil {
			continue
		}
		var doc any
		if err := yaml.Unmarshal(data, &doc); err != nil {
			t.Fatalf("yaml %s: %v", p, err)
		}
		raw, err := json.Marshal(doc)
		if err != nil {
			continue
		}
		var back []byte
		if err := db.QueryRowContext(context.Background(), "SELECT ?::jsonb::text", string(raw)).Scan(&back); err != nil {
			t.Fatalf("jsonb round trip %s: %v", p, err)
		}
		got, err := integrity.HashJSON(back)
		if err != nil {
			t.Fatalf("hash %s: %v", p, err)
		}
		if got != want {
			t.Errorf("%s: hash after jsonb round trip differs from the source file", p)
		}
		checked++
	}
	if checked < 100 {
		t.Fatalf("only %d files checked", checked)
	}
}

func TestReclassifyIntegrity_ClassifiesExistingRowsAndIsRepeatable(t *testing.T) {
	db := database.TestDB(t)
	svc := strategy.NewService(db)
	inst := seedIntegrityInstance(t, db)

	commitAuto(t, svc, inst, "definition", "sd-old", domain.MutationActionCreate, embeddedPayload(t, "FIRE/definitions/strategy/"))
	commitAuto(t, svc, inst, "value_model", "value_model_product", domain.MutationActionCreate, embeddedPayload(t, "value_models/"))
	commitAuto(t, svc, inst, "north_star", "north_star", domain.MutationActionCreate,
		map[string]any{"north_star": map[string]any{"organization": "Acme"}})

	// Simulate rows that predate the columns.
	if _, err := db.ExecContext(context.Background(),
		"UPDATE strategy_artifacts SET integrity_class = NULL, integrity_ref = NULL, integrity_checked_with = NULL WHERE instance_id = ?", inst); err != nil {
		t.Fatalf("reset: %v", err)
	}

	n, err := svc.ReclassifyIntegrity(context.Background(), nil)
	if err != nil {
		t.Fatalf("ReclassifyIntegrity: %v", err)
	}
	if n != 3 {
		t.Errorf("reclassified %d rows, want 3", n)
	}
	if got := artifactRow(t, db, inst, "sd-old").IntegrityClass; got == nil || *got != "canonical_reference" {
		t.Errorf("definition class = %v", deref(got))
	}
	if got := artifactRow(t, db, inst, "value_model_product").IntegrityClass; got == nil || *got != "packaged_default" {
		t.Errorf("value model class = %v", deref(got))
	}
	authored := artifactRow(t, db, inst, "north_star")
	if authored.IntegrityClass != nil || authored.IntegrityCheckedWith == nil {
		t.Errorf("authored row: class=%v checked_with=%v", deref(authored.IntegrityClass), deref(authored.IntegrityCheckedWith))
	}

	// A second run finds nothing to do: every row was checked with this manifest.
	n, err = svc.ReclassifyIntegrity(context.Background(), nil)
	if err != nil {
		t.Fatalf("second ReclassifyIntegrity: %v", err)
	}
	if n != 0 {
		t.Errorf("second run reclassified %d rows, want 0", n)
	}
}

func TestReclassifyIntegrity_RecomputesWhenTheManifestChanges(t *testing.T) {
	db := database.TestDB(t)
	svc := strategy.NewService(db)
	inst := seedIntegrityInstance(t, db)
	commitAuto(t, svc, inst, "definition", "sd-x", domain.MutationActionCreate, embeddedPayload(t, "FIRE/definitions/strategy/"))

	// A classifier whose manifest knows nothing: the same row is now authored.
	empty, err := integrity.NewClassifier(
		[]byte(`{"manifest_version":1,"normalisation":"`+integrity.NormalisationVersion+`","current_release":"9.9.9","releases":["9.9.9"],"entries":{"x":{"kind":"definition","refs":["a"],"releases":["9.9.9"]}}}`),
		func() (map[string][]byte, error) { return nil, nil })
	if err != nil {
		t.Fatal(err)
	}
	svc.SetIntegrityClassifier(empty)

	n, err := svc.ReclassifyIntegrity(context.Background(), &inst)
	if err != nil {
		t.Fatalf("ReclassifyIntegrity: %v", err)
	}
	if n != 1 {
		t.Errorf("reclassified %d rows, want 1 (the manifest changed)", n)
	}
	if got := artifactRow(t, db, inst, "sd-x").IntegrityClass; got != nil {
		t.Errorf("row still classified as %s under a manifest that does not list it", *got)
	}
}

func TestReclassifyIntegrity_MarksTheInstanceWhoseClassChanged(t *testing.T) {
	db := database.TestDB(t)
	marker, rec := changemarktest.New(db)
	svc := strategy.NewService(db).WithChangeMarker(marker)
	changed := seedIntegrityInstance(t, db)
	untouched := seedIntegrityInstance(t, db)

	commitAuto(t, svc, changed, "definition", "sd-old", domain.MutationActionCreate, embeddedPayload(t, "FIRE/definitions/strategy/"))
	commitAuto(t, svc, untouched, "north_star", "north_star", domain.MutationActionCreate,
		map[string]any{"north_star": map[string]any{"organization": "Acme"}})

	// Rows that predate the columns: no class, never checked.
	if _, err := db.ExecContext(context.Background(),
		"UPDATE strategy_artifacts SET integrity_class = NULL, integrity_ref = NULL, integrity_checked_with = NULL"); err != nil {
		t.Fatalf("reset: %v", err)
	}
	changemarktest.Reset(t, db, changed)
	changemarktest.Reset(t, db, untouched)
	notifiedChanged, notifiedUntouched := rec.Count(changed), rec.Count(untouched)

	if _, err := svc.ReclassifyIntegrity(context.Background(), nil); err != nil {
		t.Fatalf("ReclassifyIntegrity: %v", err)
	}

	// The ingest hash covers key and payload only, so a changed class is
	// invisible to it: the instance has to be marked or its graph keeps the old class.
	if s := changemarktest.Load(t, db, changed); s.Dirty == nil || s.Seq < 1 {
		t.Errorf("instance whose definition became canonical_reference: dirty=%v seq=%d, want marked", s.Dirty, s.Seq)
	}
	if rec.Count(changed) <= notifiedChanged {
		t.Errorf("the ingest service was not notified about the changed instance")
	}
	if s := changemarktest.Load(t, db, untouched); s.Dirty != nil || s.Seq != 0 {
		t.Errorf("instance whose class stayed empty was marked: dirty=%v seq=%d", s.Dirty, s.Seq)
	}
	if rec.Count(untouched) != notifiedUntouched {
		t.Errorf("the ingest service was notified about an instance whose class did not change")
	}
}

func TestReclassifyIntegrity_MarksNothingWhenOnlyTheManifestVersionChanged(t *testing.T) {
	db := database.TestDB(t)
	marker, _ := changemarktest.New(db)
	svc := strategy.NewService(db).WithChangeMarker(marker)
	inst := seedIntegrityInstance(t, db)
	commitAuto(t, svc, inst, "definition", "sd-x", domain.MutationActionCreate, embeddedPayload(t, "FIRE/definitions/strategy/"))
	changemarktest.Reset(t, db, inst)

	// Same classification, different manifest version: every row is re-checked
	// and none changes class, so no re-ingest is owed.
	if _, err := db.ExecContext(context.Background(),
		"UPDATE strategy_artifacts SET integrity_checked_with = 'older-manifest' WHERE instance_id = ?", inst); err != nil {
		t.Fatal(err)
	}
	n, err := svc.ReclassifyIntegrity(context.Background(), &inst)
	if err != nil || n != 1 {
		t.Fatalf("reclassified %d rows, err %v; want 1", n, err)
	}
	if s := changemarktest.Load(t, db, inst); s.Dirty != nil || s.Seq != 0 {
		t.Errorf("marked although nothing changed: dirty=%v seq=%d", s.Dirty, s.Seq)
	}
}
