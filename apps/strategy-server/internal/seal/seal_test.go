package seal_test

import (
	"encoding/base64"
	"errors"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/seal"
)

// key returns the base64 form of a 32-byte key made of one repeated byte.
func key(b byte) string {
	return base64.StdEncoding.EncodeToString([]byte(strings.Repeat(string(rune(b)), 32)))
}

func ring(t *testing.T, spec string) *seal.Keyring {
	t.Helper()
	k, err := seal.ParseKeyring(spec)
	if err != nil {
		t.Fatalf("ParseKeyring: %v", err)
	}
	if k == nil {
		t.Fatal("ParseKeyring returned no keyring")
	}
	return k
}

var aad = []byte("row-1")

func TestSealedValueOpensAndHidesThePlaintext(t *testing.T) {
	k := ring(t, "k1:"+key('a'))
	sealed, err := k.Seal("gho_secret", aad)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(sealed, "enc:v1:k1:") || !seal.IsSealed(sealed) {
		t.Errorf("unexpected envelope %q", sealed)
	}
	if strings.Contains(sealed, "gho_secret") {
		t.Error("the envelope contains the plaintext")
	}
	got, err := k.Open(sealed, aad)
	if err != nil || got != "gho_secret" {
		t.Errorf("Open = %q, %v", got, err)
	}
}

func TestTwoSealsOfOneInputDiffer(t *testing.T) {
	k := ring(t, "k1:"+key('a'))
	a, errA := k.Seal("same", aad)
	b, errB := k.Seal("same", aad)
	if errA != nil || errB != nil {
		t.Fatal(errA, errB)
	}
	if a == b {
		t.Error("two seals of one input are identical: the nonce is not random")
	}
}

func TestOpenRefuses(t *testing.T) {
	k := ring(t, "k1:"+key('a'))
	sealed, err := k.Seal("gho_secret", aad)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(sealed, "enc:v1:k1:"))
	if err != nil {
		t.Fatal(err)
	}
	raw[len(raw)-1] ^= 1
	tampered := "enc:v1:k1:" + base64.StdEncoding.EncodeToString(raw)

	cases := map[string]struct {
		ring  *seal.Keyring
		value string
		aad   []byte
		want  error
	}{
		"wrong key under the same id": {ring(t, "k1:"+key('b')), sealed, aad, seal.ErrOpen},
		"key id not in the list":      {ring(t, "k2:"+key('a')), sealed, aad, seal.ErrUnknownKey},
		"value moved to another row":  {k, sealed, []byte("row-2"), seal.ErrOpen},
		"tampered ciphertext":         {k, tampered, aad, seal.ErrOpen},
		"plain text":                  {k, "gho_secret", aad, seal.ErrNotSealed},
		"unknown version":             {k, "enc:v2:k1:AAAA", aad, seal.ErrMalformed},
		"no payload":                  {k, "enc:v1:k1", aad, seal.ErrMalformed},
		"not base64":                  {k, "enc:v1:k1:!!!", aad, seal.ErrMalformed},
		"shorter than a nonce":        {k, "enc:v1:k1:AAAA", aad, seal.ErrMalformed},
	}
	for name, tc := range cases {
		got, err := tc.ring.Open(tc.value, tc.aad)
		if !errors.Is(err, tc.want) {
			t.Errorf("%s: err = %v, want %v", name, err, tc.want)
		}
		if got != "" {
			t.Errorf("%s: returned %q with an error", name, got)
		}
		if err != nil && strings.Contains(err.Error(), "gho_secret") {
			t.Errorf("%s: the error carries the value: %v", name, err)
		}
	}
}

func TestRotationWritesWithTheFirstKeyAndReadsAll(t *testing.T) {
	old := ring(t, "k1:"+key('a'))
	first, err := old.Seal("before", aad)
	if err != nil {
		t.Fatal(err)
	}
	both := ring(t, " k2:"+key('b')+" , k1:"+key('a')+" ")
	second, err := both.Seal("after", aad)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(second, "enc:v1:k2:") {
		t.Errorf("a new value must use the first key, got %q", second)
	}
	if got, err := both.Open(first, aad); err != nil || got != "before" {
		t.Errorf("a value sealed with the older key: %q, %v", got, err)
	}
	if both.SealedWithPrimary(first) || !both.SealedWithPrimary(second) || both.SealedWithPrimary("plain") {
		t.Error("SealedWithPrimary must be true only for the first key")
	}
}

func TestNoSettingMeansNoKeyring(t *testing.T) {
	for _, spec := range []string{"", "   "} {
		k, err := seal.ParseKeyring(spec)
		if err != nil || k != nil {
			t.Errorf("ParseKeyring(%q) = %v, %v; want nil, nil", spec, k, err)
		}
	}
}

// A bad setting is refused, and the message never repeats key material.
func TestBadKeySettingsAreRefusedWithoutEchoingThem(t *testing.T) {
	good := key('a')
	short := base64.StdEncoding.EncodeToString([]byte("too short"))
	long := base64.StdEncoding.EncodeToString([]byte(strings.Repeat("x", 33)))
	for name, spec := range map[string]string{
		"no id":            good,
		"empty id":         ":" + good,
		"empty key":        "k1:",
		"id with a space":  "k 1:" + good,
		"id too long":      strings.Repeat("k", 33) + ":" + good,
		"not base64":       "k1:not*base64*material",
		"key too short":    "k1:" + short,
		"AES-128 key":      "k1:" + base64.StdEncoding.EncodeToString([]byte(strings.Repeat("x", 16))),
		"key too long":     "k1:" + long,
		"duplicate id":     "k1:" + good + ",k1:" + key('b'),
		"empty entry":      "k1:" + good + ",",
		"swapped id & key": good + ":k1",
	} {
		k, err := seal.ParseKeyring(spec)
		if err == nil || k != nil {
			t.Errorf("%s: accepted", name)
			continue
		}
		for _, secret := range []string{good, short, long, key('b'), "not*base64*material"} {
			if strings.Contains(err.Error(), secret) {
				t.Errorf("%s: the error repeats key material: %v", name, err)
			}
		}
	}
}
