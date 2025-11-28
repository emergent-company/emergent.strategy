#!/usr/bin/env node
/**
 * Test script to verify template pack installation works without x-org-id header
 * Tests the fix for "Organization context required" error
 *
 * SETUP:
 * 1. Open browser: npm run chrome:debug
 * 2. Login to http://localhost:5176 with credentials:
 *    - Email: test@example.com
 *    - Password: TestPassword123!
 * 3. Open browser DevTools console (F12)
 * 4. Get your token: localStorage.getItem('auth_token')
 * 5. Run this script: TOKEN="your-token" node test-template-pack-install.mjs
 */

import fetch from 'node-fetch';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3002';
const DEMO_PACK_ID = '9f8d7e6c-5b4a-4c2d-8e0f-9a8b7c6d5e4f';

async function main() {
  console.log('🧪 Testing Template Pack Installation');
  console.log(
    '   Fix verification: Organization ID should be auto-derived from project\n'
  );

  // Step 1: Get token
  const access_token = process.env.TOKEN;

  if (!access_token) {
    console.error('❌ No TOKEN environment variable provided\n');
    console.error('SETUP STEPS:');
    console.error('1. Open browser: npm run chrome:debug');
    console.error('2. Login to http://localhost:5176 with:');
    console.error('   - Email: test@example.com');
    console.error('   - Password: TestPassword123!');
    console.error('3. Open browser DevTools console (F12)');
    console.error("4. Run: localStorage.getItem('auth_token')");
    console.error('5. Copy the token and run:\n');
    console.error(
      '   TOKEN="your-token-here" node test-template-pack-install.mjs\n'
    );
    process.exit(1);
  }

  console.log('✅ Using provided access token\n');

  // Step 2: Get user's projects
  console.log('1️⃣  Getting user projects...');
  const projectsRes = await fetch(`${SERVER_URL}/projects`, {
    headers: {
      Authorization: `Bearer ${access_token}`,
    },
  });

  if (!projectsRes.ok) {
    console.error('❌ Failed to get projects:', await projectsRes.text());
    console.error(
      '\n⚠️  Token may be expired. Get a fresh one from the browser.'
    );
    process.exit(1);
  }

  const projects = await projectsRes.json();
  if (!projects || projects.length === 0) {
    console.error('❌ No projects found for user');
    process.exit(1);
  }

  const project = projects[0];
  console.log(`✅ Found project: ${project.name} (${project.id})\n`);

  // Step 3: Check if demo pack exists
  console.log('2️⃣  Checking if demo pack exists...');
  const packRes = await fetch(`${SERVER_URL}/template-packs/${DEMO_PACK_ID}`, {
    headers: {
      Authorization: `Bearer ${access_token}`,
    },
  });

  if (!packRes.ok) {
    console.error('❌ Demo pack not found. Run seed script first:');
    console.error('   npm run seed:meeting-pack');
    process.exit(1);
  }

  const pack = await packRes.json();
  console.log(`✅ Found pack: ${pack.name} v${pack.version}\n`);

  // Step 4: Install template pack WITHOUT x-org-id header
  console.log('4️⃣  Installing template pack...');
  console.log('   ⚙️  Testing without x-org-id header (only x-project-id)');
  console.log('   ⚙️  Organization ID should be auto-derived from project\n');

  const installRes = await fetch(
    `${SERVER_URL}/template-packs/${DEMO_PACK_ID}/assign`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
        'x-project-id': project.id,
        // Note: NOT including x-org-id header - this is what we're testing!
      },
      body: JSON.stringify({
        isEnabled: true,
      }),
    }
  );

  if (!installRes.ok) {
    const error = await installRes.text();
    console.error('❌ Installation failed:', error);

    if (error.includes('Organization context required')) {
      console.error('\n⚠️  THE FIX DID NOT WORK!');
      console.error('   The endpoint still requires x-org-id header.');
      console.error('   Controller changes may not have been applied.');
    } else {
      console.error('\n⚠️  Installation failed for a different reason.');
      console.error('   Check the error message above for details.');
    }

    process.exit(1);
  }

  const assignment = await installRes.json();
  console.log('✅ Template pack installed successfully!');
  console.log(`   Assignment ID: ${assignment.id}`);
  console.log(`   Is Enabled: ${assignment.isEnabled}`);
  console.log(`   Project ID: ${assignment.projectId}`);
  console.log(`   Template Pack ID: ${assignment.templatePackId}\n`);

  // Step 5: Verify installation
  console.log('5️⃣  Verifying installation...');
  const verifyRes = await fetch(
    `${SERVER_URL}/projects/${project.id}/template-packs`,
    {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'x-project-id': project.id,
      },
    }
  );

  if (!verifyRes.ok) {
    console.error('❌ Failed to verify installation:', await verifyRes.text());
    process.exit(1);
  }

  const installedPacks = await verifyRes.json();
  const isInstalled = installedPacks.some((p) => p.id === DEMO_PACK_ID);

  if (!isInstalled) {
    console.error("❌ Pack not found in project's installed packs");
    process.exit(1);
  }

  console.log('✅ Installation verified - pack appears in project\n');
  console.log('🎉 ALL TESTS PASSED!');
  console.log(
    '   The fix works correctly - organization ID is auto-derived from project.'
  );
}

main().catch((error) => {
  console.error('\n💥 Unexpected error:', error.message);
  if (error.stack) {
    console.error('\nStack trace:');
    console.error(error.stack);
  }
  process.exit(1);
});
