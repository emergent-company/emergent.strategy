package decompose

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/memory"
)

// ============================================================
// Phase 1b: Strategy Formula Expansion (6 new sections)
// ============================================================

type rawStrategyFormulaExpanded struct {
	Strategy struct {
		EcosystemDifferentiation struct {
			Summary             string `yaml:"summary"`
			EcosystemComponents []struct {
				Component       string `yaml:"component"`
				Metaphor        string `yaml:"metaphor"`
				Role            string `yaml:"role"`
				StandaloneValue string `yaml:"standalone_value"`
				EcosystemValue  string `yaml:"ecosystem_value"`
			} `yaml:"ecosystem_components"`
			EcosystemSynergies []struct {
				Synergy    string `yaml:"synergy"`
				How        string `yaml:"how"`
				UniqueToUs string `yaml:"unique_to_us"`
			} `yaml:"ecosystem_synergies"`
		} `yaml:"ecosystem_differentiation"`

		ValueCreation struct {
			ValueDrivers []struct {
				Driver    string `yaml:"driver"`
				Mechanism string `yaml:"mechanism"`
				Flywheel  string `yaml:"flywheel"`
			} `yaml:"value_drivers"`
			KeyCapabilities []struct {
				Capability   string `yaml:"capability"`
				WhyCritical  string `yaml:"why_critical"`
				CurrentState string `yaml:"current_state"`
			} `yaml:"key_capabilities"`
		} `yaml:"value_creation"`

		BusinessModel struct {
			RevenueModel      string `yaml:"revenue_model"`
			PricingPhilosophy string `yaml:"pricing_philosophy"`
			PricingTiers      []struct {
				Tier    string `yaml:"tier"`
				Price   string `yaml:"price"`
				Limits  string `yaml:"limits"`
				Purpose string `yaml:"purpose"`
			} `yaml:"pricing_tiers"`
			GrowthEngines []struct {
				Engine     string `yaml:"engine"`
				Mechanism  string `yaml:"mechanism"`
				Investment string `yaml:"investment"`
			} `yaml:"growth_engines"`
		} `yaml:"business_model"`

		Constraints []struct {
			Constraint  string `yaml:"constraint"`
			Implication string `yaml:"implication"`
			Strategy    string `yaml:"strategy"`
		} `yaml:"constraints"`

		TradeOffs []struct {
			Decision     string `yaml:"decision"`
			WhatWeGain   string `yaml:"what_we_gain"`
			WhatWeGiveUp string `yaml:"what_we_give_up"`
			Rationale    string `yaml:"rationale"`
		} `yaml:"trade_offs"`

		Risks []struct {
			Risk       string `yaml:"risk"`
			Likelihood string `yaml:"likelihood"`
			Impact     string `yaml:"impact"`
			Mitigation string `yaml:"mitigation"`
			Monitoring string `yaml:"monitoring"`
		} `yaml:"risks"`

		SuccessMetrics struct {
			NorthStarMetric   string `yaml:"north_star_metric"`
			SupportingMetrics []struct {
				Metric       string `yaml:"metric"`
				TargetPhase1 string `yaml:"target_phase_1"`
				Why          string `yaml:"why"`
			} `yaml:"supporting_metrics"`
		} `yaml:"success_metrics"`
	} `yaml:"strategy"`
}

