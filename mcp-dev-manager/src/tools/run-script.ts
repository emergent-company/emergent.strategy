/**
 * Tool for running npm scripts by name.
 * Discovers workspace-managed scripts from package.json and executes them safely.
 */

import path from 'path';
import fs from 'fs/promises';
import { safeExec } from '../utils/exec.js';

interface RunScriptArgs {
    script: string;
    app?: string;
    action?: string;
}

interface PackageJson {
    scripts?: Record<string, string>;
}

/**
 * Discover available scripts from package.json.
 * Filters out obvious utility aliases (e.g. nx) that are better executed manually.
 */
export async function discoverScripts(
    projectRoot: string
): Promise<Record<string, string>> {
    const packageJsonPath = path.join(projectRoot, 'package.json');

    try {
        const content = await fs.readFile(packageJsonPath, 'utf-8');
        const packageJson: PackageJson = JSON.parse(content);

        if (!packageJson.scripts) {
            return {};
        }

        const excludedScripts = new Set(['nx']);
        return Object.fromEntries(
            Object.entries(packageJson.scripts).filter(([name]) => !excludedScripts.has(name))
        );
    } catch (error) {
        throw new Error(`Failed to read package.json: ${error}`);
    }
}

/**
 * Run a script by name or by app:action pattern
 */
export async function runScript(
    args: RunScriptArgs,
    projectRoot: string
): Promise<string> {
    // Discover available scripts
    const scripts = await discoverScripts(projectRoot);

    // Determine which script to run
    const scriptName = resolveScriptName(args, scripts);
    const scriptCommand = scripts[scriptName];

    console.error(`Running script: ${scriptName}`);
    console.error(`Command: ${scriptCommand}`);

    // Check if script requires user interaction
    if (scriptCommand.includes('--ui') ||
        scriptCommand.includes('--headed') ||
        scriptCommand.includes('--debug') ||
        scriptCommand.includes('logs -f') ||
        scriptCommand.includes('logs --follow')) {
        throw new Error(
            `Script "${scriptName}" requires user interaction and cannot be run via MCP.\n\n` +
            `Please use run_in_terminal tool instead:\n` +
            `run_in_terminal({\n` +
            `  command: "npm run ${scriptName}",\n` +
            `  isBackground: true\n` +
            `})`
        );
    }

    // Execute the script using npm run
    const result = await safeExec(`npm run ${scriptName}`, {
        cwd: projectRoot,
        timeout: 600000, // 10 minutes
        env: process.env as Record<string, string>,
    });

    // Format output
    let output = `# Script Execution: ${scriptName}\n\n`;
    output += `## Command\n\`\`\`bash\n${scriptCommand}\n\`\`\`\n\n`;

    if (result.exitCode === 0) {
        output += `## ✅ Script Completed Successfully\n\n`;
    } else {
        output += `## ❌ Script Failed (Exit Code: ${result.exitCode})\n\n`;
    }

    if (result.stdout) {
        output += `## Output\n\`\`\`\n${truncateOutput(result.stdout, 5000)}\n\`\`\`\n\n`;
    }

    if (result.stderr) {
        output += `## Errors\n\`\`\`\n${truncateOutput(result.stderr, 2000)}\n\`\`\`\n\n`;
    }

    if (result.error) {
        output += `## Error Details\n${result.error}\n\n`;
    }

    // Add context-specific tips
    if (result.exitCode !== 0) {
        output += `## 💡 Debugging Tips\n`;

        if (scriptName.includes(':e2e')) {
            output += `1. Check error-context.md files in apps/admin/test-results/\n`;
            output += `2. Review screenshots and videos in test-results/\n`;
            output += `3. Run with :e2e:debug or :e2e:ui for interactive debugging\n`;
        } else if (scriptName.includes(':build')) {
            output += `1. Check TypeScript compilation errors above\n`;
            output += `2. Review import paths and type definitions\n`;
            output += `3. Run TypeScript type checker directly for more details\n`;
        } else if (scriptName.includes(':test')) {
            output += `1. Review test output for specific failures\n`;
            output += `2. Check if mocks and fixtures are set up correctly\n`;
            output += `3. Run individual test files for faster iteration\n`;
        }
    }

    return output;
}

/**
 * List all available workspace-managed scripts
 */
export async function listScripts(projectRoot: string): Promise<string> {
    const scripts = await discoverScripts(projectRoot);

    if (Object.keys(scripts).length === 0) {
        return 'No managed scripts found in package.json';
    }

    const grouped = groupScriptsByPrefix(scripts);

    let output = '# Available Workspace Scripts\n\n';

    for (const [prefix, entries] of grouped) {
        output += `## ${prefix}\n\n`;
        for (const [scriptName, command] of entries) {
            output += `- \`${scriptName}\`\n`;
            output += `  \`\`\`bash\n  ${command}\n  \`\`\`\n\n`;
        }
    }

    output += `\n## Usage\n\n`;
    output += `Call run_script with either:\n`;
    output += `- \`script\`: Exact script name (e.g., "workspace:start")\n`;
    output += `- \`app\` + \`action\`: Legacy compatibility (best effort match)\n`;

    return output;
}

