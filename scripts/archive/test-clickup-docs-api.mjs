import axios from 'axios';

const API_TOKEN = 'pk_6835920_ATZ7GDS6F48SN1TEFDC1V9ZK6HZ0BJ84';
const WORKSPACE_ID = '4573313';

const client = axios.create({
    baseURL: 'https://api.clickup.com/api/v2',
    headers: {
        'Authorization': API_TOKEN,
        'Content-Type': 'application/json',
    },
});

async function testDocsEndpoints() {
    console.log('🔍 Testing ClickUp Docs/Pages API endpoints...\n');
    
    // Test 1: Check if there's a docs endpoint for workspace
    try {
        console.log('1️⃣ Trying: GET /team/{workspace_id}/doc');
        const response = await client.get(`/team/${WORKSPACE_ID}/doc`);
        console.log('✅ SUCCESS! Found docs endpoint:');
        console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.log(`❌ Failed: ${error.response?.status} - ${error.response?.statusText}`);
        console.log(`   ${error.response?.data?.err || error.response?.data?.error || error.message}\n`);
    }
    
    // Test 2: Check space-level docs
    try {
        console.log('2️⃣ Trying: GET /space/{space_id}/doc');
        const HUMA_SPACE_ID = '90152846670';
        const response = await client.get(`/space/${HUMA_SPACE_ID}/doc`);
        console.log('✅ SUCCESS! Found space docs endpoint:');
        console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.log(`❌ Failed: ${error.response?.status} - ${error.response?.statusText}`);
        console.log(`   ${error.response?.data?.err || error.response?.data?.error || error.message}\n`);
    }
    
    // Test 3: Check for pages endpoint
    try {
        console.log('3️⃣ Trying: GET /team/{workspace_id}/page');
        const response = await client.get(`/team/${WORKSPACE_ID}/page`);
        console.log('✅ SUCCESS! Found pages endpoint:');
        console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.log(`❌ Failed: ${error.response?.status} - ${error.response?.statusText}`);
        console.log(`   ${error.response?.data?.err || error.response?.data?.error || error.message}\n`);
    }
    
    // Test 4: Check for wiki/knowledge base endpoint
    try {
        console.log('4️⃣ Trying: GET /team/{workspace_id}/wiki');
        const response = await client.get(`/team/${WORKSPACE_ID}/wiki`);
        console.log('✅ SUCCESS! Found wiki endpoint:');
        console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.log(`❌ Failed: ${error.response?.status} - ${error.response?.statusText}`);
        console.log(`   ${error.response?.data?.err || error.response?.data?.error || error.message}\n`);
    }
    
    // Test 5: List spaces to see if any contain docs info
    try {
        console.log('5️⃣ Checking spaces for docs metadata...');
        const response = await client.get(`/team/${WORKSPACE_ID}/space`);
        console.log('✅ Got spaces. Checking for docs-related fields:');
        const spaces = response.data.spaces || [];
        spaces.forEach(space => {
            console.log(`\n📁 Space: ${space.name} (${space.id})`);
            const docsFields = Object.keys(space).filter(key => 
                key.toLowerCase().includes('doc') || 
                key.toLowerCase().includes('page') ||
                key.toLowerCase().includes('wiki')
            );
            if (docsFields.length > 0) {
                console.log(`   Found docs-related fields: ${docsFields.join(', ')}`);
                docsFields.forEach(field => {
                    console.log(`   ${field}: ${JSON.stringify(space[field])}`);
                });
            } else {
                console.log('   No docs-related fields found');
            }
        });
    } catch (error) {
        console.log(`❌ Failed: ${error.message}\n`);
    }
}

testDocsEndpoints();
