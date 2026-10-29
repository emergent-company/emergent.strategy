package integrity_test

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

// strategy-server and epf-cli each carry their own copy of the hash vectors and
// the classification cases, and each tests its own copy. If the copies drift,
// both suites pass while the two apps classify the same file differently. This
// test fails when they differ.
func TestSharedFixturesMatchEpfCli(t *testing.T) {
	for _, name := range []string{"hash-vectors.json", "classification-cases.json"} {
		mine := filepath.Join("testdata", name)
		theirs := filepath.Join("..", "..", "..", "epf-cli", "internal", "integrity", "testdata", name)
		other, err := os.ReadFile(theirs)
		if os.IsNotExist(err) {
			t.Skipf("epf-cli is not alongside this app (%s)", theirs)
		}
		if err != nil {
			t.Fatal(err)
		}
		own, err := os.ReadFile(mine)
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(own, other) {
			t.Errorf("%s differs from apps/epf-cli/internal/integrity/testdata/%s: copy one over the other so both apps run the same cases", name, name)
		}
	}
}
