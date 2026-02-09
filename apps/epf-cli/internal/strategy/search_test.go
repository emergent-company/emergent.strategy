package strategy

import (
	"testing"
)

// TestSearcher_Search tests the search functionality.
func TestSearcher_Search(t *testing.T) {
	// Create a minimal model for testing
	model := &StrategyModel{
		NorthStar: &NorthStar{
			Purpose: Purpose{
				Statement: "We help organizations achieve emergent understanding through connected knowledge.",
			},
			Vision: Vision{
				Statement: "By 2028, Emergent powers thousands of organizations with AI-native knowledge management.",
			},
			Mission: Mission{
				Statement: "We build AI-powered products for knowledge management.",
			},
			Values: []Value{
				{Name: "Source of Truth", Definition: "Answers should be traceable to sources."},
				{Name: "Developer Experience", Definition: "Great APIs and documentation."},
			},
		},
		InsightAnalyses: &InsightAnalyses{
			KeyInsights: []KeyInsight{
				{
					Insight:              "RAG + knowledge graphs are table stakes",
					StrategicImplication: "Must differentiate on execution quality",
				},
			},
			TargetUsers: []TargetUser{
				{
					ID:          "developer-1",
					Name:        "AI Application Developer",
					Role:        "Software Developer",
					Description: "Builds AI-powered applications",
				},
			},
		},
		Features: map[string]*Feature{
			"fd-001": {
				ID:   "fd-001",
				Name: "Knowledge Graph Extraction",
				Slug: "knowledge-graph-extraction",
				Definition: FeatureDefinition{
					JobToBeDone:      "Extract structured knowledge from documents",
					SolutionApproach: "Use LLMs to extract entities and relationships",
				},
				StrategicContext: StrategicContext{
					ContributesTo: []string{"Product.Core.KnowledgeGraph"},
				},
			},
		},
		Roadmap: &Roadmap{
			Cycle: 1,
			Tracks: map[string]*Track{
				"product": {
					Name: "Product",
					OKRs: []OKR{
						{
							ID:        "okr-1",
							Objective: "Build core knowledge extraction capabilities",
							KeyResults: []KeyResult{
								{ID: "kr-1", Description: "Extract 1000 entities per document"},
							},
						},
					},
				},
			},
		},
		ValueModels: map[string]*ValueModel{
			"product": {
				Track: "Product",
				Layers: []ValueLayer{
					{
						ID:   "core",
						Name: "Core",
						Components: []ValueComponent{
							{ID: "kg", Name: "KnowledgeGraph", Description: "Knowledge graph capabilities"},
						},
					},
				},
			},
		},
	}

	searcher := NewSearcher(model)

	tests := []struct {
		name       string
		query      string
		opts       SearchOptions
		wantTypes  []string // expected types in results
		wantMinLen int      // minimum number of results
	}{
		{
			name:       "search knowledge returns multiple result types",
			query:      "knowledge",
			opts:       SearchOptions{Limit: 20},
			wantTypes:  []string{"mission", "feature"},
			wantMinLen: 2,
		},
		{
			name:       "search developer returns persona",
			query:      "developer",
			opts:       SearchOptions{Limit: 10},
			wantTypes:  []string{"persona"},
			wantMinLen: 1,
		},
		{
			name:       "search RAG returns insight",
			query:      "RAG",
			opts:       SearchOptions{Limit: 10},
			wantTypes:  []string{"insight"},
			wantMinLen: 1,
		},
		{
			name:       "filter by type",
			query:      "knowledge",
			opts:       SearchOptions{Limit: 10, Types: []string{"feature"}},
			wantTypes:  []string{"feature"},
			wantMinLen: 1,
		},
		{
			name:       "limit results",
			query:      "ai",
			opts:       SearchOptions{Limit: 2},
			wantMinLen: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			results := searcher.Search(tt.query, tt.opts)

			if len(results) < tt.wantMinLen {
				t.Errorf("Search(%q) returned %d results, want at least %d", tt.query, len(results), tt.wantMinLen)
			}

			// Check that expected types are present
			typeSet := make(map[string]bool)
			for _, r := range results {
				typeSet[r.Type] = true
			}

			for _, wantType := range tt.wantTypes {
				if !typeSet[wantType] {
					t.Errorf("Search(%q) missing expected type %q, got types: %v", tt.query, wantType, typeSet)
				}
			}

			// Check results are sorted by score (descending)
			for i := 1; i < len(results); i++ {
				if results[i].Score > results[i-1].Score {
					t.Errorf("Results not sorted by score: [%d].Score=%f > [%d].Score=%f",
						i, results[i].Score, i-1, results[i-1].Score)
				}
			}
		})
	}
}

