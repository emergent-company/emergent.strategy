/**
 * EPF Custom Tools — on-demand dashboard tools for OpenCode.
 *
 * Provides three custom tools that the LLM can invoke:
 * - epf_dashboard: instance health overview
 * - epf_coverage: value model coverage analysis
 * - epf_roadmap_status: OKR progress and assumption validation
 */

import { tool } from "@opencode-ai/plugin";
import {
  detectInstance,
  runHealthCheck,
  runCoverage,
  runOKRProgress,
  runAssumptionValidation,
} from "./cli";
import {
  formatHealthDashboard,
  formatCoverageDashboard,
  formatRoadmapDashboard,
} from "./formatters";

/** Agent activation callbacks from the plugin */
interface AgentCallbacks {
  activateAgent: (name: string) => Promise<string>;
  deactivateAgent: () => Promise<string>;
  getActiveAgent: () => string;
}

/**
 * Create all custom tool definitions.
 *
 * @param instancePath - Pre-detected instance path (may be null if no instance found at startup)
 * @param pluginVersion - Plugin version string for dashboard display
 * @param agentCallbacks - Callbacks for agent activation/deactivation
 */
export function createTools(
  instancePath: string | null,
  pluginVersion?: string,
  agentCallbacks?: AgentCallbacks
) {
  return {
    epf_dashboard: tool({
      description:
        "Show EPF instance health dashboard with structure validation, schema validation, content readiness, and workflow guidance. Use this to get a quick overview of your EPF instance status.",
      args: {},
      async execute(_args, context) {
        const instPath =
          instancePath ??
          (await detectInstance(context.worktree || context.directory));
        if (!instPath) {
          return "No EPF instance found in this workspace. Run `epf-cli init` to create one.";
        }

        const result = await runHealthCheck(instPath);
        if (!result.data) {
          return `Failed to run health check: ${result.error ?? "unknown error"}`;
        }

        return formatHealthDashboard(result.data, instPath, pluginVersion);
      },
    }),

    epf_coverage: tool({
      description:
        "Show EPF value model coverage analysis. Lists L2 components per track, marks covered/uncovered, and shows contributing features. Use this to find strategic blind spots.",
      args: {
        track: tool.schema
          .string()
          .optional()
          .describe(
            "Filter to a specific track: Product, Strategy, OrgOps, or Commercial"
          ),
      },
      async execute(args, context) {
        const instPath =
          instancePath ??
          (await detectInstance(context.worktree || context.directory));
        if (!instPath) {
          return "No EPF instance found in this workspace.";
        }

        const result = await runCoverage(instPath, args.track);
        if (!result.data) {
          return `Failed to run coverage analysis: ${result.error ?? "unknown error"}`;
        }

        return formatCoverageDashboard(result.data, args.track);
      },
    }),

    epf_roadmap_status: tool({
      description:
        "Show EPF roadmap status with OKR achievement rates, assumption validation, and cycle trends. Use this for a quick strategic status check.",
      args: {
        track: tool.schema
          .string()
          .optional()
          .describe(
            "Filter by track: product, strategy, org_ops, commercial"
          ),
        cycle: tool.schema
          .string()
          .optional()
          .describe("Filter by cycle number"),
      },
      async execute(args, context) {
        const instPath =
          instancePath ??
          (await detectInstance(context.worktree || context.directory));
        if (!instPath) {
          return "No EPF instance found in this workspace.";
        }

        // Run OKR progress and assumption validation in parallel
        const [okrResult, assumptionResult] = await Promise.all([
          runOKRProgress(instPath, args.track, args.cycle),
          runAssumptionValidation(instPath),
        ]);

        if (!okrResult.data) {
          return `Failed to load OKR progress: ${okrResult.error ?? "unknown error"}`;
        }

        if (!assumptionResult.data) {
          return `Failed to load assumption validation: ${assumptionResult.error ?? "unknown error"}`;
        }

        return formatRoadmapDashboard(okrResult.data, assumptionResult.data);
      },
    }),

    // --- Agent Activation Tools ---
    // These tools allow the AI to activate/deactivate agent personas.
    // When an agent is activated, its prompt is injected into the system prompt
    // and tool descriptions are modified to reflect the agent's skill scopes.

    epf_activate_agent: tool({
      description:
        "Activate an EPF agent persona. Injects the agent's prompt into the system prompt and applies tool scoping from the agent's required skills. The agent remains active until deactivated.",
      args: {
        name: tool.schema
          .string()
          .describe("Agent name to activate (e.g., 'pathfinder', 'product_architect')"),
      },
      async execute(args) {
        if (!agentCallbacks) {
          return "Agent activation not available.";
        }
        return agentCallbacks.activateAgent(args.name);
      },
    }),

    epf_deactivate_agent: tool({
      description:
        "Deactivate the current EPF agent persona. Removes the agent's prompt from the system prompt and restores default tool scoping.",
      args: {},
      async execute() {
        if (!agentCallbacks) {
          return "Agent activation not available.";
        }
        return agentCallbacks.deactivateAgent();
      },
    }),

    epf_active_agent: tool({
      description:
        "Show the currently active EPF agent, if any. Shows agent name, preferred tools, and avoided tools.",
      args: {},
      async execute() {
        if (!agentCallbacks) {
          return "Agent activation not available.";
        }
        return agentCallbacks.getActiveAgent();
      },
    }),
  };
}
