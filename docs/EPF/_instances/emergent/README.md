# Emergent - EPF Instance

This folder contains the EPF (Emergent Product Framework) instance for the **Emergent** ecosystem.

## What is Emergent?

Emergent is an **ecosystem of AI-powered products, frameworks, and tools** for knowledge management, product development, and emergent understanding. It's not a single product, but a portfolio:

| Product Line | Description | Status |
|-------------|-------------|--------|
| **Emergent Core** | AI-powered knowledge engine (formerly "Spec Server") | Active Development |
| **Emergent Frameworks** | EPF, OpenSpec, and other methodologies | Stable |
| **Emergent Tools** | CLI, MCP servers, integrations | Planned |

See `READY/06_product_portfolio.yaml` for the complete product portfolio documentation.

## Structure

```
emergent/
├── _meta.yaml                  # Instance metadata and version tracking
├── VERSION                     # Version file
├── READY/                      # Strategy phase
│   ├── 00_north_star.yaml      # Vision and strategic direction
│   ├── 01_insight_analyses.yaml # Market and user insights
│   ├── 02-03_*.yaml            # Strategy foundations and formula
│   ├── 04-05_*.yaml            # Roadmap planning
│   └── 06_product_portfolio.yaml # Product lines overview
├── FIRE/                       # Execution phase
│   └── feature_definitions/    # Feature definition files (fd-*.yaml)
├── AIM/                        # Assessment phase
│   └── assessments/            # Assessment reports
└── README.md                   # This file
```

## Getting Started

1. **Understand the ecosystem**: Start with `READY/00_north_star.yaml` for vision
2. **Review product portfolio**: See `READY/06_product_portfolio.yaml` for product lines
3. **Explore insights**: `READY/01_insight_analyses.yaml` for market context
4. **Plan work**: Feature definitions in `FIRE/feature_definitions/`

## Product Line Focus

When creating artifacts, specify which product line they apply to:
- **emergent-core**: Knowledge engine features and capabilities
- **epf**: Framework improvements and templates  
- **openspec**: Specification tooling
- **emergent-tools**: CLI, integrations, utilities

## Framework Version

- EPF Framework: v1.10.1
- Instance Version: v1.1.0

## Syncing Updates

Use the EPF sync script for updates:
```bash
./docs/EPF/scripts/sync-repos.sh pull   # Pull framework updates
./docs/EPF/scripts/sync-repos.sh check  # Check sync status
```

