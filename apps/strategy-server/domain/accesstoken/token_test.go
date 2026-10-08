package accesstoken

import (
	"strings"
	"testing"
)

func TestGenerate_Shape(t *testing.T) {
	g, err := Generate()
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}

	if !strings.HasPrefix(g.Plaintext, Prefix) {
		t.Errorf("plaintext %q lacks the %q marker that makes a leaked token "+
			"identifiable to secret scanners", g.Plaintext, Prefix)
	}
	// "est_" + 22 base64url chars for 16 bytes.
	if want := len(Prefix) + 22; len(g.Plaintext) != want {
		t.Errorf("plaintext length = %d, want %d (%q)", len(g.Plaintext), want, g.Plaintext)
	}
	if g.Prefix != g.Plaintext[:PrefixLen] {
		t.Errorf("Prefix = %q, want the first %d chars of %q", g.Prefix, PrefixLen, g.Plaintext)
	}
	if !strings.HasPrefix(g.Hash, "$argon2id$") {
		t.Errorf("hash is not an argon2id PHC string: %q", g.Hash)
	}
	if strings.Contains(g.Hash, g.Plaintext) {
		t.Error("the hash contains the plaintext")
	}
}

// TestGenerate_IsUnique is a smoke test against a catastrophic entropy bug —
// a fixed seed or an unchecked rand error producing identical tokens.
func TestGenerate_IsUnique(t *testing.T) {
	// Kept small deliberately: each Generate runs a real Argon2id hash
	// (~25ms by design), so a large sample would dominate the suite runtime
	// to prove something this sample already proves.
	const n = 40
	seen := make(map[string]bool, n)
	prefixes := make(map[string]bool, n)
	for range n {
		g, err := Generate()
		if err != nil {
			t.Fatalf("Generate: %v", err)
		}
		if seen[g.Plaintext] {
			t.Fatalf("duplicate token generated: %q", g.Plaintext)
		}
		seen[g.Plaintext] = true
		prefixes[g.Prefix] = true
	}
	// Prefix collisions are allowed (Resolve iterates candidates), but at
	// 62^4 for the random part they should be absent at this sample size.
	// A large shortfall means the prefix is not varying.
	if len(prefixes) < n-1 {
		t.Errorf("only %d distinct prefixes from %d tokens; prefix is not varying", len(prefixes), n)
	}
}

func TestVerify_RoundTrip(t *testing.T) {
	g, err := Generate()
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}

	ok, err := Verify(g.Plaintext, g.Hash)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if !ok {
		t.Error("a freshly generated token failed to verify against its own hash")
	}

	ok, err = Verify(g.Plaintext+"x", g.Hash)
	if err != nil {
		t.Fatalf("Verify (wrong token): %v", err)
	}
	if ok {
		t.Error("a modified token verified successfully")
	}
}

// TestVerify_DistinctSaltsPerToken guards against a fixed salt, which would
// make the hashes rainbow-table-able and let identical tokens be spotted by
// equal digests.
func TestVerify_DistinctSaltsPerToken(t *testing.T) {
	const plaintext = "est_sameinputeverytime"
	h1, err := Hash(plaintext)
	if err != nil {
		t.Fatalf("Hash: %v", err)
	}
	h2, err := Hash(plaintext)
	if err != nil {
		t.Fatalf("Hash: %v", err)
	}
	if h1 == h2 {
		t.Error("hashing the same input twice produced identical output; salt is not random")
	}
	for _, h := range []string{h1, h2} {
		ok, err := Verify(plaintext, h)
		if err != nil || !ok {
			t.Errorf("Verify against %q = (%v, %v), want (true, nil)", h, ok, err)
		}
	}
}

// TestVerify_MalformedHashIsNotAnAuthFailure is the important one.
//
// A corrupt stored hash must surface as an error, not as `false`. If it
// returned false, database corruption would be reported to users as "your
// token is invalid" and the real fault would never be noticed.
func TestVerify_MalformedHashIsNotAnAuthFailure(t *testing.T) {
	cases := map[string]string{
		"empty":              "",
		"not phc":            "deadbeef",
		"wrong algorithm":    "$bcrypt$v=19$m=65536,t=2,p=1$c2FsdA$aGFzaA",
		"missing params":     "$argon2id$v=19$c2FsdA$aGFzaA",
		"bad version":        "$argon2id$v=99$m=65536,t=2,p=1$c2FsdA$aGFzaA",
		"unparseable salt":   "$argon2id$v=19$m=65536,t=2,p=1$!!!!$aGFzaA",
		"unparseable digest": "$argon2id$v=19$m=65536,t=2,p=1$c2FsdA$!!!!",
	}
	for name, encoded := range cases {
		t.Run(name, func(t *testing.T) {
			ok, err := Verify("est_whatever", encoded)
			if err == nil {
				t.Fatalf("Verify returned no error for a malformed hash; "+
					"corruption would be reported as a bad token (ok=%v)", ok)
			}
			if ok {
				t.Error("Verify returned true for a malformed hash")
			}
		})
	}
}

// TestVerify_ParamsComeFromTheHash confirms a hash written with different
// Argon2id parameters still verifies. Without this, raising the cost
// constants would invalidate every existing token.
func TestVerify_ParamsComeFromTheHash(t *testing.T) {
	const plaintext = "est_paramsindependent"

	salt := []byte("0123456789abcdef")
	// Deliberately weaker than the package constants.
	legacy := encodeHash(plaintext, salt, 1, 8*1024, 1, 32)

	ok, err := Verify(plaintext, legacy)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if !ok {
		t.Error("a hash written with older parameters failed to verify; " +
			"raising the cost constants would invalidate existing tokens")
	}
}

func TestLookupPrefix_ShortInput(t *testing.T) {
	// Must not panic on a string shorter than the prefix.
	if got := LookupPrefix("est"); got != "est" {
		t.Errorf("LookupPrefix(%q) = %q", "est", got)
	}
}
