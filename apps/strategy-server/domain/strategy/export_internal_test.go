package strategy

import "testing"

func TestWorkPackageExportPaths(t *testing.T) {
	if dir := artifactTypeToDirPath("work_package"); dir != "work_packages" {
		t.Errorf("dir = %q, want work_packages", dir)
	}

	cases := []struct {
		key  string
		want string
	}{
		{"wp-001", "wp-001.yaml"},
		{"work_package:wp-042", "wp-042.yaml"},
		{"wp-001.yaml", "wp-001.yaml"}, // already has extension
	}
	for _, c := range cases {
		if got := artifactKeyToFilename("work_package", c.key); got != c.want {
			t.Errorf("artifactKeyToFilename(work_package, %q) = %q, want %q", c.key, got, c.want)
		}
	}
}
