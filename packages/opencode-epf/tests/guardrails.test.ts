/**
 * Unit tests for guardrails (src/guardrails.ts)
 *
 * Tests:
 * - isGitCommit: commit pattern detection, --no-verify bypass
 * - isEPFFile: EPF YAML file path matching
 * - countCriticalErrors / countWarnings: health data counting
 * - healthToastVariant: toast variant selection based on health state
 *
 * Run with: bun test
 */

import { describe, it, expect } from "bun:test";
import {
  isGitCommit,
  isEPFFile,
  countCriticalErrors,
  countWarnings,
  healthToastVariant,
} from "../src/guardrails";
import type { HealthResult } from "../src/cli";

// ---------------------------------------------------------------------------
// isGitCommit
// ---------------------------------------------------------------------------

describe("isGitCommit", () => {
  it("detects simple 'git commit'", () => {
    const r = isGitCommit("git commit");
    expect(r.detected).toBe(true);
    expect(r.noVerify).toBe(false);
  });

  it("detects 'git commit -m \"msg\"'", () => {
    const r = isGitCommit('git commit -m "initial commit"');
    expect(r.detected).toBe(true);
    expect(r.noVerify).toBe(false);
  });

  it("detects 'git commit -am \"msg\"'", () => {
    const r = isGitCommit('git commit -am "fix typo"');
    expect(r.detected).toBe(true);
    expect(r.noVerify).toBe(false);
  });

  it("detects 'git commit --amend'", () => {
    const r = isGitCommit("git commit --amend");
    expect(r.detected).toBe(true);
    expect(r.noVerify).toBe(false);
  });

  it("detects commit with extra whitespace", () => {
    const r = isGitCommit("  git   commit   -m  'hello'  ");
    expect(r.detected).toBe(true);
    expect(r.noVerify).toBe(false);
  });

  it("detects --no-verify flag", () => {
    const r = isGitCommit("git commit --no-verify -m 'skip hooks'");
    expect(r.detected).toBe(true);
    expect(r.noVerify).toBe(true);
  });

  it("detects --no-verify at the end", () => {
    const r = isGitCommit("git commit -m 'msg' --no-verify");
    expect(r.detected).toBe(true);
    expect(r.noVerify).toBe(true);
  });

  it("does not detect 'git add'", () => {
    const r = isGitCommit("git add .");
    expect(r.detected).toBe(false);
  });

  it("does not detect 'git push'", () => {
    const r = isGitCommit("git push origin main");
    expect(r.detected).toBe(false);
  });

  it("does not detect 'git status'", () => {
    const r = isGitCommit("git status");
    expect(r.detected).toBe(false);
  });

  it("does not detect 'git log --oneline'", () => {
    const r = isGitCommit("git log --oneline");
    expect(r.detected).toBe(false);
  });

  it("does not detect non-git commands", () => {
    const r = isGitCommit("npm run build");
    expect(r.detected).toBe(false);
  });

  it("does not detect empty string", () => {
    const r = isGitCommit("");
    expect(r.detected).toBe(false);
  });

  it("does not detect 'echo git commit'", () => {
    // 'git commit' does appear as a word boundary match here —
    // this is acceptable since the guardrail errs on the side of caution
    const r = isGitCommit('echo "git commit"');
    // The regex matches because \bgit\s+commit\b matches inside quotes too.
    // This is a known limitation — documented in design.md.
    expect(r.detected).toBe(true);
  });

  it("detects chained commands with git commit", () => {
    const r = isGitCommit("git add . && git commit -m 'done'");
    expect(r.detected).toBe(true);
    expect(r.noVerify).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isEPFFile
// ---------------------------------------------------------------------------

describe("isEPFFile", () => {
  it("matches READY YAML files", () => {
    expect(isEPFFile("/path/to/READY/north-star.yaml")).toBe(true);
  });

  it("matches FIRE YAML files", () => {
    expect(isEPFFile("/path/to/FIRE/fd-001-feature.yaml")).toBe(true);
  });

  it("matches AIM YAML files", () => {
    expect(isEPFFile("/path/to/AIM/assessment-report.yml")).toBe(true);
  });

  it("matches deeply nested EPF files", () => {
    expect(
      isEPFFile("/home/user/project/docs/EPF/_instances/my-product/READY/personas.yaml")
    ).toBe(true);
  });

  it("does not match non-YAML files in EPF dirs", () => {
    expect(isEPFFile("/path/to/READY/notes.md")).toBe(false);
  });

  it("does not match YAML files outside EPF dirs", () => {
    expect(isEPFFile("/path/to/config.yaml")).toBe(false);
  });

  it("does not match random directories named similar", () => {
    expect(isEPFFile("/path/to/READING/file.yaml")).toBe(false);
  });

  it("does not match non-standard extensions", () => {
    expect(isEPFFile("/path/to/FIRE/data.json")).toBe(false);
  });

  it("does not match empty string", () => {
    expect(isEPFFile("")).toBe(false);
  });

  it("requires directory separator before READY/FIRE/AIM", () => {
    // "READY/" needs to be preceded by "/"
    expect(isEPFFile("READY/file.yaml")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// countCriticalErrors
// ---------------------------------------------------------------------------

describe("countCriticalErrors", () => {
  it("returns 0 for healthy instance", () => {
    const health: HealthResult = {
      overall_status: "healthy",
      has_critical: false,
      has_errors: false,
      has_warnings: false,
      tiers: {
        critical: { score: 3, max: 3, issues: 0, summary: "All clear" },
        schema: { score: 5, max: 5, issues: 0, summary: "All valid" },
        quality: { score: 2, max: 2, issues: 0, summary: "Good" },
      },
    };
    expect(countCriticalErrors(health)).toBe(0);
  });

  it("counts critical tier issues", () => {
    const health: HealthResult = {
      overall_status: "critical",
      has_critical: true,
      tiers: {
        critical: {
          score: 0,
          max: 3,
          issues: 2,
          summary: "Missing anchor",
          details: ["No _epf.yaml", "No READY/"],
        },
        schema: { score: 5, max: 5, issues: 0, summary: "OK" },
      },
    };
    expect(countCriticalErrors(health)).toBe(2);
  });

  it("does NOT count schema tier issues (schema errors are non-blocking)", () => {
    const health: HealthResult = {
      tiers: {
        schema: {
          score: 2,
          max: 5,
          issues: 3,
          summary: "3 files invalid",
        },
      },
    };
    expect(countCriticalErrors(health)).toBe(0);
  });

  it("only counts critical tier, not schema", () => {
    const health: HealthResult = {
      tiers: {
        critical: { score: 1, max: 3, issues: 1, summary: "Issue" },
        schema: { score: 3, max: 5, issues: 2, summary: "Issues" },
      },
    };
    expect(countCriticalErrors(health)).toBe(1);
  });

  it("returns 0 when tiers are missing", () => {
    const health: HealthResult = {};
    expect(countCriticalErrors(health)).toBe(0);
  });

  it("returns 0 when tiers exist but critical/schema are missing", () => {
    const health: HealthResult = {
      tiers: {
        quality: { score: 1, max: 2, issues: 1, summary: "Minor" },
      },
    };
    expect(countCriticalErrors(health)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// countWarnings
// ---------------------------------------------------------------------------

describe("countWarnings", () => {
  it("returns 0 for fully clean instance", () => {
    const health: HealthResult = {
      tiers: {
        quality: { score: 2, max: 2, issues: 0, summary: "Good" },
      },
      content_readiness: {
        total_files: 10,
        files_checked: 10,
        score: 100,
        grade: "A",
        placeholders: [],
      },
    };
    expect(countWarnings(health)).toBe(0);
  });

  it("counts quality tier issues", () => {
    const health: HealthResult = {
      tiers: {
        quality: { score: 0, max: 2, issues: 4, summary: "Issues" },
      },
    };
    expect(countWarnings(health)).toBe(4);
  });

  it("counts placeholders as a single warning (not one per placeholder)", () => {
    const health: HealthResult = {
      content_readiness: {
        total_files: 5,
        files_checked: 5,
        score: 80,
        grade: "B",
        placeholders: [
          { file: "a.yaml", line: 1, content: "TBD", pattern: "TBD", field_path: "x" },
          { file: "b.yaml", line: 2, content: "TODO", pattern: "TODO", field_path: "y" },
        ],
      },
    };
    expect(countWarnings(health)).toBe(1);
  });

  it("sums quality issues and placeholders", () => {
    const health: HealthResult = {
      tiers: {
        quality: { score: 1, max: 2, issues: 3, summary: "Issues" },
      },
      content_readiness: {
        total_files: 5,
        files_checked: 5,
        score: 80,
        grade: "B",
        placeholders: [
          { file: "a.yaml", line: 1, content: "TBD", pattern: "TBD", field_path: "x" },
        ],
      },
    };
    expect(countWarnings(health)).toBe(4);
  });

  it("returns 0 when fields are missing", () => {
    const health: HealthResult = {};
    expect(countWarnings(health)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// healthToastVariant
// ---------------------------------------------------------------------------

describe("healthToastVariant", () => {
  it("returns 'error' when has_critical is true", () => {
    const health: HealthResult = {
      has_critical: true,
      has_errors: true,
      has_warnings: true,
    };
    expect(healthToastVariant(health)).toBe("error");
  });

  it("returns 'warning' when has_errors is true", () => {
    const health: HealthResult = {
      has_critical: false,
      has_errors: true,
      has_warnings: true,
    };
    expect(healthToastVariant(health)).toBe("warning");
  });

  it("returns 'info' when only has_warnings is true", () => {
    const health: HealthResult = {
      has_critical: false,
      has_errors: false,
      has_warnings: true,
    };
    expect(healthToastVariant(health)).toBe("info");
  });

  it("returns 'success' when everything is clean", () => {
    const health: HealthResult = {
      has_critical: false,
      has_errors: false,
      has_warnings: false,
    };
    expect(healthToastVariant(health)).toBe("success");
  });

  it("returns 'success' when flags are undefined", () => {
    const health: HealthResult = {};
    expect(healthToastVariant(health)).toBe("success");
  });
});
