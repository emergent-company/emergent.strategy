#!/usr/bin/env node
/**
 * Test PKCS#1 to PKCS#8 conversion
 * This simulates what the production code will do
 */

import crypto from 'crypto';
import * as jose from 'jose';

// Sample PKCS#1 key (this is the format Zitadel provides)
const pkcs1Key = `-----BEGIN RSA PRIVATE KEY-----
MIIEpQIBAAKCAQEAw4mPJ7JnWG0mcX4JqWt+Kmc1Us//1fuPDObcAxdIzNDTG+D3
k0XYour-actual-key-here
-----END RSA PRIVATE KEY-----`;

async function testConversion() {
    console.log('Testing PKCS#1 to PKCS#8 conversion...\n');

    try {
        // Step 1: Import PKCS#1 key using Node.js crypto
        console.log('1. Importing PKCS#1 key with crypto.createPrivateKey()...');
        const keyObject = crypto.createPrivateKey({
            key: pkcs1Key,
            format: 'pem',
            type: 'pkcs1'
        });
        console.log('   ✓ PKCS#1 import successful\n');

        // Step 2: Export as PKCS#8
        console.log('2. Exporting as PKCS#8...');
        const pkcs8Key = keyObject.export({
            type: 'pkcs8',
            format: 'pem'
        });
        console.log('   ✓ PKCS#8 export successful');
        console.log('   Key starts with:', pkcs8Key.substring(0, 50) + '...\n');

        // Step 3: Try to import with jose
        console.log('3. Importing PKCS#8 key with jose.importPKCS8()...');
        const privateKey = await jose.importPKCS8(pkcs8Key, 'RS256');
        console.log('   ✓ jose import successful\n');

        // Step 4: Create a test JWT
        console.log('4. Creating test JWT...');
        const jwt = await new jose.SignJWT({ test: 'data' })
            .setProtectedHeader({ alg: 'RS256' })
            .setIssuer('test')
            .setSubject('test')
            .setAudience('test')
            .setExpirationTime('1h')
            .sign(privateKey);
        console.log('   ✓ JWT creation successful');
        console.log('   JWT:', jwt.substring(0, 50) + '...\n');

        console.log('✅ All steps successful! The conversion will work in production.');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

testConversion();
