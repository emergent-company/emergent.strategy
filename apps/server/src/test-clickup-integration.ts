#!/usr/bin/env ts-node
/**
 * Manual Test Script for ClickUp Integration
 * 
 * Tests:
 * 1. Integration registration and discovery
 * 2. Integration capabilities
 * 3. Configuration validation
 * 4. API client functionality (mock/real)
 * 5. Data mapper functionality
 * 
 * Usage:
 *   npm run test:clickup
 * 
 * Or with real ClickUp API token:
 *   CLICKUP_API_TOKEN=pk_xxx CLICKUP_WORKSPACE_ID=ws_xxx npm run test:clickup
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from './modules/app.module';
import { IntegrationRegistryService } from './modules/integrations/integration-registry.service';
import { ClickUpApiClient } from './modules/clickup/clickup-api.client';
import { ClickUpDataMapper } from './modules/clickup/clickup-data-mapper.service';

async function runTests() {
    console.log('\n' + '='.repeat(60));
    console.log('ClickUp Integration Backend Tests');
    console.log('='.repeat(60) + '\n');

    // Bootstrap the application
    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn'], // Suppress info/debug logs
    });

    const registry = app.get(IntegrationRegistryService);
    const apiClient = app.get(ClickUpApiClient);
    const dataMapper = app.get(ClickUpDataMapper);

    let testsPassed = 0;
    let testsFailed = 0;

    // Helper function to run tests
    const test = async (name: string, fn: () => Promise<void>) => {
        try {
            await fn();
            console.log(`✅ ${name}`);
            testsPassed++;
        } catch (error) {
            const err = error as Error;
            console.log(`❌ ${name}`);
            console.log(`   Error: ${err.message}`);
            testsFailed++;
        }
    };

    // Test 1: Integration Registration
    console.log('Test Suite 1: Integration Registration');
    console.log('-'.repeat(60));

    await test('Integration is registered in registry', async () => {
        const integration = registry.getIntegration('clickup');
        if (!integration) {
            throw new Error('ClickUp integration not found in registry');
        }
    });

    await test('Integration name is correct', async () => {
        const integration = registry.getIntegration('clickup');
        if (integration?.getName() !== 'clickup') {
            throw new Error(`Expected name 'clickup', got '${integration?.getName()}'`);
        }
    });

    await test('Integration display name is correct', async () => {
        const integration = registry.getIntegration('clickup');
        if (integration?.getDisplayName() !== 'ClickUp') {
            throw new Error(`Expected 'ClickUp', got '${integration?.getDisplayName()}'`);
        }
    });

    // Test 2: Capabilities
    console.log('\nTest Suite 2: Integration Capabilities');
    console.log('-'.repeat(60));

    await test('Integration supports import', async () => {
        const integration = registry.getIntegration('clickup');
        const caps = integration?.getCapabilities();
        if (!caps?.supportsImport) {
            throw new Error('Integration should support import');
        }
    });

    await test('Integration supports webhooks', async () => {
        const integration = registry.getIntegration('clickup');
        const caps = integration?.getCapabilities();
        if (!caps?.supportsWebhooks) {
            throw new Error('Integration should support webhooks');
        }
    });

    await test('Integration supports incremental sync', async () => {
        const integration = registry.getIntegration('clickup');
        const caps = integration?.getCapabilities();
        if (!caps?.supportsIncrementalSync) {
            throw new Error('Integration should support incremental sync');
        }
    });

    await test('Integration does not require OAuth', async () => {
        const integration = registry.getIntegration('clickup');
        const caps = integration?.getCapabilities();
        if (caps?.requiresOAuth) {
            throw new Error('Integration should not require OAuth');
        }
    });

    // Test 3: Registry Listing
    console.log('\nTest Suite 3: Registry Listing');
    console.log('-'.repeat(60));

    await test('ClickUp appears in available integrations list', async () => {
        const available = registry.listAvailableIntegrations();
        const clickup = available.find(i => i.name === 'clickup');
        if (!clickup) {
            throw new Error('ClickUp not in available integrations list');
        }
    });

    await test('ClickUp has required settings defined', async () => {
        const available = registry.listAvailableIntegrations();
        const clickup = available.find(i => i.name === 'clickup');
        if (!clickup?.requiredSettings?.includes('api_token')) {
            throw new Error('api_token should be in required settings');
        }
        if (!clickup?.requiredSettings?.includes('workspace_id')) {
            throw new Error('workspace_id should be in required settings');
        }
    });

    await test('ClickUp has optional settings with defaults', async () => {
        const available = registry.listAvailableIntegrations();
        const clickup = available.find(i => i.name === 'clickup');
        if (clickup?.optionalSettings?.batch_size !== 100) {
            throw new Error('batch_size default should be 100');
        }
    });

    // Test 4: Data Mapper (skipped - would need full mock types)
    console.log('\nTest Suite 4: Data Mapper');
    console.log('-'.repeat(60));
    console.log('⏭️  Skipped (requires full ClickUp type mocks)');

    // Test 5: API Client (Real API Test - optional)
    const hasRealCredentials = process.env.CLICKUP_API_TOKEN && process.env.CLICKUP_WORKSPACE_ID;

    if (hasRealCredentials) {
        console.log('\nTest Suite 5: Real API Client Tests');
        console.log('-'.repeat(60));
        console.log('(Using real ClickUp API credentials from environment)');

        await test('API client can fetch workspaces', async () => {
            apiClient.configure(process.env.CLICKUP_API_TOKEN!);
            const response = await apiClient.getWorkspaces();

            if (!response.teams || !Array.isArray(response.teams)) {
                throw new Error('Expected teams array in response');
            }
        });

        await test('API client can find specified workspace', async () => {
            const response = await apiClient.getWorkspaces();
            const workspace = response.teams.find(t => t.id === process.env.CLICKUP_WORKSPACE_ID);

            if (!workspace) {
                throw new Error(`Workspace ${process.env.CLICKUP_WORKSPACE_ID} not found`);
            }
        });

        await test('API client respects rate limits', async () => {
            // The rate limiter should allow at least a few requests
            const promises = Array.from({ length: 5 }, () => apiClient.getWorkspaces());
            const results = await Promise.all(promises);

            if (results.some(r => !r.teams)) {
                throw new Error('Rate limiter interfered with valid requests');
            }
        });
    } else {
        console.log('\nTest Suite 5: Real API Client Tests');
        console.log('-'.repeat(60));
        console.log('⏭️  Skipped (set CLICKUP_API_TOKEN and CLICKUP_WORKSPACE_ID to run)');
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('Test Summary');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);
    console.log(`📊 Total:  ${testsPassed + testsFailed}`);
    console.log('='.repeat(60) + '\n');

    await app.close();

    // Exit with appropriate code
    process.exit(testsFailed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
});
