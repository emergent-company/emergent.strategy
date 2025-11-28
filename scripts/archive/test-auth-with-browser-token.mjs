#!/usr/bin/env node

/**
 * Test authentication with a token from browser
 * 
 * Usage:
 *   node test-auth-with-browser-token.mjs YOUR_TOKEN_HERE
 * 
 * This script will:
 * 1. Decode the JWT token and show claims
 * 2. Test the token against your API
 * 3. Check if token exchange is possible
 * 4. Verify backend authentication flow
 */

const TOKEN = process.argv[2];

if (!TOKEN) {
    console.error('❌ Error: No token provided');
    console.log('\nUsage:');
    console.log('  node test-auth-with-browser-token.mjs YOUR_TOKEN_HERE');
    console.log('\nTo get your token:');
    console.log('  1. Open browser DevTools (F12)');
    console.log('  2. Go to Application tab → Local Storage');
    console.log('  3. Look for __nexus_auth_v1__');
    console.log('  4. Copy the access_token or id_token value');
    console.log('\nAlternatively from Network tab:');
    console.log('  1. Open DevTools → Network tab');
    console.log('  2. Find a request to /api/');
    console.log('  3. Look at Request Headers → Authorization');
    console.log('  4. Copy the Bearer token (without "Bearer " prefix)');
    process.exit(1);
}

console.log('🔐 Testing Authentication Flow\n');
console.log('═══════════════════════════════════════════════════════\n');

// Step 1: Decode JWT token
console.log('1️⃣  Decoding JWT Token...\n');

function decodeJWT(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) {
            throw new Error('Invalid JWT format (should have 3 parts)');
        }

        const [headerB64, payloadB64, signature] = parts;

        // Decode header
        const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());

        // Decode payload
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

        return { header, payload, signature };
    } catch (error) {
        throw new Error(`JWT decode failed: ${error.message}`);
    }
}

try {
    const { header, payload, signature } = decodeJWT(TOKEN);

    console.log('   ✅ Token Structure Valid\n');
    console.log('   📋 Header:');
    console.log('   ' + JSON.stringify(header, null, 2).replace(/\n/g, '\n   '));
    console.log('\n   📋 Payload (Claims):');
    console.log('   ' + JSON.stringify(payload, null, 2).replace(/\n/g, '\n   '));

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp) {
        const expiresIn = payload.exp - now;
        if (expiresIn > 0) {
            console.log(`\n   ✅ Token expires in: ${Math.floor(expiresIn / 60)} minutes`);
        } else {
            console.log(`\n   ❌ Token EXPIRED ${Math.floor(-expiresIn / 60)} minutes ago`);
        }
    }

    // Check issuer
    if (payload.iss) {
        console.log(`   📍 Issued by: ${payload.iss}`);
    }

    // Check subject (user ID)
    if (payload.sub) {
        console.log(`   👤 Subject (User ID): ${payload.sub}`);
    }

    // Check scopes
    if (payload.scope) {
        const scopes = typeof payload.scope === 'string'
            ? payload.scope.split(' ')
            : payload.scope;
        console.log(`   🔑 Scopes: ${Array.isArray(scopes) ? scopes.join(', ') : scopes}`);
    }

    console.log('\n');
} catch (error) {
    console.log(`   ❌ Token Decode Failed: ${error.message}\n`);
    console.log('   This might be an opaque token (non-JWT) from Zitadel.\n');
}

// Step 2: Test against local API
console.log('2️⃣  Testing Against Backend API...\n');

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

async function testEndpoint(url, token, description) {
    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        const status = response.status;
        const statusText = response.statusText;

        let body;
        try {
            body = await response.json();
        } catch {
            body = await response.text();
        }

        return {
            success: response.ok,
            status,
            statusText,
            body,
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
        };
    }
}

// Test /auth/me endpoint
console.log('   Testing: GET /auth/me');
const authMeResult = await testEndpoint(`${API_BASE}/auth/me`, TOKEN, 'Auth Me');
if (authMeResult.success) {
    console.log('   ✅ Authentication successful');
    console.log('   Response:', JSON.stringify(authMeResult.body, null, 2).replace(/\n/g, '\n   '));
} else if (authMeResult.error) {
    console.log(`   ❌ Connection failed: ${authMeResult.error}`);
    console.log(`   Is the backend running? Check: ${API_BASE}`);
} else {
    console.log(`   ❌ Authentication failed: ${authMeResult.status} ${authMeResult.statusText}`);
    console.log('   Response:', JSON.stringify(authMeResult.body, null, 2).replace(/\n/g, '\n   '));
}
console.log();

