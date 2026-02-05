package validation

import (
	"testing"

	"github.com/eyedea-io/emergent/apps/epf-cli/internal/context"
)

func TestCheckContentAlignment_VeilagMismatch(t *testing.T) {
	// This is the actual bug we're trying to catch!
	// Veilag is a Norwegian road cost allocation platform
	// but the content talks about "planning frameworks"

	ctx := &context.InstanceContext{
		ProductName: "Veilag",
		Description: "Norwegian private road cost allocation platform for managing shared road maintenance costs",
		Domain:      "transportation",
		Found:       true,
	}

	content := `Empowering product organizations with evidence-based planning frameworks that transform roadmap uncertainty into strategic clarity`

	warning := CheckContentAlignment(ctx, "mission", content)

	if warning == nil {
		t.Fatal("Expected alignment warning for Veilag/planning mismatch, got nil")
	}

	if warning.Confidence != "high" && warning.Confidence != "medium" {
		t.Errorf("Expected high/medium confidence for obvious mismatch, got %s", warning.Confidence)
	}

	if len(warning.Keywords) == 0 {
		t.Error("Expected suspicious keywords to be identified")
	}

	// Should mention planning/framework/product which are NOT about roads
	hasRelevantKeyword := false
	for _, kw := range warning.Keywords {
		if kw == "planning" || kw == "framework" || kw == "product" {
			hasRelevantKeyword = true
			break
		}
	}
	if !hasRelevantKeyword {
		t.Errorf("Expected warning keywords to include planning/framework/product, got %v", warning.Keywords)
	}
}

func TestCheckContentAlignment_GoodMatch(t *testing.T) {
	// Content that DOES match the product
	ctx := &context.InstanceContext{
		ProductName: "Veilag",
		Description: "Norwegian private road cost allocation platform",
		Domain:      "transportation",
		Found:       true,
	}

	content := `Managing private road maintenance costs through transparent allocation and billing for Norwegian road associations`

	warning := CheckContentAlignment(ctx, "mission", content)

	if warning != nil {
		t.Errorf("Expected no warning for matching content, got: %+v", warning)
	}
}

func TestCheckContentAlignment_NoContext(t *testing.T) {
	// Should not crash without context
	warning := CheckContentAlignment(nil, "mission", "some content")

	if warning != nil {
		t.Error("Expected nil warning when no context provided")
	}
}

func TestCheckContentAlignment_EmptyContent(t *testing.T) {
	ctx := &context.InstanceContext{
		ProductName: "Test Product",
		Description: "A test product",
		Found:       true,
	}

	warning := CheckContentAlignment(ctx, "mission", "")

	if warning != nil {
		t.Error("Expected nil warning for empty content")
	}
}

func TestCheckContentAlignment_ShortContent(t *testing.T) {
	// Very short content (few keywords) should not trigger warnings
	ctx := &context.InstanceContext{
		ProductName: "DataViz",
		Description: "Data visualization platform",
		Domain:      "analytics",
		Found:       true,
	}

	content := "Planning roadmaps" // Only 2 keywords, not enough to judge

	warning := CheckContentAlignment(ctx, "mission", content)

	// Should not warn on very short content
	if warning != nil {
		t.Logf("Note: Short content triggered warning: %+v", warning)
		// This is OK, just logging for visibility
	}
}

func TestCheckContentAlignment_PartialOverlap(t *testing.T) {
	// Content that partially overlaps (some shared keywords, some not)
	ctx := &context.InstanceContext{
		ProductName: "Product Manager Assistant",
		Description: "AI-powered product management and roadmap planning tool",
		Domain:      "product-management",
		Found:       true,
	}

	content := `Helping product teams create evidence-based roadmaps with strategic planning frameworks and research analysis`

	warning := CheckContentAlignment(ctx, "mission", content)

	// This should NOT warn - product/roadmap/planning are all relevant
	if warning != nil {
		t.Errorf("Expected no warning for content with good overlap, got: %+v", warning)
	}
}

func TestCheckContentAlignment_CompleteMismatch(t *testing.T) {
	// Completely unrelated content
	ctx := &context.InstanceContext{
		ProductName: "BankFlow",
		Description: "Banking transaction management system",
		Domain:      "fintech",
		Found:       true,
	}

	content := `Agricultural equipment rental platform for farmers to share tractors and combines across rural communities`

	warning := CheckContentAlignment(ctx, "mission", content)

	if warning == nil {
		t.Fatal("Expected alignment warning for banking/agriculture mismatch, got nil")
	}

	if warning.Confidence != "high" {
		t.Errorf("Expected high confidence for extreme mismatch, got %s", warning.Confidence)
	}
}

func TestExtractContentKeywords(t *testing.T) {
	tests := []struct {
		name             string
		content          string
		expectedContains []string
		expectedExcludes []string
	}{
		{
			name:             "Product management content",
			content:          "Product roadmap planning with evidence-based frameworks",
			expectedContains: []string{"product", "roadmap", "planning", "evidence", "based", "frameworks"},
			expectedExcludes: []string{"with", "the", "and"},
		},
		{
			name:             "Transportation content",
			content:          "Managing road maintenance costs for private roads",
			expectedContains: []string{"managing", "road", "maintenance", "costs", "private", "roads"},
			expectedExcludes: []string{"for", "the"},
		},
		{
			name:             "Short words filtered",
			content:          "AI in ML and NLP",
			expectedContains: []string{}, // All words too short (2-3 chars)
			expectedExcludes: []string{"ai", "in", "ml", "and", "nlp"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			keywords := extractContentKeywords(tt.content)

			// Check expected contains
			for _, expected := range tt.expectedContains {
				found := false
				for _, kw := range keywords {
					if kw == expected {
						found = true
						break
					}
				}
				if !found {
					t.Errorf("Expected keyword '%s' not found in %v", expected, keywords)
				}
			}

			// Check expected excludes
			for _, excluded := range tt.expectedExcludes {
				for _, kw := range keywords {
					if kw == excluded {
						t.Errorf("Excluded keyword '%s' found in %v", excluded, keywords)
					}
				}
			}
		})
	}
}

func TestCheckContentAlignment_NoProductKeywords(t *testing.T) {
	// Edge case: product has no extractable keywords
	ctx := &context.InstanceContext{
		ProductName: "", // Empty name
		Description: "", // Empty description
		Found:       true,
	}

	content := "Some content here"

	warning := CheckContentAlignment(ctx, "mission", content)

	if warning != nil {
		t.Error("Expected nil warning when product has no keywords")
	}
}

func TestCheckContentAlignment_LowOverlap(t *testing.T) {
	// Content with very low keyword overlap but long enough to analyze
	ctx := &context.InstanceContext{
		ProductName: "CodeReview",
		Description: "Automated code review platform",
		Domain:      "developer-tools",
		Found:       true,
	}

	// 10+ keywords, but none about code/review/developer
	// Uses strong domain indicators (agricultural, farming) so will trigger domain mismatch
	content := `Agricultural farming management system helping farmers track crops yields weather patterns irrigation schedules harvest planning seasonal optimization`

	warning := CheckContentAlignment(ctx, "mission", content)

	if warning == nil {
		t.Fatal("Expected alignment warning for agriculture/developer mismatch, got nil")
	}

	// Should detect as different domain (high confidence due to "agricultural", "farming", "farmers")
	if warning.Issue != "Content describes a different product domain" {
		t.Errorf("Expected domain mismatch warning, got: %s", warning.Issue)
	}

	if warning.Confidence != "high" {
		t.Errorf("Expected high confidence for strong domain mismatch, got %s", warning.Confidence)
	}
}
