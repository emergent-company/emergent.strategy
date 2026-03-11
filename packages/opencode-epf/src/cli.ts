/**
 * EPF CLI subprocess wrapper.
 *
 * All EPF logic lives in the Go-based `epf-cli` binary.
 * This module shells out to it and parses the structured output.
 * The plugin is purely an integration/presentation layer.
 */

/** Result of an epf-cli invocation */
export interface CLIResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Parsed JSON result from epf-cli */
export interface CLIJsonResult<T = unknown> {
  ok: boolean;
  data: T | null;
  error: string | null;
  exitCode: number;
}

/** EPF instance location from `epf-cli locate --json` */
export interface EPFInstance {
  path: string;
  status: string;
  confidence: number;
}

/** Locate result from `epf-cli locate --json` */
export interface LocateResult {
  valid?: EPFInstance[];
  legacy?: EPFInstance[];
  broken?: EPFInstance[];
}

/** Health tier from epf-cli health --json */
export interface HealthTier {
  score: number;
  max: number;
  issues: number;
  summary: string;
  details?: string[];
}

/** Schema validation result item */
export interface SchemaValidationResultItem {
  valid: boolean;
  file_path: string;
  artifact_type: string;
  phase: string;
  errors?: Array<{ path: string; message: string }>;
}

/** Health check result structure (matches epf-cli health --json output) */
export interface HealthResult {
  instance_path?: string;
  overall_status?: string;
  has_critical?: boolean;
  has_errors?: boolean;
  has_warnings?: boolean;
  tiers?: {
    critical?: HealthTier;
    schema?: HealthTier;
    quality?: HealthTier;
  };
  structure_check?: {
    epf_root?: string;
    repo_type?: string;
    valid?: boolean;
    severity?: string;
    message?: string;
  };
  anchor_status?: {
    has_anchor?: boolean;
    product_name?: string;
    epf_version?: string;
    instance_id?: string;
  };
  instance_check?: {
    total_checks: number;
    passed: number;
    failed: number;
    critical: number;
    errors: number;
    warnings: number;
    results?: Array<{
      check: string;
      passed: boolean;
      severity: string;
      message: string;
    }>;
  };
  schema_validation?: {
    total_files: number;
    valid_files: number;
    invalid_files: number;
    skipped_files: number;
    results?: SchemaValidationResultItem[];
  };
  relationships?: {
    valid: boolean;
    coverage_percent: number;
    total_l2_components: number;
    covered_l2_components: number;
    invalid_paths: number;
    grade: string;
    score: number;
  };
  content_readiness?: {
    total_files: number;
    files_checked: number;
    score: number;
    grade: string;
    placeholders?: Array<{
      file: string;
      line: number;
      content: string;
      pattern: string;
      field_path: string;
    }>;
  };
}

/** Coverage result from epf-cli coverage --json */
export interface CoverageResult {
  track: string;
  coverage_percent: number;
  total_l2_components: number;
  covered_l2_components: number;
  uncovered_l2_components?: string[];
  by_layer?: Array<{
    layer_path: string;
    layer_name: string;
    total_components: number;
    covered_count: number;
    coverage_percent: number;
  }>;
  guidance?: {
    next_steps?: string[];
    tips?: string[];
  };
}

/** OKR summary counts */
export interface OKRSummary {
  total_krs: number;
  exceeded: number;
  met: number;
  partially_met: number;
  missed: number;
  achievement_rate: number;
}

/** OKR progress result from epf-cli aim okr-progress --json */
export interface OKRProgressResult {
  cycles: Array<{
    cycle: number;
    summary: OKRSummary;
    okrs: Array<{
      okr_id: string;
      track: string;
      objective: string;
      summary: OKRSummary;
    }>;
  }>;
  by_track: Record<
    string,
    {
      track: string;
      summary: OKRSummary;
      cycles: number[];
    }
  >;
  overall: OKRSummary;
}

/** Assumption validation result from epf-cli aim validate-assumptions --json */
export interface AssumptionResult {
  summary: {
    total: number;
    validated: number;
    invalidated: number;
    inconclusive: number;
    pending: number;
  };
  details: Array<{
    id: string;
    statement: string;
    track: string;
    status: string;
    evidence: string;
  }>;
}

let cachedCLIPath: string | null = null;
let cachedInstancePath: string | null = null;

/**
 * Find the epf-cli binary on PATH.
 * Checks `which epf-cli` and caches the result.
 * Returns null if not found.
 */
