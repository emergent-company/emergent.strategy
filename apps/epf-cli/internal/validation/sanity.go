package validation

import (
	"strings"

	"github.com/emergent-company/product-factory-os/apps/epf-cli/internal/context"
)

// AlignmentWarning represents a potential content/product mismatch
type AlignmentWarning struct {
	Field       string   // Field path (e.g., "mission", "definition.job_to_be_done")
	Issue       string   // Human-readable description of the issue
	ProductHint string   // What the product is actually about
	ContentHint string   // What the content seems to be about
	Confidence  string   // "high", "medium", "low"
	Suggestion  string   // How to fix it
	Keywords    []string // Mismatched keywords found
}

// CheckContentAlignment detects when field content doesn't match product domain
// Returns nil if alignment looks good, or an AlignmentWarning if suspicious
func CheckContentAlignment(ctx *context.InstanceContext, fieldPath string, content string) *AlignmentWarning {
	if ctx == nil || !ctx.Found || content == "" {
		return nil
	}

	// Get product keywords (what the product IS)
	productKeywords := ctx.GetKeywords()
	if len(productKeywords) == 0 {
		return nil // Can't check without product context
	}

	// Get content keywords (what the content talks about)
	contentKeywords := extractContentKeywords(content)
	if len(contentKeywords) == 0 {
		return nil // Content too short to analyze
	}

	// Check for known domain mismatches
	warning := detectDomainMismatch(ctx, fieldPath, productKeywords, contentKeywords, content)

	return warning
}

// extractContentKeywords extracts keywords from content for matching
func extractContentKeywords(content string) []string {
	// Normalize and split
	content = strings.ToLower(content)
	replacer := strings.NewReplacer(
		"-", " ",
		"/", " ",
		"_", " ",
		":", " ",
		",", " ",
		".", " ",
	)
	content = replacer.Replace(content)
	words := strings.Fields(content)

	// Filter out stop words (common words that don't indicate domain)
	stopWords := map[string]bool{
		"the": true, "a": true, "an": true, "and": true, "or": true,
		"but": true, "in": true, "on": true, "at": true, "to": true,
		"for": true, "of": true, "with": true, "by": true, "from": true,
		"is": true, "are": true, "was": true, "were": true, "be": true,
		"been": true, "being": true, "have": true, "has": true, "had": true,
		"do": true, "does": true, "did": true, "will": true, "would": true,
		"could": true, "should": true, "may": true, "might": true, "must": true,
		"can": true, "that": true, "this": true, "these": true, "those": true,
		"their": true, "them": true, "they": true, "we": true, "our": true,
		"us": true, "you": true, "your": true, "it": true, "its": true,
		"when": true, "where": true, "why": true, "how": true, "what": true,
		"which": true, "who": true, "whom": true, "whose": true,
	}

	keywords := make([]string, 0)
	for _, word := range words {
		if len(word) > 3 && !stopWords[word] {
			keywords = append(keywords, word)
		}
	}

	return keywords
}