func (d *Decomposer) decomposeStrategyFormulaExpanded(result *Result) {
	var raw rawStrategyFormulaExpanded
	if err := d.readYAML("READY/04_strategy_formula.yaml", &raw); err != nil {
		return
	}

	artKey := objectKey("Artifact", "READY/04_strategy_formula.yaml")

	// Ecosystem components → Positioning objects (tier 3, they're strategy-level)
	for i, comp := range raw.Strategy.EcosystemDifferentiation.EcosystemComponents {
		if comp.Component == "" {
			continue
		}
		key := objectKey("Positioning", fmt.Sprintf("strategy_formula:ecosystem.%d", i))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "Positioning", Key: key,
			Properties: map[string]any{
				"name":            comp.Component,
				"claim":           fmt.Sprintf("%s: %s (standalone: %s, ecosystem: %s)", comp.Component, comp.Role, comp.StandaloneValue, comp.EcosystemValue),
				"moat_type":       "ecosystem",
				"inertia_tier":    "3",
				"source_artifact": "READY/04_strategy_formula.yaml",
				"section_path":    fmt.Sprintf("strategy.ecosystem_differentiation.ecosystem_components[%d]", i),
			},
		})
		d.addContains(result, artKey, "Artifact", key, "Positioning")
	}

	// Value drivers
	for i, vd := range raw.Strategy.ValueCreation.ValueDrivers {
		if vd.Driver == "" {
			continue
		}
		key := objectKey("ValueDriver", fmt.Sprintf("strategy_formula:value_creation.value_drivers[%d]", i))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "ValueDriver", Key: key,
			Properties: map[string]any{
				"name":            truncate(vd.Driver, 60),
				"driver":          vd.Driver,
				"mechanism":       vd.Mechanism,
				"flywheel":        vd.Flywheel,
				"inertia_tier":    "3",
				"source_artifact": "READY/04_strategy_formula.yaml",
				"section_path":    fmt.Sprintf("strategy.value_creation.value_drivers[%d]", i),
			},
		})
		d.addContains(result, artKey, "Artifact", key, "ValueDriver")
	}

	// Business model → single Positioning-tier object capturing the whole model
	if raw.Strategy.BusinessModel.RevenueModel != "" {
		key := objectKey("Positioning", "strategy_formula:business_model")
		tiers := []string{}
		for _, t := range raw.Strategy.BusinessModel.PricingTiers {
			tiers = append(tiers, fmt.Sprintf("%s (%s): %s", t.Tier, t.Price, t.Purpose))
		}
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "Positioning", Key: key,
			Properties: map[string]any{
				"name":            "Business Model: " + raw.Strategy.BusinessModel.RevenueModel,
				"claim":           raw.Strategy.BusinessModel.PricingPhilosophy,
				"moat_type":       "business_model",
				"inertia_tier":    "3",
				"source_artifact": "READY/04_strategy_formula.yaml",
				"section_path":    "strategy.business_model",
			},
		})
		d.addContains(result, artKey, "Artifact", key, "Positioning")
	}

	// Constraints → Constraint objects
	for i, c := range raw.Strategy.Constraints {
		if c.Constraint == "" {
			continue
		}
		key := objectKey("Constraint", fmt.Sprintf("strategy_formula:constraints[%d]", i))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "Constraint", Key: key,
			Properties: map[string]any{
				"name":            truncate(c.Constraint, 60),
				"description":     fmt.Sprintf("%s → Implication: %s → Strategy: %s", c.Constraint, c.Implication, c.Strategy),
				"constraint_type": "strategic",
				"inertia_tier":    "3",
				"source_artifact": "READY/04_strategy_formula.yaml",
				"section_path":    fmt.Sprintf("strategy.constraints[%d]", i),
			},
		})
		d.addContains(result, artKey, "Artifact", key, "Constraint")
	}

	// Trade-offs → KeyInsight objects (they're strategic decisions worth tracking)
	for i, t := range raw.Strategy.TradeOffs {
		if t.Decision == "" {
			continue
		}
		key := objectKey("KeyInsight", fmt.Sprintf("strategy_formula:trade_offs[%d]", i))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "KeyInsight", Key: key,
			Properties: map[string]any{
				"name":                  truncate(t.Decision, 60),
				"insight":               fmt.Sprintf("Trade-off: %s — Gain: %s — Give up: %s", t.Decision, t.WhatWeGain, t.WhatWeGiveUp),
				"strategic_implication": t.Rationale,
				"inertia_tier":          "3",
				"source_artifact":       "READY/04_strategy_formula.yaml",
				"section_path":          fmt.Sprintf("strategy.trade_offs[%d]", i),
			},
		})
		d.addContains(result, artKey, "Artifact", key, "KeyInsight")
	}

	// Risks → StrategicRisk objects
	for i, r := range raw.Strategy.Risks {
		if r.Risk == "" {
			continue
		}
		key := objectKey("StrategicRisk", fmt.Sprintf("strategy_formula:risks[%d]", i))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "StrategicRisk", Key: key,
			Properties: map[string]any{
				"name":            truncate(r.Risk, 60),
				"risk":            r.Risk,
				"likelihood":      r.Likelihood,
				"impact":          r.Impact,
				"mitigation":      r.Mitigation,
				"monitoring":      r.Monitoring,
				"inertia_tier":    "3",
				"source_artifact": "READY/04_strategy_formula.yaml",
				"section_path":    fmt.Sprintf("strategy.risks[%d]", i),
			},
		})
		d.addContains(result, artKey, "Artifact", key, "StrategicRisk")
	}

	// Success metrics → KeyInsight objects
	if raw.Strategy.SuccessMetrics.NorthStarMetric != "" {
		key := objectKey("KeyInsight", "strategy_formula:success_metrics.north_star")
		metrics := []string{fmt.Sprintf("North Star: %s", raw.Strategy.SuccessMetrics.NorthStarMetric)}
		for _, m := range raw.Strategy.SuccessMetrics.SupportingMetrics {
			metrics = append(metrics, fmt.Sprintf("%s (target: %s, why: %s)", m.Metric, m.TargetPhase1, m.Why))
		}
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "KeyInsight", Key: key,
			Properties: map[string]any{
				"name":                  "Success Metrics: " + truncate(raw.Strategy.SuccessMetrics.NorthStarMetric, 40),
				"insight":               strings.Join(metrics, "; "),
				"strategic_implication": "These metrics define success for the strategy",
				"inertia_tier":          "3",
				"source_artifact":       "READY/04_strategy_formula.yaml",
				"section_path":          "strategy.success_metrics",
			},
		})
		d.addContains(result, artKey, "Artifact", key, "KeyInsight")
	}
}

