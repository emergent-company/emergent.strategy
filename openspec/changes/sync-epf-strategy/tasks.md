## 1. Value Model Updates (execute first — paths referenced by FDs and KRs)

- [ ] 1.1 Rename `product.emergent-core.value_model.yaml` → `product.emergent-memory.value_model.yaml`: Rename product line, update all internal references
- [ ] 1.2 Refocus Emergent Memory value model to pure memory capabilities: Knowledge Graph (entity/relationship storage, graph queries, batch ops, FTS, canonical IDs), Vector Search (embeddings, similarity, fusion strategies), Entity Extraction (NLP, AI-powered, Google ADK-Go), Document Processing (ingestion, chunking, embedding policies)
- [ ] 1.3 Remove non-memory capabilities from Memory value model: CLI, SDK, admin UI, MCP server, multi-agent coordination, email service, template packs (these move to Emergent Tools)
- [ ] 1.4 Update `product.emergent-tools.value_model.yaml`: Add capabilities moved from Core (CLI, SDK, admin UI, MCP server), mark shipped capabilities as active, position tools as consumers of Memory APIs
- [ ] 1.5 Rewrite `product.epf-runtime.value_model.yaml` Layer 2: Replace Temporal DurableExecution/SchemaEnforcement with EPF Cloud Strategy Server (MCP over SSE, GitHub artifact loading, Cloud Run hosting)
- [ ] 1.6 Rewrite `product.epf-runtime.value_model.yaml` Layer 3: Replace WorkspaceIsolation/ExternalIntegrations with AI Strategy Engine (OpenCode headless, EPF artifact writing, framework-agnostic engine + EPF framework layer)
- [ ] 1.7 Rewrite `product.epf-runtime.value_model.yaml` Layer 4: Replace ProductFactoryOS Dashboard with AI Strategy Platform (subscription billing, session management, multi-tenant isolation)
- [ ] 1.8 Update `product.epf-runtime.value_model.yaml` Layer 1: Mark shipped capabilities as active (distribution pipeline, Homebrew tap)
- [ ] 1.9 Update `product.epf-runtime.value_model.yaml` roadmap phases 3-7 to reflect actual implementation path
- [ ] 1.10 Create `product.diane.value_model.yaml`: Lightweight value model for Diane personal AI assistant (MCP tools, Google integration, banking, reminders, smart home)
- [ ] 1.11 Validate all value model files individually with `epf-cli validate`

## 2. Product Portfolio Update

- [ ] 2.1 Rename Emergent Core → Emergent Memory in `product_portfolio.yaml` with updated description reflecting pure memory positioning
- [ ] 2.2 Add Diane product line to `product_portfolio.yaml`
- [ ] 2.3 Update EPF-Runtime description (remove Temporal references, describe cloud server + AI strategy path)
- [ ] 2.4 Update Emergent Memory version (0.1.0 → 0.9.4) and status
- [ ] 2.5 Update Emergent Tools version and status (mark CLI/SDK as shipped, note tools as Memory API consumers)
- [ ] 2.6 Validate `product_portfolio.yaml` with `epf-cli validate`

## 3. Feature Definition Updates

- [ ] 3.1 Rewrite fd-010: Replace Temporal Workflow Initiation API with EPF Cloud Strategy Server (MCP-based, stateless, Cloud Run). Maintain exactly 4 personas, 200+ char narratives, valid contributes_to paths using new value model component names
- [ ] 3.2 Update fd-011: Remove Temporal/server-side references, mark local validation capabilities as delivered, update contributes_to paths to new value model components
- [ ] 3.3 Create fd-014 (AI Strategy Agent): Feature definition for emergent-AI-strategy capability with 4 personas, capabilities, scenarios, and contributes_to paths referencing Layer 3 value model
- [ ] 3.4 Create fd-015 (Diane Personal AI Assistant): Lightweight feature definition for Diane with 4 personas, capabilities for MCP tools, contributes_to paths referencing Diane value model
- [ ] 3.5 Update fd-001 through fd-009: Replace all `contributes_to` paths referencing "emergent-core" with "emergent-memory" paths. Review maturity tracking for capabilities shipped in the Go server
- [ ] 3.6 Validate all feature definition files with `epf-cli validate`

## 4. Roadmap Recipe Update

- [ ] 4.1 Rewrite kr-p-006 through kr-p-009: Replace Temporal 4-stage approach with Cloud Server → AI Strategy PoC → AI Strategy Platform milestones
- [ ] 4.2 Add KR for Emergent Memory v1.0 milestone (Go port completion)
- [ ] 4.3 Add KR for Diane stabilization (v1.x maintenance)
- [ ] 4.4 Update all KR `target_value_paths` referencing old "emergent-core" paths to use new "emergent-memory" paths
- [ ] 4.5 Validate `05_roadmap_recipe.yaml` with `epf-cli validate`

## 5. Cross-Artifact Validation

- [ ] 5.1 Run `epf-cli health` on full instance — fix any relationship validation errors
- [ ] 5.2 Verify all `contributes_to` paths in FDs resolve to valid value model components (especially after Core → Memory rename)
- [ ] 5.3 Verify all KR `target_value_paths` resolve to valid value model components
- [ ] 5.4 Run content readiness check — no unintentional TBD/TODO placeholders
- [ ] 5.5 Run feature quality check — all persona narratives, context descriptions meet minimums

## 6. Commit and Push

- [ ] 6.1 Stage all changes in the `emergent-epf` submodule
- [ ] 6.2 Commit with descriptive message to `emergent-epf` repo
- [ ] 6.3 Push to `emergent-company/emergent-epf` main branch
- [ ] 6.4 Update submodule reference in `emergent-strategy` repo
- [ ] 6.5 Commit submodule pointer update in `emergent-strategy`
