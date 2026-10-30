package ingest_test

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ingest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/decompose"
)

// memoryKeyLimit is Memory's maximum object key length
// (CreateGraphObjectRequest.Key, max=128).
const memoryKeyLimit = 128

func TestScopedKey_PrefixesWithFirstEightCharactersOfTheInstance(t *testing.T) {
	id := uuid.MustParse("cf47ebd4-49c7-4f89-a36a-df87cc5cd8c7")
	got := ingest.ScopedKey(id, "TrackDefinition:definition:sd-027")
	if want := "cf47ebd4/TrackDefinition:definition:sd-027"; got != want {
		t.Errorf("ScopedKey = %q, want %q", got, want)
	}
}

func TestScopedKey_SameKeyInTwoInstancesDiffers(t *testing.T) {
	a := uuid.MustParse("aaaaaaaa-0000-4000-8000-000000000001")
	b := uuid.MustParse("bbbbbbbb-0000-4000-8000-000000000001")
	if ingest.ScopedKey(a, "north_star") == ingest.ScopedKey(b, "north_star") {
		t.Error("two instances produced the same Memory key for the same artifact key")
	}
}

func TestUnscopedKey_RoundTrips(t *testing.T) {
	id := uuid.New()
	for _, key := range []string{
		"north_star",
		"value_model_strategy.value_model",
		"Artifact:READY/00_north_star.yaml", // a key may itself contain '/'
		"a/b/c",
	} {
		got, ok := ingest.UnscopedKey(id, ingest.ScopedKey(id, key))
		if !ok || got != key {
			t.Errorf("UnscopedKey(ScopedKey(%q)) = %q, %v; want the key back", key, got, ok)
		}
	}
}

func TestUnscopedKey_RejectsKeysThatDoNotBelongToTheInstance(t *testing.T) {
	a := uuid.MustParse("aaaaaaaa-0000-4000-8000-000000000001")
	b := uuid.MustParse("bbbbbbbb-0000-4000-8000-000000000001")
	cases := map[string]string{
		"another instance's key": ingest.ScopedKey(b, "north_star"),
		"an unprefixed key":      "north_star",
		"the prefix alone":       "aaaaaaaa/",
		"a prefix without slash": "aaaaaaaanorth_star",
		"empty":                  "",
	}
	for name, scoped := range cases {
		if got, ok := ingest.UnscopedKey(a, scoped); ok {
			t.Errorf("%s: UnscopedKey(%q) = %q, true; want false", name, scoped, got)
		}
	}
}

var shortenedSuffix = regexp.MustCompile(`~[0-9a-f]{16}$`)

func TestScopedKey_KeyThatFitsIsNeverShortened(t *testing.T) {
	id := uuid.MustParse("cf47ebd4-49c7-4f89-a36a-df87cc5cd8c7")
	exact := strings.Repeat("k", memoryKeyLimit-len("cf47ebd4/")) // scoped length is exactly the limit
	got := ingest.ScopedKey(id, exact)
	if got != "cf47ebd4/"+exact || len(got) != memoryKeyLimit {
		t.Errorf("a key that fits was changed: len %d", len(got))
	}
	if ingest.IsShortened(id, exact) {
		t.Error("IsShortened reported true for a key that fits")
	}
}

func TestScopedKey_LongKeyIsShortenedToTheLimit(t *testing.T) {
	id := uuid.MustParse("cf47ebd4-49c7-4f89-a36a-df87cc5cd8c7")
	long := strings.Repeat("k", memoryKeyLimit-len("cf47ebd4/")+1) // one over
	got := ingest.ScopedKey(id, long)
	if len(got) > memoryKeyLimit {
		t.Errorf("shortened key is %d bytes, over the limit of %d", len(got), memoryKeyLimit)
	}
	if !strings.HasPrefix(got, "cf47ebd4/") || !shortenedSuffix.MatchString(got) {
		t.Errorf("shortened key %q lacks the instance prefix or the hash suffix", got)
	}
	if again := ingest.ScopedKey(id, long); again != got {
		t.Errorf("ScopedKey is not deterministic: %q then %q", got, again)
	}
	if !ingest.IsShortened(id, long) {
		t.Error("IsShortened reported false for a key that was shortened")
	}
}

