/**
 * Tool for managing development services (docker-compose, pm2, npm)
 */

import path from 'path';
import { safeExec, validatePath, fileExists } from '../utils/exec.js';

interface ManageServiceArgs {
    action: 'start' | 'stop' | 'restart' | 'status';
    service: 'docker-compose' | 'pm2' | 'npm' | 'custom';
    services?: string[];
    script?: string;
    command?: string;
    workDir?: string;
}

export async function manageService(
    args: ManageServiceArgs,
    projectRoot: string
): Promise<string> {
    const workDir = args.workDir
        ? await validatePath(projectRoot, args.workDir)
        : projectRoot;

    let command: string;

    switch (args.service) {
        case 'docker-compose':
            command = await buildDockerComposeCommand(args, workDir);
            break;

        case 'pm2':
            command = buildPm2Command(args);
            break;

        case 'npm':
            command = buildNpmCommand(args);
            break;

        case 'custom':
            if (!args.command) {
                throw new Error('command is required for custom service type');
            }
            command = args.command;
            break;

        default:
            throw new Error(`Unknown service type: ${args.service}`);
    }

    console.error(`Executing: ${command}`);
    console.error(`Working directory: ${workDir}`);

    const result = await safeExec(command, {
        cwd: workDir,
        timeout: 120000, // 2 minutes
    });

    let output = `# Service Management: ${args.service}\n\n`;
    output += `## Action: ${args.action}\n\n`;
    output += `## Command\n\`\`\`bash\n${command}\n\`\`\`\n\n`;

    if (result.exitCode === 0) {
        output += `## ✅ Success\n\n`;
    } else {
        output += `## ❌ Failed (Exit Code: ${result.exitCode})\n\n`;
    }

    if (result.stdout) {
        output += `## Output\n\`\`\`\n${result.stdout}\n\`\`\`\n\n`;
    }

    if (result.stderr) {
        output += `## Errors\n\`\`\`\n${result.stderr}\n\`\`\`\n\n`;
    }

    return output;
}

async function buildDockerComposeCommand(
    args: ManageServiceArgs,
    workDir: string
): Promise<string> {
    // Check if docker-compose.yml or docker-compose.yaml exists
    const composeFile = (await fileExists(path.join(workDir, 'docker-compose.yml')))
        ? 'docker-compose.yml'
        : (await fileExists(path.join(workDir, 'docker-compose.yaml')))
            ? 'docker-compose.yaml'
            : null;

    if (!composeFile) {
        throw new Error('No docker-compose.yml or docker-compose.yaml found');
    }

    let cmd = `docker-compose -f ${composeFile}`;

    const services = args.services?.join(' ') || '';

    switch (args.action) {
        case 'start':
            cmd += ` up -d ${services}`;
            break;
        case 'stop':
            cmd += ` stop ${services}`;
            break;
        case 'restart':
            cmd += ` restart ${services}`;
            break;
        case 'status':
            cmd += ' ps';
            break;
    }

    return cmd;
}

function buildPm2Command(args: ManageServiceArgs): string {
    const services = args.services?.join(' ') || 'all';

    switch (args.action) {
        case 'start':
            return `pm2 start ${services}`;
        case 'stop':
            return `pm2 stop ${services}`;
        case 'restart':
            return `pm2 restart ${services}`;
        case 'status':
            return 'pm2 list';
        default:
            throw new Error(`Unknown action: ${args.action}`);
    }
}

function buildNpmCommand(args: ManageServiceArgs): string {
    if (!args.script) {
        throw new Error('script is required for npm service type');
    }

    switch (args.action) {
        case 'start':
            return `npm run ${args.script}`;
        case 'stop':
            return `npm run ${args.script}:stop || echo "No stop script available"`;
        case 'restart':
            return `npm run ${args.script}:restart || (npm run ${args.script}:stop && npm run ${args.script})`;
        case 'status':
            return 'npm run dev:status || ps aux | grep node';
        default:
            throw new Error(`Unknown action: ${args.action}`);
    }
}
