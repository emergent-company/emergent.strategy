package handler

import (
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	evidencedom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/evidence"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// ---------------------------------------------------------------------------
// GET /strategies/:id/aim/evidence
// ---------------------------------------------------------------------------

// handleEvidencePage renders the evidence collection page.
func (s *Server) handleEvidencePage(c echo.Context) error {
	instanceID := c.Param("id")
	ctx := c.Request().Context()

	instID, err := uuid.Parse(instanceID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid instance ID")
	}

	data := ui.EvidencePageData{
		InstanceID: instanceID,
	}

	if s.evidenceSvc != nil {
		items, listErr := s.evidenceSvc.List(ctx, instID, evidencedom.ListFilters{})
		if listErr == nil {
			tagCounts := make(map[string]int)
			for _, item := range items {
				tags := item.Tags
				for _, tag := range tags {
					tagCounts[tag]++
				}
				data.Items = append(data.Items, ui.EvidenceItem{
					ArtifactKey:      item.ArtifactKey,
					SourceName:       item.Source.Name,
					SourceType:       item.Source.Type,
					Summary:          item.Summary,
					Tags:             tags,
					ProcessingStatus: item.ProcessingStatus,
					CreatedAt:        item.CreatedAt.Format("2 Jan 15:04"),
				})
			}
			data.TotalCount = len(items)
			data.TagCounts = tagCounts
		} else {
			s.log.Warn("evidence: failed to list items", "instance_id", instanceID, "err", listErr)
		}
	}

	content := ui.EvidencePageContent(data)
	return s.renderInstancePage(c, "Evidence", ui.PhaseRenderData{
		Title:   "Evidence",
		Content: content,
	})
}

// ---------------------------------------------------------------------------
// POST /strategies/:id/evidence/ingest
// ---------------------------------------------------------------------------

// handleIngestEvidence handles evidence form submission and redirects back to
// the evidence page.
func (s *Server) handleIngestEvidence(c echo.Context) error {
	instanceID := c.Param("id")
	ctx := c.Request().Context()

	instID, err := uuid.Parse(instanceID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid instance ID")
	}

	if s.evidenceSvc == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "evidence service not configured")
	}

	sourceName := strings.TrimSpace(c.FormValue("source_name"))
	sourceType := strings.TrimSpace(c.FormValue("source_type"))
	content := strings.TrimSpace(c.FormValue("content"))
	summary := strings.TrimSpace(c.FormValue("summary"))
	tagsRaw := strings.TrimSpace(c.FormValue("tags"))
	confidence := strings.TrimSpace(c.FormValue("confidence"))

	if sourceName == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "source_name is required")
	}
	if content == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "content is required")
	}

	tags := splitTags(tagsRaw)
	if confidence == "" {
		confidence = "medium"
	}

	req := evidencedom.IngestRequest{
		InstanceID: instID,
		Source: evidencedom.Source{
			Name:       sourceName,
			Type:       sourceType,
			Confidence: confidence,
		},
		CollectedAt: time.Now().UTC(),
		Content:     content,
		Tags:        tags,
		Summary:     summary,
	}

	key, err := s.evidenceSvc.Ingest(ctx, req)
	if err != nil {
		s.log.Error("evidence: ingest failed", "instance_id", instanceID, "err", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to store evidence")
	}

	s.log.Info("evidence: ingested", "instance_id", instanceID, "key", key, "source", sourceName)
	return c.Redirect(http.StatusSeeOther, "/strategies/"+instanceID+"/aim/evidence")
}

// ---------------------------------------------------------------------------
// GET /strategies/:id/aim/evidence/interview
// ---------------------------------------------------------------------------

// interviewQuestionDef defines one question in the guided interview.
type interviewQuestionDef struct {
	ID         string
	Question   string
	Hint       string
	Tags       []string
	SourceType string
}

