package decompose

import (
	"fmt"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/memory"
)

// ============================================================
// Expanded insight analyses extraction (Phase 1a)
// Completes the 16 missing sections from 01_insight_analyses.yaml
// ============================================================

// rawInsightAnalysesExpanded captures all 18 sections of insight analyses.
// The base rawInsightAnalyses already handles trends and target_users.
type rawInsightAnalysesExpanded struct {
	// Already handled by decomposeInsightAnalyses:
	// Trends      ...
	// TargetUsers ...

	// New sections:
	KeyInsights []struct {
		Insight              string   `yaml:"insight"`
		SupportingTrends     []string `yaml:"supporting_trends"`
		StrategicImplication string   `yaml:"strategic_implication"`
	} `yaml:"key_insights"`

	MarketDefinition struct {
		TAM struct {
			Size              string `yaml:"size"`
			CalculationMethod string `yaml:"calculation_method"`
		} `yaml:"tam"`
		SAM struct {
			Size       string `yaml:"size"`
			Definition string `yaml:"definition"`
		} `yaml:"sam"`
		SOM struct {
			Size      string `yaml:"size"`
			Timeframe string `yaml:"timeframe"`
		} `yaml:"som"`
		MarketStage string `yaml:"market_stage"`
		GrowthRate  string `yaml:"growth_rate"`
	} `yaml:"market_definition"`

	MarketStructure struct {
		Segments []struct {
			Segment         string   `yaml:"segment"`
			Size            string   `yaml:"size"`
			Characteristics []string `yaml:"characteristics"`
			UnmetNeeds      []string `yaml:"unmet_needs"`
		} `yaml:"segments"`
		ValueChain []struct {
			Stage      string   `yaml:"stage"`
			KeyPlayers []string `yaml:"key_players"`
			ValueCap   string   `yaml:"value_captured"`
		} `yaml:"value_chain"`
	} `yaml:"market_structure"`

	CompetitiveLandscape struct {
		DirectCompetitors []struct {
			Name        string   `yaml:"name"`
			Positioning string   `yaml:"positioning"`
			Strengths   []string `yaml:"strengths"`
			Weaknesses  []string `yaml:"weaknesses"`
		} `yaml:"direct_competitors"`
		StrategyTools []struct {
			Name        string   `yaml:"name"`
			Positioning string   `yaml:"positioning"`
			Strengths   []string `yaml:"strengths"`
			Weaknesses  []string `yaml:"weaknesses"`
		} `yaml:"strategy_tools"`
		IndirectCompetitors []struct {
			Name         string `yaml:"name"`
			HowTheySolve string `yaml:"how_they_solve"`
			ThreatLevel  string `yaml:"threat_level"`
		} `yaml:"indirect_competitors"`
		Substitutes []struct {
			Substitute string `yaml:"substitute"`
			Adoption   string `yaml:"adoption"`
		} `yaml:"substitutes"`
		BarriersToEntry []struct {
			Barrier string `yaml:"barrier"`
			Height  string `yaml:"height"`
		} `yaml:"barriers_to_entry"`
	} `yaml:"competitive_landscape"`

	MarketDynamics []struct {
		Dynamic     string `yaml:"dynamic"`
		Implication string `yaml:"implication"`
	} `yaml:"market_dynamics"`

	WhiteSpaces []struct {
		Gap                  string   `yaml:"gap"`
		Evidence             []string `yaml:"evidence"`
		OpportunityPotential string   `yaml:"opportunity_potential"`
	} `yaml:"white_spaces"`

	// SWOT
	Strengths []struct {
		Strength       string   `yaml:"strength"`
		Evidence       []string `yaml:"evidence"`
		StrategicValue string   `yaml:"strategic_value"`
	} `yaml:"strengths"`
	Weaknesses []struct {
		Weakness   string `yaml:"weakness"`
		Impact     string `yaml:"impact"`
		Mitigation string `yaml:"mitigation"`
	} `yaml:"weaknesses"`
	Opportunities []struct {
		Opportunity  string `yaml:"opportunity"`
		HowToExploit string `yaml:"how_to_exploit"`
		Priority     string `yaml:"priority"`
	} `yaml:"opportunities"`
	Threats []struct {
		Threat     string `yaml:"threat"`
		Likelihood string `yaml:"likelihood"`
		Mitigation string `yaml:"mitigation"`
	} `yaml:"threats"`

	StrategicImplications []struct {
		Insight string `yaml:"insight"`
		Action  string `yaml:"action"`
	} `yaml:"strategic_implications"`

	ProductProblemFitAnalysis struct {
		ProblemClarity      string `yaml:"problem_clarity"`
		ProblemSeverity     string `yaml:"problem_severity"`
		SolutionFeasibility string `yaml:"solution_feasibility"`
	} `yaml:"product_problem_fit_analysis"`

	ValidationStatus []struct {
		Hypothesis       string   `yaml:"hypothesis"`
		ValidationMethod string   `yaml:"validation_method"`
		Status           string   `yaml:"status"`
		Evidence         []string `yaml:"evidence"`
	} `yaml:"validation_status"`

	ProblemSolutionHypotheses []struct {
		Problem      string `yaml:"problem"`
		Hypothesis   string `yaml:"hypothesis"`
		TestApproach string `yaml:"test_approach"`
	} `yaml:"problem_solution_hypotheses"`

	OpportunityConvergence []struct {
		Opportunity        string   `yaml:"opportunity"`
		SupportingAnalyses []string `yaml:"supporting_analyses"`
		Strength           string   `yaml:"strength"`
	} `yaml:"opportunity_convergence"`

	StrategicTensions []struct {
		Tension  string `yaml:"tension"`
		Tradeoff string `yaml:"tradeoff"`
	} `yaml:"strategic_tensions"`

	ConfidenceGaps []struct {
		Gap        string `yaml:"gap"`
		WhyMatters string `yaml:"why_it_matters"`
		HowToClose string `yaml:"how_to_close"`
	} `yaml:"confidence_gaps"`

	NextAnalyticalSteps []struct {
		Step     string `yaml:"step"`
		Priority string `yaml:"priority"`
		Owner    string `yaml:"owner"`
	} `yaml:"next_analytical_steps"`
}

