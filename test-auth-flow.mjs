#!/usr/bin/env node

/**
 * Test script to verify auth flow with Zitadel
 * Usage: node test-auth-flow.mjs
 */

const API_URL = process.env.API_URL || 'https://spec2.mcj.ovh';
const ZITADEL_DOMAIN = process.env.ZITADEL_DOMAIN || 'https://z.mcj.ovh';

console.log('=== Zitadel Auth Flow Test ===\n');
console.log(`API URL: ${API_URL}`);
console.log(`Zitadel Domain: ${ZITADEL_DOMAIN}\n`);

async function testHealthCheck() {
    console.log('1. Testing API health endpoint...');
    try {
        const response = await fetch(`${API_URL}/health`);
        const data = await response.json();
        console.log(`   ✅ Health check: ${response.status} - ${JSON.stringify(data)}\n`);
        return true;
    } catch (error) {
        console.log(`   ❌ Health check failed: ${error.message}\n`);
        return false;
    }
}

async function testZitadelDiscovery() {
    console.log('2. Testing Zitadel OIDC discovery...');
    try {
        const response = await fetch(`${ZITADEL_DOMAIN}/.well-known/openid-configuration`);
        const data = await response.json();
        console.log(`   ✅ Discovery endpoint: ${response.status}`);
        console.log(`   - Issuer: ${data.issuer}`);
        console.log(`   - Token endpoint: ${data.token_endpoint}`);
        console.log(`   - Introspection endpoint: ${data.introspection_endpoint}\n`);
        return data;
    } catch (error) {
        console.log(`   ❌ Discovery failed: ${error.message}\n`);
        return null;
    }
}

async function testTokenWithoutAuth() {
    console.log('3. Testing API endpoint without auth token...');
    try {
        const response = await fetch(`${API_URL}/api/projects`, {
            headers: {
                'Content-Type': 'application/json',
            },
        });
        const text = await response.text();
        console.log(`   Status: ${response.status}`);
        console.log(`   Response: ${text.substring(0, 200)}\n`);
        return response.status === 401;
    } catch (error) {
        console.log(`   ❌ Request failed: ${error.message}\n`);
        return false;
    }
}

async function testTokenWithInvalidAuth() {
    console.log('4. Testing API endpoint with invalid token...');
    try {
        const response = await fetch(`${API_URL}/api/projects`, {
            headers: {
                'Authorization': 'Bearer invalid-token-12345',
                'Content-Type': 'application/json',
            },
        });
        const text = await response.text();
        console.log(`   Status: ${response.status}`);
        console.log(`   Response: ${text.substring(0, 200)}\n`);

        if (response.status === 401) {
            console.log('   ℹ️  This is expected - invalid token should be rejected\n');
        }
        return true;
    } catch (error) {
        console.log(`   ❌ Request failed: ${error.message}\n`);
        return false;
    }
}

async function getZitadelToken() {
    console.log('5. Testing Zitadel token introspection diagnostics...');
    console.log('   ⚠️  To test with a real token, you need to:');
    console.log('   1. Get a valid access token from Zitadel');
    console.log('   2. Set TOKEN env var: TOKEN="your-token" node test-auth-flow.mjs\n');

    const token = process.env.TOKEN;
    if (!token) {
        console.log('   ℹ️  No TOKEN provided, skipping introspection test\n');
        return null;
    }

    return token;
}

async function testTokenIntrospection(token) {
    if (!token) return;

    console.log('6. Testing with provided token...');
    try {
        const response = await fetch(`${API_URL}/api/projects`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        console.log(`   Status: ${response.status}`);

        if (response.ok) {
            const data = await response.json();
            console.log(`   ✅ Auth successful! Got ${data.length || 0} projects\n`);
        } else {
            const text = await response.text();
            console.log(`   ❌ Auth failed: ${text.substring(0, 300)}\n`);
        }
    } catch (error) {
        console.log(`   ❌ Request failed: ${error.message}\n`);
    }
}

async function checkServerLogs() {
    console.log('7. Server-side diagnostics:');
    console.log('   To check server logs, SSH to the server and run:');
    console.log(`   ssh root@kucharz.net "docker logs --tail 100 server-t4cok0o4cwwoo8o0ccs8ogkg-101452008875 2>&1 | grep -E 'AUTH|Zitadel|pkcs8|introspection'"\n`);
}

// Run all tests
async function runTests() {
    await testHealthCheck();
    await testZitadelDiscovery();
    await testTokenWithoutAuth();
    await testTokenWithInvalidAuth();
    const token = await getZitadelToken();
    await testTokenIntrospection(token);
    await checkServerLogs();

    console.log('=== Test Complete ===');
    console.log('\nNOTE: If you\'re getting "Invalid or expired access token":');
    console.log('1. Check that ZITADEL_CLIENT_JWT has proper newlines (\\n not \\\\n)');
    console.log('2. Check server logs for "pkcs8 must be PKCS#8 formatted string" errors');
    console.log('3. Verify the service account key in Zitadel admin panel');
    console.log('4. Try regenerating the service account key if needed\n');
}

runTests().catch(console.error);