// guidedInterviewQuestions is the canonical ordered list of strategy questions.
var guidedInterviewQuestions = []interviewQuestionDef{
	{
		ID:         "q_vision",
		Question:   "What is your product vision? What future are you building toward?",
		Hint:       "One or two paragraphs on the 3-5 year outcome you're after.",
		Tags:       []string{"vision", "strategy"},
		SourceType: "interview",
	},
	{
		ID:         "q_problem",
		Question:   "What problem does your product solve, and for whom?",
		Hint:       "Describe the target persona and the core pain point. Include any evidence you have.",
		Tags:       []string{"user_research", "market"},
		SourceType: "interview",
	},
	{
		ID:         "q_market",
		Question:   "What is the market opportunity? Size, growth trends, timing.",
		Hint:       "Include any market research, analyst reports, or first-hand observations.",
		Tags:       []string{"market", "trends"},
		SourceType: "interview",
	},
	{
		ID:         "q_competition",
		Question:   "Who are your main competitors and how do you differentiate?",
		Hint:       "List 3-5 competitors, their main strengths, and your edge.",
		Tags:       []string{"competitive"},
		SourceType: "interview",
	},
	{
		ID:         "q_value",
		Question:   "What is your unique value proposition?",
		Hint:       "Why would a customer choose you over alternatives?",
		Tags:       []string{"strategy", "pitch"},
		SourceType: "interview",
	},
	{
		ID:         "q_team",
		Question:   "Describe your team and its relevant strengths.",
		Hint:       "Relevant experience, unfair advantages, key hires needed.",
		Tags:       []string{"team", "strategy"},
		SourceType: "interview",
	},
}

// handleEvidenceInterviewPage renders the guided strategy interview.
func (s *Server) handleEvidenceInterviewPage(c echo.Context) error {
	instanceID := c.Param("id")
	ctx := c.Request().Context()

	instID, err := uuid.Parse(instanceID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid instance ID")
	}

	// Check which tag groups already have evidence, to skip those questions.
	coveredTags := map[string]bool{}
	if s.evidenceSvc != nil {
		items, listErr := s.evidenceSvc.List(ctx, instID, evidencedom.ListFilters{})
		if listErr == nil {
			for _, item := range items {
				for _, tag := range item.Tags {
					coveredTags[tag] = true
				}
			}
		}
	}

	var questions []ui.InterviewQuestion
	allCovered := true
	for _, def := range guidedInterviewQuestions {
		covered := false
		for _, tag := range def.Tags {
			if coveredTags[tag] {
				covered = true
				break
			}
		}
		if !covered {
			allCovered = false
		}
		questions = append(questions, ui.InterviewQuestion{
			ID:             def.ID,
			Question:       def.Question,
			Hint:           def.Hint,
			Tags:           def.Tags,
			SourceType:     def.SourceType,
			AlreadyCovered: covered,
		})
	}

	data := ui.EvidenceInterviewData{
		InstanceID: instanceID,
		Questions:  questions,
		AllCovered: allCovered,
	}

	content := ui.EvidenceInterviewContent(data)
	return s.renderInstancePage(c, "Strategy Interview", ui.PhaseRenderData{
		Title:   "Strategy Interview",
		Content: content,
	})
}

// ---------------------------------------------------------------------------
// POST /strategies/:id/evidence/interview
// ---------------------------------------------------------------------------

// handleSubmitInterview processes the guided interview form. Each non-empty
// answer is stored as a separate evidence item with appropriate tags.
func (s *Server) handleSubmitInterview(c echo.Context) error {
	instanceID := c.Param("id")
	ctx := c.Request().Context()

	instID, err := uuid.Parse(instanceID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid instance ID")
	}

	if s.evidenceSvc == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "evidence service not configured")
	}

	stored := 0
	for _, def := range guidedInterviewQuestions {
		answer := strings.TrimSpace(c.FormValue(def.ID))
		if answer == "" {
			continue
		}

		req := evidencedom.IngestRequest{
			InstanceID: instID,
			Source: evidencedom.Source{
				Name:       "Guided Interview",
				Type:       def.SourceType,
				Confidence: "high",
			},
			CollectedAt: time.Now().UTC(),
			Content:     answer,
			Tags:        def.Tags,
			Summary:     truncateSummary(answer, 120),
		}

		key, ingestErr := s.evidenceSvc.Ingest(ctx, req)
		if ingestErr != nil {
			s.log.Error("evidence: interview ingest failed", "question", def.ID, "err", ingestErr)
			continue
		}
		s.log.Info("evidence: interview answer stored", "question", def.ID, "key", key)
		stored++
	}

	s.log.Info("evidence: interview complete", "instance_id", instanceID, "answers_stored", stored)
	return c.Redirect(http.StatusSeeOther, "/strategies/"+instanceID+"/aim/evidence")
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// splitTags splits a comma-separated tag string into a trimmed slice.
func splitTags(raw string) []string {
	var tags []string
	for _, t := range strings.Split(raw, ",") {
		if tag := strings.TrimSpace(t); tag != "" {
			tags = append(tags, tag)
		}
	}
	return tags
}

// truncateSummary returns the first n characters of s with "..." appended if truncated.
func truncateSummary(s string, n int) string {
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n]) + "..."
}
