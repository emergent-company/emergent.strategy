/**
 * Tool for running npm scripts by name
 * Discovers and executes dev-manager:* scripts from package.json
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
 * Discover available dev-manager scripts from package.json
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

        // Filter only dev-manager:* scripts
        const devManagerScripts: Record<string, string> = {};
        for (const [name, command] of Object.entries(packageJson.scripts)) {
            if (name.startsWith('dev-manager:')) {
                devManagerScripts[name] = command;
            }
        }

        return devManagerScripts;
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
    let scriptName: string;
    let scriptCommand: string;

    if (args.script) {
        // Direct script name provided
        scriptName = args.script.startsWith('dev-manager:')
            ? args.script
            : `dev-manager:${args.script}`;
    } else if (args.app && args.action) {
        // Build script name from app:action pattern
        scriptName = `dev-manager:${args.app}:${args.action}`;
    } else {
        throw new Error('Either script name or app+action must be provided');
    }

    // Find the script
    scriptCommand = scripts[scriptName];
    if (!scriptCommand) {
        // Try to suggest similar scripts
        const suggestions = Object.keys(scripts)
            .filter(name => 
                name.includes(args.app || '') || 
                name.includes(args.action || '')
            )
            .slice(0, 5);

        let errorMsg = `Script "${scriptName}" not found.\n\n`;
        if (suggestions.length > 0) {
            errorMsg += `Did you mean one of these?\n`;
            suggestions.forEach(s => {
                errorMsg += `  - ${s}: ${scripts[s]}\n`;
            });
        } else {
            errorMsg += `Available dev-manager scripts:\n`;
            Object.keys(scripts).slice(0, 10).forEach(s => {
                errorMsg += `  - ${s}\n`;
            });
        }

        throw new Error(errorMsg);
    }

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
 * List all available dev-manager scripts
 */
export async function listScripts(projectRoot: string): Promise<string> {
    const scripts = await discoverScripts(projectRoot);
    
    if (Object.keys(scripts).length === 0) {
        return 'No dev-manager scripts found in package.json';
    }

    let output = '# Available Dev Manager Scripts\n\n';
    
    // Group by app
    const grouped: Record<string, string[]> = {};
    for (const scriptName of Object.keys(scripts)) {
        const parts = scriptName.replace('dev-manager:', '').split(':');
        const app = parts[0];
        
        if (!grouped[app]) {
            grouped[app] = [];
        }
        grouped[app].push(scriptName);
    }

    // Output grouped scripts
    for (const [app, scriptNames] of Object.entries(grouped)) {
        output += `## ${app}\n\n`;
        for (const scriptName of scriptNames.sort()) {
            const command = scripts[scriptName];
            const action = scriptName.replace(`dev-manager:${app}:`, '');
            output += `- **${action}**: \`${scriptName}\`\n`;
            output += `  \`\`\`bash\n  ${command}\n  \`\`\`\n\n`;
        }
    }

    output += `\n## Usage\n\n`;
    output += `Call run_script with either:\n`;
    output += `- \`script\`: Full script name (e.g., "dev-manager:admin:e2e")\n`;
    output += `- \`app\` + \`action\`: (e.g., app="admin", action="e2e")\n`;

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
