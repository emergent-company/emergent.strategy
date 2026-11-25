// Package seal encrypts small secrets for storage at rest with AES-256-GCM.
//
// A sealed value is the text "enc:v1:<key id>:<base64 nonce+ciphertext>". The
// key id lets the key be rotated: the first key of a Keyring writes, every key
// reads. The caller's additional authenticated data binds a value to the place it
// is stored, so a value copied elsewhere does not open.
//
// No error carries a plaintext, a stored value or key material.
package seal

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"regexp"
	"strings"
)

const (
	prefix  = "enc:"
	version = "enc:v1:"
	keySize = 32 // AES-256
)

var (
	// ErrNotSealed means the value is plain text.
	ErrNotSealed = errors.New("value is not sealed")
	// ErrMalformed means the value is marked as sealed but cannot be parsed.
	ErrMalformed = errors.New("sealed value is malformed")
	// ErrUnknownKey means the value was sealed with a key that is not in the list.
	ErrUnknownKey = errors.New("sealed value uses a key that is not configured")
	// ErrOpen means decryption failed: wrong key, wrong additional data, or an
	// altered value.
	ErrOpen = errors.New("sealed value cannot be decrypted")
)

var keyID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,32}$`)

// Keyring holds the configured keys.
type Keyring struct {
	primary string
	keys    map[string]cipher.AEAD
}

// ParseKeyring reads a comma-separated list of "id:base64key" entries, each key
// 32 bytes. The first entry is the one new values are sealed with. A blank spec
// returns a nil Keyring and no error.
func ParseKeyring(spec string) (*Keyring, error) {
	if strings.TrimSpace(spec) == "" {
		return nil, nil
	}
	ring := &Keyring{keys: map[string]cipher.AEAD{}}
	// Errors name an entry by position only: a mistyped entry may hold a key
	// where the id should be.
	for i, entry := range strings.Split(spec, ",") {
		n := i + 1
		id, encoded, found := strings.Cut(strings.TrimSpace(entry), ":")
		if !found || !keyID.MatchString(id) {
			return nil, fmt.Errorf("entry %d: expected id:base64key, with an id of up to 32 letters, digits, - or _", n)
		}
		key, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil {
			return nil, fmt.Errorf("entry %d: the key is not valid base64", n)
		}
		if len(key) != keySize {
			return nil, fmt.Errorf("entry %d: the key must be %d bytes, got %d", n, keySize, len(key))
		}
		if _, dup := ring.keys[id]; dup {
			return nil, fmt.Errorf("entry %d: its key id is used twice", n)
		}
		block, err := aes.NewCipher(key)
		if err != nil {
			return nil, fmt.Errorf("entry %d: %w", n, err)
		}
		aead, err := cipher.NewGCM(block)
		if err != nil {
			return nil, fmt.Errorf("entry %d: %w", n, err)
		}
		ring.keys[id] = aead
		if i == 0 {
			ring.primary = id
		}
	}
	return ring, nil
}

// IsSealed reports whether a stored value is marked as sealed, of any version.
func IsSealed(value string) bool {
	return strings.HasPrefix(value, prefix)
}

// SealedWithPrimary reports whether value was sealed with the key that writes.
func (k *Keyring) SealedWithPrimary(value string) bool {
	return strings.HasPrefix(value, version+k.primary+":")
}

// Seal encrypts plaintext with the first key, bound to aad.
func (k *Keyring) Seal(plaintext string, aad []byte) (string, error) {
	aead := k.keys[k.primary]
	nonce := make([]byte, aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", fmt.Errorf("generate nonce: %w", err)
	}
	out := aead.Seal(nonce, nonce, []byte(plaintext), aad)
	return version + k.primary + ":" + base64.StdEncoding.EncodeToString(out), nil
}

// Open decrypts a sealed value that was bound to aad.
func (k *Keyring) Open(value string, aad []byte) (string, error) {
	if !IsSealed(value) {
		return "", ErrNotSealed
	}
	rest, found := strings.CutPrefix(value, version)
	if !found {
		return "", ErrMalformed
	}
	id, encoded, found := strings.Cut(rest, ":")
	if !found {
		return "", ErrMalformed
	}
	aead, ok := k.keys[id]
	if !ok {
		return "", ErrUnknownKey
	}
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(raw) < aead.NonceSize()+aead.Overhead() {
		return "", ErrMalformed
	}
	plain, err := aead.Open(nil, raw[:aead.NonceSize()], raw[aead.NonceSize():], aad)
	if err != nil {
		return "", ErrOpen
	}
	return string(plain), nil
}