// ============================================================
// Phase 1c: Strategy Foundations
// ============================================================

type rawStrategyFoundations struct {
	StrategyFoundations struct {
		ProductVision struct {
			VisionStatement   string `yaml:"vision_statement"`
			TargetTimeframe   string `yaml:"target_timeframe"`
			SuccessIndicators []struct {
				Indicator string `yaml:"indicator"`
				Target    string `yaml:"target"`
			} `yaml:"success_indicators"`
		} `yaml:"product_vision"`

		ValueProposition struct {
			Headline        string `yaml:"headline"`
			TargetSegment   string `yaml:"target_segment"`
			FunctionalValue struct {
				JobsToBeDone []string `yaml:"jobs_to_be_done"`
				KeyBenefits  []string `yaml:"key_benefits"`
			} `yaml:"functional_value"`
			EmotionalValue struct {
				FeelingsWeCreate []string `yaml:"feelings_we_create"`
				PainsWeEliminate []string `yaml:"pains_we_eliminate"`
			} `yaml:"emotional_value"`
			EconomicValue struct {
				CostSavings   string `yaml:"cost_savings"`
				RevenueGains  string `yaml:"revenue_gains"`
				RiskReduction string `yaml:"risk_reduction"`
			} `yaml:"economic_value"`
			ProofPoints []struct {
				Claim string `yaml:"claim"`
				Proof string `yaml:"proof"`
			} `yaml:"proof_points"`
		} `yaml:"value_proposition"`

		StrategicSequencing struct {
			SequencingPrinciple string `yaml:"sequencing_principle"`
			Phases              []struct {
				Phase           int      `yaml:"phase"`
				Name            string   `yaml:"name"`
				Timeframe       string   `yaml:"timeframe"`
				Focus           string   `yaml:"focus"`
				TargetSegment   string   `yaml:"target_segment"`
				ValueDelivered  []string `yaml:"value_delivered"`
				SuccessCriteria []struct {
					Metric string `yaml:"metric"`
					Target string `yaml:"target"`
				} `yaml:"success_criteria"`
				StrategicRationale string `yaml:"strategic_rationale"`
			} `yaml:"phases"`
		} `yaml:"strategic_sequencing"`

		InformationArchitecture struct {
			DesignPrinciples []struct {
				Principle     string `yaml:"principle"`
				Manifestation string `yaml:"manifestation"`
			} `yaml:"design_principles"`
		} `yaml:"information_architecture"`
	} `yaml:"strategy_foundations"`
}

