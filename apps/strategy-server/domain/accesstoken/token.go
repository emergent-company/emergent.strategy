// Package accesstoken issues and resolves long-lived credentials for
// non-interactive MCP clients.
//
// A token is an opaque random string, not a JWT. A self-contained JWT would
// avoid a database lookup, but revoking one requires consulting a blocklist —
// which is a database lookup, so the saving evaporates while the complexity
// remains. For a credential handed to an external party, immediate revocation
// is the entire point.
package accesstoken

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// Token format.
const (
	// Prefix marks a string as one of our access tokens. It makes a leaked
	// token identifiable in logs and source code — secret scanners key on
	// exactly this kind of fixed marker.
	Prefix = "est_"

	// secretBytes is the entropy behind the random portion. 16 bytes = 128
	// bits, which is beyond brute-force reach and is the same budget a UUIDv4
	// spends. Encoded base64url-unpadded this yields 22 characters.
	secretBytes = 16

	// PrefixLen is how many leading characters of the *full* token are stored
	// in clear and indexed for lookup. It must match migration 043.
	//
	// 8 characters covers "est_" plus 4 characters of the secret. That is
	// deliberately a small part of the secret: the prefix is stored
	// unhashed, so it must not be worth stealing on its own. It leaves 18
	// characters (~107 bits) still protected by Argon2id, while narrowing
	// the candidate set enough that the expected number of rows to verify
	// is ~1.
	PrefixLen = 8
)

// Argon2id parameters.
//
// These follow the OWASP Password Storage Cheat Sheet's second recommended
// configuration (19 MiB memory, 2 iterations, 1 degree of parallelism), which
// is calibrated to make large-scale offline cracking expensive while keeping
// a single verification in the low tens of milliseconds.
//
// They are stored in each hash's PHC string rather than only here, so raising
// them later does not invalidate existing hashes: an old hash still verifies
// with the parameters it was created with. Changing these constants therefore
// affects new tokens only — there is no migration to run.
const (
	argonTime    uint32 = 2
	argonMemory  uint32 = 19 * 1024 // KiB
	argonThreads uint8  = 1
	argonKeyLen  uint32 = 32
	argonSaltLen        = 16
)

// ErrMalformedHash means a stored hash could not be parsed. It indicates
// database corruption or a hash written by incompatible code, not a bad
// token, and must never be reported to a caller as an authentication failure.
var ErrMalformedHash = errors.New("accesstoken: malformed stored hash")

// Generated is a freshly minted token.
type Generated struct {
	// Plaintext is shown to the user exactly once and never persisted.
	Plaintext string
	// Prefix is the clear-text, indexed lookup key.
	Prefix string
	// Hash is the Argon2id PHC string to store.
	Hash string
}

// Generate creates a new token, its lookup prefix, and its hash.
func Generate() (Generated, error) {
	secret := make([]byte, secretBytes)
	if _, err := rand.Read(secret); err != nil {
		// crypto/rand failing means the system has no usable entropy. There
		// is no fallback that is not weaker, so this must abort the mint
		// rather than degrade to a predictable token.
		return Generated{}, fmt.Errorf("accesstoken: read random: %w", err)
	}

	plaintext := Prefix + base64.RawURLEncoding.EncodeToString(secret)

	hash, err := Hash(plaintext)
	if err != nil {
		return Generated{}, err
	}

	return Generated{
		Plaintext: plaintext,
		Prefix:    LookupPrefix(plaintext),
		Hash:      hash,
	}, nil
}

// LookupPrefix returns the indexed lookup key for a token.
//
// Tokens shorter than PrefixLen are returned whole rather than panicking;
// such a string cannot match a real token's prefix, so it simply finds
// nothing.
func LookupPrefix(plaintext string) string {
	if len(plaintext) < PrefixLen {
		return plaintext
	}
	return plaintext[:PrefixLen]
}

// Hash computes an Argon2id PHC string for a token.
func Hash(plaintext string) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("accesstoken: read salt: %w", err)
	}
	return encodeHash(plaintext, salt, argonTime, argonMemory, argonThreads, argonKeyLen), nil
}

// Verify reports whether plaintext matches the stored PHC hash.
//
// The comparison uses subtle.ConstantTimeCompare. Argon2id already makes a
// timing side-channel here unlikely to be practical, but a non-constant-time
// comparison is a known-bad pattern and the correct version costs nothing.
//
// An unparseable hash returns ErrMalformedHash rather than false, so a
// corrupt row is distinguishable from a wrong token. Callers must treat the
// error as a server fault, not as a failed authentication, or corruption
// would silently present as "your token is invalid".
func Verify(plaintext, encoded string) (bool, error) {
	salt, want, time, memory, threads, keyLen, err := decodeHash(encoded)
	if err != nil {
		return false, err
	}

	got := argon2.IDKey([]byte(plaintext), salt, time, memory, threads, keyLen)
	return subtle.ConstantTimeCompare(got, want) == 1, nil
}

// encodeHash renders an Argon2id PHC string:
//
//	$argon2id$v=19$m=<mem>,t=<time>,p=<par>$<b64 salt>$<b64 hash>
//
// The parameters travel with the hash so a future increase does not
// invalidate hashes written under the old settings.
func encodeHash(plaintext string, salt []byte, time, memory uint32, threads uint8, keyLen uint32) string {
	sum := argon2.IDKey([]byte(plaintext), salt, time, memory, threads, keyLen)
	return fmt.Sprintf(
		"$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, memory, time, threads,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(sum),
	)
}

// decodeHash parses a PHC string back into its salt, digest and parameters.
func decodeHash(encoded string) (salt, sum []byte, time, memory uint32, threads uint8, keyLen uint32, err error) {
	parts := strings.Split(encoded, "$")
	// Leading "$" yields an empty first element: ["", "argon2id", "v=19", "m=...", salt, hash]
	if len(parts) != 6 || parts[1] != "argon2id" {
		return nil, nil, 0, 0, 0, 0, fmt.Errorf("%w: unexpected format", ErrMalformedHash)
	}

	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil {
		return nil, nil, 0, 0, 0, 0, fmt.Errorf("%w: version: %v", ErrMalformedHash, err)
	}
	if version != argon2.Version {
		// A different algorithm version produces a different digest, so
		// verification would fail in a way that looks like a wrong token.
		// Refuse explicitly instead.
		return nil, nil, 0, 0, 0, 0, fmt.Errorf("%w: unsupported version %d", ErrMalformedHash, version)
	}

	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &time, &threads); err != nil {
		return nil, nil, 0, 0, 0, 0, fmt.Errorf("%w: params: %v", ErrMalformedHash, err)
	}

	salt, err = base64.RawStdEncoding.Strict().DecodeString(parts[4])
	if err != nil {
		return nil, nil, 0, 0, 0, 0, fmt.Errorf("%w: salt: %v", ErrMalformedHash, err)
	}
	sum, err = base64.RawStdEncoding.Strict().DecodeString(parts[5])
	if err != nil {
		return nil, nil, 0, 0, 0, 0, fmt.Errorf("%w: digest: %v", ErrMalformedHash, err)
	}

	//nolint:gosec // digest length is bounded by the stored hash, not attacker-controlled at scale
	return salt, sum, time, memory, threads, uint32(len(sum)), nil
}
