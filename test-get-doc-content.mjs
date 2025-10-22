import axios from 'axios';

const API_TOKEN = 'pk_6835920_ATZ7GDS6F48SN1TEFDC1V9ZK6HZ0BJ84';
const WORKSPACE_ID = '4573313';
const DOC_ID = '4bj41-17328'; // "The managing of the management" doc

const clientV3 = axios.create({
    baseURL: 'https://api.clickup.com/api/v3',
    headers: {
        'Authorization': API_TOKEN,
        'Content-Type': 'application/json',
    },
});

async function getDocContent() {
    try {
        console.log(`Getting doc ${DOC_ID} content...\n`);
        
        // First get doc details to see pages
        const docResponse = await clientV3.get(`/workspaces/${WORKSPACE_ID}/docs/${DOC_ID}`);
        console.log('Doc structure:');
        console.log(JSON.stringify(docResponse.data, null, 2));
        
    } catch (error) {
        console.error(`Error: ${error.message}`);
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Data: ${JSON.stringify(error.response.data, null, 2)}`);
        }
    }
}

getDocContent();
