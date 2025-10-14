#!/usr/bin/env node

/**
 * Test script for MCP Dev Manager
 * Run with: node test.js
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(__dirname, '..');

console.log('Testing MCP Dev Manager');
console.log('PROJECT_ROOT:', PROJECT_ROOT);
console.log('');

const server = spawn('node', ['dist/index.js'], {
    env: {
        ...process.env,
        PROJECT_ROOT,
    },
    stdio: ['pipe', 'pipe', 'inherit'],
});

// Test the server by sending an initialize request
const initialize = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
            name: 'test-client',
            version: '1.0.0',
        },
    },
};

const listTools = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
};

server.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    lines.forEach((line) => {
        try {
            const response = JSON.parse(line);
            console.log('Response:', JSON.stringify(response, null, 2));
        } catch (e) {
            console.log('Raw:', line);
        }
    });
});

// Send initialize
setTimeout(() => {
    console.log('\nSending initialize request...');
    server.stdin.write(JSON.stringify(initialize) + '\n');
}, 500);

// Send list tools
setTimeout(() => {
    console.log('\nSending list tools request...');
    server.stdin.write(JSON.stringify(listTools) + '\n');
}, 1500);

// Exit after 3 seconds
setTimeout(() => {
    console.log('\nTest complete!');
    server.kill();
    process.exit(0);
}, 3000);

server.on('error', (error) => {
    console.error('Error:', error);
    process.exit(1);
});
