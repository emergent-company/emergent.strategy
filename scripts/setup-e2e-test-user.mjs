#!/usr/bin/env node
/**
 * Setup script for E2E test user
 * Creates an organization and project for the test user
 */

import 'dotenv/config';

const API_URL = process.env.VITE_API_URL || 'http://localhost:3002';
const TEST_EMAIL = process.env.E2E_LOGIN_EMAIL || 'test@example.com';
const TEST_PASSWORD = process.env.E2E_LOGIN_PASSWORD || 'TestPassword123!';
const ZITADEL_ISSUER =
  process.env.VITE_ZITADEL_ISSUER || 'http://localhost:8200';
const ZITADEL_CLIENT_ID = process.env.VITE_ZITADEL_CLIENT_ID;

console.log('E2E Test User Setup');
console.log('==================');
console.log(`API URL: ${API_URL}`);
console.log(`Test Email: ${TEST_EMAIL}`);
console.log(`Zitadel Issuer: ${ZITADEL_ISSUER}`);

if (!ZITADEL_CLIENT_ID) {
  console.error('ERROR: VITE_ZITADEL_CLIENT_ID is not set');
  process.exit(1);
}

async function getAccessToken() {
  // Use Zitadel Resource Owner Password Credentials (ROPC) flow
  const tokenUrl = `${ZITADEL_ISSUER}/oauth/v2/token`;

  const params = new URLSearchParams({
    grant_type: 'password',
    username: TEST_EMAIL,
    password: TEST_PASSWORD,
    client_id: ZITADEL_CLIENT_ID,
    scope: 'openid profile email',
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get access token: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function createOrganization(accessToken, name) {
  const response = await fetch(`${API_URL}/orgs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Failed to create organization: ${response.status} ${error}`
    );
  }

  return await response.json();
}

async function createProject(accessToken, orgId, name) {
  const response = await fetch(`${API_URL}/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ name, orgId }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create project: ${response.status} ${error}`);
  }

  return await response.json();
}

async function getOrganizations(accessToken) {
  const response = await fetch(`${API_URL}/orgs`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get organizations: ${response.status} ${error}`);
  }

  return await response.json();
}

async function getProjects(accessToken) {
  const response = await fetch(`${API_URL}/projects`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get projects: ${response.status} ${error}`);
  }

  return await response.json();
}

async function main() {
  try {
    console.log('\n1. Getting access token...');
    const accessToken = await getAccessToken();
    console.log('✓ Access token obtained');

    console.log('\n2. Checking existing organizations...');
    const existingOrgs = await getOrganizations(accessToken);
    console.log(`Found ${existingOrgs.length} existing organization(s)`);

    let org;
    if (existingOrgs.length > 0) {
      org = existingOrgs[0];
      console.log(`✓ Using existing organization: ${org.name} (${org.id})`);
    } else {
      console.log('Creating new organization...');
      org = await createOrganization(accessToken, 'E2E Test Organization');
      console.log(`✓ Organization created: ${org.name} (${org.id})`);
    }

    console.log('\n3. Checking existing projects...');
    const existingProjects = await getProjects(accessToken);
    console.log(`Found ${existingProjects.length} existing project(s)`);

    let project;
    if (existingProjects.length > 0) {
      project = existingProjects[0];
      console.log(`✓ Using existing project: ${project.name} (${project.id})`);
    } else {
      console.log('Creating new project...');
      project = await createProject(accessToken, org.id, 'E2E Test Project');
      console.log(`✓ Project created: ${project.name} (${project.id})`);
    }

    console.log('\n✅ E2E test user setup complete!');
    console.log(`Organization: ${org.name} (${org.id})`);
    console.log(`Project: ${project.name} (${project.id})`);
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  }
}

main();
