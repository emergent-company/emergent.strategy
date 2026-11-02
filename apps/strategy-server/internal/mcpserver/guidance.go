package mcpserver

import (
	"context"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/agent"
)

const (
	// answeringRulesSkill is the name of the installed skill whose prompt is the
	// company's own rules for answering questions about its strategy.
	answeringRulesSkill = "answering-rules"
	// guidanceMaxChars bounds the rules carried in an outline. They are read at
	// the start of every question, so a long set would cost on every answer.
	guidanceMaxChars = 8000
)

// outlineGuidance is what a whole-instance outline tells the reader about how to
// answer: the general rules, and the company's own when it has installed them.
type outlineGuidance struct {
	HowToAnswer  string        `json:"how_to_answer"`
	CompanyRules *companyRules `json:"company_rules,omitempty"`
}

// companyRules is the company's answering rules, as installed in the instance.
type companyRules struct {
	Skill     string `json:"skill"`
	Pack      string `json:"pack,omitempty"`
	Text      string `json:"text"`
	SizeChars int    `json:"size_chars"`
	Truncated bool   `json:"truncated,omitempty"`
}

// outlineWithGuidance is the whole-instance outline plus the company's rules.
type outlineWithGuidance struct {
	// Guidance comes first: the outline is a long listing, and rules placed
	// after it were followed less in the evaluation.
	Guidance *outlineGuidance `json:"guidance,omitempty"`
	*strategy.OutlineResult
}

// answeringGuidance returns the general rules and, when the instance has
// installed an answering-rules skill, its prompt. The text is guidance for the
// reader; it is never executed.
func answeringGuidance(ctx context.Context, svc Services, instanceID uuid.UUID) (*outlineGuidance, error) {
	out := &outlineGuidance{HowToAnswer: agent.AnsweringRules()}
	rules, err := installedCompanyRules(ctx, svc, instanceID)
	if err != nil {
		return nil, err
	}
	out.CompanyRules = rules
	return out, nil
}

func installedCompanyRules(ctx context.Context, svc Services, instanceID uuid.UUID) (*companyRules, error) {
	if svc.Pack == nil {
		return nil, nil
	}
	skill, err := svc.Pack.InstalledSkill(ctx, instanceID, answeringRulesSkill)
	if err != nil {
		return nil, err
	}
	if skill == nil || skill.PromptMD == nil || *skill.PromptMD == "" {
		return nil, nil
	}
	text := *skill.PromptMD
	g := &companyRules{Skill: skill.SkillName, Text: text, SizeChars: utf8.RuneCountInString(text)}
	if skill.PackName != nil {
		g.Pack = *skill.PackName
	}
	if g.SizeChars > guidanceMaxChars {
		g.Text = string([]rune(text)[:guidanceMaxChars])
		g.Truncated = true
	}
	return g, nil
}