export async function findCLI(): Promise<string | null> {
  if (cachedCLIPath !== null) return cachedCLIPath;

  try {
    const proc = Bun.spawn(["which", "epf-cli"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode === 0 && stdout.trim()) {
      cachedCLIPath = stdout.trim();
      return cachedCLIPath;
    }
  } catch {
    // which command failed
  }

  cachedCLIPath = null;
  return null;
}

/**
 * Execute an epf-cli command and return raw stdout/stderr/exitCode.
 *
 * @param args - CLI arguments (e.g., ["health", "/path/to/instance", "--json"])
 * @param timeoutMs - Timeout in milliseconds (default: 30000)
 */
export async function execCLI(
  args: string[],
  timeoutMs: number = 30000
): Promise<CLIResult> {
  const cliPath = await findCLI();
  if (!cliPath) {
    return {
      stdout: "",
      stderr: "epf-cli not found on PATH",
      exitCode: 127,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const proc = Bun.spawn([cliPath, ...args], {
      stdout: "pipe",
      stderr: "pipe",
      signal: controller.signal,
    });

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;

    return { stdout, stderr, exitCode };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown error executing epf-cli";
    return {
      stdout: "",
      stderr: message,
      exitCode: 1,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Execute an epf-cli command and parse JSON output.
 *
 * @param args - CLI arguments (should include --json)
 * @param timeoutMs - Timeout in milliseconds (default: 30000)
 */
export async function execCLIJson<T = unknown>(
  args: string[],
  timeoutMs: number = 30000
): Promise<CLIJsonResult<T>> {
  const result = await execCLI(args, timeoutMs);

  if (result.exitCode === 127) {
    return {
      ok: false,
      data: null,
      error: "epf-cli not found on PATH",
      exitCode: 127,
    };
  }

  if (result.exitCode !== 0 && !result.stdout.trim()) {
    return {
      ok: false,
      data: null,
      error:
        result.stderr.trim() ||
        `epf-cli exited with code ${result.exitCode}`,
      exitCode: result.exitCode,
    };
  }

  // Try to parse JSON from stdout
  const text = result.stdout.trim();
  if (!text) {
    return {
      ok: false,
      data: null,
      error: "No output from epf-cli",
      exitCode: result.exitCode,
    };
  }

  try {
    const data = JSON.parse(text) as T;
    return {
      ok: result.exitCode === 0,
      data,
      error: result.exitCode !== 0 ? result.stderr.trim() || null : null,
      exitCode: result.exitCode,
    };
  } catch {
    return {
      ok: false,
      data: null,
      error: `Failed to parse JSON output from epf-cli: ${text.slice(0, 200)}`,
      exitCode: result.exitCode,
    };
  }
}

/**
 * Detect EPF instance in the given directory.
 * Runs `epf-cli locate --require-anchor --json` and caches the result.
 * Returns the path to the best valid instance, or null.
 */
export async function detectInstance(
  directory: string
): Promise<string | null> {
  if (cachedInstancePath !== null) return cachedInstancePath || null;

  const result = await execCLI([
    "locate",
    "--path",
    directory,
    "--require-anchor",
    "--json",
  ]);

  if (result.exitCode !== 0 || !result.stdout.trim()) {
    cachedInstancePath = "";
    return null;
  }

  try {
    const data = JSON.parse(result.stdout.trim()) as LocateResult;
    const valid = data.valid;
    if (valid && valid.length > 0) {
      // Pick the highest-confidence instance
      valid.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
      cachedInstancePath = valid[0].path;
      return cachedInstancePath;
    }
  } catch {
    // JSON parse failed
  }

  cachedInstancePath = "";
  return null;
}

/**
 * Run an EPF health check on the given instance.
 * Uses: epf-cli health <instance_path> --json
 */
export async function runHealthCheck(
  instancePath: string
): Promise<CLIJsonResult<HealthResult>> {
  return execCLIJson<HealthResult>(["health", instancePath, "--json"]);
}

/**
 * Run coverage analysis on the given instance.
 * Uses: epf-cli coverage <instance_path> --json [--track <track>]
 */
export async function runCoverage(
  instancePath: string,
  track?: string
): Promise<CLIJsonResult<CoverageResult>> {
  const args = ["coverage", instancePath, "--json"];
  if (track) {
    args.push("--track", track);
  }
  return execCLIJson<CoverageResult>(args);
}

/**
 * Run OKR progress analysis.
 * Uses: epf-cli aim okr-progress --json [--track <track>] [--cycle <n>]
 * Note: This command auto-detects instance from cwd, so we pass instancePath as cwd.
 * Since we can't set cwd with Bun.spawn easily here, we use the --path flag if available.
 * Fallback: run from the instance directory.
 */
export async function runOKRProgress(
  instancePath: string,
  track?: string,
  cycle?: string
): Promise<CLIJsonResult<OKRProgressResult>> {
  const args = ["aim", "okr-progress", "--json"];
  if (track) args.push("--track", track);
  if (cycle) args.push("--cycle", cycle);

  // epf-cli aim commands auto-detect from cwd; we need to run from instance dir
  const cliPath = await findCLI();
  if (!cliPath) {
    return { ok: false, data: null, error: "epf-cli not found on PATH", exitCode: 127 };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const proc = Bun.spawn([cliPath, ...args], {
      stdout: "pipe",
      stderr: "pipe",
      signal: controller.signal,
      cwd: instancePath,
    });

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;

    if (exitCode !== 0 && !stdout.trim()) {
      return {
        ok: false,
        data: null,
        error: stderr.trim() || `epf-cli exited with code ${exitCode}`,
        exitCode,
      };
    }

    const text = stdout.trim();
    if (!text) {
      return { ok: false, data: null, error: "No output from epf-cli", exitCode };
    }

    try {
      const data = JSON.parse(text) as OKRProgressResult;
      return {
        ok: exitCode === 0,
        data,
        error: exitCode !== 0 ? stderr.trim() || null : null,
        exitCode,
      };
    } catch {
      return {
        ok: false,
        data: null,
        error: `Failed to parse JSON: ${text.slice(0, 200)}`,
        exitCode,
      };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, data: null, error: message, exitCode: 1 };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Run assumption validation.
 * Uses: epf-cli aim validate-assumptions --json
 * Note: runs from instance directory (auto-detects instance from cwd).
 */
export async function runAssumptionValidation(
  instancePath: string
): Promise<CLIJsonResult<AssumptionResult>> {
  const cliPath = await findCLI();
  if (!cliPath) {
    return { ok: false, data: null, error: "epf-cli not found on PATH", exitCode: 127 };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const proc = Bun.spawn([cliPath, "aim", "validate-assumptions", "--json"], {
      stdout: "pipe",
      stderr: "pipe",
      signal: controller.signal,
      cwd: instancePath,
    });

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;

    if (exitCode !== 0 && !stdout.trim()) {
      return {
        ok: false,
        data: null,
        error: stderr.trim() || `epf-cli exited with code ${exitCode}`,
        exitCode,
      };
    }

    const text = stdout.trim();
    if (!text) {
      return { ok: false, data: null, error: "No output from epf-cli", exitCode };
    }

    try {
      const data = JSON.parse(text) as AssumptionResult;
      return {
        ok: exitCode === 0,
        data,
        error: exitCode !== 0 ? stderr.trim() || null : null,
        exitCode,
      };
    } catch {
      return {
        ok: false,
        data: null,
        error: `Failed to parse JSON: ${text.slice(0, 200)}`,
        exitCode,
      };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, data: null, error: message, exitCode: 1 };
  } finally {
    clearTimeout(timeout);
  }
}

/** Agent info from `epf-cli agents show <name> --json` */
export interface AgentInfo {
  name: string;
  type: string;
  display_name: string;
  description: string;
  content?: string;
  required_skills?: string[];
  activation?: {
    system_prompt: string;
    required_tools?: string[];
    skill_scopes?: Array<{
      skill: string;
      preferred_tools?: string[];
      avoid_tools?: string[];
    }>;
  };
}

/**
 * Get agent details by name.
 * Uses: epf-cli agents show <name> --json
 */
export async function getAgent(
  name: string
): Promise<CLIJsonResult<AgentInfo>> {
  return execCLIJson<AgentInfo>(["agents", "show", name, "--json"]);
}

/**
 * Recommend an agent for a task.
 * Uses: epf-cli agents recommend <task> --json
 */
export async function recommendAgent(
  task: string
): Promise<CLIJsonResult<{ recommended_agent: string; confidence: string; reason: string }>> {
  return execCLIJson(["agents", "recommend", task, "--json"]);
}

/**
 * Validate a single EPF file.
 * Uses: epf-cli validate <file_path> --ai-friendly
 */
export async function validateFile(
  filePath: string
): Promise<CLIJsonResult<unknown>> {
  return execCLIJson(["validate", filePath, "--ai-friendly"]);
}

/**
 * Reset cached values (useful for testing).
 */
export function resetCache(): void {
  cachedCLIPath = null;
  cachedInstancePath = null;
}