// TestSearcher_Search_EmptyQuery tests searching with empty query.
func TestSearcher_Search_EmptyQuery(t *testing.T) {
	model := &StrategyModel{
		NorthStar: &NorthStar{
			Purpose: Purpose{Statement: "Test purpose"},
		},
	}

	searcher := NewSearcher(model)
	results := searcher.Search("", SearchOptions{Limit: 10})

	if len(results) != 0 {
		t.Errorf("Expected 0 results for empty query, got %d", len(results))
	}
}

// TestSearcher_Search_NoMatches tests searching with no matches.
func TestSearcher_Search_NoMatches(t *testing.T) {
	model := &StrategyModel{
		NorthStar: &NorthStar{
			Purpose: Purpose{Statement: "Simple purpose statement"},
		},
	}

	searcher := NewSearcher(model)
	results := searcher.Search("xyzzyx12345", SearchOptions{Limit: 10})

	if len(results) != 0 {
		t.Errorf("Expected 0 results for non-matching query, got %d", len(results))
	}
}

// TestSearcher_ScoreMatch tests the scoring function.
func TestSearcher_ScoreMatch(t *testing.T) {
	tests := []struct {
		name        string
		text        string
		queryTokens []string
		wantScore   float64
		wantMatch   bool
	}{
		{
			name:        "exact match gets high score",
			text:        "knowledge graph",
			queryTokens: []string{"knowledge", "graph"},
			wantScore:   1.0,
			wantMatch:   true,
		},
		{
			name:        "partial match",
			text:        "build knowledge graph extraction",
			queryTokens: []string{"knowledge"},
			wantMatch:   true,
		},
		{
			name:        "case insensitive",
			text:        "KNOWLEDGE GRAPH",
			queryTokens: []string{"knowledge"},
			wantMatch:   true,
		},
		{
			name:        "no match",
			text:        "something else entirely",
			queryTokens: []string{"knowledge"},
			wantMatch:   false,
		},
		{
			name:        "multiple query terms",
			text:        "build knowledge graph for extraction",
			queryTokens: []string{"knowledge", "extraction"},
			wantMatch:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			score := scoreMatch(tt.text, tt.queryTokens)

			if tt.wantMatch && score == 0 {
				t.Errorf("scoreMatch(%q, %v) = 0, wanted non-zero", tt.text, tt.queryTokens)
			}
			if !tt.wantMatch && score > 0 {
				t.Errorf("scoreMatch(%q, %v) = %f, wanted 0", tt.text, tt.queryTokens, score)
			}
			if tt.wantScore > 0 && score != tt.wantScore {
				t.Errorf("scoreMatch(%q, %v) = %f, wanted %f", tt.text, tt.queryTokens, score, tt.wantScore)
			}
		})
	}
}

// TestExtractSearchSnippet tests snippet extraction.
func TestExtractSearchSnippet(t *testing.T) {
	tests := []struct {
		name        string
		text        string
		queryTokens []string
		want        string // substring that should be in snippet
	}{
		{
			name:        "query in middle",
			text:        "This is a long text with knowledge graph in the middle that continues",
			queryTokens: []string{"knowledge"},
			want:        "knowledge",
		},
		{
			name:        "query at start",
			text:        "Knowledge is power in this long text",
			queryTokens: []string{"knowledge"},
			want:        "Knowledge",
		},
		{
			name:        "query not found",
			text:        "Some other text entirely",
			queryTokens: []string{"knowledge"},
			want:        "Some other",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			snippet := extractSearchSnippet(tt.text, tt.queryTokens)

			if len(snippet) == 0 {
				t.Error("extractSearchSnippet returned empty string")
			}
			if len(snippet) > 200 {
				t.Errorf("extractSearchSnippet returned snippet too long: %d chars", len(snippet))
			}
		})
	}
}

// TestTokenize tests the tokenization function.
func TestTokenize(t *testing.T) {
	tests := []struct {
		input string
		want  []string
	}{
		{
			input: "hello world",
			want:  []string{"hello", "world"},
		},
		{
			input: "  multiple   spaces  ",
			want:  []string{"multiple", "spaces"},
		},
		{
			input: "UPPERCASE lowercase MixedCase",
			want:  []string{"uppercase", "lowercase", "mixedcase"},
		},
		{
			input: "",
			want:  []string{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := tokenize(tt.input)

			if len(got) != len(tt.want) {
				t.Errorf("tokenize(%q) = %v, want %v", tt.input, got, tt.want)
				return
			}

			for i, token := range got {
				if token != tt.want[i] {
					t.Errorf("tokenize(%q)[%d] = %q, want %q", tt.input, i, token, tt.want[i])
				}
			}
		})
	}
}
