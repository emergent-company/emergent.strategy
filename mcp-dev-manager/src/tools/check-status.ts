/**
 * Tool for checking development service status
 */

import path from 'path';
import { safeExec, fileExists } from '../utils/exec.js';

interface CheckStatusArgs {
    services?: string[];
    detailed?: boolean;
}

export async function checkStatus(
    args: CheckStatusArgs,
    projectRoot: string
): Promise<string> {
    let output = '# Development Services Status\n\n';

    const services = args.services || ['docker-compose', 'npm', 'ports'];

    for (const service of services) {
        switch (service) {
            case 'docker-compose':
                output += await checkDockerCompose(projectRoot);
                break;

            case 'npm':
                output += await checkNpmProcesses(projectRoot);
                break;

            case 'pm2':
                output += await checkPm2();
                break;

            case 'ports':
                output += await checkPorts();
                break;

            default:
                output += `## ⚠️  Unknown service: ${service}\n\n`;
        }
    }

    return output;
}

async function checkDockerCompose(projectRoot: string): Promise<string> {
    let output = '## Docker Compose\n\n';

    const composeFile = (await fileExists(path.join(projectRoot, 'docker-compose.yml')))
        ? 'docker-compose.yml'
        : (await fileExists(path.join(projectRoot, 'docker-compose.yaml')))
            ? 'docker-compose.yaml'
            : null;

    if (!composeFile) {
        output += '❌ No docker-compose.yml found\n\n';
        return output;
    }

    const result = await safeExec(`docker-compose -f ${composeFile} ps`, {
        cwd: projectRoot,
    });

    if (result.exitCode !== 0) {
        output += '❌ Docker Compose not running or error occurred\n\n';
        if (result.stderr) {
            output += `Error: ${result.stderr}\n\n`;
        }
        return output;
    }

    output += '```\n';
    output += result.stdout || 'No services running';
    output += '\n```\n\n';

    return output;
}

async function checkNpmProcesses(projectRoot: string): Promise<string> {
    let output = '## NPM/Node Processes\n\n';

    // Check for dev-pids directory
    const pidDir = path.join(projectRoot, '.dev-pids');
    if (await fileExists(pidDir)) {
        output += '### Dev Manager PIDs\n';

        const pidFiles = ['api.pid', 'admin.pid'];
        for (const pidFile of pidFiles) {
            const pidPath = path.join(pidDir, pidFile);
            if (await fileExists(pidPath)) {
                const result = await safeExec(`cat "${pidPath}"`);
                const pid = result.stdout.trim();

                // Check if process is still running
                const checkResult = await safeExec(`ps -p ${pid}`);
                const status = checkResult.exitCode === 0 ? '✅ Running' : '❌ Stopped';

                output += `- ${pidFile}: PID ${pid} - ${status}\n`;
            }
        }
        output += '\n';
    }

    // Check for node processes
    const nodeResult = await safeExec('ps aux | grep -E "node|npm" | grep -v grep');
    if (nodeResult.stdout) {
        output += '### All Node Processes\n```\n';
        output += nodeResult.stdout;
        output += '\n```\n\n';
    }

    return output;
}

async function checkPm2(): Promise<string> {
    let output = '## PM2\n\n';

    const result = await safeExec('pm2 list');

    if (result.exitCode !== 0) {
        output += '❌ PM2 not installed or not running\n\n';
        return output;
    }

    output += '```\n';
    output += result.stdout;
    output += '\n```\n\n';

    return output;
}

async function checkPorts(): Promise<string> {
    let output = '## Port Status\n\n';

    // Common development ports
    const ports = [
        { port: 3000, service: 'React/Next.js' },
        { port: 3001, service: 'Backend API' },
        { port: 5173, service: 'Vite' },
        { port: 5175, service: 'Admin Vite' },
        { port: 5432, service: 'PostgreSQL' },
        { port: 6379, service: 'Redis' },
        { port: 8080, service: 'Zitadel' },
    ];

    for (const { port, service } of ports) {
        const result = await safeExec(`lsof -ti:${port}`);

        if (result.stdout) {
            const pids = result.stdout.split('\n').filter(Boolean);
            output += `- ✅ **${port}** (${service}): Running (PID: ${pids.join(', ')})\n`;
        } else {
            output += `- ⚪ **${port}** (${service}): Available\n`;
        }
    }

    output += '\n';
    return output;
}
