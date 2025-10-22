#!/usr/bin/env node
/**
 * Test script to investigate Huma space structure
 * 
 * This will:
 * 1. Fetch all spaces to confirm space ID
 * 2. Fetch folders in Huma space
 * 3. Fetch docs with parent=spaceId to see what we get
 * 4. Try to identify where the wiki docs are stored
 */

import fetch from 'node-fetch';

const API_TOKEN = process.env.CLICKUP_API_TOKEN || 'YOUR_TOKEN';
const WORKSPACE_ID = '4573313';
const HUMA_SPACE_ID = '90152846670';

const headers = {
    'Authorization': API_TOKEN,
    'Content-Type': 'application/json'
};

async function fetchSpaces() {
    console.log('\n📦 Fetching spaces...');
    const response = await fetch(`https://api.clickup.com/api/v2/team/${WORKSPACE_ID}/space?archived=false`, {
        headers
    });
    const data = await response.json();

    if (!response.ok || !data.spaces) {
        console.error('Error response:', data);
        throw new Error(`Failed to fetch spaces: ${data.err || data.ECODE || 'Unknown error'}`);
    }

    console.log(`Found ${data.spaces.length} spaces:`);
    data.spaces.forEach(space => {
        console.log(`  - ${space.name} (ID: ${space.id})`);
    });
    return data.spaces;
}

async function fetchFolders(spaceId) {
    console.log(`\n📁 Fetching folders in space ${spaceId}...`);
    try {
        const response = await fetch(`https://api.clickup.com/api/v2/space/${spaceId}/folder?archived=false`, {
            headers
        });
        const data = await response.json();
        console.log(`Found ${data.folders.length} folders:`);
        data.folders.forEach(folder => {
            console.log(`  - ${folder.name} (ID: ${folder.id})`);
        });
        return data.folders;
    } catch (error) {
        console.error('Error fetching folders:', error.message);
        return [];
    }
}

async function fetchDocs(workspaceId, parentId) {
    console.log(`\n📄 Fetching docs with parent=${parentId}...`);
    const response = await fetch(`https://api.clickup.com/api/v3/workspaces/${workspaceId}/docs?parent=${parentId}`, {
        headers
    });
    const data = await response.json();
    console.log(`Found ${data.docs.length} docs:`);
    data.docs.slice(0, 10).forEach(doc => {
        console.log(`  - "${doc.name}" (ID: ${doc.id})`);
        console.log(`    Parent: type=${doc.parent.type}, id=${doc.parent.id}`);
    });
    if (data.docs.length > 10) {
        console.log(`  ... and ${data.docs.length - 10} more`);
    }
    return data.docs;
}

async function fetchAllDocs(workspaceId) {
    console.log(`\n📚 Fetching ALL docs from workspace (no parent filter)...`);
    const response = await fetch(`https://api.clickup.com/api/v3/workspaces/${workspaceId}/docs`, {
        headers
    });
    const data = await response.json();
    console.log(`Found ${data.docs.length} total docs`);

    // Group by parent type
    const byParentType = {};
    data.docs.forEach(doc => {
        const type = doc.parent.type;
        if (!byParentType[type]) {
            byParentType[type] = [];
        }
        byParentType[type].push(doc);
    });

    console.log('\nDocs grouped by parent type:');
    Object.keys(byParentType).sort().forEach(type => {
        console.log(`  Type ${type}: ${byParentType[type].length} docs`);
        // Show a few examples
        byParentType[type].slice(0, 3).forEach(doc => {
            console.log(`    - "${doc.name}" (parent_id: ${doc.parent.id})`);
        });
    });

    return data.docs;
}

async function main() {
    console.log('🔍 Investigating Huma Space Structure');
    console.log(`Workspace: ${WORKSPACE_ID}`);
    console.log(`Target Space: ${HUMA_SPACE_ID}`);

    try {
        const spaces = await fetchSpaces();
        const humaSpace = spaces.find(s => s.id === HUMA_SPACE_ID);

        if (!humaSpace) {
            console.error(`\n❌ Space ${HUMA_SPACE_ID} not found!`);
            return;
        }

        console.log(`\n✅ Found Huma space: "${humaSpace.name}"`);

        const folders = await fetchFolders(HUMA_SPACE_ID);
        const docsWithParent = await fetchDocs(WORKSPACE_ID, HUMA_SPACE_ID);
        const allDocs = await fetchAllDocs(WORKSPACE_ID);

        // Try to find wiki-related docs
        console.log('\n🔎 Searching for wiki-related docs...');
        const wikiDocs = allDocs.filter(doc =>
            doc.name.toLowerCase().includes('wiki') ||
            doc.name.toLowerCase().includes('documentation') ||
            doc.name.toLowerCase().includes('huma')
        );

        console.log(`\nFound ${wikiDocs.length} potential wiki docs:`);
        wikiDocs.forEach(doc => {
            console.log(`  - "${doc.name}"`);
            console.log(`    ID: ${doc.id}, Parent: type=${doc.parent.type}, id=${doc.parent.id}`);
        });

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.response) {
            console.error('Response:', await error.response.text());
        }
    }
}

main();
