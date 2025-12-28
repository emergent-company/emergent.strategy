# EPF v2.0.0 Health & Consistency Report
**Product**: emergent
**Generated**: 2025-12-28 19:59:32
**EPF Framework Version**: 2.0.0

---

## 1. Instance Metadata

-   product_name: "Emergent"
-   epf_version: "2.0.0"
- Current     phase: "READY"
- ✅ Metadata file present

## 2. READY Phase Artifacts

| Artifact | Status | File Size |
|----------|--------|-----------|
| 00_north_star.yaml | ✅ Present | 27719 bytes |
| 01_insight_analyses.yaml | ✅ Present | 18923 bytes |
| 02_strategy_foundations.yaml | ✅ Present | 19124 bytes |
| 03_insight_opportunity.yaml | ✅ Present | 5746 bytes |
| 04_strategy_formula.yaml | ✅ Present | 29236 bytes |
| 05_roadmap_recipe.yaml | ✅ Present | 20636 bytes |

## 3. FIRE Phase Artifacts

- **Feature Definitions**: 9 files
- **Value Models**: 4 files
- **Workflows**: 0 files
- ✅ No legacy `value_propositions` field found (v2.0.0 compliant)
- ✅ Mappings file present

## 4. Traceability Quick Check

- **Roadmap KRs**: 0 defined
- **Features linked to Roadmap**: 0 / 9
- **Features linked to Value Models**: 0 / 9

## 5. Feature Definition Quality (v2.0.0 Schema)

Checking persona count (v2.0.0 requires exactly 4 per feature)...

- ⚠️ fd-001_knowledge_graph_engine.yaml: 0 personas (expected 4)
- ⚠️ fd-002_document_ingestion_pipeline.yaml: 0 personas (expected 4)
- ⚠️ fd-003_ai_native_chat.yaml: 0 personas (expected 4)
- ⚠️ fd-004_model_context_protocol_server.yaml: 0 personas (expected 4)
- ⚠️ fd-005_template_packs_system.yaml: 0 personas (expected 4)
- ⚠️ fd-006_integration_framework.yaml: 0 personas (expected 4)
- ⚠️ fd-007_authentication_multi_tenancy.yaml: 0 personas (expected 4)
- ⚠️ fd-008_ai_chat_interface.yaml: 0 personas (expected 4)
- ⚠️ fd-009_admin_tools_configuration.yaml: 0 personas (expected 4)

- ✅ **Compliant**: 0 / 9 features have exactly 4 personas
- ⚠️ **Non-compliant**: 9 features need persona count adjustment

---

## Summary

This health check validates EPF v2.0.0 migration completeness for the **emergent** instance.

**Key Migration Points:**
- ✅ Framework synced to v2.0.0
- ✅ Instance `_meta.yaml` updated to `epf_version: 2.0.0`
- Check: Legacy `value_propositions` field removed from all feature definitions
- Check: Feature definitions have exactly 4 personas (v2.0.0 schema requirement)
- Check: Traceability links present (roadmap KRs, value model drivers)

**Next Steps:**
- Address any ⚠️ warnings or ❌ errors above
- Run full schema validation: `./scripts/validate-schemas.sh _instances/emergent/`
- Test balance checker against roadmap: `@wizards/balance_checker.agent_prompt.md`

