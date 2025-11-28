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

const clientV3 = axios.create({
    baseURL: 'https://api.clickup.com/api/v3',
    headers: {
        'Authorization': API_TOKEN,
        'Content-Type': 'application/json',
    },
});

async function showDocSpaces() {
    try {
        // Get all spaces first
        console.log('Getting all spaces...\n');
        const spacesResponse = await clientV2.get(`/team/${WORKSPACE_ID}/space?archived=false`);
        const spaces = spacesResponse.data.spaces || [];
        
        const spaceMap = {};
        spaces.forEach(space => {
            spaceMap[space.id] = space.name;
        });
        
        console.log('Available spaces:');
        Object.entries(spaceMap).forEach(([id, name]) => {
            console.log(`  ${id}: ${name}`);
        });
        
        // Get docs
        console.log('\n\nGetting docs...\n');
        const docsResponse = await clientV3.get(`/workspaces/${WORKSPACE_ID}/docs`);
        const docs = docsResponse.data.docs || [];
        
        // Show first 10 docs with their parent info
        console.log('First 10 docs:\n');
        for (const doc of docs.slice(0, 10)) {
            console.log(`📄 ${doc.name} (${doc.id})`);
            console.log(`   Parent type: ${doc.parent.type}, Parent ID: ${doc.parent.id}`);
            
            // If parent is space (type 6), show space name
            if (doc.parent.type === 6 && spaceMap[doc.parent.id]) {
                console.log(`   ✅ Space: ${spaceMap[doc.parent.id]}`);
            } else if (doc.parent.type === 6) {
                console.log(`   ⚠️  Space ID ${doc.parent.id} not found in available spaces`);
            } else if (doc.parent.type === 5) {
                console.log(`   Parent is a list, fetching space...`);
                try {
                    const listResponse = await clientV2.get(`/list/${doc.parent.id}`);
                    const spaceId = listResponse.data.space?.id;
                    if (spaceId && spaceMap[spaceId]) {
                        console.log(`   ✅ Space (via list): ${spaceMap[spaceId]}`);
                    }
                } catch (error) {
                    console.log(`   ❌ Could not fetch list details`);
                }
            }
            console.log('');
        }
        
    } catch (error) {
        console.error(`Error: ${error.message}`);
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
        }
    }
}

showDocSpaces();
