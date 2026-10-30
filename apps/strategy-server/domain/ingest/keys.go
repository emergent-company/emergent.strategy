package ingest

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
)

const (
	// keyPrefixLen is the number of leading hex characters of the instance UUID
	// used to prefix Memory object keys. The full UUID would leave less room for
	// the key itself under Memory's limit.
	keyPrefixLen = 8

	// maxMemoryKeyLen is Memory's limit on an object key
	// (CreateGraphObjectRequest.Key, max=128), counted in bytes, which is never
	// less than the character count. Memory has not enforced it on every
	// version, and it is updated independently of this server, so the limit is
	// treated as binding.
	maxMemoryKeyLen = 128

	// keyHashLen is the number of hex characters of the key's SHA-256 kept in a
	// shortened key. 64 bits makes a collision between two keys of one instance
	// negligible.
	keyHashLen = 16
)

// ScopedKey is the Memory key for an object of an instance. It is the only
// place Memory keys are built. Memory enforces unique (project, type, key), so
// without the prefix two instances that share a key, such as the canonical
// template definitions, overwrite each other. The prefix prevents write
// collisions only; ownership on read comes from the instance label and
// property, and freshness from the manifest.
//
// A key that would exceed Memory's limit is shortened to
// "<prefix>/<start of key>~<hash of the whole key>". It stays deterministic and
// distinct for distinct keys, but the original cannot be recovered from it, so
// the writer stores the original in a property (see IsShortened).
func ScopedKey(instanceID uuid.UUID, key string) string {
	prefix := instanceID.String()[:keyPrefixLen] + "/"
	if len(prefix)+len(key) <= maxMemoryKeyLen {
		return prefix + key
	}
	sum := sha256.Sum256([]byte(key))
	suffix := "~" + hex.EncodeToString(sum[:])[:keyHashLen]
	return prefix + truncateUTF8(key, maxMemoryKeyLen-len(prefix)-len(suffix)) + suffix
}

// IsShortened reports whether ScopedKey shortens key for this instance.
func IsShortened(instanceID uuid.UUID, key string) bool {
	return len(instanceID.String()[:keyPrefixLen])+1+len(key) > maxMemoryKeyLen
}

// UnscopedKey reverses ScopedKey. It reports false for a key that does not
// carry this instance's prefix, that has nothing after it, or that was
// shortened and so cannot be reversed.
func UnscopedKey(instanceID uuid.UUID, scoped string) (string, bool) {
	rest, ok := strings.CutPrefix(scoped, instanceID.String()[:keyPrefixLen]+"/")
	if !ok || rest == "" || isShortenedRest(rest) {
		return "", false
	}
	return rest, true
}

// isShortenedRest recognises the tail ScopedKey appends. A key that fits and
// happens to end like that is reported as not reversible, which is safe: it
// only means the caller falls back to the stored original.
func isShortenedRest(rest string) bool {
	n := len(rest)
	if n < keyHashLen+1 || rest[n-keyHashLen-1] != '~' {
		return false
	}
	for _, c := range rest[n-keyHashLen:] {
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') {
			return false
		}
	}
	return len(rest)+keyPrefixLen+1 >= maxMemoryKeyLen-utf8.UTFMax+1
}

// truncateUTF8 cuts s to at most n bytes without splitting a character.
func truncateUTF8(s string, n int) string {
	if len(s) <= n {
		return s
	}
	for n > 0 && !utf8.RuneStart(s[n]) {
		n--
	}
	return s[:n]
}

// RelationshipKey identifies a relationship in the projection manifest. Both
// endpoints are scoped keys. It is stored in Postgres, not in Memory, so it is
// not subject to Memory's key limit.
func RelationshipKey(relType, fromScoped, toScoped string) string {
	return relType + "|" + fromScoped + "|" + toScoped
}
