package mcpserver_test

import (
	"strings"
	"testing"

	"github.com/google/uuid"
)

type companyRules struct {
	Skill     string `json:"skill"`
	Pack      string `json:"pack"`
	Text      string `json:"text"`
	SizeChars int    `json:"size_chars"`
	Truncated bool   `json:"truncated"`
}

type outlineGuidance struct {
	HowToAnswer  string        `json:"how_to_answer"`
	CompanyRules *companyRules `json:"company_rules"`
}

type outlineWithGuidance struct {
	Artifacts []map[string]any `json:"artifacts"`
	Guidance  *outlineGuidance `json:"guidance"`
}

func installGuidanceSkill(t *testing.T, c *mcpClient, id *int, inst uuid.UUID, pack, skill, prompt string) {
	t.Helper()
	c.call(*id, "install_pack", map[string]any{
		"instance_id": inst.String(),
		"pack_yaml":   minimalPackYAML(pack, "1.0.0"),
		"skills": skillsJSONArray(map[string]any{
			"name":       skill,
			"skill_yaml": promptSkillYAML(skill),
			"prompt_md":  prompt,
		}),
	}).assertOK()
	*id++
}

func readOutline(t *testing.T, c *mcpClient, id *int, inst uuid.UUID, artifact string) outlineWithGuidance {
	t.Helper()
	args := map[string]any{"instance_id": inst.String()}
	if artifact != "" {
		args["artifact"] = artifact
	}
	var out outlineWithGuidance
	c.call(*id, "get_outline", args).assertOK().decode(&out)
	*id++
	return out
}

func TestMCP_OutlineCarriesHowToAnswerAndTheCompanysRules(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1
	_, inst := seedInstance(t, svc, "org-guidance", nil)

	plain := readOutline(t, c, &id, inst, "")
	if plain.Guidance == nil || !strings.Contains(plain.Guidance.HowToAnswer, "My reading:") {
		t.Fatalf("every whole-instance outline must carry how to answer, got %+v", plain.Guidance)
	}
	if plain.Guidance.CompanyRules != nil {
		t.Fatalf("an instance without the pack must carry no company rules, got %+v", plain.Guidance.CompanyRules)
	}

	installGuidanceSkill(t, c, &id, inst, "acme-other", "not-the-rules", "Some other skill.")
	if out := readOutline(t, c, &id, inst, ""); out.Guidance.CompanyRules != nil {
		t.Fatalf("only the skill named answering-rules holds company rules, got %+v", out.Guidance.CompanyRules)
	}

	rules := "Do not use the word \"band\".\nAudience: management."
	installGuidanceSkill(t, c, &id, inst, "acme-answering", "answering-rules", rules)

	out := readOutline(t, c, &id, inst, "")
	got := out.Guidance.CompanyRules
	if got == nil {
		t.Fatal("the outline must carry the installed answering rules")
	}
	if got.Text != rules || got.Skill != "answering-rules" || got.Pack != "acme-answering" {
		t.Errorf("company rules = %+v, want the pack's text, skill and pack name", got)
	}
	if got.Truncated || got.SizeChars != len(rules) {
		t.Errorf("company rules size=%d truncated=%v, want %d and false", got.SizeChars, got.Truncated, len(rules))
	}
	if out.Guidance.HowToAnswer != plain.Guidance.HowToAnswer {
		t.Error("the general rules must not change with the company's")
	}

	if per := readOutline(t, c, &id, inst, "strategy_formula"); per.Guidance != nil {
		t.Errorf("the per-artifact outline must not repeat the guidance, got %+v", per.Guidance)
	}
}

func TestMCP_OutlineGuidanceIsBoundedAndSaysSo(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	id := 1
	_, inst := seedInstance(t, svc, "org-guidance-big", nil)

	installGuidanceSkill(t, c, &id, inst, "acme-answering", "answering-rules", strings.Repeat("a rule. ", 2000))

	out := readOutline(t, c, &id, inst, "")
	got := out.Guidance.CompanyRules
	if got == nil {
		t.Fatal("company rules missing")
	}
	if !got.Truncated || len(got.Text) > 8000 || got.SizeChars != 16000 {
		t.Errorf("a long rule set must be cut at 8000 characters and say so: len=%d size=%d truncated=%v",
			len(got.Text), got.SizeChars, got.Truncated)
	}
}

func TestMCP_OutlineListsGuidanceBeforeTheOutline(t *testing.T) {
	svc := buildSvc(t)
	c := newMCPClient(t, svc)
	_, inst := seedInstance(t, svc, "org-guidance-order", nil)

	res := c.call(1, "get_outline", map[string]any{"instance_id": inst.String()}).assertOK()
	text := res.text
	g, a := strings.Index(text, `"guidance"`), strings.Index(text, `"artifacts"`)
	if g < 0 || a < 0 || g > a {
		t.Errorf("guidance must come before the outline listing: guidance at %d, artifacts at %d", g, a)
	}
}
