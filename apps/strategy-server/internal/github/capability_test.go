package github

import "testing"

// The App that shipped to production had permissions: {} for four months. It
// authenticated, minted installation tokens, and failed every repository
// operation. These pin the predicate that would have caught it.
func TestAppCapability_MissingForSync(t *testing.T) {
	tests := []struct {
		name  string
		perms map[string]string
		want  []string
	}{
		{
			name:  "no permissions at all — the live failure",
			perms: map[string]string{},
			want:  []string{"contents:write", "pull_requests:write"},
		},
		{
			name:  "read-only contents is not enough to commit",
			perms: map[string]string{"contents": "read", "pull_requests": "write"},
			want:  []string{"contents:write"},
		},
		{
			name:  "can commit but cannot open the PR",
			perms: map[string]string{"contents": "write", "pull_requests": "read"},
			want:  []string{"pull_requests:write"},
		},
		{
			name:  "fully granted",
			perms: map[string]string{"contents": "write", "pull_requests": "write", "metadata": "read"},
			want:  nil,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := AppCapability{Permissions: tc.perms}.MissingForSync()
			if len(got) != len(tc.want) {
				t.Fatalf("MissingForSync() = %v, want %v", got, tc.want)
			}
			for i := range got {
				if got[i] != tc.want[i] {
					t.Errorf("MissingForSync()[%d] = %q, want %q", i, got[i], tc.want[i])
				}
			}
		})
	}
}

// A permission present but not "write" must never read as writable — the whole
// point is that presence is not capability.
func TestAppCapability_ReadIsNotWrite(t *testing.T) {
	c := AppCapability{Permissions: map[string]string{"contents": "read", "pull_requests": "read"}}
	if c.CanWriteContents() {
		t.Error("CanWriteContents() true for contents:read")
	}
	if c.CanWritePullRequests() {
		t.Error("CanWritePullRequests() true for pull_requests:read")
	}
}
