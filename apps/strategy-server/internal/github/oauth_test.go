package github

import (
	"encoding/hex"
	"strings"
	"testing"
)

func TestGenerateState(t *testing.T) {
	a, err := GenerateState()
	if err != nil {
		t.Fatalf("GenerateState: %v", err)
	}
	b, err := GenerateState()
	if err != nil {
		t.Fatalf("GenerateState: %v", err)
	}

	if len(a) != 64 {
		t.Errorf("len(state) = %d, want 64 hex characters", len(a))
	}
	if _, err := hex.DecodeString(a); err != nil {
		t.Errorf("state %q is not hex: %v", a, err)
	}
	if a == b {
		t.Errorf("two states are identical: %q", a)
	}
}

func TestSignState_Format(t *testing.T) {
	signed := SignState("abc123", "secret")

	state, mac, found := strings.Cut(signed, ".")
	if !found {
		t.Fatalf("signed state %q has no separator", signed)
	}
	if state != "abc123" {
		t.Errorf("state part = %q, want %q", state, "abc123")
	}
	if len(mac) != 64 {
		t.Errorf("len(mac) = %d, want 64 hex characters", len(mac))
	}
	if _, err := hex.DecodeString(mac); err != nil {
		t.Errorf("mac %q is not hex: %v", mac, err)
	}
}

func TestSignState_Deterministic(t *testing.T) {
	first := SignState("s", "k")
	second := SignState("s", "k")
	if first != second {
		t.Errorf("same state and secret signed to different values: %q and %q", first, second)
	}
	if SignState("s", "k1") == SignState("s", "k2") {
		t.Error("different secrets signed to the same value")
	}
	if SignState("s1", "k") == SignState("s2", "k") {
		t.Error("different states signed to the same value")
	}
}

func TestVerifyState_RoundTrip(t *testing.T) {
	state, err := GenerateState()
	if err != nil {
		t.Fatalf("GenerateState: %v", err)
	}

	got, ok := VerifyState(SignState(state, "secret"), "secret")
	if !ok {
		t.Fatal("VerifyState rejected a state it just signed")
	}
	if got != state {
		t.Errorf("state = %q, want %q", got, state)
	}
}

func TestVerifyState_Rejects(t *testing.T) {
	valid := SignState("abc123", "secret")
	state, mac, _ := strings.Cut(valid, ".")

	tests := []struct {
		name   string
		signed string
		secret string
	}{
		{"wrong secret", valid, "other"},
		{"tampered state", "abc124." + mac, "secret"},
		{"tampered mac", state + "." + flipLast(mac), "secret"},
		{"truncated mac", valid[:len(valid)-1], "secret"},
		{"state without mac", state, "secret"},
		{"empty mac", state + ".", "secret"},
		{"empty input", "", "secret"},
		{"separator only", ".", "secret"},
		{"mac signed for a different state", "abc124." + strings.SplitN(SignState("abc123", "secret"), ".", 2)[1], "secret"},
		{"state containing the separator", "ab.c123." + mac, "secret"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got, ok := VerifyState(tt.signed, tt.secret); ok {
				t.Errorf("VerifyState(%q) accepted, returned state %q", tt.signed, got)
			}
		})
	}
}

func flipLast(s string) string {
	last := s[len(s)-1]
	repl := byte('0')
	if last == '0' {
		repl = '1'
	}
	return s[:len(s)-1] + string(repl)
}