function truncateOutput(output: string, maxLength: number): string {
    if (output.length <= maxLength) {
        return output;
    }

    const half = Math.floor(maxLength / 2);
    return (
        output.slice(0, half) +
        '\n\n... (output truncated) ...\n\n' +
        output.slice(-half)
    );
}

function resolveScriptName(
    args: RunScriptArgs,
    scripts: Record<string, string>
): string {
    if (args.script) {
        const direct = normalizeScriptName(args.script.trim());
        if (scripts[direct]) {
            return direct;
        }

        const suggestions = suggestScripts(direct, scripts);
        throw new Error(buildNotFoundMessage(direct, scripts, suggestions));
    }

    if (args.app && args.action) {
        const app = args.app.trim();
        const action = args.action.trim();

        const directCandidate = normalizeScriptName(`${app}:${action}`);
        if (scripts[directCandidate]) {
            return directCandidate;
        }

        const fallback = findBestMatch(app, action, scripts);
        if (fallback) {
            return fallback;
        }

        const suggestions = suggestScripts(`${app}:${action}`, scripts, {
            includeApp: app,
            includeAction: action,
        });
        throw new Error(buildNotFoundMessage(`${app}:${action}`, scripts, suggestions));
    }

    throw new Error('Either script name or app+action must be provided');
}

function normalizeScriptName(name: string): string {
    return name.startsWith('npm run ')
        ? name.replace(/^npm run\s+/, '')
        : name;
}

function findBestMatch(
    app: string,
    action: string,
    scripts: Record<string, string>
): string | undefined {
    const candidates = Object.keys(scripts).filter((scriptName) => {
        const segments = scriptName.split(':');
        return segments.some((segment) => segment.includes(app)) &&
            segments.some((segment) => segment.includes(action));
    });

    if (candidates.length === 1) {
        return candidates[0];
    }

    return undefined;
}

function suggestScripts(
    target: string,
    scripts: Record<string, string>,
    opts: { includeApp?: string; includeAction?: string } = {}
): string[] {
    const normalizedTarget = target.toLowerCase();

    const bySimilarity = Object.keys(scripts)
        .filter((name) => {
            const lower = name.toLowerCase();
            const matchesTarget = lower.includes(normalizedTarget);
            const matchesApp = opts.includeApp
                ? lower.includes(opts.includeApp.toLowerCase())
                : true;
            const matchesAction = opts.includeAction
                ? lower.includes(opts.includeAction.toLowerCase())
                : true;
            return matchesTarget || (matchesApp && matchesAction);
        })
        .slice(0, 5);

    if (bySimilarity.length > 0) {
        return bySimilarity;
    }

    return Object.keys(scripts).slice(0, 10);
}

function buildNotFoundMessage(
    attempted: string,
    scripts: Record<string, string>,
    suggestions: string[]
): string {
    let message = `Script "${attempted}" not found.\n\n`;

    if (suggestions.length > 0) {
        message += 'Did you mean one of these?\n';
        for (const suggestion of suggestions) {
            message += `  - ${suggestion}: ${scripts[suggestion]}\n`;
        }
    } else {
        message += 'Available scripts:\n';
        for (const name of Object.keys(scripts).slice(0, 10)) {
            message += `  - ${name}\n`;
        }
    }

    return message;
}

function groupScriptsByPrefix(
    scripts: Record<string, string>
): [string, Array<[string, string]>][] {
    const grouped = new Map<string, Array<[string, string]>>();

    for (const [scriptName, command] of Object.entries(scripts)) {
        const prefix = scriptName.includes(':') ? scriptName.split(':')[0] : 'misc';
        if (!grouped.has(prefix)) {
            grouped.set(prefix, []);
        }
        grouped.get(prefix)!.push([scriptName, command]);
    }

    const prioritizedPrefixes = ['workspace', 'test', 'e2e', 'build', 'db', 'bench', 'spec', 'migrate'];

    return Array.from(grouped.entries()).sort((a, b) => {
        const aIndex = prioritizedPrefixes.indexOf(a[0]);
        const bIndex = prioritizedPrefixes.indexOf(b[0]);

        if (aIndex === -1 && bIndex === -1) {
            return a[0].localeCompare(b[0]);
        }

        if (aIndex === -1) {
            return 1;
        }

        if (bIndex === -1) {
            return -1;
        }

        return aIndex - bIndex;
    }).map(([prefix, entries]) => [prefix, entries.sort((a, b) => a[0].localeCompare(b[0]))]);
}
