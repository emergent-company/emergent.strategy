import axios from 'axios';

const API_TOKEN = 'pk_6835920_ATZ7GDS6F48SN1TEFDC1V9ZK6HZ0BJ84';
const WORKSPACE_ID = '4573313';

const clientV2 = axios.create({
    baseURL: 'https://api.clickup.com/api/v2',
    headers: {
        'Authorization': API_TOKEN,
        'Content-Type': 'application/json',
    },
});

async function checkArchivedSpaces() {
    try {
        // Get ALL spaces including archived
        console.log('Getting ALL spaces (including archived)...\n');
        const spacesResponse = await clientV2.get(`/team/${WORKSPACE_ID}/space?archived=true`);
        const spaces = spacesResponse.data.spaces || [];
        
        console.log(`Total spaces: ${spaces.length}\n`);
        
        const spaceMap = {};
        const archivedSpaces = [];
        
        spaces.forEach(space => {
            spaceMap[space.id] = {
                name: space.name,
                archived: space.archived || false
            };
            if (space.archived) {
                archivedSpaces.push(space);
            }
        });
        
        console.log('All spaces:');
        Object.entries(spaceMap).forEach(([id, info]) => {
            const status = info.archived ? '📦 ARCHIVED' : '✅ ACTIVE';
            console.log(`  ${status} ${id}: ${info.name}`);
        });
        
        // Now check the mysterious space IDs from docs
        console.log('\n\n🔍 Checking mysterious doc parent space IDs:\n');
        const mysteryIds = ['42415326', '42415333'];
        
        mysteryIds.forEach(id => {
            if (spaceMap[id]) {
                const status = spaceMap[id].archived ? '📦 ARCHIVED' : '✅ ACTIVE';
                console.log(`  ${status} ${id}: ${spaceMap[id].name}`);
            } else {
                console.log(`  ❓ ${id}: NOT FOUND (might be from different workspace or deleted)`);
            }
        });
        
    } catch (error) {
        console.error(`Error: ${error.message}`);
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
        }
    }
}

checkArchivedSpaces();
