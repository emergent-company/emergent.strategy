package ingest

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

func classified(class, ref string) domain.StrategyArtifact {
	a := domain.StrategyArtifact{
		InstanceID:   uuid.New(),
		ArtifactType: "definition",
		ArtifactKey:  "sd-001",
		Status:       "active",
		Payload:      json.RawMessage(`{"name":"A definition"}`),
	}
	if class != "" {
		a.IntegrityClass = &class
		a.IntegrityRef = &ref
	}
	return a
}

func hasLabel(labels []string, want string) bool {
	for _, l := range labels {
		if l == want {
			return true
		}
	}
	return false
}

func TestArtifactToSubgraphObject_StampsIntegrityClass(t *testing.T) {
	obj := artifactToSubgraphObject(classified("canonical_reference", "definitions/x.yaml@2.31.0"), "")
	if obj.Properties["integrity_class"] != "canonical_reference" {
		t.Errorf("integrity_class = %v", obj.Properties["integrity_class"])
	}
	if obj.Properties["integrity_ref"] != "definitions/x.yaml@2.31.0" {
		t.Errorf("integrity_ref = %v", obj.Properties["integrity_ref"])
	}
	if !hasLabel(obj.Labels, "integrity:canonical_reference") || !hasLabel(obj.Labels, "layer:artifact") {
		t.Errorf("labels = %v", obj.Labels)
	}
}

func TestArtifactToSubgraphObject_AuthoredContentIsNotStamped(t *testing.T) {
	obj := artifactToSubgraphObject(classified("", ""), "")
	if _, ok := obj.Properties["integrity_class"]; ok {
		t.Error("authored content must carry no integrity_class")
	}
	for _, l := range obj.Labels {
		if len(l) > 10 && l[:10] == "integrity:" {
			t.Errorf("authored content has label %q", l)
		}
	}
}
