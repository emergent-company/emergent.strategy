package handler

import (
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	evidencedom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/evidence"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/langs"
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
		return echo.NewHTTPError(http.StatusBadRequest, langs.T(ctx, "error.invalid_instance_id"))
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
		return echo.NewHTTPError(http.StatusBadRequest, langs.T(ctx, "error.invalid_instance_id"))
	}

	if s.evidenceSvc == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, langs.T(ctx, "error.evidence_service_not_configured"))
	}

	sourceName := strings.TrimSpace(c.FormValue("source_name"))
	sourceType := strings.TrimSpace(c.FormValue("source_type"))
	content := strings.TrimSpace(c.FormValue("content"))
	summary := strings.TrimSpace(c.FormValue("summary"))
	tagsRaw := strings.TrimSpace(c.FormValue("tags"))
	confidence := strings.TrimSpace(c.FormValue("confidence"))

	if sourceName == "" {
		return echo.NewHTTPError(http.StatusBadRequest, langs.T(ctx, "error.source_name_required"))
	}
	if content == "" {
		return echo.NewHTTPError(http.StatusBadRequest, langs.T(ctx, "error.content_required"))
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
		return echo.NewHTTPError(http.StatusInternalServerError, langs.T(ctx, "error.evidence_store_failed"))
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
// Question/Hint fields use langs keys — resolved at request time via langs.T(ctx, ...).
var guidedInterviewQuestions = []interviewQuestionDef{
	{
		ID:         "q_vision",
		Question:   "evidence.interview.q_vision",
		Hint:       "evidence.interview.q_vision_hint",
		Tags:       []string{"vision", "strategy"},
		SourceType: "interview",
	},
	{
		ID:         "q_problem",
		Question:   "evidence.interview.q_problem",
		Hint:       "evidence.interview.q_problem_hint",
		Tags:       []string{"user_research", "market"},
		SourceType: "interview",
	},
	{
		ID:         "q_market",
		Question:   "evidence.interview.q_market",
		Hint:       "evidence.interview.q_market_hint",
		Tags:       []string{"market", "trends"},
		SourceType: "interview",
	},
	{
		ID:         "q_competition",
		Question:   "evidence.interview.q_competition",
		Hint:       "evidence.interview.q_competition_hint",
		Tags:       []string{"competitive"},
		SourceType: "interview",
	},
	{
		ID:         "q_value",
		Question:   "evidence.interview.q_value",
		Hint:       "evidence.interview.q_value_hint",
		Tags:       []string{"strategy", "pitch"},
		SourceType: "interview",
	},
	{
		ID:         "q_team",
		Question:   "evidence.interview.q_team",
		Hint:       "evidence.interview.q_team_hint",
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
		return echo.NewHTTPError(http.StatusBadRequest, langs.T(ctx, "error.invalid_instance_id"))
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
			Question:       langs.T(ctx, def.Question),
			Hint:           langs.T(ctx, def.Hint),
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
	title := langs.T(ctx, "page.strategy_interview")
	return s.renderInstancePage(c, title, ui.PhaseRenderData{
		Title:   title,
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
		return echo.NewHTTPError(http.StatusBadRequest, langs.T(ctx, "error.invalid_instance_id"))
	}

	if s.evidenceSvc == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, langs.T(ctx, "error.evidence_service_not_configured"))
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
				Name:       langs.T(ctx, "evidence.source.guided_interview"),
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
