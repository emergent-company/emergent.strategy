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
import {
  findCLI,
  detectInstance,
  runHealthCheck,
  validateFile,
  getAgent,
  type AgentInfo,
} from "./cli";
import {
  isGitCommit,
  isEPFFile,
  countCriticalErrors,
  countWarnings,
  healthToastVariant,
} from "./guardrails";
import { formatHealthToast } from "./formatters";
import { createTools } from "./tools";

/** Plugin version — keep in sync with package.json "version" field */
const PLUGIN_VERSION = "0.2.3";

/** Active agent state — tracks the currently activated agent persona */
interface ActiveAgentState {
  name: string;
  systemPrompt: string;
  preferredTools: string[];
  avoidTools: string[];
}

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

  // Active agent state (set via epf_activate_agent tool, cleared via epf_deactivate_agent)
  let activeAgent: ActiveAgentState | null = null;

  return {
    // --- Shell Environment ---
    // Set EPF_PLUGIN_ACTIVE so the MCP server can detect plugin presence.
    // This is read by DetectPlugin() in internal/mcp/plugin.go.
    "shell.env": async (_input, output) => {
      output.env.EPF_PLUGIN_ACTIVE = `opencode-epf@${PLUGIN_VERSION}`;
    },

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

    // --- Post-Write Validation (Decision 13: skill output validation) ---
    // Automatically validate EPF files after write operations.
    // This makes validation genuinely automatic rather than instruction-dependent.
    "tool.execute.after": async (input, _output) => {
      if (!instancePath) return;

      // Detect write/edit operations to EPF artifact files
      const filePath =
        input.tool === "write" || input.tool === "edit"
          ? input.args?.filePath
          : null;

      if (typeof filePath !== "string" || !isEPFFile(filePath)) return;

      // Auto-validate the written file
      const result = await validateFile(filePath);
      if (!result.ok && result.error) {
        await client.tui.showToast({
          body: {
            title: "EPF Auto-Validation",
            message: `Validation issues in ${filePath.split("/").pop()}: ${result.error.slice(0, 150)}`,
            variant: "warning",
            duration: 5000,
          },
        });
      }
    },

    // --- Agent Persona Injection (Decision 12: agent activation protocol) ---
    // When an agent is active, inject its prompt into the system prompt.
    // This makes the AI genuinely adopt the agent's persona rather than
    // reading it as a text response.
    "experimental.chat.system.transform": async (_input, output) => {
      if (activeAgent) {
        output.system.push(activeAgent.systemPrompt);
      }
    },

    // --- Tool Scoping (Decision 12: step 5 — SCOPE) ---
    // When a skill is active, modify tool descriptions to highlight preferred
    // tools and de-emphasize avoided tools.
    "tool.definition": async (input, output) => {
      if (!activeAgent) return;

      const toolName = input.toolID;

      if (activeAgent.preferredTools.includes(toolName)) {
        output.description = `[PREFERRED] ${output.description}`;
      } else if (activeAgent.avoidTools.includes(toolName)) {
        output.description = `[AVOID — not needed for current agent] ${output.description}`;
      }
    },

    // --- Custom Tools ---
    tool: createTools(instancePath, PLUGIN_VERSION, {
      activateAgent: async (name: string): Promise<string> => {
        const result = await getAgent(name);
        if (!result.ok || !result.data) {
          return `Failed to load agent '${name}': ${result.error ?? "unknown error"}`;
        }

        const agent = result.data;
        const prompt = agent.activation?.system_prompt ?? agent.content ?? "";
        if (!prompt) {
          return `Agent '${name}' has no prompt content. Cannot activate.`;
        }

        // Aggregate tool scopes from skill_scopes
        const preferred: string[] = [];
        const avoid: string[] = [];
        if (agent.activation?.skill_scopes) {
          for (const scope of agent.activation.skill_scopes) {
            if (scope.preferred_tools) preferred.push(...scope.preferred_tools);
            if (scope.avoid_tools) avoid.push(...scope.avoid_tools);
          }
        }

        activeAgent = {
          name: agent.name,
          systemPrompt: prompt,
          preferredTools: [...new Set(preferred)],
          avoidTools: [...new Set(avoid)],
        };

        const parts = [`Activated agent: ${agent.display_name ?? agent.name}`];
        if (preferred.length > 0) {
          parts.push(`Preferred tools: ${preferred.join(", ")}`);
        }
        if (avoid.length > 0) {
          parts.push(`Avoided tools: ${avoid.join(", ")}`);
        }
        parts.push("The agent's persona is now active in the system prompt.");
        return parts.join("\n");
      },

      deactivateAgent: (): string => {
        if (!activeAgent) {
          return "No agent is currently active.";
        }
        const name = activeAgent.name;
        activeAgent = null;
        return `Deactivated agent: ${name}. System prompt restored to default.`;
      },

      getActiveAgent: (): string => {
        if (!activeAgent) {
          return "No agent is currently active. Use epf_activate_agent to activate one.";
        }
        return `Active agent: ${activeAgent.name}\nPreferred tools: ${activeAgent.preferredTools.join(", ") || "none"}\nAvoided tools: ${activeAgent.avoidTools.join(", ") || "none"}`;
      },
    }),
  };
};
