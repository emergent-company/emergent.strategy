#!/usr/bin/env tsx
/**
 * Debug ClickUp API Script
 * 
 * This script makes direct calls to the ClickUp API and pretty-prints the responses
 * to help diagnose structure and data issues.
 * 
 * Usage:
 *   npx tsx scripts/debug-clickup-api.ts <API_TOKEN> <WORKSPACE_ID>
 * 
 * Example:
 *   npx tsx scripts/debug-clickup-api.ts pk_12345678_ABCDEFGH 9012345
 */

import axios from 'axios';

// ANSI color codes for pretty output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(text: string) {
    console.log('\n' + '='.repeat(80));
    log(text, 'bright');
    console.log('='.repeat(80) + '\n');
}

function prettyPrint(label: string, data: any) {
    log(`\n${label}:`, 'cyan');
    console.log(JSON.stringify(data, null, 2));
}

async function makeRequest(apiToken: string, path: string, params?: any) {
    const url = `https://api.clickup.com/api/v2${path}`;
    log(`\nGET ${url}`, 'blue');
    if (params) {
        log(`Params: ${JSON.stringify(params)}`, 'dim');
    }

    try {
        const response = await axios.get(url, {
            headers: {
                'Authorization': apiToken,
                'Content-Type': 'application/json',
            },
            params,
            timeout: 30000,
        });

        log('✓ Success', 'green');
        return response.data;
    } catch (error: any) {
        log('✗ Error', 'red');
        if (error.response) {
            log(`Status: ${error.response.status}`, 'red');
            log(`Message: ${JSON.stringify(error.response.data)}`, 'red');
        } else {
            log(`Error: ${error.message}`, 'red');
        }
        throw error;
    }
}

