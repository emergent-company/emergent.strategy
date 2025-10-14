#!/usr/bin/env node

async function testOrgCreate() {
    const response = await fetch('http://localhost:3001/orgs', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer e2e-all',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: 'Test Org ' + Date.now() })
    });

    const text = await response.text();
    console.log('Status:', response.status);
    console.log('Body:', text);

    if (!response.ok) {
        console.error('Failed to create org');
        process.exit(1);
    }

    console.log('Success!');
    console.log(JSON.parse(text));
}

testOrgCreate().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