// detectDomainMismatch checks for obvious domain mismatches
func detectDomainMismatch(ctx *context.InstanceContext, fieldPath string, productKeywords []string, contentKeywords []string, content string) *AlignmentWarning {
	// Build keyword sets for faster lookup
	productSet := make(map[string]bool)
	for _, kw := range productKeywords {
		productSet[kw] = true
	}

	contentSet := make(map[string]bool)
	for _, kw := range contentKeywords {
		contentSet[kw] = true
	}

	// Check for significant keywords in content that are NOT in product
	// These indicate the content might be about something else
	suspiciousKeywords := make([]string, 0)
	suspiciousCount := 0

	// Strong domain indicators (if these appear in content but not product, it's suspicious)
	// BUT: Some words like "product", "planning", "evidence" are common across many domains
	strongDomainIndicators := []string{
		// Software-specific
		"platform", "system", "application", "software", "code", "developer",
		// Finance-specific
		"banking", "transaction", "payment", "financial", "invoice", "billing",
		// Agriculture-specific
		"farming", "agricultural", "crops", "harvest", "irrigation", "farmers",
		// Transportation-specific
		"vehicle", "road", "transportation", "logistics", "delivery", "shipping",
		// Healthcare-specific
		"patient", "medical", "healthcare", "clinical", "diagnosis", "treatment",
	}

	// Weak indicators - common words that hint at domain but aren't definitive
	weakDomainIndicators := []string{
		"management", "planning", "framework", "strategy", "organization",
		"evidence", "research", "analysis", "development", "tool", "service",
	}

	strongMismatches := 0
	weakMismatches := 0

	for _, indicator := range strongDomainIndicators {
		if contentSet[indicator] && !productSet[indicator] {
			suspiciousKeywords = append(suspiciousKeywords, indicator)
			strongMismatches++
			suspiciousCount++
		}
	}

	for _, indicator := range weakDomainIndicators {
		if contentSet[indicator] && !productSet[indicator] {
			weakMismatches++
			// Only count weak mismatches if we have multiple
			if weakMismatches > 3 {
				suspiciousKeywords = append(suspiciousKeywords, indicator)
				suspiciousCount++
			}
		}
	}

	// Trigger warning based on strong mismatches (domain-specific words)
	// or many weak mismatches (generic business words)
	if strongMismatches >= 2 {
		// 2+ strong domain indicators from different domain = high confidence mismatch
		return &AlignmentWarning{
			Field:       fieldPath,
			Issue:       "Content describes a different product domain",
			ProductHint: ctx.ProductName + " (" + ctx.Description + ")",
			ContentHint: strings.Join(suspiciousKeywords[:min(3, len(suspiciousKeywords))], ", "),
			Confidence:  getConfidenceLevelStrong(strongMismatches),
			Suggestion:  "Verify this content is about " + ctx.ProductName + ", not a different product",
			Keywords:    suspiciousKeywords,
		}
	} else if weakMismatches >= 5 {
		// Many generic business words not in product = medium confidence
		return &AlignmentWarning{
			Field:       fieldPath,
			Issue:       "Content may describe a different product/domain",
			ProductHint: ctx.ProductName + " (" + ctx.Description + ")",
			ContentHint: strings.Join(suspiciousKeywords[:min(3, len(suspiciousKeywords))], ", "),
			Confidence:  "medium",
			Suggestion:  "Verify this content is about " + ctx.ProductName + ", not a different product",
			Keywords:    suspiciousKeywords,
		}
	}

	// Check for extremely low overlap (content talks about something completely different)
	overlap := calculateOverlap(productSet, contentSet)
	if overlap < 0.1 && len(contentKeywords) > 10 {
		return &AlignmentWarning{
			Field:       fieldPath,
			Issue:       "Very low keyword overlap with product description",
			ProductHint: ctx.ProductName,
			ContentHint: strings.Join(contentKeywords[:min(5, len(contentKeywords))], ", "),
			Confidence:  "medium",
			Suggestion:  "Check if this content is relevant to " + ctx.ProductName,
			Keywords:    contentKeywords[:min(5, len(contentKeywords))],
		}
	}

	return nil
}

// getConfidenceLevelStrong returns confidence for strong domain mismatches
func getConfidenceLevelStrong(strongCount int) string {
	if strongCount >= 3 {
		return "high"
	} else if strongCount >= 2 {
		return "high" // Changed: 2+ strong mismatches = high confidence
	}
	return "medium"
}

// calculateOverlap returns the percentage of content keywords that appear in product keywords
func calculateOverlap(productSet map[string]bool, contentSet map[string]bool) float64 {
	if len(contentSet) == 0 {
		return 0.0
	}

	matches := 0
	for kw := range contentSet {
		if productSet[kw] {
			matches++
		}
	}

	return float64(matches) / float64(len(contentSet))
}

// getConfidenceLevel returns confidence based on number of mismatched indicators
func getConfidenceLevel(suspiciousCount int) string {
	if suspiciousCount >= 5 {
		return "high"
	} else if suspiciousCount >= 3 {
		return "medium"
	}
	return "low"
}

// min returns the minimum of two integers
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
