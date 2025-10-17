import process from 'node:process';

import { WORKSPACE_COMMAND_CATALOG } from '../config/command-catalog.js';
import { listEnvironmentProfiles } from '../config/env-profiles.js';

function assert(condition: unknown, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
}

async function main(): Promise<void> {
    const profiles = listEnvironmentProfiles();
    assert(profiles.length >= 1, 'At least one environment profile must be defined.');

    const catalogSize = WORKSPACE_COMMAND_CATALOG.length;
    assert(catalogSize >= 1, 'Workspace command catalog must not be empty.');

    const profileIds = new Set(profiles.map((profile) => profile.profileId));
    const invalidCommands = WORKSPACE_COMMAND_CATALOG.filter(
        (command) => !profileIds.has(command.envProfile)
    );

    assert(
        invalidCommands.length === 0,
        `Commands reference unknown profiles: ${invalidCommands.map((command) => command.commandId).join(', ')}`
    );

    process.stdout.write(
        `✅ workspace-cli verify: ${catalogSize} commands mapped across ${profiles.length} profiles\n`
    );
}

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`❌ workspace-cli verify failed: ${message}\n`);
    process.exitCode = 1;
});
