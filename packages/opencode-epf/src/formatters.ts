/**
 * EPF Formatters — JSON → markdown formatters for inline display.
 *
 * Converts structured JSON output from epf-cli into readable markdown
 * tables and summaries for OpenCode custom tool responses.
 */

import type { HealthResult, CoverageResult, OKRProgressResult, AssumptionResult } from "./cli";

/**
 * Format a health result into a concise toast message.
 *
 * Kept short for toast display (aim for <60 chars).
 * Prioritizes the most important signal: critical > schema > quality > files valid.
 */
export function formatHealthToast(health: HealthResult): string {
  const parts: string[] = [];

  if (health.overall_status) {
    parts.push(health.overall_status);
  }

  // Show the single most important issue tier
  if (health.tiers) {
    const critical = health.tiers.critical;
    const schema = health.tiers.schema;
    const quality = health.tiers.quality;

    if (critical && critical.issues > 0) {
      parts.push(`${critical.issues} critical`);
    } else if (schema && schema.issues > 0) {
      parts.push(`${schema.issues} schema errors`);
    } else if (quality && quality.issues > 0) {
      parts.push(`${quality.issues} quality issues`);
    }
  }

  if (health.schema_validation) {
    parts.push(
      `${health.schema_validation.valid_files}/${health.schema_validation.total_files} valid`
    );
  }

  return parts.join(" | ") || "EPF instance status unknown";
}

/**
 * Format a full health result as a markdown dashboard.
 */
