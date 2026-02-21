# test-product EPF Instance

This is the EPF (Emergent Product Framework) instance for test-product.

## Directory Structure

- **READY/** - Strategic foundation phase
  - 00_north_star.yaml - Vision, mission, values
  - 01_insight_analyses.yaml - Market research
  - 02_strategy_foundations.yaml - Core strategy elements
  - 03_insight_opportunity.yaml - Opportunity analysis
  - 04_strategy_formula.yaml - Strategic approach
  - 05_roadmap_recipe.yaml - Execution roadmap

- **FIRE/** - Execution phase
  - definitions/ - Feature & track definitions
  - value_models/ - Value creation models
  - workflows/ - Process workflows

- **AIM/** - Assessment phase
  - living_reality_assessment.yaml - Persistent baseline
  - assessment_reports/ - Cycle assessments

- **outputs/** - Generated documents

## Validation

```bash
# Validate this instance
epf-cli health

# Validate specific file
epf-cli validate READY/00_north_star.yaml

# Generate health report
epf-cli report --format html -o report.html
```