// Test /orgs endpoint (the one from your error)
console.log('   Testing: GET /orgs');
const orgsResult = await testEndpoint(`${API_BASE}/orgs`, TOKEN, 'Organizations');
if (orgsResult.success) {
    console.log('   ✅ Organizations endpoint successful');
    const orgs = Array.isArray(orgsResult.body) ? orgsResult.body : [orgsResult.body];
    console.log(`   Found ${orgs.length} organization(s)`);
    if (orgs.length > 0 && orgs.length <= 3) {
        console.log('   Organizations:', JSON.stringify(orgs, null, 2).replace(/\n/g, '\n   '));
    }
} else if (orgsResult.error) {
    console.log(`   ❌ Connection failed: ${orgsResult.error}`);
} else {
    console.log(`   ❌ Request failed: ${orgsResult.status} ${orgsResult.statusText}`);
    console.log('   Response:', JSON.stringify(orgsResult.body, null, 2).replace(/\n/g, '\n   '));
}
console.log();

// Step 3: Test token introspection with Zitadel
console.log('3️⃣  Testing Zitadel Token Introspection...\n');

const ZITADEL_DOMAIN = process.env.ZITADEL_DOMAIN || 'localhost:8080';

// Note: Introspection requires service account credentials
console.log('   ℹ️  Token introspection requires Zitadel service account');
console.log('   Skipping (would need ZITADEL_CLIENT_JWT configured)');
console.log();

// Step 4: Test token exchange capability
console.log('4️⃣  Testing Token Exchange Support...\n');

try {
    const discoveryUrl = `http://${ZITADEL_DOMAIN}/.well-known/openid-configuration`;
    const discoveryRes = await fetch(discoveryUrl);

    if (discoveryRes.ok) {
        const config = await discoveryRes.json();

        if (config.grant_types_supported) {
            const hasTokenExchange = config.grant_types_supported.includes(
                'urn:ietf:params:oauth:grant-type:token-exchange'
            );

            if (hasTokenExchange) {
                console.log('   ✅ Token Exchange IS supported by Zitadel');
                console.log('   You can implement impersonation/delegation');
            } else {
                console.log('   ❌ Token Exchange NOT supported');
                console.log('   Enable it in Zitadel application settings');
            }
        }

        console.log(`\n   📍 Endpoints:`);
        console.log(`   Authorization: ${config.authorization_endpoint}`);
        console.log(`   Token: ${config.token_endpoint}`);
        if (config.introspection_endpoint) {
            console.log(`   Introspection: ${config.introspection_endpoint}`);
        }
    } else {
        console.log(`   ⚠️  Could not reach Zitadel discovery endpoint`);
        console.log(`   URL: ${discoveryUrl}`);
    }
} catch (error) {
    console.log(`   ❌ Zitadel discovery failed: ${error.message}`);
}

console.log('\n═══════════════════════════════════════════════════════');
console.log('\n📊 Summary:\n');
console.log('Token Status:');
console.log('  • Decoded: ' + (TOKEN.split('.').length === 3 ? '✅' : '❌'));
console.log('  • Valid: ' + (authMeResult.success ? '✅' : '❌'));
console.log('  • Backend Auth: ' + (authMeResult.success ? '✅' : '❌'));
console.log('  • Orgs Access: ' + (orgsResult.success ? '✅' : '❌'));
console.log();

if (!authMeResult.success && authMeResult.status === 401) {
    console.log('🔧 Troubleshooting Tips:');
    console.log('  1. Token might be expired - try logging in again');
    console.log('  2. Token might be for wrong issuer - check Zitadel domain');
    console.log('  3. Backend might not be configured - check AUTH_ISSUER env var');
    console.log();
}

if (authMeResult.success && !orgsResult.success) {
    console.log('🔧 Troubleshooting Tips:');
    console.log('  1. Token is valid but lacks required scopes for /orgs');
    console.log('  2. Backend might be checking different headers');
    console.log('  3. Check backend logs for details');
    console.log();
}

console.log('📖 Next Steps:');
console.log('  • Review backend auth logs');
console.log('  • Check Zitadel application configuration');
console.log('  • Verify required scopes in token');
console.log();
