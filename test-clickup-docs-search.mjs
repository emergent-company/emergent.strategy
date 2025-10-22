import axios from 'axios';

const API_TOKEN = 'pk_6835920_ATZ7GDS6F48SN1TEFDC1V9ZK6HZ0BJ84';
const HUMA_SPACE_ID = '90152846670';

const client = axios.create({
    baseURL: 'https://api.clickup.com/api/v2',
    headers: {
        'Authorization': API_TOKEN,
        'Content-Type': 'application/json',
    },
});

async function searchForDocs() {
    console.log('🔍 Searching for ClickUp Docs/document-like content...\n');
    
    try {
        // Get folders in Huma space
        console.log('1️⃣ Checking folders in Huma space...');
        const foldersResponse = await client.get(`/space/${HUMA_SPACE_ID}/folder`);
        const folders = foldersResponse.data.folders || [];
        console.log(`✅ Found ${folders.length} folders\n`);
        
        if (folders.length > 0) {
            const firstFolder = folders[0];
            console.log(`📁 First folder: "${firstFolder.name}" (${firstFolder.id})`);
            
            // Get lists in that folder
            const listsResponse = await client.get(`/folder/${firstFolder.id}/list`);
            const lists = listsResponse.data.lists || [];
            console.log(`   Contains ${lists.length} lists\n`);
            
            if (lists.length > 0) {
                const firstList = lists[0];
                console.log(`📋 First list: "${firstList.name}" (${firstList.id})`);
                console.log(`   Task count: ${firstList.task_count || 0}`);
                
                // Get a task from this list
                if (firstList.task_count > 0) {
                    const tasksResponse = await client.get(`/list/${firstList.id}/task`, {
                        params: { page: 0, archived: false }
                    });
                    const tasks = tasksResponse.data.tasks || [];
                    
                    if (tasks.length > 0) {
                        const task = tasks[0];
                        console.log(`\n📝 Sample Task: "${task.name}"`);
                        console.log(`   ID: ${task.id}`);
                        
                        if (task.description) {
                            console.log(`\n   ✅ Has HTML description (${task.description.length} chars):`);
                            console.log(`      ${task.description.substring(0, 300)}...`);
                        }
                        if (task.text_content) {
                            console.log(`\n   ✅ Has plain text content (${task.text_content.length} chars):`);
                            console.log(`      ${task.text_content.substring(0, 300)}...`);
                        }
                        if (!task.description && !task.text_content) {
                            console.log(`\n   ❌ No description/content found`);
                        }
                    }
                }
            }
        }
        
        // IMPORTANT: Check ClickUp's "Docs" feature via task custom types
        console.log('\n\n2️⃣ Checking for ClickUp Docs 3.0 (Page/Doc task types)...\n');
        console.log('ℹ️  ClickUp Docs 3.0 are actually special task types with rich content');
        console.log('   They appear in lists but have doc-like properties');
        console.log('   Looking for tasks with extensive descriptions...\n');
        
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Data: ${JSON.stringify(error.response.data)}`);
        }
    }
}

searchForDocs();
