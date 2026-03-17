package pathutil

import (
	"os"
	"path/filepath"
	"testing"
)

func TestExpandTilde(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatalf("cannot determine home directory: %v", err)
	}

	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "empty string unchanged",
			input: "",
			want:  "",
		},
		{
			name:  "tilde alone expands to home",
			input: "~",
			want:  home,
		},
		{
			name:  "tilde slash expands",
			input: "~/Documents",
			want:  filepath.Join(home, "Documents"),
		},
		{
			name:  "tilde slash nested path",
			input: "~/epf/outputs/report.md",
			want:  filepath.Join(home, "epf/outputs/report.md"),
		},
		{
			name:  "absolute path unchanged",
			input: "/usr/local/bin",
			want:  "/usr/local/bin",
		},
		{
			name:  "relative path unchanged",
			input: "relative/path",
			want:  "relative/path",
		},
		{
			name:  "dot path unchanged",
			input: "./local/path",
			want:  "./local/path",
		},
		{
			name:  "tilde in middle unchanged",
			input: "/some/~path/here",
			want:  "/some/~path/here",
		},
		{
			name:  "tilde user syntax unchanged (not supported)",
			input: "~otheruser/dir",
			want:  "~otheruser/dir",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ExpandTilde(tt.input)
			if got != tt.want {
				t.Errorf("ExpandTilde(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}
