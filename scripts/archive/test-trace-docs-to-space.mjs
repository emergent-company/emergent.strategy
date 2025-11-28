import axios from 'axios';

const API_TOKEN = 'pk_6835920_ATZ7GDS6F48SN1TEFDC1V9ZK6HZ0BJ84';
const WORKSPACE_ID = '4573313';
const HUMA_SPACE_ID = '90152846670';

const clientV2 = axios.create({
    baseURL: 'https://api.clickup.com/api/v2',
    headers: {
        'Authorization': API_TOKEN,
        'Content-Type': 'application/json',
    },
});

const clientV3 = axios.create({
    baseURL: 'https://api.clickup.com/api/v3',
    headers: {
        'Authorization': API_TOKEN,
        'Content-Type': 'application/json',
    },
});

// Cache for hierarchy
const hierarchyCache = {};

async function getListSpace(listId) {
    if (hierarchyCache[listId]) return hierarchyCache[listId];

    try {
        const response = await clientV2.get(`/list/${listId}`);
        const spaceId = response.data.space?.id;
        hierarchyCache[listId] = spaceId;
        return spaceId;
    } catch (error) {
        return null;
    }
}

async function getFolderSpace(folderId) {
    if (hierarchyCache[folderId]) return hierarchyCache[folderId];

    try {
        const response = await clientV2.get(`/folder/${folderId}`);
        const spaceId = response.data.space?.id;
        hierarchyCache[folderId] = spaceId;
        return spaceId;
    } catch (error) {
        return null;
    }
}

async function getTaskList(taskId) {
    if (hierarchyCache[taskId]) return hierarchyCache[taskId];

    try {
        const response = await clientV2.get(`/task/${taskId}`);
        const listId = response.data.list?.id;
        hierarchyCache[taskId] = listId;
        return listId;
    } catch (error) {
        return null;
    }
}

async function traceDocToSpace(doc) {
    const parent = doc.parent;

    switch (parent.type) {
        case 6: // space
            return parent.id;

        case 5: // list
            return await getListSpace(parent.id);

        case 4: // folder
            return await getFolderSpace(parent.id);

        case 1: // task
            const listId = await getTaskList(parent.id);
            if (listId) {
                return await getListSpace(listId);
            }
            return null;

        default:
            return null;
    }
}

async function findDocsInHumaSpace() {
    try {
        console.log('Getting all docs...\n');
        const response = await clientV3.get(`/workspaces/${WORKSPACE_ID}/docs`);
        const docs = response.data.docs || [];

        console.log(`Total docs: ${docs.length}\n`);
        console.log('Tracing docs to their spaces (this may take a moment)...\n');

        const docsInHuma = [];

        for (const doc of docs.slice(0, 20)) { // Test first 20 to avoid rate limits
            const spaceId = await traceDocToSpace(doc);
            if (spaceId === HUMA_SPACE_ID) {
                docsInHuma.push({
                    name: doc.name,
                    id: doc.id,
                    parent_type: doc.parent.type,
                    parent_id: doc.parent.id
                });
            }
            // Small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log(`\n📁 Found ${docsInHuma.length} docs in Huma space (from first 20):\n`);
        docsInHuma.forEach(doc => {
            const typeNames = { 1: 'task', 4: 'folder', 5: 'list', 6: 'space' };
            console.log(`  - ${doc.name}`);
            console.log(`    ID: ${doc.id}`);
            console.log(`    Parent: ${typeNames[doc.parent_type] || 'unknown'} (${doc.parent_id})\n`);
        });

    } catch (error) {
        console.error(`Error: ${error.message}`);
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
        }
    }
}

findDocsInHumaSpace();
