import axios from 'axios';

const API_TOKEN = 'pk_6835920_ATZ7GDS6F48SN1TEFDC1V9ZK6HZ0BJ84';
const LIST_ID = '901507254876'; // HUMA: Strategy list

const client = axios.create({
    baseURL: 'https://api.clickup.com/api/v2',
    headers: {
        'Authorization': API_TOKEN,
        'Content-Type': 'application/json',
    },
});

async function checkTaskContent() {
    try {
        console.log(`Fetching tasks from list ${LIST_ID}...\n`);
        const response = await client.get(`/list/${LIST_ID}/task`, {
            params: { page: 0, archived: false }
        });
        
        const tasks = response.data.tasks || [];
        console.log(`Found ${tasks.length} tasks\n`);
        
        tasks.forEach((task, i) => {
            console.log(`\n${'='.repeat(80)}`);
            console.log(`Task ${i+1}: "${task.name}"`);
            console.log(`ID: ${task.id}`);
            console.log(`URL: ${task.url}`);
            console.log(`Status: ${task.status?.status || 'N/A'}`);
            
            if (task.description) {
                console.log(`\n✅ HTML Description (${task.description.length} chars):`);
                console.log(task.description);
            }
            
            if (task.text_content) {
                console.log(`\n✅ Plain Text Content (${task.text_content.length} chars):`);
                console.log(task.text_content);
            }
            
            if (task.checklists && task.checklists.length > 0) {
                console.log(`\n📝 Checklists: ${task.checklists.length}`);
                task.checklists.forEach(cl => {
                    console.log(`  - ${cl.name}: ${cl.items?.length || 0} items`);
                });
            }
            
            if (task.attachments && task.attachments.length > 0) {
                console.log(`\n📎 Attachments: ${task.attachments.length}`);
                task.attachments.forEach(att => {
                    console.log(`  - ${att.title || att.name} (${att.extension || 'no ext'})`);
                });
            }
        });
        
    } catch (error) {
        console.error(`Error: ${error.message}`);
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Data: ${JSON.stringify(error.response.data, null, 2)}`);
        }
    }
}

checkTaskContent();
