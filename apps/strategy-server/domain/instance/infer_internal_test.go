package instance

import "testing"

func TestInferArtifactType_WorkPackageKeys(t *testing.T) {
	cases := []struct{ key, want string }{
		{"wp-001", "work_package"},
		{"wp-042", "work_package"},
		{"fd-001", "feature"},
		{"work_packages/notes", "artifact"},
		{"north_star", "north_star"},
	}
	for _, c := range cases {
		if got := inferArtifactType(c.key); got != c.want {
			t.Errorf("inferArtifactType(%q) = %q, want %q", c.key, got, c.want)
		}
	}
}