func (d *Decomposer) decomposeStrategyFoundations(result *Result) {
	var raw rawStrategyFoundations
	if err := d.readYAML("READY/02_strategy_foundations.yaml", &raw); err != nil {
		return
	}

	artKey := d.addArtifactNode(result,
		"READY/02_strategy_foundations.yaml", "strategy_foundations", "READY",
		"Strategy foundations — product vision, value proposition, strategic sequencing, information architecture", "2")

	sf := raw.StrategyFoundations

	// Product vision → Belief-tier object (highest inertia)
	if sf.ProductVision.VisionStatement != "" {
		key := objectKey("Belief", "strategy_foundations:product_vision")
		indicators := []string{}
		for _, si := range sf.ProductVision.SuccessIndicators {
			indicators = append(indicators, fmt.Sprintf("%s: %s", si.Indicator, si.Target))
		}
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "Belief", Key: key,
			Properties: map[string]any{
				"name":            "Product Vision",
				"statement":       sf.ProductVision.VisionStatement,
				"evidence":        strings.Join(indicators, "; "),
				"category":        "vision",
				"inertia_tier":    "1",
				"source_artifact": "READY/02_strategy_foundations.yaml",
				"section_path":    "strategy_foundations.product_vision",
			},
		})
		d.addContains(result, artKey, "Artifact", key, "Belief")
	}

	// Value proposition
	if sf.ValueProposition.Headline != "" {
		key := objectKey("ValueProposition", "strategy_foundations:value_proposition")
		functionalVal := strings.Join(append(sf.ValueProposition.FunctionalValue.JobsToBeDone, sf.ValueProposition.FunctionalValue.KeyBenefits...), "; ")
		emotionalVal := strings.Join(append(sf.ValueProposition.EmotionalValue.FeelingsWeCreate, sf.ValueProposition.EmotionalValue.PainsWeEliminate...), "; ")
		economicVal := fmt.Sprintf("Cost savings: %s; Revenue gains: %s; Risk reduction: %s",
			sf.ValueProposition.EconomicValue.CostSavings,
			sf.ValueProposition.EconomicValue.RevenueGains,
			sf.ValueProposition.EconomicValue.RiskReduction)

		d.addObject(result, memory.UpsertObjectRequest{
			Type: "ValueProposition", Key: key,
			Properties: map[string]any{
				"name":             sf.ValueProposition.Headline,
				"headline":         sf.ValueProposition.Headline,
				"target_segment":   sf.ValueProposition.TargetSegment,
				"functional_value": truncate(functionalVal, 500),
				"emotional_value":  truncate(emotionalVal, 500),
				"economic_value":   truncate(economicVal, 500),
				"inertia_tier":     "3",
				"source_artifact":  "READY/02_strategy_foundations.yaml",
				"section_path":     "strategy_foundations.value_proposition",
			},
		})
		d.addContains(result, artKey, "Artifact", key, "ValueProposition")
	}

	// Strategic sequencing phases
	var phaseKeys []string
	for _, phase := range sf.StrategicSequencing.Phases {
		if phase.Name == "" {
			continue
		}
		key := objectKey("StrategicPhase", fmt.Sprintf("strategy_foundations:sequencing.phase-%d", phase.Phase))
		criteria := []string{}
		for _, sc := range phase.SuccessCriteria {
			criteria = append(criteria, fmt.Sprintf("%s: %s", sc.Metric, sc.Target))
		}
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "StrategicPhase", Key: key,
			Properties: map[string]any{
				"name":             phase.Name,
				"phase_number":     fmt.Sprintf("%d", phase.Phase),
				"timeframe":        phase.Timeframe,
				"focus":            phase.Focus,
				"target_segment":   phase.TargetSegment,
				"success_criteria": strings.Join(criteria, "; "),
				"inertia_tier":     "3",
				"source_artifact":  "READY/02_strategy_foundations.yaml",
				"section_path":     fmt.Sprintf("strategy_foundations.strategic_sequencing.phases[%d]", phase.Phase-1),
			},
		})
		d.addContains(result, artKey, "Artifact", key, "StrategicPhase")
		phaseKeys = append(phaseKeys, key)
	}

	// Create follows edges between sequential phases
	for i := 1; i < len(phaseKeys); i++ {
		d.addRel(result, "follows", phaseKeys[i-1], "StrategicPhase", phaseKeys[i], "StrategicPhase",
			map[string]any{"weight": "1.0", "edge_source": "structural"})
	}

	// Design principles → KeyInsight objects
	for i, dp := range sf.InformationArchitecture.DesignPrinciples {
		if dp.Principle == "" {
			continue
		}
		key := objectKey("KeyInsight", fmt.Sprintf("strategy_foundations:design_principles[%d]", i))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "KeyInsight", Key: key,
			Properties: map[string]any{
				"name":                  truncate(dp.Principle, 60),
				"insight":               dp.Principle,
				"strategic_implication": dp.Manifestation,
				"inertia_tier":          "3",
				"source_artifact":       "READY/02_strategy_foundations.yaml",
				"section_path":          fmt.Sprintf("strategy_foundations.information_architecture.design_principles[%d]", i),
			},
		})
		d.addContains(result, artKey, "Artifact", key, "KeyInsight")
	}
}