async function main() {
    const apiToken = process.argv[2];
    const workspaceId = process.argv[3];
    const includeArchived = process.argv[4] === 'true';

    if (!apiToken || !workspaceId) {
        log('Usage: npx tsx scripts/debug-clickup-api.ts <API_TOKEN> <WORKSPACE_ID> [true|false for archived]', 'yellow');
        log('\nExample:', 'dim');
        log('  npx tsx scripts/debug-clickup-api.ts pk_12345678_ABCDEFGH 9012345', 'dim');
        log('  npx tsx scripts/debug-clickup-api.ts pk_12345678_ABCDEFGH 9012345 true  # include archived', 'dim');
        process.exit(1);
    }

    header('ClickUp API Debug Tool');
    log(`API Token: ${apiToken.substring(0, 15)}...`, 'dim');
    log(`Workspace ID: ${workspaceId}`, 'dim');
    log(`Include Archived: ${includeArchived}`, 'dim');

    try {
        // 1. Get Workspaces (Teams)
        header('1. Fetching Workspaces (Teams)');
        const workspacesResponse = await makeRequest(apiToken, '/team');
        prettyPrint('Workspaces', workspacesResponse);

        const workspace = workspacesResponse.teams.find((t: any) => t.id === workspaceId);
        if (!workspace) {
            log(`\n⚠️  Workspace ${workspaceId} not found!`, 'yellow');
            log(`Available workspaces:`, 'yellow');
            workspacesResponse.teams.forEach((t: any) => {
                log(`  - ${t.name} (ID: ${t.id})`, 'yellow');
            });
            process.exit(1);
        }
        log(`\n✓ Found workspace: ${workspace.name}`, 'green');

        // 2. Get Spaces
        header('2. Fetching Spaces');
        const spacesResponse = await makeRequest(
            apiToken,
            `/team/${workspaceId}/space`,
            { archived: includeArchived }
        );
        prettyPrint('Spaces Response', spacesResponse);

        log(`\n📊 Summary: ${spacesResponse.spaces.length} spaces found`, 'bright');
        spacesResponse.spaces.forEach((space: any, idx: number) => {
            log(`  ${idx + 1}. ${space.name} (ID: ${space.id}, Archived: ${space.archived || false})`, 'cyan');
        });

        // 3. For each space, get folders and lists
        for (const space of spacesResponse.spaces) {
            header(`3. Space: "${space.name}" (${space.id})`);

            // 3a. Get Folders
            log(`\n3a. Fetching Folders in "${space.name}"...`, 'magenta');
            const foldersResponse = await makeRequest(
                apiToken,
                `/space/${space.id}/folder`,
                { archived: includeArchived }
            );
            prettyPrint(`Folders in "${space.name}"`, foldersResponse);

            log(`\n📊 Folders Summary: ${foldersResponse.folders.length} folders`, 'bright');
            foldersResponse.folders.forEach((folder: any, idx: number) => {
                log(`  ${idx + 1}. ${folder.name} (ID: ${folder.id})`, 'yellow');
            });

            // 3b. Get Lists in each Folder
            for (const folder of foldersResponse.folders) {
                log(`\n  → Fetching Lists in folder "${folder.name}"...`, 'dim');
                const listsInFolderResponse = await makeRequest(
                    apiToken,
                    `/folder/${folder.id}/list`,
                    { archived: includeArchived }
                );
                prettyPrint(`  Lists in folder "${folder.name}"`, listsInFolderResponse);

                log(`  📋 Lists: ${listsInFolderResponse.lists.length} lists`, 'dim');
                listsInFolderResponse.lists.forEach((list: any, idx: number) => {
                    log(`    ${idx + 1}. ${list.name} (ID: ${list.id}, Tasks: ${list.task_count || 0})`, 'dim');
                });
            }

            // 3c. Get Folderless Lists
            log(`\n3c. Fetching Folderless Lists in "${space.name}"...`, 'magenta');
            const folderlessListsResponse = await makeRequest(
                apiToken,
                `/space/${space.id}/list`,
                { archived: includeArchived }
            );
            prettyPrint(`Folderless Lists in "${space.name}"`, folderlessListsResponse);

            log(`\n📋 Folderless Lists Summary: ${folderlessListsResponse.lists.length} lists`, 'bright');
            folderlessListsResponse.lists.forEach((list: any, idx: number) => {
                log(`  ${idx + 1}. ${list.name} (ID: ${list.id}, Tasks: ${list.task_count || 0})`, 'green');
            });
        }

        // Final Summary
        header('🎉 Debug Complete - Summary');
        log(`Workspace: ${workspace.name}`, 'bright');
        log(`Total Spaces: ${spacesResponse.spaces.length}`, 'bright');

        let totalFolders = 0;
        let totalListsInFolders = 0;
        let totalFolderlessLists = 0;

        for (const space of spacesResponse.spaces) {
            const foldersResponse = await makeRequest(
                apiToken,
                `/space/${space.id}/folder`,
                { archived: includeArchived }
            );
            totalFolders += foldersResponse.folders.length;

            for (const folder of foldersResponse.folders) {
                const listsResponse = await makeRequest(
                    apiToken,
                    `/folder/${folder.id}/list`,
                    { archived: includeArchived }
                );
                totalListsInFolders += listsResponse.lists.length;
            }

            const folderlessListsResponse = await makeRequest(
                apiToken,
                `/space/${space.id}/list`,
                { archived: includeArchived }
            );
            totalFolderlessLists += folderlessListsResponse.lists.length;
        }

        log(`Total Folders: ${totalFolders}`, 'bright');
        log(`Total Lists in Folders: ${totalListsInFolders}`, 'bright');
        log(`Total Folderless Lists: ${totalFolderlessLists}`, 'bright');
        log(`Total Lists: ${totalListsInFolders + totalFolderlessLists}`, 'green');

        log('\n✓ All API calls completed successfully!', 'green');

    } catch (error: any) {
        header('❌ Script Failed');
        log(error.message, 'red');
        if (error.stack) {
            log('\nStack trace:', 'dim');
            console.log(error.stack);
        }
        process.exit(1);
    }
}

main();