func TestScopedKey_LongKeysThatShareALongPrefixStayDistinct(t *testing.T) {
	id := uuid.New()
	head := strings.Repeat("Commercial.BusinessDevelopment.", 6)
	a := ingest.ScopedKey(id, head+"Stakeholder relationship management")
	b := ingest.ScopedKey(id, head+"Stakeholder relationship measurement")
	if a == b {
		t.Errorf("two different long keys collapsed to %q", a)
	}
}

func TestScopedKey_ShorteningKeepsMultiByteKeysValidAndWithinTheLimit(t *testing.T) {
	id := uuid.New()
	for _, r := range []string{"ø", "界", "😀"} {
		got := ingest.ScopedKey(id, strings.Repeat(r, 200))
		if len(got) > memoryKeyLimit {
			t.Errorf("%q: shortened key is %d bytes, over the limit", r, len(got))
		}
		if !utf8.ValidString(got) {
			t.Errorf("%q: shortening cut a character in half: %q", r, got)
		}
	}
}

func TestUnscopedKey_CannotRecoverAShortenedKey(t *testing.T) {
	id := uuid.New()
	long := strings.Repeat("k", 300)
	if got, ok := ingest.UnscopedKey(id, ingest.ScopedKey(id, long)); ok {
		t.Errorf("UnscopedKey returned %q for a shortened key; the original is not recoverable", got)
	}
}

func TestRelationshipKey_JoinsTypeAndEndpoints(t *testing.T) {
	got := ingest.RelationshipKey("depends_on", "cf47ebd4/a", "cf47ebd4/b")
	if want := "depends_on|cf47ebd4/a|cf47ebd4/b"; got != want {
		t.Errorf("RelationshipKey = %q, want %q", got, want)
	}
	if got == ingest.RelationshipKey("depends_on", "cf47ebd4/b", "cf47ebd4/a") {
		t.Error("RelationshipKey must be directional")
	}
}

// Memory's key limit is declared in its API but has not been enforced on every
// version, and Memory is updated independently of this server, so no key may
// depend on that. Every key the decomposer produces must fit and stay unique
// once scoped. Skipped when the submodule is not checked out, like the other
// real-instance tests.
func TestScopedKey_EveryDecomposedKeyFitsMemoryLimitAndStaysUnique(t *testing.T) {
	path, err := filepath.Abs("../../../../docs/EPF/_instances/emergent")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(path, "_meta.yaml")); err != nil {
		t.Skipf("emergent EPF instance not checked out at %s", path)
	}

	res, err := decompose.New(path).DecomposeInstance()
	if err != nil {
		t.Fatalf("decompose: %v", err)
	}
	if len(res.Objects) == 0 {
		t.Fatal("decomposer produced no objects; the test would pass vacuously")
	}

	id := uuid.New()
	seen := make(map[string]string, len(res.Objects))
	shortened := 0
	for _, o := range res.Objects {
		k := ingest.ScopedKey(id, o.Key)
		if len(k) > memoryKeyLimit {
			t.Errorf("scoped key is %d bytes, over Memory's limit of %d: %s", len(k), memoryKeyLimit, k)
		}
		if prev, dup := seen[k]; dup && prev != o.Key {
			t.Errorf("two decomposer keys scope to %q:\n  %s\n  %s", k, prev, o.Key)
		}
		seen[k] = o.Key
		if ingest.IsShortened(id, o.Key) {
			shortened++
		}
	}
	t.Logf("%d objects, %d keys shortened", len(res.Objects), shortened)
	if shortened == 0 {
		t.Log("no key needed shortening; the shortening path is covered by the unit tests only")
	}
}
