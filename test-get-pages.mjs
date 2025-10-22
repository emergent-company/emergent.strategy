import axios from 'axios';

const API_TOKEN = 'pk_6835920_ATZ7GDS6F48SN1TEFDC1V9ZK6HZ0BJ84';
const WORKSPACE_ID = '4573313';
const DOC_ID = '4bj41-17328'; 

const clientV3 = axios.create({
    baseURL: 'https://api.clickup.com/api/v3',
    headers: {
        'Authorization': API_TOKEN,
        'Content-Type': 'application/json',
    },
});

async function getDocPages() {
    try {
        console.log(`Getting pages for doc ${DOC_ID}...\n`);
        
        const response = await clientV3.get(`/workspaces/${WORKSPACE_ID}/docs/${DOC_ID}/pages`);
        console.log('Pages response:');
        console.log(JSON.stringify(response.data, null, 2));
        
        // If there are pages, get content of first one
        if (response.data.pages && response.data.pages.length > 0) {
            const firstPage = response.data.pages[0];
            console.log(`\n\nGetting content of first page: ${firstPage.id}...\n`);
            
            const pageResponse = await clientV3.get(`/workspaces/${WORKSPACE_ID}/docs/${DOC_ID}/pages/${firstPage.id}`);
            console.log('Page content:');
            console.log(JSON.stringify(pageResponse.data, null, 2));
        }
        
    } catch (error) {
        console.error(`Error: ${error.message}`);
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Data: ${JSON.stringify(error.response.data, null, 2)}`);
        }
    }
}

getDocPages();
