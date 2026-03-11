/**
 * Unit tests for formatters and tools (src/formatters.ts, src/tools.ts)
 *
 * Tests:
 * - formatHealthToast: concise toast message generation
 * - formatHealthDashboard: full markdown dashboard
 * - formatCoverageDashboard: coverage analysis markdown
 * - formatRoadmapDashboard: OKR + assumptions markdown
 *
 * Run with: bun test
 */

import { describe, it, expect } from "bun:test";
import {
  formatHealthToast,
  formatHealthDashboard,
  formatCoverageDashboard,
  formatRoadmapDashboard,
} from "../src/formatters";
import type {
  HealthResult,
  CoverageResult,
  OKRProgressResult,
  AssumptionResult,
} from "../src/cli";

// ---------------------------------------------------------------------------
// Mock data factories
// ---------------------------------------------------------------------------

function makeHealthy(): HealthResult {
  return {
    overall_status: "healthy",
    has_critical: false,
    has_errors: false,
    has_warnings: false,
    tiers: {
      critical: { score: 3, max: 3, issues: 0, summary: "All clear" },
      schema: { score: 5, max: 5, issues: 0, summary: "All valid" },
      quality: { score: 2, max: 2, issues: 0, summary: "Good quality" },
    },
    structure_check: {
      repo_type: "phased",
      valid: true,
      message: "Valid EPF instance structure",
    },
    schema_validation: {
      total_files: 10,
      valid_files: 10,
      invalid_files: 0,
      skipped_files: 0,
    },
    instance_check: {
      total_checks: 8,
      passed: 8,
      failed: 0,
      critical: 0,
      errors: 0,
      warnings: 0,
    },
    relationships: {
      valid: true,
      coverage_percent: 75,
      total_l2_components: 20,
      covered_l2_components: 15,
      invalid_paths: 0,
      grade: "B",
      score: 75,
    },
    content_readiness: {
      total_files: 10,
      files_checked: 10,
      score: 95,
      grade: "A",
      placeholders: [],
    },
  };
}

function makeCritical(): HealthResult {
  return {
    overall_status: "critical",
    has_critical: true,
    has_errors: true,
    has_warnings: true,
    tiers: {
      critical: {
        score: 0,
        max: 3,
        issues: 2,
        summary: "Missing anchor file",
        details: ["No _epf.yaml found", "READY/ directory missing"],
      },
      schema: {
        score: 2,
        max: 5,
        issues: 3,
        summary: "3 files invalid",
      },
      quality: {
        score: 1,
        max: 2,
        issues: 4,
        summary: "Many placeholders",
      },
    },
    schema_validation: {
      total_files: 10,
      valid_files: 7,
      invalid_files: 3,
      skipped_files: 0,
      results: [
        {
          valid: false,
          file_path: "/instance/READY/north-star.yaml",
          artifact_type: "north_star",
          phase: "READY",
          errors: [
            { path: "vision", message: "Required field missing" },
          ],
        },
        {
          valid: false,
          file_path: "/instance/FIRE/fd-001.yaml",
          artifact_type: "feature_definition",
          phase: "FIRE",
          errors: [
            { path: "id", message: "Required" },
            { path: "status", message: "Invalid value" },
          ],
        },
        {
          valid: true,
          file_path: "/instance/READY/personas.yaml",
          artifact_type: "personas",
          phase: "READY",
        },
      ],
    },
    instance_check: {
      total_checks: 5,
      passed: 3,
      failed: 2,
      critical: 1,
      errors: 1,
      warnings: 0,
      results: [
        { check: "anchor_file", passed: true, severity: "critical", message: "Anchor file exists" },
        { check: "ready_dir", passed: true, severity: "critical", message: "READY/ directory exists" },
        { check: "fire_dir", passed: true, severity: "error", message: "FIRE/ directory exists" },
        { check: "old_feature_dir", passed: false, severity: "critical", message: "Old FIRE/feature_definitions/ directory should be migrated" },
        { check: "aim_lra", passed: false, severity: "error", message: "AIM/ missing living reality assessment" },
      ],
    },
  };
}

