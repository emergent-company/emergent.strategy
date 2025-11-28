#!/usr/bin/env node

/**
 * Test Zitadel Token Introspection
 * 
 * This script tests the Zitadel introspection endpoint to diagnose
 * why it's returning 500 errors in production.
 * 
 * Based on: https://zitadel.com/blog/testing-token-introspection-with-postman
 */

import https from 'https';
import { URLSearchParams } from 'url';

// Configuration - from production environment
const CONFIG = {
    // From docker inspect: ZITADEL_CLIENT_JWT.clientId
    clientId: '345047809973618692',
    // This is the API application client secret - need to get from Zitadel console
    // OR we can use JWT assertion with the private key from ZITADEL_CLIENT_JWT
    clientSecret: '',
    introspectionUrl: 'https://spec-zitadel.kucharz.net/oauth/v2/introspect',
    // You'll need to provide a valid access token to test
    // Get from browser: DevTools > Application > Local Storage after login
    accessToken: process.argv[2] || '',
    // Key ID from production: 345047982275561476
    keyId: '345047982275561476',
    // App ID from production: 345047809973553156  
    appId: '345047809973553156',
};

/**
 * Make introspection request
 */
async function testIntrospection() {
    if (!CONFIG.accessToken) {
        console.error('❌ Error: No access token provided');
        console.log('Usage: node test-zitadel-introspection.mjs <access_token>');
        console.log('\nYou can get an access token by:');
        console.log('1. Logging into the admin app');
        console.log('2. Opening browser DevTools > Application > Local Storage');
        console.log('3. Looking for the token in the auth state');
        process.exit(1);
    }

    console.log('🔍 Testing Zitadel Token Introspection\n');
    console.log('Configuration:');
    console.log(`  Client ID: ${CONFIG.clientId}`);
    console.log(`  Introspection URL: ${CONFIG.introspectionUrl}`);
    console.log(`  Token (first 20 chars): ${CONFIG.accessToken.substring(0, 20)}...\n`);

    const url = new URL(CONFIG.introspectionUrl);
    const body = new URLSearchParams({
        token: CONFIG.accessToken,
    }).toString();

    // Create Basic Auth header
    const auth = Buffer.from(`${CONFIG.clientId}:${CONFIG.clientSecret}`).toString('base64');

    const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body),
            'Authorization': `Basic ${auth}`,
        },
    };

    return new Promise((resolve, reject) => {
        console.log('📤 Making introspection request...\n');

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                console.log(`Status Code: ${res.statusCode}`);
                console.log(`Status Message: ${res.statusMessage}\n`);

                console.log('Response Headers:');
                Object.entries(res.headers).forEach(([key, value]) => {
                    console.log(`  ${key}: ${value}`);
                });
                console.log();

                console.log('Response Body:');
                try {
                    const parsed = JSON.parse(data);
                    console.log(JSON.stringify(parsed, null, 2));

                    if (res.statusCode === 200) {
                        if (parsed.active) {
                            console.log('\n✅ Token is ACTIVE');
                            console.log(`   Subject: ${parsed.sub || 'N/A'}`);
                            console.log(`   Client ID: ${parsed.client_id || 'N/A'}`);
                            console.log(`   Username: ${parsed.username || 'N/A'}`);
                            console.log(`   Scopes: ${parsed.scope || 'N/A'}`);
                            if (parsed.exp) {
                                const expDate = new Date(parsed.exp * 1000);
                                console.log(`   Expires: ${expDate.toISOString()}`);
                            }
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
                    console.log('\n❌ Failed to parse response as JSON');
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

// Additional helper: Get token from Zitadel using client credentials
async function getClientCredentialsToken() {
    console.log('🔑 Attempting to get token using client credentials flow...\n');

    const url = new URL('https://spec-zitadel.kucharz.net/oauth/v2/token');
    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'openid',
    }).toString();

    const auth = Buffer.from(`${CONFIG.clientId}:${CONFIG.clientSecret}`).toString('base64');

    const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body),
            'Authorization': `Basic ${auth}`,
        },
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                console.log(`Token Response Status: ${res.statusCode}\n`);

                try {
                    const parsed = JSON.parse(data);
                    if (parsed.access_token) {
                        console.log('✅ Successfully obtained token');
                        console.log(`   Token (first 20 chars): ${parsed.access_token.substring(0, 20)}...\n`);
                        resolve(parsed.access_token);
                    } else {
                        console.log('❌ No access token in response');
                        console.log(JSON.stringify(parsed, null, 2));
                        reject(new Error('No access token received'));
                    }
                } catch (e) {
                    console.log('❌ Failed to parse token response');
                    console.log(data);
                    reject(e);
                }
            });
        });

        req.on('error', (error) => {
            console.error('❌ Token request error:', error.message);
            reject(error);
        });

        req.write(body);
        req.end();
    });
}

// Main execution
async function main() {
    try {
        // If client secret is provided, we can try to get a token first
        if (CONFIG.clientSecret && !CONFIG.accessToken) {
            console.log('💡 No token provided, but client secret available.');
            console.log('   Attempting to get token using client credentials flow...\n');
            const token = await getClientCredentialsToken();
            CONFIG.accessToken = token;
            console.log('─'.repeat(60) + '\n');
        }

        await testIntrospection();
    } catch (error) {
        console.error('\n💥 Error:', error.message);
        process.exit(1);
    }
}

main();