// decomposeInsightAnalysesExpanded extracts the 16 sections not handled
// by the base decomposeInsightAnalyses (trends + target_users).
// Called after decomposeInsightAnalyses so the artifact node already exists.
func (d *Decomposer) decomposeInsightAnalysesExpanded(result *Result) {
	var raw rawInsightAnalysesExpanded
	if err := d.readYAML("READY/01_insight_analyses.yaml", &raw); err != nil {
		return
	}

	// Find the existing artifact key for insight analyses
	artKey := objectKey("Artifact", "READY/01_insight_analyses.yaml")

	// Key Insights
	for i, ki := range raw.KeyInsights {
		if ki.Insight == "" {
			continue
		}
		key := objectKey("KeyInsight", fmt.Sprintf("insight_analyses:key_insights[%d]", i))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "KeyInsight", Key: key,
			Properties: map[string]any{
				"name":                  truncate(ki.Insight, 60),
				"insight":               ki.Insight,
				"supporting_trends":     strings.Join(ki.SupportingTrends, "; "),
				"strategic_implication": ki.StrategicImplication,
				"inertia_tier":          "2",
				"source_artifact":       "READY/01_insight_analyses.yaml",
				"section_path":          fmt.Sprintf("key_insights[%d]", i),
			},
		})
		d.addContains(result, artKey, "Artifact", key, "KeyInsight")
	}

	// Market Segments
	for i, seg := range raw.MarketStructure.Segments {
		if seg.Segment == "" {
			continue
		}
		key := objectKey("MarketSegment", fmt.Sprintf("insight_analyses:market_structure.segments[%d]", i))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "MarketSegment", Key: key,
			Properties: map[string]any{
				"name":            seg.Segment,
				"size":            seg.Size,
				"characteristics": strings.Join(seg.Characteristics, "; "),
				"unmet_needs":     strings.Join(seg.UnmetNeeds, "; "),
				"inertia_tier":    "2",
				"source_artifact": "READY/01_insight_analyses.yaml",
				"section_path":    fmt.Sprintf("market_structure.segments[%d]", i),
			},
		})
		d.addContains(result, artKey, "Artifact", key, "MarketSegment")
	}

	// Competitive Landscape — Direct Competitors
	for i, comp := range raw.CompetitiveLandscape.DirectCompetitors {
		if comp.Name == "" {
			continue
		}
		key := objectKey("Competitor", fmt.Sprintf("insight_analyses:competitive_landscape.direct_competitors[%d]", i))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "Competitor", Key: key,
			Properties: map[string]any{
				"name":            comp.Name,
				"positioning":     comp.Positioning,
				"strengths":       strings.Join(comp.Strengths, "; "),
				"weaknesses":      strings.Join(comp.Weaknesses, "; "),
				"competitor_type": "direct",
				"inertia_tier":    "2",
				"source_artifact": "READY/01_insight_analyses.yaml",
				"section_path":    fmt.Sprintf("competitive_landscape.direct_competitors[%d]", i),
			},
		})
		d.addContains(result, artKey, "Artifact", key, "Competitor")
	}

	// Strategy Tools (also competitors)
	for i, comp := range raw.CompetitiveLandscape.StrategyTools {
		if comp.Name == "" {
			continue
		}
		key := objectKey("Competitor", fmt.Sprintf("insight_analyses:competitive_landscape.strategy_tools[%d]", i))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "Competitor", Key: key,
			Properties: map[string]any{
				"name":            comp.Name,
				"positioning":     comp.Positioning,
				"strengths":       strings.Join(comp.Strengths, "; "),
				"weaknesses":      strings.Join(comp.Weaknesses, "; "),
				"competitor_type": "strategy_tool",
				"inertia_tier":    "2",
				"source_artifact": "READY/01_insight_analyses.yaml",
				"section_path":    fmt.Sprintf("competitive_landscape.strategy_tools[%d]", i),
			},
		})
		d.addContains(result, artKey, "Artifact", key, "Competitor")
	}

	// Indirect Competitors
	for i, comp := range raw.CompetitiveLandscape.IndirectCompetitors {
		if comp.Name == "" {
			continue
		}
		key := objectKey("Competitor", fmt.Sprintf("insight_analyses:competitive_landscape.indirect_competitors[%d]", i))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "Competitor", Key: key,
			Properties: map[string]any{
				"name":            comp.Name,
				"positioning":     comp.HowTheySolve,
				"competitor_type": "indirect",
				"threat_level":    comp.ThreatLevel,
				"inertia_tier":    "2",
				"source_artifact": "READY/01_insight_analyses.yaml",
				"section_path":    fmt.Sprintf("competitive_landscape.indirect_competitors[%d]", i),
			},
		})
		d.addContains(result, artKey, "Artifact", key, "Competitor")
	}

	// White Spaces
	for i, ws := range raw.WhiteSpaces {
		if ws.Gap == "" {
			continue
		}
		key := objectKey("WhiteSpace", fmt.Sprintf("insight_analyses:white_spaces[%d]", i))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "WhiteSpace", Key: key,
			Properties: map[string]any{
				"name":                  truncate(ws.Gap, 60),
				"description":           ws.Gap,
				"evidence":              strings.Join(ws.Evidence, "; "),
				"opportunity_potential": ws.OpportunityPotential,
				"inertia_tier":          "2",
				"source_artifact":       "READY/01_insight_analyses.yaml",
				"section_path":          fmt.Sprintf("white_spaces[%d]", i),
			},
		})
		d.addContains(result, artKey, "Artifact", key, "WhiteSpace")
	}

	// SWOT — Strengths
	for i, s := range raw.Strengths {
		if s.Strength == "" {
			continue
		}
		key := objectKey("Strength", fmt.Sprintf("insight_analyses:strengths[%d]", i))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "Strength", Key: key,
			Properties: map[string]any{
				"name":            truncate(s.Strength, 60),
				"description":     s.Strength,
				"evidence":        strings.Join(s.Evidence, "; "),
				"strategic_value": s.StrategicValue,
				"inertia_tier":    "2",
				"source_artifact": "READY/01_insight_analyses.yaml",
				"section_path":    fmt.Sprintf("strengths[%d]", i),
			},
		})
		d.addContains(result, artKey, "Artifact", key, "Strength")
	}

	// SWOT — Weaknesses
	for i, w := range raw.Weaknesses {
		if w.Weakness == "" {
			continue
		}
		key := objectKey("Weakness", fmt.Sprintf("insight_analyses:weaknesses[%d]", i))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "Weakness", Key: key,
			Properties: map[string]any{
				"name":            truncate(w.Weakness, 60),
				"description":     w.Weakness,
				"impact":          w.Impact,
				"mitigation":      w.Mitigation,
				"inertia_tier":    "2",
				"source_artifact": "READY/01_insight_analyses.yaml",
				"section_path":    fmt.Sprintf("weaknesses[%d]", i),
			},
		})
		d.addContains(result, artKey, "Artifact", key, "Weakness")
	}

	// SWOT — Opportunities
	for i, o := range raw.Opportunities {
		if o.Opportunity == "" {
			continue
		}
		key := objectKey("Opportunity", fmt.Sprintf("insight_analyses:opportunities[%d]", i))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "Opportunity", Key: key,
			Properties: map[string]any{
				"name":            truncate(o.Opportunity, 60),
				"description":     o.Opportunity,
				"how_to_exploit":  o.HowToExploit,
				"priority":        o.Priority,
				"inertia_tier":    "2",
				"source_artifact": "READY/01_insight_analyses.yaml",
				"section_path":    fmt.Sprintf("opportunities[%d]", i),
			},
		})
		d.addContains(result, artKey, "Artifact", key, "Opportunity")
	}

	// SWOT — Threats
	for i, t := range raw.Threats {
		if t.Threat == "" {
			continue
		}
		key := objectKey("Threat", fmt.Sprintf("insight_analyses:threats[%d]", i))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "Threat", Key: key,
			Properties: map[string]any{
				"name":            truncate(t.Threat, 60),
				"description":     t.Threat,
				"likelihood":      t.Likelihood,
				"mitigation":      t.Mitigation,
				"inertia_tier":    "2",
				"source_artifact": "READY/01_insight_analyses.yaml",
				"section_path":    fmt.Sprintf("threats[%d]", i),
			},
		})
		d.addContains(result, artKey, "Artifact", key, "Threat")
	}

	// Problem-Solution Hypotheses
	for i, h := range raw.ProblemSolutionHypotheses {
		if h.Hypothesis == "" {
			continue
		}
		key := objectKey("Hypothesis", fmt.Sprintf("insight_analyses:problem_solution_hypotheses[%d]", i))
		props := map[string]any{
			"name":              truncate(h.Hypothesis, 60),
			"hypothesis":        h.Hypothesis,
			"test_approach":     h.TestApproach,
			"validation_status": "pending",
			"inertia_tier":      "3",
			"source_artifact":   "READY/01_insight_analyses.yaml",
			"section_path":      fmt.Sprintf("problem_solution_hypotheses[%d]", i),
		}

		// Try to enrich with validation_status data by matching hypothesis text
		for _, vs := range raw.ValidationStatus {
			if vs.Hypothesis != "" && strings.Contains(strings.ToLower(h.Hypothesis), strings.ToLower(truncate(vs.Hypothesis, 40))) {
				props["validation_status"] = vs.Status
				props["validation_evidence"] = strings.Join(vs.Evidence, "; ")
				break
			}
		}

		d.addObject(result, memory.UpsertObjectRequest{
			Type: "Hypothesis", Key: key, Properties: props,
		})
		d.addContains(result, artKey, "Artifact", key, "Hypothesis")
	}

	// Validation status entries that don't match any hypothesis get their own nodes
	for i, vs := range raw.ValidationStatus {
		if vs.Hypothesis == "" {
			continue
		}
		// Check if already covered by a problem_solution_hypothesis
		alreadyCovered := false
		for _, h := range raw.ProblemSolutionHypotheses {
			if h.Hypothesis != "" && strings.Contains(strings.ToLower(h.Hypothesis), strings.ToLower(truncate(vs.Hypothesis, 40))) {
				alreadyCovered = true
				break
			}
		}
		if alreadyCovered {
			continue
		}
		key := objectKey("Hypothesis", fmt.Sprintf("insight_analyses:validation_status[%d]", i))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "Hypothesis", Key: key,
			Properties: map[string]any{
				"name":                truncate(vs.Hypothesis, 60),
				"hypothesis":          vs.Hypothesis,
				"test_approach":       vs.ValidationMethod,
				"validation_status":   vs.Status,
				"validation_evidence": strings.Join(vs.Evidence, "; "),
				"inertia_tier":        "3",
				"source_artifact":     "READY/01_insight_analyses.yaml",
				"section_path":        fmt.Sprintf("validation_status[%d]", i),
			},
		})
		d.addContains(result, artKey, "Artifact", key, "Hypothesis")
	}

	// Market dynamics — stored as Trend-tier objects with the dynamic/implication structure
	for i, md := range raw.MarketDynamics {
		if md.Dynamic == "" {
			continue
		}
		key := objectKey("Trend", fmt.Sprintf("insight_analyses:market_dynamics[%d]", i))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "Trend", Key: key,
			Properties: map[string]any{
				"name":            truncate(md.Dynamic, 60),
				"description":     md.Dynamic,
				"trend_type":      "market_dynamic",
				"impact":          md.Implication,
				"inertia_tier":    "2",
				"source_artifact": "READY/01_insight_analyses.yaml",
				"section_path":    fmt.Sprintf("market_dynamics[%d]", i),
			},
		})
		d.addContains(result, artKey, "Artifact", key, "Trend")
	}

	// Strategic implications — stored as properties on KeyInsight objects
	for i, si := range raw.StrategicImplications {
		if si.Insight == "" {
			continue
		}
		key := objectKey("KeyInsight", fmt.Sprintf("insight_analyses:strategic_implications[%d]", i))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "KeyInsight", Key: key,
			Properties: map[string]any{
				"name":                  truncate(si.Insight, 60),
				"insight":               si.Insight,
				"strategic_implication": si.Action,
				"inertia_tier":          "2",
				"source_artifact":       "READY/01_insight_analyses.yaml",
				"section_path":          fmt.Sprintf("strategic_implications[%d]", i),
			},
		})
		d.addContains(result, artKey, "Artifact", key, "KeyInsight")
	}

	// Opportunity convergence — stored as KeyInsight objects showing where analyses converge
	for i, oc := range raw.OpportunityConvergence {
		if oc.Opportunity == "" {
			continue
		}
		key := objectKey("KeyInsight", fmt.Sprintf("insight_analyses:opportunity_convergence[%d]", i))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "KeyInsight", Key: key,
			Properties: map[string]any{
				"name":                  truncate(oc.Opportunity, 60),
				"insight":               oc.Opportunity,
				"supporting_trends":     strings.Join(oc.SupportingAnalyses, "; "),
				"strategic_implication": fmt.Sprintf("Convergence strength: %s", oc.Strength),
				"inertia_tier":          "2",
				"source_artifact":       "READY/01_insight_analyses.yaml",
				"section_path":          fmt.Sprintf("opportunity_convergence[%d]", i),
			},
		})
		d.addContains(result, artKey, "Artifact", key, "KeyInsight")
	}

	// Strategic tensions — important for identifying trade-offs
	for i, st := range raw.StrategicTensions {
		if st.Tension == "" {
			continue
		}
		key := objectKey("KeyInsight", fmt.Sprintf("insight_analyses:strategic_tensions[%d]", i))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "KeyInsight", Key: key,
			Properties: map[string]any{
				"name":                  truncate(st.Tension, 60),
				"insight":               st.Tension,
				"strategic_implication": st.Tradeoff,
				"inertia_tier":          "2",
				"source_artifact":       "READY/01_insight_analyses.yaml",
				"section_path":          fmt.Sprintf("strategic_tensions[%d]", i),
			},
		})
		d.addContains(result, artKey, "Artifact", key, "KeyInsight")
	}
}
