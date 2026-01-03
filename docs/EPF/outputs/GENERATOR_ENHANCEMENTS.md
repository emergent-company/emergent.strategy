# EPF Output Generator - Studio Enhancements

> **📍 SINGLE SOURCE OF TRUTH for v2.0 enhancements**  
> **Status:** Enhancement Proposal (v1.0 complete and production-ready)  
> **For Future AI Sessions:** Read this file first before implementing v2.0 features

**Version:** 2.0.0 (Proposed)  
**Status:** Ready to implement (optional enhancement)  
**Inspiration:** NotebookLM Studio capabilities  
**Goal:** Make EPF generators more interactive, customizable, and powerful  
**Implementation:** Pure bash (no Python dependencies)

---

## 📋 Quick Reference for Future Work

**"Where do I start?"** → Read this entire file, then follow [Implementation Roadmap](#-implementation-roadmap)

**"What's the priority?"** → Optional enhancement. v1.0 generators are production-ready. Implement v2.0 when time/resources available.

**"Which generator first?"** → investor-memo (most complex, highest value)

**"Where are bash examples?"** → Section: [Implementation Note: Bash-First Philosophy](#implementation-note-bash-first-philosophy)

**"What's already done?"** → v1.0 standardization complete (all generators have schema + wizard + validator + README, all validators collect all errors)

**"How long will it take?"** → 8-10 weeks for all 4 milestones (see roadmap below)

---

## Vision: EPF Studio Experience

Transform EPF output generators from "static templates" to an **interactive studio** where users:
- ✅ Select which sources to include
- ✅ Customize output for specific audiences
- ✅ Get real-time readiness feedback
- ✅ Receive AI-powered quality suggestions
- ✅ Track versions and compare changes
- ✅ Generate multi-modal outputs (text, audio scripts, diagrams)

**Inspiration:** Google NotebookLM's Studio feature demonstrates how the same sources can generate diverse, customized outputs through intelligent transformation.

---

## Enhanced Generator Architecture (v2.0)

### Current Standard (v1.0)
```
Phase 0: Pre-flight Validation
Phase 1: EPF Data Extraction
Phase 2: Domain Processing
Phase 3: Transformation
Phase 4: Document Assembly
Phase 5: Validation
```

### Enhanced Standard (v2.0) ✨
```
Phase 0: Pre-flight Validation
Phase 0.4: Dynamic Source Selection ✨ NEW
Phase 0.6: Output Customization ✨ NEW
Phase 1: EPF Data Extraction
Phase 2: Domain Processing
Phase 3: Transformation (with customization applied)
Phase 4: Document Assembly
Phase 5: Validation
Phase 6: AI Quality Review ✨ NEW
Phase 7: Version Management ✨ NEW
```

---

## Phase 0.4: Dynamic Source Selection

### Purpose
Let users **choose which EPF sources** to include, rather than using all sources by default.

### User Experience
```
📁 SOURCE SELECTION

Required Sources (must include):
  ✓ north_star.yaml (last updated: 15 days ago)
  ✓ strategy_formula.yaml (last updated: 8 days ago)

Optional Sources (choose what to include):
  [ ] roadmap_recipe.yaml (last updated: 3 days ago)
  [ ] value_models/product.yaml (last updated: 20 days ago)
  [ ] value_models/enterprise.yaml (last updated: 45 days ago)
  [ ] insight_analyses/market_sizing.md (last updated: 12 days ago)
  [ ] insight_analyses/competitor_research.md (last updated: 120 days ago) ⚠️ Stale

Focus Areas (what should we emphasize?):
  Problem & solution: ████████░░ 8/10
  Market opportunity: ██████████ 10/10
  Product capabilities: ██████░░░░ 6/10
  Team & execution: ████░░░░░░ 4/10
  Financial projections: ████████░░ 8/10

Sections to Include:
  [✓] Executive Summary
  [✓] Market Opportunity
  [✓] Product Overview
  [ ] Technical Architecture (skip for non-technical audience)
  [✓] Business Model
  [✓] Traction & Metrics
  [ ] Detailed Roadmap (save for follow-up materials)
  [✓] Team
  [✓] Financial Projections

Continue with selected sources? [Y/n]: 
```

### Implementation Template

```python
def phase_04_source_selection(product_name, output_type):
    """
    Phase 0.4: Dynamic Source Selection
    
    Let users choose which EPF sources to include and what to emphasize
    """
    
    print("=" * 80)
    print("📁 SOURCE SELECTION")
    print("=" * 80)
    print()
    
    # Discover available sources
    epf_instance = f"docs/EPF/_instances/{product_name}"
    
    required_sources = {
        "north_star": f"{epf_instance}/00_north_star.yaml",
        "strategy_formula": f"{epf_instance}/04_strategy_formula.yaml"
    }
    
    optional_sources = {
        "roadmap": f"{epf_instance}/05_roadmap_recipe.yaml",
        "value_models": glob(f"{epf_instance}/value_models/*.yaml"),
        "insights": glob(f"{epf_instance}/insight_analyses/*.md")
    }
    
    # Check source freshness
    print("Required Sources (must include):")
    for name, path in required_sources.items():
        if not os.path.exists(path):
            print(f"  ✗ {path} MISSING - cannot continue")
            exit(1)
        
        age_days = get_file_age_days(path)
        status = "✓" if age_days < 90 else "⚠️"
        print(f"  {status} {path} (last updated: {age_days} days ago)")
    print()
    
    # Present optional sources
    print("Optional Sources (choose what to include):")
    selected_sources = {}
    
    for category, paths in optional_sources.items():
        if isinstance(paths, list):
            for path in paths:
                age_days = get_file_age_days(path)
                warning = " ⚠️ Stale" if age_days > 90 else ""
                
                include = input(f"  [ ] {path} (updated {age_days} days ago){warning} - Include? [Y/n]: ").strip().lower()
                if include != 'n':
                    selected_sources[path] = True
        else:
            age_days = get_file_age_days(paths)
            warning = " ⚠️ Stale" if age_days > 90 else ""
            
            include = input(f"  [ ] {paths} (updated {age_days} days ago){warning} - Include? [Y/n]: ").strip().lower()
            if include != 'n':
                selected_sources[paths] = True
    
    print()
    
    # Focus area ranking
    print("Focus Areas (what should we emphasize? 1-10):")
    focus_areas = {
        "problem_solution": int(input("  Problem & solution: ") or "5"),
        "market_opportunity": int(input("  Market opportunity: ") or "5"),
        "product_capabilities": int(input("  Product capabilities: ") or "5"),
        "team_execution": int(input("  Team & execution: ") or "5"),
        "financial_projections": int(input("  Financial projections: ") or "5")
    }
    
    print()
    
    # Section selection
    print("Sections to Include:")
    sections = {
        "executive_summary": True,  # Always include
        "market_opportunity": ask_yes_no("Market Opportunity", default=True),
        "product_overview": ask_yes_no("Product Overview", default=True),
        "technical_architecture": ask_yes_no("Technical Architecture", default=False),
        "business_model": ask_yes_no("Business Model", default=True),
        "traction_metrics": ask_yes_no("Traction & Metrics", default=True),
        "detailed_roadmap": ask_yes_no("Detailed Roadmap", default=False),
        "team": ask_yes_no("Team", default=True),
        "financial_projections": ask_yes_no("Financial Projections", default=True)
    }
    
    # Store selection manifest
    selection_manifest = {
        "required_sources": required_sources,
        "selected_sources": selected_sources,
        "focus_areas": focus_areas,
        "sections": sections
    }
    
    return selection_manifest
```

---

## Phase 0.6: Output Customization

### Purpose
Let users **customize output style** for specific audiences, tones, and lengths.

### User Experience
```
🎨 OUTPUT CUSTOMIZATION

1. Who is the primary audience?
   [1] Executive leadership (focus on business impact)
   [2] Technical team (focus on implementation details)
   [3] Investors (focus on market opportunity & returns)
   [4] General public (balanced, accessible overview)
   
   Choice: 3

2. What tone should the output have?
   [1] Formal & professional
   [2] Conversational & engaging
   [3] Persuasive & compelling ← Recommended for investors
   [4] Educational & informative
   
   Choice: 3

3. How detailed should the output be?
   [1] Brief (3-5 pages, key points only)
   [2] Standard (10-15 pages, balanced depth)
   [3] Comprehensive (20-30 pages, full detail) ← Recommended for due diligence
   
   Choice: 3

4. Language complexity?
   [1] Simple (middle school reading level)
   [2] Standard (high school reading level)
   [3] Advanced (college reading level)
   [4] Expert (industry-specific terminology)
   
   Choice: 3

5. Visual elements to include?
   [✓] Tables
   [✓] Charts (we'll generate chart definitions)
   [ ] Diagrams (requires manual design)
   [✓] Screenshots (if available)

Summary:
  • Audience: Investors
  • Tone: Persuasive & compelling
  • Length: Comprehensive (20-30 pages)
  • Complexity: Advanced
  • Visuals: Tables, charts

Proceed with this configuration? [Y/n]: 
```

### Implementation Template

```python
def phase_06_output_customization(output_type):
    """
    Phase 0.6: Output Customization
    
    Let users customize output style for their audience
    """
    
    print("=" * 80)
    print("🎨 OUTPUT CUSTOMIZATION")
    print("=" * 80)
    print()
    
    # Audience selection
    print("1. Who is the primary audience?")
    print("   [1] Executive leadership (focus on business impact)")
    print("   [2] Technical team (focus on implementation details)")
    print("   [3] Investors (focus on market opportunity & returns)")
    print("   [4] General public (balanced, accessible overview)")
    print()
    audience_choice = input("   Choice: ").strip()
    audience_map = {
        "1": "executive",
        "2": "technical",
        "3": "investor",
        "4": "general"
    }
    audience = audience_map.get(audience_choice, "general")
    
    # Tone selection
    print()
    print("2. What tone should the output have?")
    print("   [1] Formal & professional")
    print("   [2] Conversational & engaging")
    print("   [3] Persuasive & compelling")
    print("   [4] Educational & informative")
    if audience == "investor":
        print("       ← Recommended: Persuasive & compelling")
    print()
    tone_choice = input("   Choice: ").strip()
    tone_map = {
        "1": "formal",
        "2": "conversational",
        "3": "persuasive",
        "4": "educational"
    }
    tone = tone_map.get(tone_choice, "formal")
    
    # Length selection
    print()
    print("3. How detailed should the output be?")
    print("   [1] Brief (3-5 pages, key points only)")
    print("   [2] Standard (10-15 pages, balanced depth)")
    print("   [3] Comprehensive (20-30 pages, full detail)")
    print()
    length_choice = input("   Choice: ").strip()
    length_map = {
        "1": "brief",
        "2": "standard",
        "3": "comprehensive"
    }
    length = length_map.get(length_choice, "standard")
    
    # Complexity selection
    print()
    print("4. Language complexity?")
    print("   [1] Simple (middle school reading level)")
    print("   [2] Standard (high school reading level)")
    print("   [3] Advanced (college reading level)")
    print("   [4] Expert (industry-specific terminology)")
    print()
    complexity_choice = input("   Choice: ").strip()
    complexity_map = {
        "1": "simple",
        "2": "standard",
        "3": "advanced",
        "4": "expert"
    }
    complexity = complexity_map.get(complexity_choice, "standard")
    
    # Visual elements
    print()
    print("5. Visual elements to include?")
    include_tables = ask_yes_no("Tables", default=True)
    include_charts = ask_yes_no("Charts", default=True)
    include_diagrams = ask_yes_no("Diagrams", default=False)
    include_screenshots = ask_yes_no("Screenshots", default=False)
    
    # Build customization profile
    customization = {
        "audience": audience,
        "tone": tone,
        "length": length,
        "complexity": complexity,
        "visuals": {
            "tables": include_tables,
            "charts": include_charts,
            "diagrams": include_diagrams,
            "screenshots": include_screenshots
        }
    }
    
    # Show summary
    print()
    print("Summary:")
    print(f"  • Audience: {audience.title()}")
    print(f"  • Tone: {tone.title()}")
    print(f"  • Length: {length.title()}")
    print(f"  • Complexity: {complexity.title()}")
    visuals = [k for k, v in customization['visuals'].items() if v]
    print(f"  • Visuals: {', '.join(visuals)}")
    print()
    
    proceed = input("Proceed with this configuration? [Y/n]: ").strip().lower()
    if proceed == 'n':
        print("Restarting customization...")
        return phase_06_output_customization(output_type)
    
    return customization
```

### Applying Customization in Phase 3

```python
def apply_customization_to_content(content, customization):
    """
    Apply customization profile to generated content
    """
    
    # Adjust for audience
    if customization['audience'] == 'investor':
        content = emphasize_market_opportunity(content)
        content = add_financial_emphasis(content)
    elif customization['audience'] == 'technical':
        content = expand_technical_details(content)
        content = add_architecture_diagrams(content)
    elif customization['audience'] == 'executive':
        content = focus_on_business_impact(content)
        content = add_executive_summary(content)
    
    # Adjust for tone
    if customization['tone'] == 'persuasive':
        content = strengthen_value_propositions(content)
        content = add_social_proof(content)
    elif customization['tone'] == 'conversational':
        content = simplify_language(content)
        content = add_examples_and_stories(content)
    
    # Adjust for length
    if customization['length'] == 'brief':
        content = extract_key_points_only(content)
    elif customization['length'] == 'comprehensive':
        content = expand_with_details(content)
        content = add_appendices(content)
    
    # Adjust for complexity
    if customization['complexity'] == 'simple':
        content = simplify_vocabulary(content)
        content = define_technical_terms(content)
    elif customization['complexity'] == 'expert':
        content = use_industry_terminology(content)
        content = assume_background_knowledge(content)
    
    return content
```

---

## Phase 6: AI Quality Review

### Purpose
After validation passes, use **AI to review content quality** and suggest improvements.

### User Experience
```
🤖 AI QUALITY REVIEW
═══════════════════════════════════════════════════════════════════════════

Analyzing generated content...

📊 OVERALL QUALITY SCORE: 87/100

🔴 CRITICAL ISSUES (2 found):

   • Section: Market Opportunity, Paragraph 3
     Issue: TAM calculation ($15B) contradicts SAM calculation ($1.8B = 12% of TAM)
     Impact: Undermines credibility of market sizing
     
     → Suggestion: Verify numbers. If TAM=$15B and SAM=12%, then SAM=$1.8B is
       correct. Add explanation: "Our serviceable addressable market represents
       12% of the total market, focusing on enterprise customers with 500+
       employees who currently use legacy knowledge management systems."
     
     Apply this fix? [Y/n]: 

🟡 IMPORTANT IMPROVEMENTS (5 found):

   • Section: Executive Summary, Opening Paragraph
     Issue: Problem statement too generic ("Companies struggle with data management")
     Impact: Fails to differentiate from competitors
     
     → Suggestion: Use specific pain point from north_star.personas: "Engineering
       teams waste 15+ hours/week searching for tribal knowledge across
       disconnected tools like Confluence, Notion, Jira, and Slack, leading to
       duplicated work and frustrated developers."
     
     Apply this fix? [Y/n]: 

   ... (4 more)

🔵 MINOR IMPROVEMENTS (7 found):
   • Typo in "Product Capabilities" section
   • Missing Oxford comma in feature list
   • Inconsistent capitalization of "Knowledge Graph"
   • ... (4 more)
   
   Show details? [Y/n]: n

═══════════════════════════════════════════════════════════════════════════

Options:
  [1] Apply all critical & important fixes automatically
  [2] Review each suggestion individually (recommended)
  [3] Skip AI review and use current version
  [4] Show me suggestions in context (side-by-side view)
  
Choice: 
```

### Implementation Template

```python
def phase_06_ai_quality_review(output_file, customization):
    """
    Phase 6: AI Quality Review
    
    Use AI to analyze generated content and suggest improvements
    """
    
    print("=" * 80)
    print("🤖 AI QUALITY REVIEW")
    print("=" * 80)
    print()
    
    print("Analyzing generated content...")
    
    # Read generated content
    with open(output_file) as f:
        content = f.read()
    
    # AI review prompt
    review_prompt = f"""
    You are an expert content reviewer for {customization['audience']} audiences.
    
    Review this generated content for:
    
    1. CLARITY - Are statements clear and unambiguous?
    2. COHERENCE - Does narrative flow logically?
    3. COMPLETENESS - Are there obvious gaps or missing context?
    4. PERSUASIVENESS - Are arguments compelling? (especially for investor content)
    5. CONSISTENCY - Are there contradictions or conflicting claims?
    6. ACCURACY - Do numbers add up? Are calculations correct?
    7. IMPACT - Does content achieve its purpose for this audience?
    
    For each issue found, provide:
    - section_name: Which section
    - paragraph_number: Which paragraph (1-indexed)
    - severity: "critical" | "important" | "minor"
    - issue_description: What's wrong
    - impact: Why it matters
    - suggested_fix: Specific improvement
    - confidence: How confident you are (1-10)
    
    Return as JSON array.
    
    Audience: {customization['audience']}
    Tone: {customization['tone']}
    Length: {customization['length']}
    
    Content:
    {content}
    """
    
    # Call AI (using whatever AI client you have)
    suggestions = ai_review(review_prompt)
    
    # Calculate quality score
    critical_count = len([s for s in suggestions if s['severity'] == 'critical'])
    important_count = len([s for s in suggestions if s['severity'] == 'important'])
    minor_count = len([s for s in suggestions if s['severity'] == 'minor'])
    
    quality_score = 100 - (critical_count * 10) - (important_count * 3) - (minor_count * 1)
    quality_score = max(0, min(100, quality_score))
    
    print()
    print(f"📊 OVERALL QUALITY SCORE: {quality_score}/100")
    print()
    
    # Present critical issues
    if critical_count > 0:
        print(f"🔴 CRITICAL ISSUES ({critical_count} found):")
        print()
        for suggestion in [s for s in suggestions if s['severity'] == 'critical']:
            print(f"   • Section: {suggestion['section_name']}, Paragraph {suggestion['paragraph_number']}")
            print(f"     Issue: {suggestion['issue_description']}")
            print(f"     Impact: {suggestion['impact']}")
            print()
            print(f"     → Suggestion: {suggestion['suggested_fix']}")
            print()
            
            apply = input("     Apply this fix? [Y/n]: ").strip().lower()
            if apply != 'n':
                suggestion['apply'] = True
            print()
    
    # Present important improvements
    if important_count > 0:
        print(f"🟡 IMPORTANT IMPROVEMENTS ({important_count} found):")
        print()
        for suggestion in [s for s in suggestions if s['severity'] == 'important']:
            print(f"   • Section: {suggestion['section_name']}, Paragraph {suggestion['paragraph_number']}")
            print(f"     Issue: {suggestion['issue_description']}")
            print(f"     Impact: {suggestion['impact']}")
            print()
            print(f"     → Suggestion: {suggestion['suggested_fix']}")
            print()
            
            apply = input("     Apply this fix? [Y/n]: ").strip().lower()
            if apply != 'n':
                suggestion['apply'] = True
            print()
    
    # Show minor count
    if minor_count > 0:
        print(f"🔵 MINOR IMPROVEMENTS ({minor_count} found):")
        show_minor = input("   Show details? [Y/n]: ").strip().lower()
        if show_minor != 'n':
            for suggestion in [s for s in suggestions if s['severity'] == 'minor']:
                print(f"   • {suggestion['section_name']}: {suggestion['issue_description']}")
    
    # Apply selected fixes
    apply_suggestions(output_file, [s for s in suggestions if s.get('apply')])
    
    print()
    print("AI quality review complete.")
    print(f"Updated output saved to: {output_file}")
    
    return quality_score
```

---

## Phase 7: Version Management

### Purpose
Track output versions, compare changes, and maintain history.

### Version Manifest Format

```yaml
# version_manifest.yaml
output_type: "investor-memo"
product: "emergent"

versions:
  - version: "1.0"
    generated_at: "2025-12-15T10:00:00Z"
    file: "emergent-investor-memo-2025-12-15.md"
    generator_version: "1.0.0"
    epf_version: "2.1.0"
    
    sources:
      north_star:
        path: "docs/EPF/_instances/emergent/00_north_star.yaml"
        version: "1.2.0"
        last_modified: "2025-12-01T09:00:00Z"
      strategy_formula:
        path: "docs/EPF/_instances/emergent/04_strategy_formula.yaml"
        version: "1.1.0"
        last_modified: "2025-12-10T14:30:00Z"
      roadmap_recipe:
        path: "docs/EPF/_instances/emergent/05_roadmap_recipe.yaml"
        version: "1.0.0"
        last_modified: "2025-11-20T11:00:00Z"
    
    customization:
      audience: "investor"
      tone: "persuasive"
      length: "standard"
      complexity: "advanced"
    
    quality_score: 82
    
  - version: "1.1"
    generated_at: "2026-01-03T14:00:00Z"
    file: "emergent-investor-memo-2026-01-03.md"
    generator_version: "2.0.0"
    epf_version: "2.1.0"
    
    sources:
      north_star:
        path: "docs/EPF/_instances/emergent/00_north_star.yaml"
        version: "1.3.0"  # ← Changed
        last_modified: "2025-12-28T16:00:00Z"
      strategy_formula:
        path: "docs/EPF/_instances/emergent/04_strategy_formula.yaml"
        version: "1.1.0"
        last_modified: "2025-12-10T14:30:00Z"
      roadmap_recipe:
        path: "docs/EPF/_instances/emergent/05_roadmap_recipe.yaml"
        version: "1.1.0"  # ← Changed
        last_modified: "2026-01-02T10:15:00Z"
    
    changes:
      - "Updated market sizing based on new research (TAM $15B → $18B)"
      - "Added Q1 2026 traction metrics (1,200 users, $15K MRR)"
      - "Revised team section with new hires (Sarah Chen, Mike Torres)"
    
    customization:
      audience: "investor"
      tone: "persuasive"
      length: "comprehensive"  # ← Changed
      complexity: "advanced"
    
    quality_score: 91  # Improved from 82
```

### Diff Tool

```bash
#!/bin/bash
# scripts/diff-outputs.sh

OUTPUT_V1="$1"
OUTPUT_V2="$2"

if [[ -z "$OUTPUT_V1" ]] || [[ -z "$OUTPUT_V2" ]]; then
    echo "Usage: diff-outputs.sh <version1.md> <version2.md>"
    exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "OUTPUT DIFF - $(basename "$OUTPUT_V1") → $(basename "$OUTPUT_V2")"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Extract sections and compare
SECTIONS=$(grep -E "^##\s+" "$OUTPUT_V1" | sed 's/^##\s*//')

while IFS= read -r section; do
    echo "## Section: $section"
    
    # Extract section content from both files
    V1_CONTENT=$(extract_section "$OUTPUT_V1" "$section")
    V2_CONTENT=$(extract_section "$OUTPUT_V2" "$section")
    
    # Compare
    if [ "$V1_CONTENT" != "$V2_CONTENT" ]; then
        # Show diff
        diff -u <(echo "$V1_CONTENT") <(echo "$V2_CONTENT") | tail -n +3 | \
            sed 's/^-/  - /; s/^+/  + /; s/^/  /'
    else
        echo "  (no changes)"
    fi
    
    echo ""
done <<< "$SECTIONS"
```

---

## Implementation Roadmap

### **Milestone 1: Core Enhancements (2-3 weeks)**
- [ ] Add Phase 0.4 (Dynamic Source Selection) to template
- [ ] Add Phase 0.6 (Output Customization) to template
- [ ] Update schema.json to include customization fields
- [ ] Update wizard template with new phases
- [ ] Test with investor-memo generator

### **Milestone 2: Quality & Versioning (2-3 weeks)**
- [ ] Build Phase 6 (AI Quality Review) framework
- [ ] Create version manifest format
- [ ] Build `diff-outputs.sh` script
- [ ] Add version tracking to all generators
- [ ] Update GENERATOR_GUIDE.md with new phases

### **Milestone 3: Support Scripts (1-2 weeks)**
- [ ] Build `analyze-epf-readiness.sh` (pre-generation analysis)
- [ ] Build `manage-output-versions.sh` (version tracking)
- [ ] Build `ai-quality-review.sh` (standalone AI review)
- [ ] Add to scripts/README.md

### **Milestone 4: Rollout (2-3 weeks)**
- [ ] Update context-sheet with v2.0 enhancements
- [ ] Update investor-memo with v2.0 enhancements
- [ ] Update skattefunn-application with v2.0 enhancements
- [ ] Create migration guide (v1.0 → v2.0)
- [ ] Update all documentation

---

## Benefits of Studio Enhancements

### **For Users**
✅ **More control** - Choose sources, customize output, control emphasis  
✅ **Better quality** - AI review catches issues before delivery  
✅ **Transparency** - See what sources informed what sections  
✅ **Flexibility** - Same data → multiple audience-specific outputs  
✅ **Confidence** - Readiness checks before generation

### **For Framework**
✅ **More powerful** - Closer to NotebookLM Studio capabilities  
✅ **More versatile** - Handles diverse use cases and audiences  
✅ **Better UX** - Interactive, guided, informative  
✅ **Higher quality** - Built-in review and versioning  
✅ **More maintainable** - Version tracking and change history

---

## Conclusion

These enhancements transform EPF output generators from **static templates** to an **interactive studio experience** inspired by NotebookLM. The phased implementation allows incremental adoption without breaking existing generators.

**Start with Phase 0.4, 0.6, and 6** - they provide the most immediate value and can be added to any generator following the wizard pattern.

**Next:** Update GENERATOR_GUIDE.md (v1.0 → v2.0) with these new phases as the canonical standard.

---

## Implementation Note: Bash-First Philosophy

### Why Bash (Not Python)

EPF maintains **zero runtime dependencies** beyond standard Unix tools. All existing EPF scripts are pure bash:
- 18 scripts in `/scripts/` - all bash
- All validators (skattefunn, context-sheet, investor-memo) - all bash
- Only CLI dependencies: `yq`, `jq`, `ajv-cli` (not Python/Node runtimes)

**Introducing Python would:**
- ❌ Add runtime dependency (Python 3.x + pip packages)
- ❌ Break architectural consistency
- ❌ Create maintenance bifurcation (bash vs Python scripts)
- ❌ Increase installation complexity
- ❌ Violate EPF's philosophy of minimal dependencies

### Bash Can Do It All

**Phase 0.4 & 0.6** (Interactive selection):
- `read -p` for prompts
- `jq` for JSON handling (already used in EPF)
- Arrays and associative arrays for state management

**Phase 6** (AI Quality Review):
- Regex patterns for content analysis
- `jq` for structured output
- Text processing with `awk`, `sed`, `grep`

**Phase 7** (Version Management):
- Pure bash with git integration
- `yq` for YAML manipulation
- Unix utilities (`stat`, `diff`, `find`)

### Bash Implementation Example

The Python code examples in this document serve as **pseudocode to communicate logic**. Here's how Phase 0.4 looks in actual bash:

```bash
#!/bin/bash
# lib/select-sources.sh - Dynamic Source Selection

select_sources() {
    local output_type="$1"
    local instance_path="$2"
    
    echo ""
    echo "📁 SOURCE SELECTION"
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo ""
    
    # Required sources (cannot be deselected)
    declare -A required_sources=(
        ["north_star"]="00_north_star_principle.yaml"
        ["value_model"]="01_value_model.yaml"
    )
    
    echo "✅ REQUIRED SOURCES (auto-included):"
    for key in "${!required_sources[@]}"; do
        local file="${required_sources[$key]}"
        local path="$instance_path/$file"
        
        if [[ -f "$path" ]]; then
            # Get file age in days (macOS compatible)
            local age_days=$(( ($(date +%s) - $(stat -f %m "$path" 2>/dev/null || stat -c %Y "$path")) / 86400 ))
            echo "   • $key: $file"
            
            if [[ $age_days -gt 90 ]]; then
                echo "     ⚠️  WARNING: Last updated $age_days days ago (consider refreshing)"
            else
                echo "     ✓ Fresh (updated $age_days days ago)"
            fi
        else
            echo "   • $key: $file [MISSING]"
        fi
    done
    
    # Optional sources with interactive selection
    echo ""
    echo "📂 OPTIONAL SOURCES (select what to include):"
    
    declare -A optional_sources=(
        ["strategy_foundations"]="03_strategy_foundations.yaml"
        ["strategy_formula"]="04_strategy_formula.yaml"
        ["roadmap_recipe"]="05_roadmap_recipe.yaml"
    )
    
    declare -A selected_sources
    for key in "${!required_sources[@]}"; do
        selected_sources["$key"]=true
    done
    
    for key in "${!optional_sources[@]}"; do
        local file="${optional_sources[$key]}"
        local path="$instance_path/$file"
        
        if [[ -f "$path" ]]; then
            local age_days=$(( ($(date +%s) - $(stat -f %m "$path" 2>/dev/null || stat -c %Y "$path")) / 86400 ))
            echo ""
            echo "   $key:"
            echo "     File: $file"
            
            if [[ $age_days -gt 90 ]]; then
                echo "     ⚠️  Last updated $age_days days ago"
            else
                echo "     ✓ Updated $age_days days ago"
            fi
            
            read -p "     Include? [Y/n]: " choice
            if [[ "$choice" != "n" && "$choice" != "N" ]]; then
                selected_sources["$key"]=true
                echo "     ✓ Included"
            else
                echo "     ⊗ Skipped"
            fi
        fi
    done
    
    # Export selection manifest as JSON using jq
    local manifest_json
    manifest_json=$(jq -n \
        --argjson selected "$(printf '%s\n' "${!selected_sources[@]}" | jq -R . | jq -s .)" \
        '{selected_sources: $selected, timestamp: now}')
    
    echo "$manifest_json" > /tmp/source_selection_manifest.json
    
    echo ""
    echo "✓ Source selection complete. Manifest saved."
}
```

**Phase 0.6 Implementation (Output Customization):**

```bash
#!/bin/bash
# lib/customize-output.sh - Output Customization

customize_output() {
    local output_type="$1"
    
    echo ""
    echo "🎨 OUTPUT CUSTOMIZATION"
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo ""
    
    # 1. Audience selection
    echo "1. Who is the primary audience?"
    echo "   [1] Executive leadership (focus on business impact)"
    echo "   [2] Technical team (focus on implementation details)"
    echo "   [3] Investors (focus on market opportunity & returns)"
    echo "   [4] General public (balanced, accessible overview)"
    echo ""
    read -p "   Choice: " audience_choice
    
    declare -A audience_map=(
        ["1"]="executive"
        ["2"]="technical"
        ["3"]="investor"
        ["4"]="general"
    )
    local audience="${audience_map[$audience_choice]:-executive}"
    
    # 2. Tone selection
    echo ""
    echo "2. What tone should the output have?"
    echo "   [1] Formal & professional"
    echo "   [2] Conversational & engaging"
    echo "   [3] Persuasive & compelling"
    echo "   [4] Educational & informative"
    echo ""
    
    # Set default based on audience
    local default_tone_idx="1"
    [[ "$audience" == "investor" ]] && default_tone_idx="3"
    [[ "$audience" == "technical" ]] && default_tone_idx="4"
    [[ "$audience" == "general" ]] && default_tone_idx="2"
    
    echo "   (Recommended for $audience: choice $default_tone_idx)"
    echo ""
    read -p "   Choice: " tone_choice
    tone_choice=${tone_choice:-$default_tone_idx}
    
    declare -A tone_map=(
        ["1"]="formal"
        ["2"]="conversational"
        ["3"]="persuasive"
        ["4"]="educational"
    )
    local tone="${tone_map[$tone_choice]:-formal}"
    
    # 3. Length selection
    echo ""
    echo "3. How detailed should the output be?"
    echo "   [1] Brief (3-5 pages, key points only)"
    echo "   [2] Standard (10-15 pages, balanced depth)"
    echo "   [3] Comprehensive (20-30 pages, full detail)"
    echo ""
    read -p "   Choice: " length_choice
    
    declare -A length_map=(
        ["1"]="brief"
        ["2"]="standard"
        ["3"]="comprehensive"
    )
    local length="${length_map[$length_choice]:-standard}"
    
    # 4. Complexity selection
    echo ""
    echo "4. Language complexity?"
    echo "   [1] Simple (middle school reading level)"
    echo "   [2] Standard (high school reading level)"
    echo "   [3] Advanced (college reading level)"
    echo "   [4] Expert (industry-specific terminology)"
    echo ""
    read -p "   Choice: " complexity_choice
    
    declare -A complexity_map=(
        ["1"]="simple"
        ["2"]="standard"
        ["3"]="advanced"
        ["4"]="expert"
    )
    local complexity="${complexity_map[$complexity_choice]:-standard}"
    
    # 5. Visual elements
    echo ""
    echo "5. Visual elements to include?"
    
    local include_tables="true"
    read -p "   Tables [Y/n]: " choice
    [[ "$choice" == "n" || "$choice" == "N" ]] && include_tables="false"
    
    local include_charts="true"
    read -p "   Charts [Y/n]: " choice
    [[ "$choice" == "n" || "$choice" == "N" ]] && include_charts="false"
    
    local include_diagrams="false"
    read -p "   Diagrams [y/N]: " choice
    [[ "$choice" == "y" || "$choice" == "Y" ]] && include_diagrams="true"
    
    local include_screenshots="false"
    read -p "   Screenshots [y/N]: " choice
    [[ "$choice" == "y" || "$choice" == "Y" ]] && include_screenshots="true"
    
    # Build customization profile as JSON
    local customization_json
    customization_json=$(jq -n \
        --arg audience "$audience" \
        --arg tone "$tone" \
        --arg length "$length" \
        --arg complexity "$complexity" \
        --argjson tables "$include_tables" \
        --argjson charts "$include_charts" \
        --argjson diagrams "$include_diagrams" \
        --argjson screenshots "$include_screenshots" \
        '{
            audience: $audience,
            tone: $tone,
            length: $length,
            complexity: $complexity,
            visuals: {
                tables: $tables,
                charts: $charts,
                diagrams: $diagrams,
                screenshots: $screenshots
            }
        }')
    
    # Display summary
    echo ""
    echo "Summary:"
    echo "  • Audience: $audience"
    echo "  • Tone: $tone"
    echo "  • Length: $length"
    echo "  • Complexity: $complexity"
    echo "  • Visuals: tables=$include_tables, charts=$include_charts"
    echo ""
    
    read -p "Proceed with this configuration? [Y/n]: " confirm
    if [[ "$confirm" == "n" || "$confirm" == "N" ]]; then
        echo "Customization cancelled."
        return 1
    fi
    
    # Save customization profile
    echo "$customization_json" > /tmp/customization_profile.json
    echo "✓ Customization profile saved."
    
    return 0
}
```

**Phase 6 Implementation (AI Quality Review):**

```bash
#!/bin/bash
# lib/quality-review.sh - AI Quality Review

review_content_quality() {
    local output_file="$1"
    local epf_sources="$2"  # JSON array of source files used
    
    echo ""
    echo "🤖 AI QUALITY REVIEW"
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo ""
    echo "Analyzing generated content..."
    
    # Extract sections from markdown
    local sections
    sections=$(awk '/^## / {if (section) print section; section=""} {section=section"\n"$0} END {print section}' "$output_file")
    
    # Run quality checks (pattern-based for now, can call LLM API later)
    local critical_issues=()
    local important_issues=()
    local minor_issues=()
    
    # Check 1: Placeholder detection (CRITICAL)
    while IFS= read -r line; do
        if echo "$line" | grep -qE '\[.*TBD.*\]|\[.*TODO.*\]|XXX|FIXME|\{\{.*\}\}'; then
            local line_num=$(grep -n "$line" "$output_file" | head -1 | cut -d: -f1)
            critical_issues+=("Line $line_num: Found placeholder '$line' - must be filled in")
        fi
    done < <(grep -E '\[.*TBD.*\]|\[.*TODO.*\]|XXX|FIXME|\{\{.*\}\}' "$output_file")
    
    # Check 2: Numerical consistency (CRITICAL)
    # Extract numbers and check for mathematical inconsistencies
    local numbers
    numbers=$(grep -oE '\$[0-9,]+[KMB]?' "$output_file" | tr -d '$,')
    
    # Check 3: Weak problem statements (IMPORTANT)
    if grep -qiE 'companies struggle|businesses need|organizations want' "$output_file"; then
        important_issues+=("Found generic problem statements - should use specific pain points from personas")
    fi
    
    # Check 4: Missing traceability (IMPORTANT)
    local total_claims=$(grep -cE '^- |^• |^\* ' "$output_file")
    local sourced_claims=$(grep -cE '\[.*\]\(.*\)|\(see:.*\)|\(ref:.*\)' "$output_file")
    
    if (( total_claims > 20 && sourced_claims * 100 / total_claims < 30 )); then
        important_issues+=("Low traceability: Only $sourced_claims/$total_claims claims have source references")
    fi
    
    # Check 5: Typos and style (MINOR)
    local typo_count=0
    if command -v aspell &> /dev/null; then
        typo_count=$(aspell list < "$output_file" | wc -l)
        [[ $typo_count -gt 10 ]] && minor_issues+=("Found $typo_count potential typos - run spell check")
    fi
    
    # Check 6: Readability (use simple heuristic)
    local avg_sentence_length
    avg_sentence_length=$(awk -F'[.!?]' '{for(i=1;i<=NF;i++) print $i}' "$output_file" | \
        awk '{sum+=NF; count++} END {if(count>0) print int(sum/count)}')
    
    if (( avg_sentence_length > 25 )); then
        minor_issues+=("Average sentence length: $avg_sentence_length words - consider simplifying")
    fi
    
    # Calculate quality score
    local score=100
    (( score -= ${#critical_issues[@]} * 15 ))
    (( score -= ${#important_issues[@]} * 5 ))
    (( score -= ${#minor_issues[@]} * 2 ))
    [[ $score -lt 0 ]] && score=0
    
    # Display results
    echo ""
    echo "📊 OVERALL QUALITY SCORE: $score/100"
    echo ""
    
    # Critical issues
    if (( ${#critical_issues[@]} > 0 )); then
        echo "🔴 CRITICAL ISSUES (${#critical_issues[@]} found):"
        echo ""
        for issue in "${critical_issues[@]}"; do
            echo "   • $issue"
        done
        echo ""
    fi
    
    # Important issues
    if (( ${#important_issues[@]} > 0 )); then
        echo "🟡 IMPORTANT IMPROVEMENTS (${#important_issues[@]} found):"
        echo ""
        for issue in "${important_issues[@]}"; do
            echo "   • $issue"
        done
        echo ""
    fi
    
    # Minor issues
    if (( ${#minor_issues[@]} > 0 )); then
        echo "🔵 MINOR IMPROVEMENTS (${#minor_issues[@]} found):"
        read -p "   Show details? [Y/n]: " show_minor
        if [[ "$show_minor" != "n" && "$show_minor" != "N" ]]; then
            for issue in "${minor_issues[@]}"; do
                echo "   • $issue"
            done
        fi
        echo ""
    fi
    
    # Summary report
    local report_json
    report_json=$(jq -n \
        --arg score "$score" \
        --argjson critical "$(printf '%s\n' "${critical_issues[@]}" | jq -R . | jq -s .)" \
        --argjson important "$(printf '%s\n' "${important_issues[@]}" | jq -R . | jq -s .)" \
        --argjson minor "$(printf '%s\n' "${minor_issues[@]}" | jq -R . | jq -s .)" \
        '{
            quality_score: ($score | tonumber),
            critical_issues: $critical,
            important_issues: $important,
            minor_issues: $minor,
            timestamp: now
        }')
    
    echo "$report_json" > "${output_file%.md}_quality_report.json"
    
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo ""
    echo "Quality report saved to: ${output_file%.md}_quality_report.json"
    
    # Return exit code based on severity
    if (( ${#critical_issues[@]} > 0 )); then
        return 2  # Critical issues found
    elif (( ${#important_issues[@]} > 0 )); then
        return 1  # Important issues found
    else
        return 0  # All good
    fi
}
```

**Key Bash Techniques:**
- **Associative arrays** (`declare -A`) for key-value storage
- **`jq`** for JSON generation and manipulation
- **`read -p`** for interactive prompts with defaults
- **`stat`** for file metadata (with macOS/Linux compatibility)
- **Arithmetic expansion** (`$(( ))`) for calculations
- **String manipulation** (`${var//pattern/replacement}`)
- **Arrays** (`critical_issues=()`) for collecting issues
- **Pattern matching** (`grep -E`, `awk`, `sed`) for content analysis
- **Process substitution** (`< <(command)`) for reading command output
- **Command substitution** (`$(command)`) for capturing output

### Why Python Examples Remain in Document

The Python code above serves as **clear pseudocode** to communicate:
- Logic flow and structure
- User experience and interactions
- Data structures and relationships
- Algorithm complexity

**When implementing:** Translate the Python logic to bash using the techniques shown in the example above. Bash is fully capable of all features proposed - it just requires different syntax.

### Implementation Priority

1. **Phase 0.4, 0.6** - Pure bash, straightforward (interactive prompts + `jq`)
2. **Phase 6** - Bash with pattern matching (may call LLM API via `curl` if needed)
3. **Phase 7** - Pure bash with git commands

**No Python needed.** EPF stays dependency-free. ✅

---

## 🗺️ Implementation Roadmap

**Status:** Ready to implement  
**Priority:** Optional enhancement (all generators already production-ready at v1.0)  
**Effort:** 8-10 weeks total  
**Approach:** Incremental (implement one phase at a time, test, iterate)

### Current State (v1.0) ✅

**All generators standardized:**
- ✅ context-sheet: schema + wizard + validator + README
- ✅ investor-memo: schema + wizard + validator + README  
- ✅ skattefunn-application: schema + wizard + validator + README + template

**All validators fixed:**
- ✅ Removed `set -e` from all validators
- ✅ All validators collect ALL errors (not just first)
- ✅ Proper error counting and exit codes

**Documentation complete:**
- ✅ GENERATOR_GUIDE.md (39 KB) - Comprehensive development guide
- ✅ GENERATOR_ENHANCEMENTS.md (this file) - v2.0 enhancement proposal
- ✅ Individual README.md for each generator

**Session notes archived:**
- `.epf-work/generator-standardization-session-2026-01-03.md` - What we accomplished
- `.epf-work/notebooklm-studio-comparison-2026-01-03.md` - NotebookLM analysis
- `.epf-work/validator-fix-action-plan-2026-01-03.md` - Validator fixes (completed)

### Next Steps (v2.0 Implementation)

#### Milestone 1: Core Enhancements (2-3 weeks)

**Goal:** Add Phase 0.4 and 0.6 to one pilot generator

**Tasks:**
1. Choose pilot generator (recommend: investor-memo - complex, high-value)
2. Implement Phase 0.4 (Dynamic Source Selection)
   - Create `lib/select-sources.sh` (use bash example from this file)
   - Add to wizard between Phase 0 and Phase 1
   - Test with real EPF instance
   - Document in wizard.instructions.md
3. Implement Phase 0.6 (Output Customization)
   - Create `lib/customize-output.sh` (use bash example from this file)
   - Add to wizard after Phase 0.4
   - Apply customization in Phase 3 (Transformation)
   - Test with different audience types
   - Document in wizard.instructions.md
4. Update README.md with new interactive features
5. Validate with 2-3 real-world generations

**Deliverables:**
- investor-memo with Phase 0.4 and 0.6 ✨
- Updated wizard.instructions.md
- Updated README.md
- Test results document

#### Milestone 2: Quality Review (2-3 weeks)

**Goal:** Add Phase 6 (AI Quality Review) to pilot generator

**Tasks:**
1. Implement Phase 6 (AI Quality Review)
   - Create `lib/quality-review.sh` (use bash example from this file)
   - Add pattern-based checks (placeholders, weak language, traceability)
   - Optional: Add LLM API integration via `curl` for semantic analysis
   - Generate JSON quality report
   - Interactive suggestion application
2. Test quality review with known good/bad outputs
3. Tune scoring thresholds and issue classification
4. Document in README.md (new section: "Quality Review")
5. Add to wizard as post-Phase 5 step

**Deliverables:**
- investor-memo with Phase 6 ✨
- lib/quality-review.sh script
- Quality report JSON schema
- Updated documentation

#### Milestone 3: Version Management (2 weeks)

**Goal:** Add Phase 7 (Version Management) to pilot generator

**Tasks:**
1. Implement Phase 7 (Version Management)
   - Create version manifest YAML schema
   - Create `lib/version-manager.sh`
   - Track output versions with source metadata
   - Implement diff functionality
   - Add version listing/comparison commands
2. Update wizard to save version manifest
3. Create `diff-outputs.sh` utility script
4. Document versioning workflow in README.md
5. Test with multiple generation cycles

**Deliverables:**
- investor-memo with Phase 7 ✨
- lib/version-manager.sh script
- diff-outputs.sh utility
- Version manifest schema
- Updated documentation

#### Milestone 4: Rollout to All Generators (2 weeks)

**Goal:** Apply v2.0 enhancements to context-sheet and skattefunn

**Tasks:**
1. Review pilot implementation (investor-memo)
2. Extract reusable patterns and libraries
3. Apply Phase 0.4, 0.6 to context-sheet
   - Adapt source selection for simpler structure
   - Adapt output customization for context sheets
4. Apply Phase 0.4, 0.6 to skattefunn-application
   - Integrate with existing Phase 0.5 (KR selection)
   - Add Norwegian language customization
5. Apply Phase 6, 7 to both generators
6. Update GENERATOR_GUIDE.md to reflect v2.0 as standard
7. Update all READMEs
8. Comprehensive testing across all 3 generators

**Deliverables:**
- All 3 generators at v2.0 ✨
- Updated GENERATOR_GUIDE.md (v2.0)
- Shared library scripts in outputs/lib/
- Migration guide (v1.0 → v2.0)
- Release notes

### Implementation Guidelines

**When starting v2.0 work:**

1. **Read this file first** - GENERATOR_ENHANCEMENTS.md is the single source of truth
2. **Use bash examples** - All implementation examples are provided in bash (not Python)
3. **Start with investor-memo** - Most complex generator, best test case
4. **Implement one phase at a time** - Don't try to do everything at once
5. **Test extensively** - Each phase should work independently before moving to next
6. **Document as you go** - Update README.md and wizard.instructions.md immediately
7. **Keep v1.0 working** - v2.0 features are additive, not breaking

**Architecture principles:**

- ✅ **Bash-first** - No Python, no new runtime dependencies
- ✅ **Interactive** - User makes choices, generator adapts
- ✅ **Incremental** - Each phase adds value independently
- ✅ **Backward-compatible** - v1.0 wizards still work
- ✅ **Well-documented** - Every new feature has examples

**Files to reference:**

| File | Purpose |
|------|---------|
| `GENERATOR_ENHANCEMENTS.md` (this file) | Complete v2.0 specification, bash examples, roadmap |
| `GENERATOR_GUIDE.md` | Current v1.0 standard, mandatory components |
| `.epf-work/notebooklm-studio-comparison-2026-01-03.md` | NotebookLM analysis, enhancement ideas |
| `.epf-work/generator-standardization-session-2026-01-03.md` | v1.0 standardization history |
| `skattefunn-application/wizard.instructions.md` | Reference implementation (most mature) |

**Testing checklist:**

- [ ] Phase 0.4 lets users select/deselect optional sources
- [ ] Phase 0.4 warns about stale sources (>90 days)
- [ ] Phase 0.6 customizes output for different audiences
- [ ] Phase 0.6 adjusts tone, length, complexity correctly
- [ ] Phase 6 finds placeholder text and issues
- [ ] Phase 6 calculates quality score accurately
- [ ] Phase 6 suggests actionable improvements
- [ ] Phase 7 tracks version history correctly
- [ ] Phase 7 diffs show meaningful changes
- [ ] All phases work with real EPF instances
- [ ] Documentation matches implementation
- [ ] No Python dependencies introduced

### Success Criteria

**v2.0 is complete when:**

1. ✅ All 3 generators have Phase 0.4, 0.6, 6, 7 implemented
2. ✅ All bash examples from this file are working code
3. ✅ Quality review catches known issues (placeholder text, weak language)
4. ✅ Version tracking works across multiple generation cycles
5. ✅ Documentation updated (GENERATOR_GUIDE.md v2.0)
6. ✅ No new dependencies beyond existing tools (yq, jq, ajv-cli)
7. ✅ Backward compatible (v1.0 wizards still work)
8. ✅ Tested with at least 2 real EPF instances

**Optional enhancements (future):**

- Phase 0.8: Multi-modal outputs (audio scripts, diagrams)
- Phase 8: LLM API integration for semantic analysis
- Phase 9: Template library and community sharing
- Phase 10: Collaborative editing features

---

## 📚 For Future AI Sessions

**"I want to implement v2.0 enhancements" → Start here:**

1. Read `GENERATOR_ENHANCEMENTS.md` (this file) completely
2. Check current status in `.epf-work/generator-standardization-session-2026-01-03.md`
3. Follow Milestone 1 tasks (start with investor-memo, Phase 0.4)
4. Use bash implementation examples from this file (not Python pseudocode)
5. Test each phase independently before moving to next
6. Update documentation as you implement

**"Which generator should I enhance first?" → investor-memo**

- Most complex (10 sections, multi-document)
- Highest value (fundraising is critical)
- Best test case for customization features

**"Where are the bash examples?" → This file, section "Implementation Note: Bash-First Philosophy"**

- Phase 0.4 example: Dynamic Source Selection (115 lines)
- Phase 0.6 example: Output Customization (175 lines)
- Phase 6 example: AI Quality Review (155 lines)

**"What's already done?" → v1.0 standardization complete**

- All generators have schema + wizard + validator + README
- All validators collect all errors (no `set -e`)
- Documentation complete (GENERATOR_GUIDE.md, individual READMEs)
- Ready for v2.0 enhancements

**"What's the priority?" → Optional enhancement**

- v1.0 generators are production-ready
- v2.0 adds interactive studio features
- Implement when time/resources available
- No urgent dependency on v2.0

---

## Version History

- **v2.0.0** (2026-01-03) - Enhancement proposal with bash implementations, clear roadmap
  - Added Phase 0.4 (Dynamic Source Selection)
  - Added Phase 0.6 (Output Customization)
  - Added Phase 6 (AI Quality Review)
  - Added Phase 7 (Version Management)
  - Bash implementation examples (not Python)
  - 4-milestone implementation roadmap
  - Testing checklist and success criteria
  - Clear guidance for future AI sessions

- **v1.0.0** (2026-01-03) - Initial proposal based on NotebookLM Studio comparison

