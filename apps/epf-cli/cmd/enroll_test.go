package cmd

import "testing"

func TestDeriveInstanceName(t *testing.T) {
	tests := []struct {
		name     string
		url      string
		expected string
	}{
		{
			name:     "SSH URL with .git suffix",
			url:      "git@github.com:emergent-company/emergent-epf.git",
			expected: "emergent",
		},
		{
			name:     "SSH URL without .git suffix",
			url:      "git@github.com:emergent-company/emergent-epf",
			expected: "emergent",
		},
		{
			name:     "HTTPS URL with .git suffix",
			url:      "https://github.com/emergent-company/emergent-epf.git",
			expected: "emergent",
		},
		{
			name:     "HTTPS URL without .git suffix",
			url:      "https://github.com/emergent-company/emergent-epf",
			expected: "emergent",
		},
		{
			name:     "strips -strategy suffix",
			url:      "git@github.com:org/product-strategy.git",
			expected: "product",
		},
		{
			name:     "no special suffix to strip",
			url:      "git@github.com:org/my-product.git",
			expected: "my-product",
		},
		{
			name:     "plain repo name",
			url:      "git@github.com:org/acme.git",
			expected: "acme",
		},
		{
			name:     "deeply nested HTTPS path",
			url:      "https://gitlab.com/group/subgroup/my-repo-epf.git",
			expected: "my-repo",
		},
		{
			name:     "empty URL returns empty",
			url:      "",
			expected: "",
		},
		{
			name:     "only .git suffix returns empty",
			url:      ".git",
			expected: "",
		},
		{
			name:     "name is exactly epf — kept as-is (only suffix -epf stripped)",
			url:      "git@github.com:org/epf.git",
			expected: "epf",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := deriveInstanceName(tt.url)
			if result != tt.expected {
				t.Errorf("deriveInstanceName(%q) = %q, want %q", tt.url, result, tt.expected)
			}
		})
	}
}
