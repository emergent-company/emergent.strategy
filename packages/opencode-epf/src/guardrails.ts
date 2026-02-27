/**
 * EPF Guardrails — proactive event hooks for OpenCode.
 *
 * Provides:
 * - Commit guard: blocks git commits when EPF instance has critical errors
 * - Session idle health check: shows health toast on first idle event
 * - File edit validation: validates EPF YAML files on edit
 * - Diagnostic aggregation: summarizes EPF LSP diagnostics
 */

import type { HealthResult } from "./cli";

/**
 * Detect git commit commands in a bash command string.
 * Returns true for `git commit`, `git commit -m`, `git commit -am`, etc.
 * Returns false if `--no-verify` is present (user explicitly bypasses hooks).
 */
export function isGitCommit(command: string): {
  detected: boolean;
  noVerify: boolean;
} {
  // Normalize whitespace
  const normalized = command.replace(/\s+/g, " ").trim();

  // Check for git commit patterns
  const commitPattern = /\bgit\s+commit\b/;
  if (!commitPattern.test(normalized)) {
    return { detected: false, noVerify: false };
  }

  // Check for --no-verify flag
  const noVerify = /--no-verify/.test(normalized);
  return { detected: true, noVerify };
}

/**
 * Check if a file path is an EPF artifact (inside READY/, FIRE/, or AIM/ directories).
 */
export function isEPFFile(filePath: string): boolean {
  return /\/(READY|FIRE|AIM)\//.test(filePath) && /\.ya?ml$/.test(filePath);
}

/**
 * Count critical errors from a health check result.
 *
 * Only counts the `critical` tier (structural issues like missing anchor,
 * missing directories). Schema validation errors are non-blocking —
 * they indicate incomplete artifacts, not a broken instance.
 */
export function countCriticalErrors(health: HealthResult): number {
  return health.tiers?.critical?.issues ?? 0;
}

/**
 * Count warnings from a health check result.
 *
 * Quality tier issues count individually. Placeholders count as a single
 * warning (the count of remaining placeholders, not one per placeholder)
 * to avoid inflated numbers like "85 warnings" when most are TODOs.
 */
export function countWarnings(health: HealthResult): number {
  let count = 0;
  if (health.tiers?.quality?.issues) {
    count += health.tiers.quality.issues;
  }
  if (
    health.content_readiness?.placeholders &&
    health.content_readiness.placeholders.length > 0
  ) {
    // Count as a single warning — "N placeholders remaining"
    count += 1;
  }
  return count;
}

/** Toast variant type matching OpenCode SDK */
export type ToastVariant = "info" | "success" | "warning" | "error";

/**
 * Determine toast variant based on health result.
 */
export function healthToastVariant(health: HealthResult): ToastVariant {
  if (health.has_critical) return "error";
  if (health.has_errors) return "warning";
  if (health.has_warnings) return "info";
  return "success";
}