// ============================================================
// Phase 1c: Insight Opportunity
// ============================================================

type rawInsightOpportunity struct {
	Opportunity struct {
		ID          string `yaml:"id"`
		Title       string `yaml:"title"`
		Description string `yaml:"description"`
		Context     struct {
			TargetSegment string   `yaml:"target_segment"`
			PainPoints    []string `yaml:"pain_points"`
			MarketSize    string   `yaml:"market_size"`
			Urgency       string   `yaml:"urgency"`
		} `yaml:"context"`
		Evidence struct {
			Quantitative []struct {
				Source  string `yaml:"source"`
				Insight string `yaml:"insight"`
			} `yaml:"quantitative"`
			Qualitative []struct {
				Source  string `yaml:"source"`
				Insight string `yaml:"insight"`
			} `yaml:"qualitative"`
			CompetitiveLandscape []string `yaml:"competitive_landscape"`
		} `yaml:"evidence"`
		ValueHypothesis struct {
			UserValue     string `yaml:"user_value"`
			BusinessValue string `yaml:"business_value"`
			StrategicFit  string `yaml:"strategic_fit"`
		} `yaml:"value_hypothesis"`
		SuccessIndicators []struct {
			Metric string `yaml:"metric"`
			Target string `yaml:"target"`
		} `yaml:"success_indicators"`
		Status          string `yaml:"status"`
		ConfidenceLevel string `yaml:"confidence_level"`
	} `yaml:"opportunity"`
}

func (d *Decomposer) decomposeInsightOpportunity(result *Result) {
	var raw rawInsightOpportunity
	if err := d.readYAML("READY/03_insight_opportunity.yaml", &raw); err != nil {
		return
	}

	artKey := d.addArtifactNode(result,
		"READY/03_insight_opportunity.yaml", "insight_opportunity", "READY",
		"Insight opportunity — validated market opportunity with evidence", "2")

	opp := raw.Opportunity
	if opp.Title == "" {
		return
	}

	// Collect evidence strings
	var evidence []string
	for _, q := range opp.Evidence.Quantitative {
		evidence = append(evidence, fmt.Sprintf("[quant] %s: %s", q.Source, q.Insight))
	}
	for _, q := range opp.Evidence.Qualitative {
		evidence = append(evidence, fmt.Sprintf("[qual] %s: %s", q.Source, q.Insight))
	}
	evidence = append(evidence, opp.Evidence.CompetitiveLandscape...)

	key := objectKey("Opportunity", fmt.Sprintf("insight_opportunity:%s", opp.ID))
	d.addObject(result, memory.UpsertObjectRequest{
		Type: "Opportunity", Key: key,
		Properties: map[string]any{
			"name":            opp.Title,
			"description":     opp.Description,
			"how_to_exploit":  fmt.Sprintf("User: %s; Business: %s; Fit: %s", opp.ValueHypothesis.UserValue, opp.ValueHypothesis.BusinessValue, opp.ValueHypothesis.StrategicFit),
			"priority":        opp.ConfidenceLevel,
			"inertia_tier":    "2",
			"source_artifact": "READY/03_insight_opportunity.yaml",
			"section_path":    "opportunity",
		},
	})
	d.addContains(result, artKey, "Artifact", key, "Opportunity")
}

