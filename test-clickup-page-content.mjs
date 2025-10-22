#!/usr/bin/env node
/**
 * Test script to investigate ClickUp page content structure
 * Run: node test-clickup-page-content.mjs
 */

import clickupSdk from '@api/clickup';

// Get credentials from environment
const API_TOKEN = process.env.CLICKUP_API_TOKEN || 'pk_4573313_9USWVEMF7EGM8V6RV36VRD4W6E70CR04';
const WORKSPACE_ID = '4573313';
const DOC_ID = '4bj41-38075'; // "test document"

console.log('🔍 Investigating ClickUp Page Content Structure\n');

try {
    // Configure SDK
    clickupSdk.auth(API_TOKEN);
    clickupSdk.config({ timeout: 30000 });

    console.log(`📄 Fetching doc: ${DOC_ID}`);
    const doc = await clickupSdk.getDoc({
        workspaceId: parseInt(WORKSPACE_ID),
        docId: DOC_ID,
    });
    console.log('Doc info:', JSON.stringify(doc, null, 2));

    console.log(`\n📑 Fetching pages for doc: ${DOC_ID}`);
    const pages = await clickupSdk.getDocPages({
        workspaceId: parseInt(WORKSPACE_ID),
        docId: DOC_ID,
    });

    console.log(`\nFound ${pages.length} pages`);

    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        console.log(`\n--- Page ${i + 1} ---`);
        console.log('Page ID:', page.page_id);
        console.log('Name:', page.name);
        console.log('Content length:', page.content?.length || 0);
        console.log('Content preview:', page.content?.substring(0, 200) || '(empty)');
        console.log('Has nested pages:', page.pages?.length || 0);
        console.log('Full structure:', JSON.stringify(page, null, 2).substring(0, 1000));
    }

} catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
}
