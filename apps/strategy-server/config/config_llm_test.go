package config

import "testing"

// TestLLMConfigured covers the per-mode "is the LLM usable" predicate. Getting
// this wrong is silent: a false negative drops the server into
// agent-orchestrated/formula mode with no error, so each mode's required field
// is asserted explicitly.
func TestLLMConfigured(t *testing.T) {
	tests := []struct {
		name string
		cfg  Config
		want bool
	}{
		{
			name: "api-key mode needs a provider URL",
			cfg:  Config{LLMAuthMode: "api-key", LLMProviderURL: "https://api.openai.com"},
			want: true,
		},
		{
			name: "api-key mode without a URL is unconfigured",
			cfg:  Config{LLMAuthMode: "api-key"},
			want: false,
		},
		{
			name: "empty auth mode defaults to api-key semantics",
			cfg:  Config{LLMProviderURL: "http://localhost:11434"},
			want: true,
		},
		{
			name: "vertex mode needs a project",
			cfg:  Config{LLMAuthMode: "vertex", LLMVertexProject: "my-project"},
			want: true,
		},
		{
			name: "vertex mode without a project is unconfigured",
			cfg:  Config{LLMAuthMode: "vertex"},
			want: false,
		},
		{
			name: "vertex mode ignores a stray provider URL",
			cfg:  Config{LLMAuthMode: "vertex", LLMProviderURL: "https://api.openai.com"},
			want: false,
		},
		{
			name: "bedrock mode needs a region",
			cfg:  Config{LLMAuthMode: "bedrock", LLMBedrockRegion: "eu-central-1"},
			want: true,
		},
		{
			name: "bedrock mode without a region is unconfigured",
			cfg:  Config{LLMAuthMode: "bedrock"},
			want: false,
		},
		{
			name: "bedrock mode ignores a stray provider URL",
			cfg:  Config{LLMAuthMode: "bedrock", LLMProviderURL: "https://api.openai.com"},
			want: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := tc.cfg.LLMConfigured(); got != tc.want {
				t.Errorf("LLMConfigured()=%v, want %v", got, tc.want)
			}
		})
	}
}

func TestLLMAuthModePredicates(t *testing.T) {
	tests := []struct {
		mode        string
		wantVertex  bool
		wantBedrock bool
	}{
		{"api-key", false, false},
		{"vertex", true, false},
		{"bedrock", false, true},
		{"", false, false},
		{"unknown", false, false},
	}

	for _, tc := range tests {
		t.Run("mode="+tc.mode, func(t *testing.T) {
			c := Config{LLMAuthMode: tc.mode}
			if got := c.IsVertexLLM(); got != tc.wantVertex {
				t.Errorf("IsVertexLLM()=%v, want %v", got, tc.wantVertex)
			}
			if got := c.IsBedrockLLM(); got != tc.wantBedrock {
				t.Errorf("IsBedrockLLM()=%v, want %v", got, tc.wantBedrock)
			}
		})
	}
}

// TestAuthModesAreMutuallyExclusive guards against a future edit making two
// mode predicates true at once, which would make the provider branch order
// silently significant.
func TestAuthModesAreMutuallyExclusive(t *testing.T) {
	for _, mode := range []string{"api-key", "vertex", "bedrock", "", "unknown"} {
		c := Config{LLMAuthMode: mode}
		if c.IsVertexLLM() && c.IsBedrockLLM() {
			t.Errorf("mode %q reports both vertex and bedrock", mode)
		}
	}
}