// ============================================================
// Phase 1d: Mappings decomposition
// ============================================================

type rawMappings map[string][]struct {
	SubComponentID string `yaml:"sub_component_id"`
	Artifacts      []struct {
		Type        string `yaml:"type"`
		URL         string `yaml:"url"`
		Description string `yaml:"description"`
	} `yaml:"artifacts"`
}

func (d *Decomposer) decomposeMappings(result *Result) {
	var raw rawMappings
	if err := d.readYAML("FIRE/mappings.yaml", &raw); err != nil {
		return
	}

	artKey := d.addArtifactNode(result,
		"FIRE/mappings.yaml", "mappings", "FIRE",
		"Value model to implementation artifact mappings", "5")

	// Build a set of known ValueModelComponent keys for target validation,
	// and a map of value_path → key for prefix matching.
	// MappingArtifact → VMC implements edges are only created when the target
	// VMC exists in the decomposed result, preventing disconnected nodes
	// when mappings.yaml references paths not present in the value models.
	// normalizeVMCPath strips spaces, ampersands, and other special characters
	// then lowercases. This normalizes paths like "Strategy.CONTEXT.Market Analysis"
	// and "Strategy.Context.MarketAnalysis" to the same form for comparison.
	// Dots are preserved as path separators.
	normalizeVMCPath := func(path string) string {
		var b strings.Builder
		for _, r := range strings.ToLower(path) {
			if r == '.' || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
				b.WriteRune(r)
			}
			// Drop spaces, ampersands, hyphens, underscores, and other punctuation
		}
		return b.String()
	}

	vmcKeys := map[string]bool{}
	vmcPathToKey := map[string]string{}     // value_path → object key (exact)
	vmcNormPathToKey := map[string]string{} // normalized value_path → object key (for fuzzy matching)
	for _, obj := range result.Objects {
		if obj.Type == "ValueModelComponent" {
			vmcKeys[obj.Key] = true
			if vp, ok := obj.Properties["value_path"].(string); ok {
				vmcPathToKey[vp] = obj.Key
				vmcNormPathToKey[normalizeVMCPath(vp)] = obj.Key
			}
		}
	}

	// Sort track keys for deterministic iteration order.
	// Go map iteration is nondeterministic; without sorting, the global
	// artifact counter would assign different indices across runs, creating
	// orphaned objects in Memory on incremental sync.
	tracks := make([]string, 0, len(raw))
	for track := range raw {
		tracks = append(tracks, track)
	}
	sort.Strings(tracks)

	artifactIdx := 0
	for _, track := range tracks {
		entries := raw[track]
		for _, entry := range entries {
			if entry.SubComponentID == "" {
				continue
			}

			// Resolve the VMC target using a 5-tier strategy:
			// 1. Exact key match (sub_component_id matches VMC key suffix)
			// 2. Exact value_path match
			// 3. Normalized value_path match (case-insensitive, strips spaces/special chars)
			// 4. Exact prefix match (sub_component_id is prefix of a VMC value_path)
			// 5. Normalized prefix match (case-insensitive prefix matching)
			// This accommodates naming convention differences between
			// mappings.yaml (CamelCase, no spaces) and value models
			// (UPPER CASE, spaces, ampersands).
			vmcKey := objectKey("ValueModelComponent", fmt.Sprintf("value_model:%s", entry.SubComponentID))
			vmcExists := vmcKeys[vmcKey]
			if !vmcExists {
				// Tier 2: exact value_path match
				if resolvedKey, ok := vmcPathToKey[entry.SubComponentID]; ok {
					vmcKey = resolvedKey
					vmcExists = true
				}
			}
			if !vmcExists {
				// Tier 3: normalized value_path match (handles CamelCase vs "UPPER CASE",
				// spaces, ampersands, etc.)
				normID := normalizeVMCPath(entry.SubComponentID)
				if resolvedKey, ok := vmcNormPathToKey[normID]; ok {
					vmcKey = resolvedKey
					vmcExists = true
				}
			}
			if !vmcExists {
				// Tier 4: exact prefix match — find VMCs whose value_path starts
				// with the sub_component_id followed by a dot.
				prefix := entry.SubComponentID + "."
				var matchingPaths []string
				for vp := range vmcPathToKey {
					if strings.HasPrefix(vp, prefix) {
						matchingPaths = append(matchingPaths, vp)
					}
				}
				if len(matchingPaths) > 0 {
					sort.Strings(matchingPaths)
					best := matchingPaths[0]
					for _, mp := range matchingPaths[1:] {
						if len(mp) < len(best) {
							best = mp
						}
					}
					vmcKey = vmcPathToKey[best]
					vmcExists = true
				}
			}
			if !vmcExists {
				// Tier 5: normalized prefix match — handles CamelCase vs display
				// names with spaces/special chars at the prefix level.
				normPrefix := normalizeVMCPath(entry.SubComponentID) + "."
				var matchingNormPaths []string
				for np := range vmcNormPathToKey {
					if strings.HasPrefix(np, normPrefix) {
						matchingNormPaths = append(matchingNormPaths, np)
					}
				}
				if len(matchingNormPaths) > 0 {
					sort.Strings(matchingNormPaths)
					best := matchingNormPaths[0]
					for _, mp := range matchingNormPaths[1:] {
						if len(mp) < len(best) {
							best = mp
						}
					}
					vmcKey = vmcNormPathToKey[best]
					vmcExists = true
				}
			}

			for _, artifact := range entry.Artifacts {
				if artifact.URL == "" {
					continue
				}
				key := objectKey("MappingArtifact", fmt.Sprintf("mappings:%s:%s:%d", track, entry.SubComponentID, artifactIdx))
				artifactIdx++

				d.addObject(result, memory.UpsertObjectRequest{
					Type: "MappingArtifact", Key: key,
					Properties: map[string]any{
						"name":             truncate(artifact.Description, 60),
						"description":      artifact.Description,
						"artifact_type":    artifact.Type,
						"url":              artifact.URL,
						"track":            track,
						"sub_component_id": entry.SubComponentID,
						"inertia_tier":     "5",
						"source_artifact":  "FIRE/mappings.yaml",
						"section_path":     fmt.Sprintf("%s.%s", track, entry.SubComponentID),
					},
				})
				d.addContains(result, artKey, "Artifact", key, "MappingArtifact")

				// implements edge: MappingArtifact → ValueModelComponent
				// Only create when the target VMC exists in the decomposed result
				// to prevent orphaned MappingArtifact nodes from dangling references.
				if vmcExists {
					d.addRel(result, "implements", key, "MappingArtifact", vmcKey, "ValueModelComponent",
						map[string]any{"weight": "1.0", "edge_source": "structural"})
				} else {
					d.warn(result, fmt.Sprintf("mappings: sub_component_id %q (%s track) does not match any value model component — skipping implements edge", entry.SubComponentID, track))
				}
			}
		}
	}
}