export function formatHealthDashboard(
  health: HealthResult,
  instancePath: string
): string {
  const lines: string[] = [];
  lines.push("## EPF Instance Health");
  lines.push("");
  lines.push(`**Instance:** \`${instancePath}\``);
  lines.push(`**Overall Status:** ${health.overall_status ?? "unknown"}`);
  lines.push("");

  // Tiers summary table
  if (health.tiers) {
    lines.push("### Health Tiers");
    lines.push("| Tier | Score | Issues | Summary |");
    lines.push("|------|-------|--------|---------|");
    for (const [name, tier] of Object.entries(health.tiers)) {
      lines.push(
        `| ${name} | ${tier.score}/${tier.max} | ${tier.issues} | ${tier.summary} |`
      );
    }
    lines.push("");

    // Critical details
    if (health.tiers.critical?.details && health.tiers.critical.details.length > 0) {
      lines.push("### Critical Issues");
      for (const detail of health.tiers.critical.details) {
        lines.push(`- ${detail}`);
      }
      lines.push("");
    }
  }

  // Structure check
  if (health.structure_check) {
    lines.push("### Structure");
    lines.push(`- Repo type: ${health.structure_check.repo_type}`);
    lines.push(`- Valid: ${health.structure_check.valid ? "yes" : "no"}`);
    lines.push(`- ${health.structure_check.message}`);
    lines.push("");
  }

  // Schema validation
  if (health.schema_validation) {
    lines.push("### Schema Validation");
    lines.push("| Metric | Count |");
    lines.push("|--------|-------|");
    lines.push(`| Total files | ${health.schema_validation.total_files} |`);
    lines.push(`| Valid | ${health.schema_validation.valid_files} |`);
    lines.push(`| Invalid | ${health.schema_validation.invalid_files} |`);
    lines.push("");

    if (health.schema_validation.results) {
      const invalid = health.schema_validation.results.filter((r) => !r.valid);
      if (invalid.length > 0) {
        lines.push("**Invalid files:**");
        for (const result of invalid) {
          const shortPath = result.file_path.split("/").slice(-2).join("/");
          const errorCount = result.errors?.length ?? 0;
          lines.push(`- \`${shortPath}\` (${result.artifact_type}): ${errorCount} error(s)`);
        }
        lines.push("");
      }
    }
  }

  // Instance checks
  if (health.instance_check) {
    lines.push("### Instance Checks");
    lines.push(
      `Passed: ${health.instance_check.passed}/${health.instance_check.total_checks}`
    );
    if (health.instance_check.critical > 0) {
      lines.push(`Critical: ${health.instance_check.critical}`);
    }
    if (health.instance_check.errors > 0) {
      lines.push(`Errors: ${health.instance_check.errors}`);
    }

    // Show details for failed checks
    if (health.instance_check.results) {
      const failed = health.instance_check.results.filter((r) => !r.passed);
      if (failed.length > 0) {
        lines.push("");
        lines.push("**Failed checks:**");
        for (const result of failed) {
          const severity = result.severity === "critical" ? "[CRITICAL]" : "[ERROR]";
          lines.push(`- ${severity} ${result.message}`);
        }
      }
    }
    lines.push("");
  }

  // Relationships
  if (health.relationships) {
    lines.push("### Relationships");
    lines.push(
      `- Coverage: ${health.relationships.coverage_percent}% (${health.relationships.covered_l2_components}/${health.relationships.total_l2_components} L2 components)`
    );
    lines.push(`- Grade: ${health.relationships.grade}`);
    if (health.relationships.invalid_paths > 0) {
      lines.push(`- Invalid paths: ${health.relationships.invalid_paths}`);
    }
    lines.push("");
  }

  // Content readiness
  if (health.content_readiness) {
    lines.push("### Content Readiness");
    lines.push(`- Score: ${health.content_readiness.score}`);
    lines.push(`- Grade: ${health.content_readiness.grade}`);
    if (health.content_readiness.placeholders) {
      lines.push(
        `- Placeholders remaining: ${health.content_readiness.placeholders.length}`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format coverage analysis as a markdown report.
 */
export function formatCoverageDashboard(
  coverage: CoverageResult,
  track?: string
): string {
  const lines: string[] = [];
  lines.push("## EPF Value Model Coverage");
  lines.push("");
  lines.push(
    `**Track:** ${track ?? "All"} | **Coverage:** ${coverage.coverage_percent}% (${coverage.covered_l2_components}/${coverage.total_l2_components} L2 components)`
  );
  lines.push("");

  // Layer breakdown table
  if (coverage.by_layer && coverage.by_layer.length > 0) {
    lines.push("### Coverage by Layer");
    lines.push("| Layer | Components | Covered | Coverage |");
    lines.push("|-------|-----------|---------|----------|");
    for (const layer of coverage.by_layer) {
      const bar = coverageBar(layer.coverage_percent);
      lines.push(
        `| ${layer.layer_name} | ${layer.total_components} | ${layer.covered_count} | ${bar} ${layer.coverage_percent}% |`
      );
    }
    lines.push("");
  }

  // Uncovered components (limit to first 10 to avoid noise)
  if (
    coverage.uncovered_l2_components &&
    coverage.uncovered_l2_components.length > 0
  ) {
    const shown = coverage.uncovered_l2_components.slice(0, 10);
    const remaining = coverage.uncovered_l2_components.length - shown.length;
    lines.push("### Uncovered Components (top 10)");
    for (const path of shown) {
      lines.push(`- \`${path}\``);
    }
    if (remaining > 0) {
      lines.push(`- ... and ${remaining} more`);
    }
    lines.push("");
  }

  // Guidance
  if (coverage.guidance) {
    if (coverage.guidance.next_steps && coverage.guidance.next_steps.length > 0) {
      lines.push("### Next Steps");
      for (const step of coverage.guidance.next_steps) {
        lines.push(`- ${step}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Format OKR progress and assumption validation as a markdown report.
 */
export function formatRoadmapDashboard(
  okr: OKRProgressResult,
  assumptions: AssumptionResult
): string {
  const lines: string[] = [];
  lines.push("## EPF Roadmap Status");
  lines.push("");

  // Overall summary
  lines.push("### Overall OKR Progress");
  lines.push(
    `**Achievement Rate:** ${okr.overall.achievement_rate}% | **Total KRs:** ${okr.overall.total_krs}`
  );
  if (okr.overall.total_krs > 0) {
    lines.push(
      `Exceeded: ${okr.overall.exceeded} | Met: ${okr.overall.met} | Partially Met: ${okr.overall.partially_met} | Missed: ${okr.overall.missed}`
    );
  }
  lines.push("");

  // By track
  if (okr.by_track) {
    lines.push("### Progress by Track");
    lines.push("| Track | KRs | Achievement |");
    lines.push("|-------|-----|-------------|");
    for (const [track, data] of Object.entries(okr.by_track)) {
      lines.push(
        `| ${track} | ${data.summary.total_krs} | ${data.summary.achievement_rate}% |`
      );
    }
    lines.push("");
  }

  // OKR details per cycle
  if (okr.cycles && okr.cycles.length > 0) {
    for (const cycle of okr.cycles) {
      lines.push(`### Cycle ${cycle.cycle}`);
      lines.push(
        `Achievement: ${cycle.summary.achievement_rate}% (${cycle.summary.total_krs} KRs)`
      );
      lines.push("");

      if (cycle.okrs && cycle.okrs.length > 0) {
        lines.push("| OKR | Track | KRs | Rate |");
        lines.push("|-----|-------|-----|------|");
        for (const okrItem of cycle.okrs) {
          const obj =
            okrItem.objective.length > 50
              ? okrItem.objective.slice(0, 47) + "..."
              : okrItem.objective;
          lines.push(
            `| ${obj} | ${okrItem.track} | ${okrItem.summary.total_krs} | ${okrItem.summary.achievement_rate}% |`
          );
        }
        lines.push("");
      }
    }
  }

  // Assumption validation
  lines.push("### Assumption Validation");
  lines.push(
    `**Total:** ${assumptions.summary.total} | Validated: ${assumptions.summary.validated} | Invalidated: ${assumptions.summary.invalidated} | Inconclusive: ${assumptions.summary.inconclusive} | Pending: ${assumptions.summary.pending}`
  );
  lines.push("");

  if (assumptions.details && assumptions.details.length > 0) {
    lines.push("| ID | Track | Status |");
    lines.push("|----|-------|--------|");
    for (const detail of assumptions.details) {
      const icon = assumptionStatusIcon(detail.status);
      lines.push(`| ${detail.id} | ${detail.track} | ${icon} ${detail.status} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** Simple text-based coverage bar */
function coverageBar(percent: number): string {
  const filled = Math.round(percent / 10);
  const empty = 10 - filled;
  return "[" + "#".repeat(filled) + "-".repeat(empty) + "]";
}

/** Status icon for assumption validation */
function assumptionStatusIcon(status: string): string {
  switch (status) {
    case "validated":
      return "[+]";
    case "invalidated":
      return "[x]";
    case "inconclusive":
      return "[?]";
    case "pending":
      return "[ ]";
    default:
      return "[-]";
  }
}
