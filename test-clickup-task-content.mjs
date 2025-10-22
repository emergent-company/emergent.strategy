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

async function checkTaskContent() {
    console.log('🔍 Checking ClickUp tasks for rich document content...\n');
    
    try {
        // Get folderless lists from Huma space
        console.log('1️⃣ Fetching lists from Huma space...');
        const listsResponse = await client.get(`/space/${HUMA_SPACE_ID}/list`, {
            params: { archived: false }
        });
        
        const lists = listsResponse.data.lists || [];
        console.log(`✅ Found ${lists.length} lists\n`);
        
        if (lists.length === 0) {
            console.log('No lists found');
            return;
        }
        
        // Get first few tasks from first list
        const firstList = lists[0];
        console.log(`2️⃣ Fetching tasks from list: "${firstList.name}" (${firstList.id})\n`);
        
        const tasksResponse = await client.get(`/list/${firstList.id}/task`, {
            params: { archived: false, page: 0 }
        });
        
        const tasks = tasksResponse.data.tasks || [];
        console.log(`✅ Found ${tasks.length} tasks\n`);
        
        if (tasks.length === 0) {
            console.log('No tasks found');
            return;
        }
        
        // Check first task in detail
        const firstTask = tasks[0];
        console.log('3️⃣ Analyzing first task structure for content...\n');
        console.log(`📝 Task: "${firstTask.name}" (${firstTask.id})`);
        console.log(`   Status: ${firstTask.status?.status || 'N/A'}`);
        
        // Check for rich content fields
        console.log('\n📄 Content Fields:');
        if (firstTask.description) {
            console.log(`   ✅ description (HTML): ${firstTask.description.substring(0, 200)}...`);
        }
        if (firstTask.text_content) {
            console.log(`   ✅ text_content (plain): ${firstTask.text_content.substring(0, 200)}...`);
        }
        if (firstTask.markdown_description) {
            console.log(`   ✅ markdown_description: ${firstTask.markdown_description.substring(0, 200)}...`);
        }
        
        // Check for attachments
        if (firstTask.attachments && firstTask.attachments.length > 0) {
            console.log(`\n📎 Attachments (${firstTask.attachments.length}):`);
            firstTask.attachments.forEach((att, i) => {
                console.log(`   ${i+1}. ${att.title || att.name} (${att.extension})`);
                console.log(`      URL: ${att.url}`);
            });
        }
        
        // Check for comments (which might contain doc-like content)
        try {
            console.log('\n💬 Checking comments...');
            const commentsResponse = await client.get(`/task/${firstTask.id}/comment`);
            const comments = commentsResponse.data.comments || [];
            console.log(`   Found ${comments.length} comments`);
            if (comments.length > 0) {
                console.log(`   First comment: ${comments[0].comment_text?.substring(0, 100)}...`);
            }
        } catch (e) {
            console.log(`   Could not fetch comments: ${e.message}`);
        }
        
        // Look for any doc-related fields in task object
        console.log('\n🔎 Searching for doc-related fields in task object...');
        const allKeys = Object.keys(firstTask);
        const docFields = allKeys.filter(key => 
            key.toLowerCase().includes('doc') || 
            key.toLowerCase().includes('page') ||
            key.toLowerCase().includes('content') ||
            key.toLowerCase().includes('description')
        );
        console.log(`   Found fields: ${docFields.join(', ')}`);
        
        // Print full task structure (limited)
        console.log('\n📋 Full task structure (key fields):');
        console.log(JSON.stringify({
            id: firstTask.id,
            name: firstTask.name,
            description: firstTask.description ? `${firstTask.description.substring(0, 100)}...` : null,
            text_content: firstTask.text_content ? `${firstTask.text_content.substring(0, 100)}...` : null,
            attachments: firstTask.attachments?.length || 0,
            custom_fields: firstTask.custom_fields?.length || 0,
            checklists: firstTask.checklists?.length || 0,
        }, null, 2));
        
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Data: ${JSON.stringify(error.response.data)}`);
        }
    }
}

checkTaskContent();
