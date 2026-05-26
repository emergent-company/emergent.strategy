// Package agent — epf_knowledge.go
//
// Loads EPF framework knowledge from embedded canonical documentation (white
// paper + guides) and exposes it as TopicEntry items that are appended to the
// knowledge base at init time.
//
// This ensures the knowledge base always reflects the canonical EPF version
// compiled into the binary, not a hand-maintained copy that can drift.
package agent

import (
	"fmt"
	"log/slog"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
)

// epfFrameworkTopics holds the EPF framework topics loaded from embedded docs.
// Populated by init() below and appended to KnowledgeBase.
var epfFrameworkTopics []TopicEntry

func init() {
	topics, err := loadEPFFrameworkTopics()
	if err != nil {
		slog.Warn("failed to load EPF framework knowledge from embedded docs", "err", err)
		return
	}
	if len(topics) == 0 {
		slog.Info("no EPF framework docs embedded — knowledge base will use hand-written entries only")
		return
	}

	KnowledgeBase = append(KnowledgeBase, TopicEntry{
		Topic: "--- Section 3: EPF Framework Reference (from canonical EPF) ---",
		Body: fmt.Sprintf(
			"The following topics are auto-generated from the canonical EPF white paper "+
				"and framework guides (version %s). They represent the authoritative EPF "+
				"philosophy, principles, and artifact structures. When reasoning about "+
				"EPF concepts, prefer these over generic strategy knowledge.",
			strings.TrimSpace(embedded.Version),
		),
	})
	KnowledgeBase = append(KnowledgeBase, topics...)

	slog.Info("loaded EPF framework knowledge",
		"white_paper_chunks", countWhitePaperChunks(topics),
		"guide_count", countGuides(topics),
		"total_topics", len(topics),
	)
}

// loadEPFFrameworkTopics loads and chunks the white paper and guides into
// TopicEntry items suitable for the knowledge base.
func loadEPFFrameworkTopics() ([]TopicEntry, error) {
	var topics []TopicEntry

	// --- White paper ---
	wpData, err := embedded.GetWhitePaper()
	if err != nil {
		return nil, fmt.Errorf("load white paper: %w", err)
	}
	if wpData != nil {
		chunks := chunkMarkdown(string(wpData))
		for _, chunk := range chunks {
			topics = append(topics, TopicEntry{
				Topic: "EPF White Paper — " + chunk.heading,
				Body:  chunk.body,
			})
		}
	}

	// --- Guides ---
	guides, err := embedded.ListGuides()
	if err != nil {
		return nil, fmt.Errorf("list guides: %w", err)
	}
	for _, guidePath := range guides {
		data, err := embedded.GetGuide(guidePath)
		if err != nil {
			slog.Warn("skipping guide", "path", guidePath, "err", err)
			continue
		}
		title := guideTitle(guidePath, data)
		topics = append(topics, TopicEntry{
			Topic: "EPF Guide — " + title,
			Body:  string(data),
		})
	}

	return topics, nil
}

// markdownChunk is one section of a markdown document.
type markdownChunk struct {
	heading string
	body    string
}

// chunkMarkdown splits a markdown document at ## (h2) heading boundaries.
// Each chunk includes the heading and all content until the next ## heading.
// Content before the first ## heading is included as a "Preamble" chunk.
//
// This targets the white paper structure where ## delineates major sections
// like "The Philosophical Foundation", "The Four-Track Braided Model", etc.
func chunkMarkdown(content string) []markdownChunk {
	lines := strings.Split(content, "\n")
	var chunks []markdownChunk
	var currentHeading string
	var currentLines []string

	flush := func() {
		body := strings.TrimSpace(strings.Join(currentLines, "\n"))
		if body == "" {
			return
		}
		heading := currentHeading
		if heading == "" {
			heading = "Preamble"
		}
		chunks = append(chunks, markdownChunk{heading: heading, body: body})
	}

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		// Detect ## headings (but not ### or deeper).
		if strings.HasPrefix(trimmed, "## ") && !strings.HasPrefix(trimmed, "### ") {
			flush()
			currentHeading = strings.TrimPrefix(trimmed, "## ")
			currentLines = nil
			continue
		}

		// Also detect # headings (top-level parts like "PART I: THE CRISIS").
		if strings.HasPrefix(trimmed, "# ") && !strings.HasPrefix(trimmed, "## ") {
			flush()
			currentHeading = strings.TrimPrefix(trimmed, "# ")
			currentLines = nil
			continue
		}

		currentLines = append(currentLines, line)
	}
	flush()

	return chunks
}

// guideTitle extracts a human-readable title from a guide file.
// First tries to find a # heading in the content. Falls back to cleaning
// up the filename.
func guideTitle(filePath string, data []byte) string {
	// Try to find a # heading in the first 20 lines.
	lines := strings.SplitN(string(data), "\n", 20)
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "# ") {
			return strings.TrimPrefix(trimmed, "# ")
		}
	}
	// Fall back to filename cleanup.
	name := filePath
	// Strip directory prefix (e.g. "technical/").
	if idx := strings.LastIndex(name, "/"); idx >= 0 {
		name = name[idx+1:]
	}
	name = strings.TrimSuffix(name, ".md")
	name = strings.ReplaceAll(name, "_", " ")
	return name
}

func countWhitePaperChunks(topics []TopicEntry) int {
	count := 0
	for _, t := range topics {
		if strings.HasPrefix(t.Topic, "EPF White Paper") {
			count++
		}
	}
	return count
}

func countGuides(topics []TopicEntry) int {
	count := 0
	for _, t := range topics {
		if strings.HasPrefix(t.Topic, "EPF Guide") {
			count++
		}
	}
	return count
}
