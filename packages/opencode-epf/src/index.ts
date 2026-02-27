/**
 * opencode-epf — OpenCode plugin for EPF (Emergent Product Framework)
 *
 * Provides proactive guardrails (commit guard, session idle health check,
 * file edit validation, diagnostic aggregation) and on-demand dashboard tools
 * (health overview, value model coverage, roadmap status).
 *
 * All logic lives in the `epf-cli` binary — this plugin is purely an
 * integration/presentation layer that shells out to the CLI and formats output.
 *
 * Architecture:
 *   index.ts      — plugin entry point, orchestrates hooks and tools
 *   cli.ts        — epf-cli subprocess wrapper
 *   guardrails.ts — event hook helpers (commit detection, file matching, health counting)
 *   tools.ts      — custom tool definitions (dashboard, coverage, roadmap)
 *   formatters.ts — JSON → markdown formatters
 */

import type { Plugin } from "@opencode-ai/plugin";
import { findCLI, detectInstance, runHealthCheck, validateFile } from "./cli";
import {
  isGitCommit,
  isEPFFile,
  countCriticalErrors,
  countWarnings,
  healthToastVariant,
} from "./guardrails";
import { formatHealthToast } from "./formatters";
import { createTools } from "./tools";

export const EPFPlugin: Plugin = async ({ client, directory, worktree }) => {
  // --- Initialization ---
  const cliPath = await findCLI();
  if (!cliPath) {
    await client.app.log({
      body: {
        service: "opencode-epf",
        level: "warn",
        message:
          "epf-cli not found on PATH. EPF plugin disabled. Install: https://github.com/emergent-company/emergent-strategy",
      },
    });
    // Return empty hooks — plugin is effectively disabled
    return {};
  }

  // Detect EPF instance in workspace
  const instancePath = await detectInstance(worktree || directory);
  if (!instancePath) {
    await client.app.log({
      body: {
        service: "opencode-epf",
        level: "info",
        message: `No EPF instance found in ${worktree || directory}. Tools will report 'no instance found'.`,
      },
    });
  }

  // Track whether we've shown the idle health toast this session
  let idleHealthShown = false;

  // Track per-file diagnostic counts for aggregation
  const diagnosticCounts = new Map<string, number>();

  return {
    // --- Event Handler (session.idle, file.edited, lsp.client.diagnostics) ---
    event: async ({ event }) => {
      // Session Idle Health Check
      if (event.type === "session.idle" && !idleHealthShown && instancePath) {
        idleHealthShown = true;
        const result = await runHealthCheck(instancePath);
        if (result.ok && result.data) {
          const message = formatHealthToast(result.data);
          const variant = healthToastVariant(result.data);
          await client.tui.showToast({
            body: {
              title: "EPF Health",
              message,
              variant,
              duration: 5000,
            },
          });
        }
      }

      // File Edit Validation
      if (event.type === "file.edited" && instancePath) {
        const filePath = event.properties.file;
        if (isEPFFile(filePath)) {
          const result = await validateFile(filePath);
          if (!result.ok && result.error) {
            await client.tui.showToast({
              body: {
                title: "EPF Validation",
                message: result.error.slice(0, 200),
                variant: "warning",
                duration: 4000,
              },
            });
          }
        }
      }

      // Diagnostic Aggregation
      if (event.type === "lsp.client.diagnostics") {
        const { serverID, path: filePath } = event.properties;
        if (serverID === "epf" && filePath) {
          // Track this file as having diagnostics
          const currentCount = diagnosticCounts.get(filePath) ?? 0;
          diagnosticCounts.set(filePath, currentCount + 1);

          // Check threshold
          const filesWithErrors = diagnosticCounts.size;
          if (filesWithErrors >= 5 && filesWithErrors % 5 === 0) {
            await client.tui.showToast({
              body: {
                title: "EPF Diagnostics",
                message: `${filesWithErrors} EPF files have diagnostics`,
                variant: "info",
                duration: 4000,
              },
            });
          }
        }
      }
    },

    // --- Commit Guard ---
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "bash" || !instancePath) return;

      const command = output.args?.command;
      if (typeof command !== "string") return;

      const { detected, noVerify } = isGitCommit(command);
      if (!detected || noVerify) return;

      // Run health check before commit
      const result = await runHealthCheck(instancePath);
      if (!result.ok || !result.data) return; // Don't block if CLI fails

      const criticals = countCriticalErrors(result.data);
      if (criticals > 0) {
        throw new Error(
          `EPF instance has ${criticals} critical error(s). Run epf_dashboard for details. ` +
            `Use --no-verify to bypass this check.`
        );
      }

      const warnings = countWarnings(result.data);
      if (warnings > 0) {
        // Allow commit, but show toast
        await client.tui.showToast({
          body: {
            title: "EPF Commit Warning",
            message: `Committing with ${warnings} EPF warning(s)`,
            variant: "warning",
            duration: 4000,
          },
        });
      }
    },

    // --- Custom Tools ---
    tool: createTools(instancePath),
  };
};
