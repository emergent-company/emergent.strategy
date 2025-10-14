/**
 * Tool for running tests (npm, playwright, vitest, jest)
 */

import path from 'path';
import { safeExec, validatePath, fileExists } from '../utils/exec.js';

interface RunTestsArgs {
    type: 'npm' | 'playwright' | 'vitest' | 'jest';
    command?: string;
    spec?: string;
    project?: string;
    config?: string;
    grep?: string;
    workDir?: string;
}

export async function runTests(
    args: RunTestsArgs,
    projectRoot: string
): Promise<string> {
    const workDir = args.workDir
        ? await validatePath(projectRoot, args.workDir)
        : projectRoot;

    let command: string;
    let env: Record<string, string> = {};

    switch (args.type) {
        case 'npm':
            command = buildNpmTestCommand(args);
            break;

        case 'playwright':
            command = await buildPlaywrightCommand(args, workDir);
            // Check for E2E_FORCE_TOKEN env var
            if (process.env.E2E_FORCE_TOKEN) {
                env.E2E_FORCE_TOKEN = process.env.E2E_FORCE_TOKEN;
            }
            break;

        case 'vitest':
            command = buildVitestCommand(args);
            break;

        case 'jest':
            command = buildJestCommand(args);
            break;

        default:
            throw new Error(`Unknown test type: ${args.type}`);
    }

    console.error(`Running: ${command}`);
    console.error(`Working directory: ${workDir}`);

    const result = await safeExec(command, {
        cwd: workDir,
        timeout: 600000, // 10 minutes for tests
        env,
    });

    // Format the output
    let output = `# Test Execution: ${args.type}\n\n`;
    output += `## Command\n\`\`\`bash\n${command}\n\`\`\`\n\n`;
    output += `## Working Directory\n${workDir}\n\n`;

    if (result.exitCode === 0) {
        output += `## ✅ Tests Passed\n\n`;
    } else {
        output += `## ❌ Tests Failed (Exit Code: ${result.exitCode})\n\n`;
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

    // Add suggestions for failed tests
    if (result.exitCode !== 0 && args.type === 'playwright') {
        output += `## 💡 Debugging Tips\n`;
        output += `1. Check error-context.md files in test-results/\n`;
        output += `2. Review screenshots and videos in test-results/\n`;
        output += `3. Run with --debug flag for interactive debugging\n`;
        output += `4. Use --headed to see browser actions\n`;
    }

    return output;
}

function buildNpmTestCommand(args: RunTestsArgs): string {
    if (!args.command) {
        throw new Error('command is required for npm test type');
    }
    return `npm test ${args.command}`;
}

async function buildPlaywrightCommand(
    args: RunTestsArgs,
    workDir: string
): Promise<string> {
    let cmd = 'npx playwright test';

    // Add spec file
    if (args.spec) {
        cmd += ` ${args.spec}`;
    }

    // Add config
    if (args.config) {
        const configPath = path.resolve(workDir, args.config);
        if (!(await fileExists(configPath))) {
            console.error(`Warning: Config file not found: ${configPath}`);
        }
        cmd += ` --config=${args.config}`;
    }

    // Add project
    if (args.project) {
        cmd += ` --project=${args.project}`;
    }

    // Add grep filter
    if (args.grep) {
        cmd += ` --grep="${args.grep}"`;
    }

    return cmd;
}

function buildVitestCommand(args: RunTestsArgs): string {
    let cmd = 'npx vitest run';

    if (args.spec) {
        cmd += ` ${args.spec}`;
    }

    if (args.config) {
        cmd += ` --config=${args.config}`;
    }

    if (args.grep) {
        cmd += ` --grep="${args.grep}"`;
    }

    return cmd;
}

function buildJestCommand(args: RunTestsArgs): string {
    let cmd = 'npx jest';

    if (args.spec) {
        cmd += ` ${args.spec}`;
    }

    if (args.config) {
        cmd += ` --config=${args.config}`;
    }

    if (args.grep) {
        cmd += ` --testNamePattern="${args.grep}"`;
    }

    return cmd;
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