function makeCoverage(): CoverageResult {
  return {
    track: "Product",
    coverage_percent: 60,
    total_l2_components: 10,
    covered_l2_components: 6,
    uncovered_l2_components: [
      "Product.Discovery.MarketResearch",
      "Product.Discovery.UserResearch",
      "Product.Delivery.Testing",
      "Product.Delivery.Deployment",
    ],
    by_layer: [
      {
        layer_path: "Product.Discovery",
        layer_name: "Discovery",
        total_components: 4,
        covered_count: 2,
        coverage_percent: 50,
      },
      {
        layer_path: "Product.Delivery",
        layer_name: "Delivery",
        total_components: 3,
        covered_count: 2,
        coverage_percent: 67,
      },
      {
        layer_path: "Product.Core",
        layer_name: "Core",
        total_components: 3,
        covered_count: 2,
        coverage_percent: 67,
      },
    ],
    guidance: {
      next_steps: [
        "Add features for Discovery.MarketResearch",
        "Consider UserResearch capabilities",
      ],
      tips: ["Focus on uncovered L2 components"],
    },
  };
}

function makeOKRProgress(): OKRProgressResult {
  return {
    overall: {
      total_krs: 8,
      exceeded: 1,
      met: 3,
      partially_met: 2,
      missed: 2,
      achievement_rate: 50,
    },
    by_track: {
      product: {
        track: "product",
        summary: {
          total_krs: 4,
          exceeded: 1,
          met: 2,
          partially_met: 1,
          missed: 0,
          achievement_rate: 75,
        },
        cycles: [1],
      },
      strategy: {
        track: "strategy",
        summary: {
          total_krs: 4,
          exceeded: 0,
          met: 1,
          partially_met: 1,
          missed: 2,
          achievement_rate: 25,
        },
        cycles: [1],
      },
    },
    cycles: [
      {
        cycle: 1,
        summary: {
          total_krs: 8,
          exceeded: 1,
          met: 3,
          partially_met: 2,
          missed: 2,
          achievement_rate: 50,
        },
        okrs: [
          {
            okr_id: "okr-p-1",
            track: "product",
            objective: "Build core EPF validation capabilities for production use",
            summary: {
              total_krs: 4,
              exceeded: 1,
              met: 2,
              partially_met: 1,
              missed: 0,
              achievement_rate: 75,
            },
          },
          {
            okr_id: "okr-s-1",
            track: "strategy",
            objective: "Establish market positioning",
            summary: {
              total_krs: 4,
              exceeded: 0,
              met: 1,
              partially_met: 1,
              missed: 2,
              achievement_rate: 25,
            },
          },
        ],
      },
    ],
  };
}

