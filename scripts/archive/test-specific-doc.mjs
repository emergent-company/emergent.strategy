import axios from 'axios';

const API_TOKEN = 'pk_6835920_ATZ7GDS6F48SN1TEFDC1V9ZK6HZ0BJ84';
const WORKSPACE_ID = '4573313';
const DOC_ID = '4bj41-33735';

const clientV3 = axios.create({
    baseURL: 'https://api.clickup.com/api/v3',
    headers: {
        'Authorization': API_TOKEN,
        'Content-Type': 'application/json',
    },
});

async function checkSpecificDoc() {
    try {
        console.log(`Checking doc ${DOC_ID}...\n`);
        
        // First check if it's in the docs list
        console.log('1. Searching in all docs list...\n');
        const allDocsResponse = await clientV3.get(`/workspaces/${WORKSPACE_ID}/docs`);
        const allDocs = allDocsResponse.data.docs || [];
        
        const foundInList = allDocs.find(d => d.id === DOC_ID);
        if (foundInList) {
            console.log('✅ Found in docs list!');
            console.log(JSON.stringify(foundInList, null, 2));
        } else {
            console.log('❌ NOT found in docs list');
            console.log(`Total docs in list: ${allDocs.length}`);
        }
        
        // Try to fetch it directly
        console.log('\n\n2. Trying to fetch doc directly...\n');
        try {
            const docResponse = await clientV3.get(`/workspaces/${WORKSPACE_ID}/docs/${DOC_ID}`);
            console.log('✅ Direct fetch successful!');
            console.log(JSON.stringify(docResponse.data, null, 2));
            
            // Get pages
            console.log('\n\n3. Fetching pages...\n');
            const pagesResponse = await clientV3.get(`/workspaces/${WORKSPACE_ID}/docs/${DOC_ID}/pages`);
            console.log('Pages:');
            console.log(JSON.stringify(pagesResponse.data, null, 2));
            
        } catch (error) {
            console.log('❌ Direct fetch failed');
            console.log(`Status: ${error.response?.status}`);
            console.log(`Error: ${error.response?.data || error.message}`);
        }
        
    } catch (error) {
        console.error(`Error: ${error.message}`);
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Data:`, error.response.data);
        }
    }
}

checkSpecificDoc();
