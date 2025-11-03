#!/usr/bin/env node

/**
 * Test Zitadel Token Introspection (with Bearer Auth like the server)
 * 
 * This version matches what the NestJS server actually does:
 * 1. Get a service account token (JWT bearer assertion)
 * 2. Use that token to call introspection endpoint
 * 3. Pass the user token in the request body
 */

import https from 'https';
import { URLSearchParams } from 'url';
import crypto from 'crypto';
import fs from 'fs';

const CONFIG = {
    domain: 'spec-zitadel.kucharz.net',
    // From docker environment
    clientId: '345047809973618692',
    keyId: '345047982275561476',
    appId: '345047809973553156',
    // We need the private key from ZITADEL_CLIENT_JWT
    privateKeyPath: process.argv[3] || null,
    // User token to test
    userToken: process.argv[2] || '',
};

/**
 * Create JWT assertion for service account authentication
 */
function createJwtAssertion(privateKey) {
    const now = Math.floor(Date.now() / 1000);

    const header = {
        alg: 'RS256',
        kid: CONFIG.keyId,
        typ: 'JWT'
    };

    const payload = {
        iss: CONFIG.clientId,
        sub: CONFIG.clientId,
        aud: `https://${CONFIG.domain}`,
        exp: now + 3600,
        iat: now,
    };

    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signInput = `${headerB64}.${payloadB64}`;

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signInput);
    sign.end();

    const signature = sign.sign(privateKey, 'base64url');

    return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Get service account access token
 */
async function getServiceAccountToken(jwt) {
    const url = new URL(`https://${CONFIG.domain}/oauth/v2/token`);
    const body = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
        scope: 'openid urn:zitadel:iam:org:project:id:zitadel:aud',
    }).toString();

    console.log('🔐 JWT Assertion (first 100 chars):', jwt.substring(0, 100) + '...');
    console.log('📍 Token endpoint:', url.toString());
    console.log('📦 Request body length:', body.length, 'bytes\n');

    const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body),
        },
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                console.log(`📊 Response status: ${res.statusCode} ${res.statusMessage}`);
                console.log(`📄 Response body:`, data, '\n');

                if (res.statusCode !== 200) {
                    console.error(`❌ Token request failed (${res.statusCode})`);
                    try {
                        const parsed = JSON.parse(data);
                        console.error('Error details:', JSON.stringify(parsed, null, 2));
                    } catch (e) {
                        console.error('Raw error:', data);
                    }
                    reject(new Error('Failed to get service account token'));
                    return;
                }

                const parsed = JSON.parse(data);
                resolve(parsed.access_token);
            });
        });

        req.on('error', (err) => {
            console.error('🔥 Request error:', err);
            reject(err);
        });
        req.write(body);
        req.end();
    });
}

/**
 * Test introspection with Bearer auth (like the server does)
 */
async function testIntrospection(serviceToken, userToken) {
    console.log('🔍 Testing Zitadel Introspection (Bearer Auth)\n');
    console.log(`Service Token: ${serviceToken.substring(0, 30)}...`);
    console.log(`User Token: ${userToken.substring(0, 30)}...\n`);

    const url = new URL(`https://${CONFIG.domain}/oauth/v2/introspect`);
    const body = new URLSearchParams({
        token: userToken,
        token_type_hint: 'access_token',
    }).toString();

    const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body),
            'Authorization': `Bearer ${serviceToken}`,
        },
    };

    return new Promise((resolve, reject) => {
        console.log('📤 Making introspection request...\n');

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                console.log(`Status Code: ${res.statusCode}`);
                console.log(`Status Message: ${res.statusMessage}\n`);

                console.log('Response Body:');
                try {
                    const parsed = JSON.parse(data);
                    console.log(JSON.stringify(parsed, null, 2));

                    if (res.statusCode === 200) {
                        if (parsed.active) {
                            console.log('\n✅ Token is ACTIVE');
                            console.log(`   Subject: ${parsed.sub || 'N/A'}`);
                            console.log(`   Email: ${parsed.email || 'N/A'}`);
                            console.log(`   Username: ${parsed.username || 'N/A'}`);
                        } else {
                            console.log('\n⚠️  Token is INACTIVE');
                        }
                    } else {
                        console.log('\n❌ Introspection failed');
                        if (parsed.error) {
                            console.log(`   Error: ${parsed.error}`);
                            console.log(`   Description: ${parsed.error_description || 'N/A'}`);
                        }
                    }
                } catch (e) {
                    console.log(data);
                }

                resolve();
            });
        });

        req.on('error', (error) => {
            console.error('❌ Request error:', error.message);
            reject(error);
        });

        req.write(body);
        req.end();
    });
}

async function main() {
    if (!CONFIG.userToken) {
        console.error('❌ Error: No user token provided');
        console.log('Usage: node test-zitadel-introspection-bearer.mjs <user_token> [private_key_file]');
        console.log('\nThe private key is from ZITADEL_CLIENT_JWT.key field');
        process.exit(1);
    }

    try {
        console.log('🔑 Step 1: Getting service account token...\n');

        // Read private key
        let privateKey;
        if (CONFIG.privateKeyPath) {
            privateKey = fs.readFileSync(CONFIG.privateKeyPath, 'utf8');
        } else {
            // Try to get from SSH
            console.log('📡 Fetching private key from production...\n');
            console.error('❌ Cannot automatically fetch private key.');
            console.error('   Please extract it manually from docker environment:');
            console.error('   ssh root@kucharz.net "docker inspect zitadel... | grep ZITADEL_CLIENT_JWT"');
            process.exit(1);
        }

        // Create JWT and get service token
        const jwt = createJwtAssertion(privateKey);
        const serviceToken = await getServiceAccountToken(jwt);
        console.log('✅ Service account token obtained\n');
        console.log('─'.repeat(60) + '\n');

        // Test introspection
        console.log('🧪 Step 2: Testing introspection...\n');
        await testIntrospection(serviceToken, CONFIG.userToken);

    } catch (error) {
        console.error('\n💥 Error:', error.message);
        process.exit(1);
    }
}

main();
