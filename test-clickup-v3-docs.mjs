import axios from 'axios';

const API_TOKEN = 'pk_6835920_ATZ7GDS6F48SN1TEFDC1V9ZK6HZ0BJ84';
const WORKSPACE_ID = '4573313';

const clientV3 = axios.create({
    baseURL: 'https://api.clickup.com/api/v3',
    headers: {
        'Authorization': API_TOKEN,
        'Content-Type': 'application/json',
    },
});

async function testV3DocsAPI() {
    console.log('Testing ClickUp API v3 Docs endpoints...\n');
    
    try {
        console.log('1. Searching for Docs in workspace...');
        const response = await clientV3.get(`/workspaces/${WORKSPACE_ID}/docs`);
        
        console.log('SUCCESS! Found Docs API v3\n');
        console.log('Response:');
        console.log(JSON.stringify(response.data, null, 2));
        
    } catch (error) {
        console.error(`Error: ${error.message}`);
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Data: ${JSON.stringify(error.response.data, null, 2)}`);
        }
    }
}

testV3DocsAPI();