// ============================================================
// Phase 2: Non-product track definition decomposition
// ============================================================

type rawTrackDefinition struct {
	ID     string `yaml:"id"`
	Name   string `yaml:"name"`
	Slug   string `yaml:"slug"`
	Track  string `yaml:"track"`
	Status string `yaml:"status"`

	ContributesTo []string `yaml:"contributes_to"`

	Definition struct {
		Purpose string `yaml:"purpose"`
		Outcome string `yaml:"outcome"`
		Owner   string `yaml:"owner"`
		Cadence struct {
			Frequency string `yaml:"frequency"`
		} `yaml:"cadence"`
	} `yaml:"definition"`

	PractitionerScenarios []struct {
		ID           string `yaml:"id"`
		Name         string `yaml:"name"`
		Practitioner string `yaml:"practitioner"`
		Situation    string `yaml:"situation"`
		Trigger      string `yaml:"trigger"`
		Actions      string `yaml:"actions"`
		Outcome      string `yaml:"outcome"`
	} `yaml:"practitioner_scenarios"`
}

// decomposeTrackDefinitions scans FIRE/definitions/strategy/, org_ops/, and commercial/
// for track definition YAML files and creates TrackDefinition + PractitionerScenario objects.
func (d *Decomposer) decomposeTrackDefinitions(result *Result) {
	tracks := []struct {
		name string
		dir  string
	}{
		{"strategy", "FIRE/definitions/strategy"},
		{"org_ops", "FIRE/definitions/org_ops"},
		{"commercial", "FIRE/definitions/commercial"},
	}

	for _, track := range tracks {
		trackDir := filepath.Join(d.instancePath, track.dir)
		if _, err := os.Stat(trackDir); os.IsNotExist(err) {
			continue
		}

		err := filepath.Walk(trackDir, func(path string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() {
				return nil
			}
			ext := strings.ToLower(filepath.Ext(path))
			if ext != ".yaml" && ext != ".yml" {
				return nil
			}

			relPath, _ := filepath.Rel(d.instancePath, path)
			var raw rawTrackDefinition
			if err := d.readYAML(relPath, &raw); err != nil {
				return nil
			}
			if raw.ID == "" || raw.Name == "" {
				return nil
			}

			artKey := d.addArtifactNode(result,
				relPath, "track_definition", "FIRE",
				fmt.Sprintf("%s track definition: %s", track.name, raw.Name), "5")

			// Determine category from subdirectory
			parts := strings.Split(relPath, string(filepath.Separator))
			category := ""
			if len(parts) >= 4 {
				category = parts[3] // FIRE/definitions/strategy/<category>/file.yaml
			}

			defKey := objectKey("TrackDefinition", fmt.Sprintf("definition:%s", raw.ID))
			cadence := ""
			if raw.Definition.Cadence.Frequency != "" {
				cadence = raw.Definition.Cadence.Frequency
			}
			d.addObject(result, memory.UpsertObjectRequest{
				Type: "TrackDefinition", Key: defKey,
				Properties: map[string]any{
					"name":            raw.Name,
					"description":     truncate(raw.Definition.Purpose, 200),
					"definition_id":   raw.ID,
					"track":           raw.Track,
					"status":          raw.Status,
					"category":        category,
					"purpose":         truncate(raw.Definition.Purpose, 500),
					"outcome":         truncate(raw.Definition.Outcome, 500),
					"owner":           raw.Definition.Owner,
					"cadence":         cadence,
					"inertia_tier":    "5",
					"source_artifact": relPath,
					"section_path":    "definition",
				},
			})
			d.addContains(result, artKey, "Artifact", defKey, "TrackDefinition")

			// contributes_to edges
			for _, path := range raw.ContributesTo {
				vmcKey := objectKey("ValueModelComponent", fmt.Sprintf("value_model:%s", path))
				d.addRel(result, "contributes_to", defKey, "TrackDefinition", vmcKey, "ValueModelComponent",
					map[string]any{"weight": "0.8", "edge_source": "structural"})
			}

			// Practitioner scenarios
			for _, ps := range raw.PractitionerScenarios {
				if ps.Name == "" {
					continue
				}
				psKey := objectKey("PractitionerScenario", fmt.Sprintf("definition:%s:%s", raw.ID, ps.ID))
				d.addObject(result, memory.UpsertObjectRequest{
					Type: "PractitionerScenario", Key: psKey,
					Properties: map[string]any{
						"name":            ps.Name,
						"practitioner":    ps.Practitioner,
						"situation":       truncate(ps.Situation, 500),
						"trigger":         ps.Trigger,
						"outcome":         truncate(ps.Outcome, 500),
						"definition_ref":  raw.ID,
						"inertia_tier":    "6",
						"source_artifact": relPath,
						"section_path":    fmt.Sprintf("practitioner_scenarios.%s", ps.ID),
					},
				})
				d.addContains(result, defKey, "TrackDefinition", psKey, "PractitionerScenario")
			}

			return nil
		})
		if err != nil {
			d.warn(result, fmt.Sprintf("track definitions walk error for %s: %v", track.name, err))
		}
	}
}
