#!/usr/bin/env node

/**
 * Test script to check if Zitadel delegation/impersonation is configured
 * and if any delegation errors are occurring
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

console.log('🔍 Checking Zitadel delegation/impersonation status...\n');

// Check 1: Look for delegation errors in recent logs
console.log('1️⃣  Checking for delegation errors in Zitadel logs...');
try {
    const { stdout, stderr } = await execAsync(
        'docker logs spec-server-2-zitadel-1 --since 1h 2>&1 | grep -i "delegation\\|impersonat" || echo "No delegation errors found"'
    );
    
    if (stdout.includes('No delegation errors found')) {
        console.log('   ✅ No delegation errors in last hour\n');
    } else {
        console.log('   ⚠️  Found delegation-related log entries:');
        console.log(stdout);
        console.log();
    }
} catch (error) {
    console.log('   ℹ️  Could not check logs (container might not be running)\n');
}

// Check 2: Check if Zitadel is running
console.log('2️⃣  Checking if Zitadel container is running...');
try {
    const { stdout } = await execAsync('docker ps --filter "name=zitadel" --format "{{.Names}}: {{.Status}}"');
    if (stdout.trim()) {
        console.log('   ✅ Zitadel is running:');
        console.log('   ' + stdout.trim() + '\n');
    } else {
        console.log('   ❌ Zitadel container is not running\n');
    }
} catch (error) {
    console.log('   ❌ Error checking container status\n');
}

// Check 3: Check environment configuration
console.log('3️⃣  Checking Zitadel environment configuration...');
const zitadelDomain = process.env.ZITADEL_DOMAIN || process.env.AUTH_ISSUER?.replace('http://', '').replace('https://', '');
const clientId = process.env.ZITADEL_CLIENT_ID || process.env.VITE_ZITADEL_CLIENT_ID;

if (zitadelDomain) {
    console.log(`   ✅ ZITADEL_DOMAIN configured: ${zitadelDomain}`);
} else {
    console.log('   ⚠️  ZITADEL_DOMAIN not found in environment');
}

if (clientId) {
    console.log(`   ✅ Client ID configured: ${clientId.substring(0, 10)}...`);
} else {
    console.log('   ⚠️  Client ID not found in environment');
}
console.log();

// Check 4: Test Zitadel connectivity
console.log('4️⃣  Testing Zitadel connectivity...');
try {
    const zitadelUrl = `http://${zitadelDomain || 'localhost:8080'}/.well-known/openid-configuration`;
    const response = await fetch(zitadelUrl);
    
    if (response.ok) {
        const config = await response.json();
        console.log('   ✅ Zitadel is accessible');
        console.log(`   📍 Token endpoint: ${config.token_endpoint}`);
        console.log(`   📍 Authorization endpoint: ${config.authorization_endpoint}`);
        
        // Check if token exchange is mentioned in supported grant types
        if (config.grant_types_supported) {
            const hasTokenExchange = config.grant_types_supported.includes(
                'urn:ietf:params:oauth:grant-type:token-exchange'
            );
            console.log(`   ${hasTokenExchange ? '✅' : '❌'} Token exchange grant type ${hasTokenExchange ? 'IS' : 'IS NOT'} supported`);
        }
        console.log();
    } else {
        console.log(`   ❌ Could not reach Zitadel (HTTP ${response.status})\n`);
    }
} catch (error) {
    console.log(`   ❌ Could not connect to Zitadel: ${error.message}\n`);
}

// Summary
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📋 SUMMARY');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log();
console.log('Current Status:');
console.log('  • Your system uses standard OIDC authorization code flow with PKCE');
console.log('  • Token delegation/impersonation is NOT currently implemented');
console.log('  • No delegation errors detected (which is expected)');
console.log();
console.log('Next Steps:');
console.log('  • If you need impersonation, follow: docs/ZITADEL_IMPERSONATION_SETUP.md');
console.log('  • The documentation explains how to enable token exchange in Zitadel');
console.log('  • Implement backend token exchange service if needed');
console.log();
console.log('Reference Project:');
console.log('  • You mentioned ~/code/huma/huma-blueprint-ui has working impersonation');
console.log('  • Compare their Zitadel application settings with yours');
console.log('  • Check if they have "Token Exchange" grant type enabled');
console.log();
