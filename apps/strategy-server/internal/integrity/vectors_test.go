package integrity

import (
	"encoding/json"
	"os"
	"testing"
)

// hash-vectors.json is identical in epf-cli and strategy-server. Both apps must
// reproduce every hash, so the two normalisations cannot drift.
func TestHashVectors(t *testing.T) {
	raw, err := os.ReadFile("testdata/hash-vectors.json")
	if err != nil {
		t.Fatalf("read vectors: %v", err)
	}
	var vectors []struct {
		Name       string `json:"name"`
		YAML       string `json:"yaml"`
		StoredJSON string `json:"stored_json"`
		Hash       string `json:"hash"`
	}
	if err := json.Unmarshal(raw, &vectors); err != nil {
		t.Fatalf("parse vectors: %v", err)
	}
	if len(vectors) == 0 {
		t.Fatal("no vectors")
	}
	for _, v := range vectors {
		t.Run(v.Name, func(t *testing.T) {
			got, err := HashYAML([]byte(v.YAML))
			if err != nil {
				t.Fatalf("HashYAML: %v", err)
			}
			if got != v.Hash {
				t.Errorf("HashYAML = %s, want %s", got, v.Hash)
			}
			if v.StoredJSON != "" {
				gj, err := HashJSON([]byte(v.StoredJSON))
				if err != nil {
					t.Fatalf("HashJSON: %v", err)
				}
				if gj != v.Hash {
					t.Errorf("HashJSON = %s, want %s", gj, v.Hash)
				}
			}
		})
	}
}