function makeAssumptions(): AssumptionResult {
  return {
    summary: {
      total: 5,
      validated: 2,
      invalidated: 1,
      inconclusive: 1,
      pending: 1,
    },
    details: [
      {
        id: "a-001",
        statement: "Users want YAML validation",
        track: "product",
        status: "validated",
        evidence: "Confirmed via user interviews",
      },
      {
        id: "a-002",
        statement: "CLI is preferred over GUI",
        track: "product",
        status: "validated",
        evidence: "Usage analytics show 90% CLI",
      },
      {
        id: "a-003",
        statement: "Enterprise needs compliance exports",
        track: "commercial",
        status: "invalidated",
        evidence: "No enterprise demand observed",
      },
      {
        id: "a-004",
        statement: "AI agents can use EPF effectively",
        track: "strategy",
        status: "inconclusive",
        evidence: "Mixed results",
      },
      {
        id: "a-005",
        statement: "Community will contribute generators",
        track: "strategy",
        status: "pending",
        evidence: "",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// formatHealthToast
// ---------------------------------------------------------------------------

describe("formatHealthToast", () => {
  it("formats a healthy instance", () => {
    const toast = formatHealthToast(makeHealthy());
    expect(toast).toContain("healthy");
    expect(toast).toContain("10/10 valid");
    // Should NOT contain critical or schema errors when healthy
    expect(toast).not.toContain("critical");
    expect(toast).not.toContain("schema errors");
  });

  it("formats a critical instance (shows only most important tier)", () => {
    const toast = formatHealthToast(makeCritical());
    expect(toast).toContain("critical");
    expect(toast).toContain("2 critical");
    // Only the top-priority tier is shown — schema errors omitted
    expect(toast).not.toContain("3 schema errors");
    expect(toast).toContain("7/10 valid");
  });

  it("formats empty health data gracefully", () => {
    const toast = formatHealthToast({});
    expect(toast).toBe("EPF instance status unknown");
  });

  it("uses pipe separators", () => {
    const toast = formatHealthToast(makeHealthy());
    expect(toast).toContain(" | ");
  });
});

// ---------------------------------------------------------------------------
// formatHealthDashboard
// ---------------------------------------------------------------------------

describe("formatHealthDashboard", () => {
  it("includes instance path", () => {
    const md = formatHealthDashboard(makeHealthy(), "/my/instance");
    expect(md).toContain("`/my/instance`");
  });

  it("includes health tiers table", () => {
    const md = formatHealthDashboard(makeHealthy(), "/inst");
    expect(md).toContain("### Health Tiers");
    expect(md).toContain("| Tier | Score | Issues | Summary |");
    expect(md).toContain("| critical | 3/3 | 0 | All clear |");
    expect(md).toContain("| schema | 5/5 | 0 | All valid |");
    expect(md).toContain("| quality | 2/2 | 0 | Good quality |");
  });

  it("includes critical details when present", () => {
    const md = formatHealthDashboard(makeCritical(), "/inst");
    expect(md).toContain("### Critical Issues");
    expect(md).toContain("- No _epf.yaml found");
    expect(md).toContain("- READY/ directory missing");
  });

  it("does not include critical details section for healthy instance", () => {
    const md = formatHealthDashboard(makeHealthy(), "/inst");
    expect(md).not.toContain("### Critical Issues");
  });

  it("includes structure check", () => {
    const md = formatHealthDashboard(makeHealthy(), "/inst");
    expect(md).toContain("### Structure");
    expect(md).toContain("Repo type: phased");
    expect(md).toContain("Valid: yes");
  });

  it("includes schema validation table", () => {
    const md = formatHealthDashboard(makeHealthy(), "/inst");
    expect(md).toContain("### Schema Validation");
    expect(md).toContain("| Total files | 10 |");
    expect(md).toContain("| Valid | 10 |");
    expect(md).toContain("| Invalid | 0 |");
  });

  it("lists invalid files in critical instance", () => {
    const md = formatHealthDashboard(makeCritical(), "/inst");
    expect(md).toContain("**Invalid files:**");
    expect(md).toContain("north-star.yaml");
    expect(md).toContain("fd-001.yaml");
    // Valid file should not appear in invalid list
    expect(md).not.toContain("personas.yaml");
  });

  it("includes instance checks", () => {
    const md = formatHealthDashboard(makeHealthy(), "/inst");
    expect(md).toContain("### Instance Checks");
    expect(md).toContain("Passed: 8/8");
  });

  it("shows failed check details with severity tags", () => {
    const md = formatHealthDashboard(makeCritical(), "/inst");
    expect(md).toContain("### Instance Checks");
    expect(md).toContain("Passed: 3/5");
    expect(md).toContain("**Failed checks:**");
    expect(md).toContain("[CRITICAL] Old FIRE/feature_definitions/ directory should be migrated");
    expect(md).toContain("[ERROR] AIM/ missing living reality assessment");
  });

  it("includes relationships section", () => {
    const md = formatHealthDashboard(makeHealthy(), "/inst");
    expect(md).toContain("### Relationships");
    expect(md).toContain("Coverage: 75%");
    expect(md).toContain("15/20 L2 components");
    expect(md).toContain("Grade: B");
  });

  it("includes content readiness", () => {
    const md = formatHealthDashboard(makeHealthy(), "/inst");
    expect(md).toContain("### Content Readiness");
    expect(md).toContain("Score: 95");
    expect(md).toContain("Grade: A");
  });

  it("handles minimal health data without crashing", () => {
    const md = formatHealthDashboard({}, "/inst");
    expect(md).toContain("## EPF Instance Health");
    expect(md).toContain("Overall Status:** unknown");
  });
});

// ---------------------------------------------------------------------------
// formatCoverageDashboard
// ---------------------------------------------------------------------------

describe("formatCoverageDashboard", () => {
  it("includes track and overall coverage", () => {
    const md = formatCoverageDashboard(makeCoverage(), "Product");
    expect(md).toContain("**Track:** Product");
    expect(md).toContain("**Coverage:** 60%");
    expect(md).toContain("6/10 L2 components");
  });

  it("defaults track to 'All' when not specified", () => {
    const md = formatCoverageDashboard(makeCoverage());
    expect(md).toContain("**Track:** All");
  });

  it("includes layer breakdown table", () => {
    const md = formatCoverageDashboard(makeCoverage());
    expect(md).toContain("### Coverage by Layer");
    expect(md).toContain("| Layer | Components | Covered | Coverage |");
    expect(md).toContain("| Discovery |");
    expect(md).toContain("| Delivery |");
    expect(md).toContain("| Core |");
  });

  it("includes coverage bars", () => {
    const md = formatCoverageDashboard(makeCoverage());
    // 50% = [#####-----] 50%
    expect(md).toContain("[#####-----]");
    // 67% rounds to 7 filled = [#######---] 67%
    expect(md).toContain("[#######---]");
  });

  it("lists uncovered components (limited to 10)", () => {
    const md = formatCoverageDashboard(makeCoverage());
    expect(md).toContain("### Uncovered Components");
    expect(md).toContain("`Product.Discovery.MarketResearch`");
    expect(md).toContain("`Product.Delivery.Deployment`");
  });

  it("shows '... and N more' when >10 uncovered", () => {
    const coverage = makeCoverage();
    // Add 12 total uncovered components
    coverage.uncovered_l2_components = Array.from(
      { length: 12 },
      (_, i) => `Track.Layer.Component${i}`
    );
    const md = formatCoverageDashboard(coverage);
    expect(md).toContain("... and 2 more");
  });

  it("includes next steps", () => {
    const md = formatCoverageDashboard(makeCoverage());
    expect(md).toContain("### Next Steps");
    expect(md).toContain("Add features for Discovery.MarketResearch");
  });

  it("handles empty coverage gracefully", () => {
    const empty: CoverageResult = {
      track: "All",
      coverage_percent: 0,
      total_l2_components: 0,
      covered_l2_components: 0,
    };
    const md = formatCoverageDashboard(empty);
    expect(md).toContain("## EPF Value Model Coverage");
    expect(md).toContain("**Coverage:** 0%");
  });
});

// ---------------------------------------------------------------------------
// formatRoadmapDashboard
// ---------------------------------------------------------------------------

describe("formatRoadmapDashboard", () => {
  it("includes overall OKR progress", () => {
    const md = formatRoadmapDashboard(makeOKRProgress(), makeAssumptions());
    expect(md).toContain("### Overall OKR Progress");
    expect(md).toContain("**Achievement Rate:** 50%");
    expect(md).toContain("**Total KRs:** 8");
  });

  it("includes KR breakdown", () => {
    const md = formatRoadmapDashboard(makeOKRProgress(), makeAssumptions());
    expect(md).toContain("Exceeded: 1");
    expect(md).toContain("Met: 3");
    expect(md).toContain("Partially Met: 2");
    expect(md).toContain("Missed: 2");
  });

  it("includes progress by track table", () => {
    const md = formatRoadmapDashboard(makeOKRProgress(), makeAssumptions());
    expect(md).toContain("### Progress by Track");
    expect(md).toContain("| product | 4 | 75% |");
    expect(md).toContain("| strategy | 4 | 25% |");
  });

  it("includes cycle details", () => {
    const md = formatRoadmapDashboard(makeOKRProgress(), makeAssumptions());
    expect(md).toContain("### Cycle 1");
    expect(md).toContain("Achievement: 50%");
    // Objective gets truncated at 50 chars
    expect(md).toContain("Build core EPF validation capabilities for prod...");
    expect(md).toContain("Establish market positioning");
  });

  it("includes assumption validation summary", () => {
    const md = formatRoadmapDashboard(makeOKRProgress(), makeAssumptions());
    expect(md).toContain("### Assumption Validation");
    expect(md).toContain("**Total:** 5");
    expect(md).toContain("Validated: 2");
    expect(md).toContain("Invalidated: 1");
    expect(md).toContain("Inconclusive: 1");
    expect(md).toContain("Pending: 1");
  });

  it("includes assumption detail table with status icons", () => {
    const md = formatRoadmapDashboard(makeOKRProgress(), makeAssumptions());
    expect(md).toContain("| a-001 | product | [+] validated |");
    expect(md).toContain("| a-003 | commercial | [x] invalidated |");
    expect(md).toContain("| a-004 | strategy | [?] inconclusive |");
    expect(md).toContain("| a-005 | strategy | [ ] pending |");
  });

  it("handles zero KRs gracefully", () => {
    const emptyOKR: OKRProgressResult = {
      overall: {
        total_krs: 0,
        exceeded: 0,
        met: 0,
        partially_met: 0,
        missed: 0,
        achievement_rate: 0,
      },
      by_track: {},
      cycles: [],
    };
    const emptyAssumptions: AssumptionResult = {
      summary: {
        total: 0,
        validated: 0,
        invalidated: 0,
        inconclusive: 0,
        pending: 0,
      },
      details: [],
    };
    const md = formatRoadmapDashboard(emptyOKR, emptyAssumptions);
    expect(md).toContain("## EPF Roadmap Status");
    expect(md).toContain("**Total KRs:** 0");
    // Should NOT include the KR breakdown line for 0 KRs
    expect(md).not.toContain("Exceeded:");
  });
});

// ---------------------------------------------------------------------------
// Section 7: New tests for agent/skill integration
// ---------------------------------------------------------------------------

describe("formatHealthToast — agent recommendation", () => {
  it("suggests agent when errors are found", () => {
    const health: HealthResult = {
      overall_status: "error",
      has_critical: false,
      has_errors: true,
      has_warnings: true,
      tiers: {
        schema: { score: 3, max: 5, issues: 2, summary: "2 schema errors" },
      },
      schema_validation: {
        total_files: 10,
        valid_files: 8,
        invalid_files: 2,
        skipped_files: 0,
      },
    };
    const message = formatHealthToast(health);
    expect(message).toContain("epf_get_agent_for_task");
  });

  it("suggests agent when critical errors found", () => {
    const health: HealthResult = {
      overall_status: "critical",
      has_critical: true,
      has_errors: true,
      tiers: {
        critical: { score: 0, max: 3, issues: 1, summary: "Missing anchor" },
      },
    };
    const message = formatHealthToast(health);
    expect(message).toContain("epf_get_agent_for_task");
  });

  it("does NOT suggest agent when healthy", () => {
    const health: HealthResult = {
      overall_status: "healthy",
      has_critical: false,
      has_errors: false,
      has_warnings: false,
      tiers: {
        critical: { score: 3, max: 3, issues: 0, summary: "All clear" },
      },
      schema_validation: {
        total_files: 10,
        valid_files: 10,
        invalid_files: 0,
        skipped_files: 0,
      },
    };
    const message = formatHealthToast(health);
    expect(message).not.toContain("epf_get_agent_for_task");
  });
});

describe("formatHealthDashboard — plugin version", () => {
  it("shows orchestration status when plugin version is provided", () => {
    const health: HealthResult = {
      overall_status: "healthy",
    };
    const md = formatHealthDashboard(health, "/path/to/instance", "0.1.0");
    expect(md).toContain("opencode-epf@0.1.0");
    expect(md).toContain("Orchestration");
  });

  it("does NOT show orchestration when no plugin version", () => {
    const health: HealthResult = {
      overall_status: "healthy",
    };
    const md = formatHealthDashboard(health, "/path/to/instance");
    expect(md).not.toContain("Orchestration");
  });
});
