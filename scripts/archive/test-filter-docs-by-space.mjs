import axios from 'axios';

const API_TOKEN = 'pk_6835920_ATZ7GDS6F48SN1TEFDC1V9ZK6HZ0BJ84';
const WORKSPACE_ID = '4573313';
const HUMA_SPACE_ID = '90152846670';

const clientV3 = axios.create({
    baseURL: 'https://api.clickup.com/api/v3',
    headers: {
        'Authorization': API_TOKEN,
        'Content-Type': 'application/json',
    },
});

async function testFilterBySpace() {
    try {
        console.log('Test 1: Try filtering by space_id parameter...\n');
        try {
            const response1 = await clientV3.get(`/workspaces/${WORKSPACE_ID}/docs`, {
                params: { space_id: HUMA_SPACE_ID }
            });
            console.log(`✅ space_id filter works! Found ${response1.data.docs?.length || 0} docs`);
            console.log('First 3 docs:', response1.data.docs?.slice(0, 3).map(d => ({
                name: d.name,
                parent_type: d.parent.type,
                parent_id: d.parent.id
            })));
        } catch (error) {
            console.log(`❌ space_id filter failed: ${error.response?.status || error.message}`);
        }

        console.log('\n\nTest 2: Try filtering by parent parameter...\n');
        try {
            const response2 = await clientV3.get(`/workspaces/${WORKSPACE_ID}/docs`, {
                params: { parent: HUMA_SPACE_ID }
            });
            console.log(`✅ parent filter works! Found ${response2.data.docs?.length || 0} docs`);
        } catch (error) {
            console.log(`❌ parent filter failed: ${error.response?.status || error.message}`);
        }

        console.log('\n\nTest 3: Get all docs and analyze parent types...\n');
        const response3 = await clientV3.get(`/workspaces/${WORKSPACE_ID}/docs`);
        const docs = response3.data.docs || [];
        
        // Group by parent type
        const byParentType = {};
        const inHumaSpace = [];
        
        docs.forEach(doc => {
            const type = doc.parent.type;
            const parentId = doc.parent.id;
            
            if (!byParentType[type]) byParentType[type] = [];
            byParentType[type].push(doc);
            
            // Check if in Huma space
            if (parentId === HUMA_SPACE_ID) {
                inHumaSpace.push(doc);
            }
        });
        
        console.log('Parent type distribution:');
        Object.entries(byParentType).forEach(([type, docs]) => {
            const typeNames = {
                1: 'task',
                4: 'folder', 
                5: 'list',
                6: 'space',
                9: 'workspace',
                12: 'workspace_doc_root'
            };
            console.log(`  Type ${type} (${typeNames[type] || 'unknown'}): ${docs.length} docs`);
        });
        
        console.log(`\n📁 Docs with parent_id = ${HUMA_SPACE_ID} (Huma space): ${inHumaSpace.length}`);
        if (inHumaSpace.length > 0) {
            console.log('Docs in Huma space:');
            inHumaSpace.forEach(doc => {
                console.log(`  - ${doc.name} (${doc.id})`);
            });
        }
        
    } catch (error) {
        console.error(`Error: ${error.message}`);
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Data:`, error.response.data);
        }
    }
}

testFilterBySpace();
