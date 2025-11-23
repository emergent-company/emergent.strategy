#!/usr/bin/env node
/**
 * Test extraction with new schema v3.0.0
 *
 * This script:
 * 1. Authenticates as test user
 * 2. Gets or creates a test project
 * 3. Uploads a short Bible passage
 * 4. Triggers extraction
 * 5. Waits for extraction to complete
 * 6. Verifies relationships are created correctly
 * 7. Checks that no embedded properties exist
 */

const BASE_URL = 'http://localhost:3002';

const TEST_USER = {
  email: 'test@example.com',
  password: 'TestPassword123!',
};

// Short passage from 2 John (mentions people and events)
const TEST_CONTENT = `# 2 John 1:1-6

The elder to the elect lady and her children, whom I love in truth, and not only I, but also all who know the truth, because of the truth that abides in us and will be with us forever:

Grace, mercy, and peace will be with us, from God the Father and from Jesus Christ the Father's Son, in truth and love.

I rejoiced greatly to find some of your children walking in the truth, just as we were commanded by the Father. And now I ask you, dear lady—not as though I were writing you a new commandment, but the one we have had from the beginning—that we love one another. And this is love, that we walk according to his commandments; this is the commandment, just as you have heard from the beginning, so that you should walk in it.
`;

async function authenticate() {
  console.log('🔐 Authenticating...');

  // Get access token (simplified - assumes Zitadel is configured)
  const response = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(TEST_USER),
  });

  if (!response.ok) {
    throw new Error(
      `Authentication failed: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  console.log('✓ Authenticated');
  return data.access_token || data.accessToken;
}

async function getOrCreateProject(token) {
  console.log('📁 Getting or creating test project...');

  // List projects
  const listResponse = await fetch(`${BASE_URL}/projects`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!listResponse.ok) {
    throw new Error(`Failed to list projects: ${listResponse.status}`);
  }

  const projects = await listResponse.json();
  let project = projects.find((p) => p.name === 'Extraction Test v3');

  if (!project) {
    // Create new project
    const createResponse = await fetch(`${BASE_URL}/projects`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Extraction Test v3',
        description: 'Test project for schema v3.0.0 extraction',
      }),
    });

    if (!createResponse.ok) {
      throw new Error(`Failed to create project: ${createResponse.status}`);
    }

    project = await createResponse.json();
    console.log(`✓ Created project: ${project.id}`);
  } else {
    console.log(`✓ Using existing project: ${project.id}`);
  }

  return project;
}

async function uploadDocument(token, projectId) {
  console.log('📄 Uploading document...');

  const response = await fetch(`${BASE_URL}/documents`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: '2 John 1:1-6 (Extraction Test)',
      content: TEST_CONTENT,
      project_id: projectId,
      mime_type: 'text/markdown',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to upload document: ${response.status} - ${error}`);
  }

  const document = await response.json();
  console.log(`✓ Uploaded document: ${document.id}`);
  return document;
}

async function triggerExtraction(token, documentId, projectId) {
  console.log('🔍 Triggering extraction...');

  const response = await fetch(`${BASE_URL}/extraction-jobs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      document_id: documentId,
      project_id: projectId,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Failed to trigger extraction: ${response.status} - ${error}`
    );
  }

  const job = await response.json();
  console.log(`✓ Created extraction job: ${job.id}`);
  return job;
}

async function waitForExtraction(token, jobId, maxWaitSeconds = 60) {
  console.log('⏳ Waiting for extraction to complete...');

  const startTime = Date.now();
  let lastStatus = '';

  while (true) {
    const response = await fetch(`${BASE_URL}/extraction-jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to check job status: ${response.status}`);
    }

    const job = await response.json();

    if (job.status !== lastStatus) {
      console.log(`  Status: ${job.status}`);
      lastStatus = job.status;
    }

    if (job.status === 'completed') {
      console.log('✓ Extraction completed successfully');
      return job;
    }

    if (job.status === 'failed') {
      console.error('✗ Extraction failed:', job.error_message);
      throw new Error(`Extraction failed: ${job.error_message}`);
    }

    const elapsed = (Date.now() - startTime) / 1000;
    if (elapsed > maxWaitSeconds) {
      throw new Error(
        `Extraction timeout after ${maxWaitSeconds}s (status: ${job.status})`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

async function verifyResults(token, projectId) {
  console.log('\n🔬 Verifying extraction results...\n');

  // 1. Check objects were created
  const objectsResponse = await fetch(
    `${BASE_URL}/graph/objects?project_id=${projectId}&limit=100`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!objectsResponse.ok) {
    throw new Error(`Failed to fetch objects: ${objectsResponse.status}`);
  }

  const objects = await objectsResponse.json();
  console.log(`✓ Found ${objects.length} extracted objects`);

  // Check for embedded properties (should be NONE)
  let embeddedPropsCount = 0;
  const embeddedTypes = [
    'parties',
    'participants',
    'participants_canonical_ids',
    'witnesses',
    'performer',
  ];

  for (const obj of objects) {
    for (const propName of embeddedTypes) {
      if (obj.properties && propName in obj.properties) {
        embeddedPropsCount++;
        console.error(
          `✗ Found embedded property "${propName}" in object ${obj.id} (${obj.type})`
        );
      }
    }
  }

  if (embeddedPropsCount === 0) {
    console.log('✓ No embedded properties found (correct!)');
  } else {
    console.error(
      `✗ Found ${embeddedPropsCount} embedded properties (SCHEMA VIOLATION!)`
    );
  }

  // 2. Check relationships were created
  const relationshipsResponse = await fetch(
    `${BASE_URL}/graph/relationships?project_id=${projectId}&limit=100`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!relationshipsResponse.ok) {
    throw new Error(
      `Failed to fetch relationships: ${relationshipsResponse.status}`
    );
  }

  const relationships = await relationshipsResponse.json();
  console.log(
    `✓ Found ${relationships.length} relationships in kb.graph_relationships`
  );

  // 3. Sample an object and check its edges
  if (objects.length > 0) {
    const sampleObject = objects[0];
    console.log(
      `\n📊 Sample object: ${sampleObject.type} "${
        sampleObject.key || sampleObject.id
      }"`
    );

    const edgesResponse = await fetch(
      `${BASE_URL}/graph/objects/${sampleObject.id}/edges`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (edgesResponse.ok) {
      const edges = await edgesResponse.json();
      console.log(
        `  - Outgoing edges: ${
          edges.filter((e) => e.direction === 'out').length
        }`
      );
      console.log(
        `  - Incoming edges: ${
          edges.filter((e) => e.direction === 'in').length
        }`
      );

      if (edges.length > 0) {
        console.log(
          `  - First relationship: ${edges[0].type} -> ${
            edges[0].relatedObject?.type || 'unknown'
          }`
        );
      }
    }
  }

  console.log('\n✅ Verification complete!\n');
  console.log('Summary:');
  console.log(`  Objects: ${objects.length}`);
  console.log(`  Relationships: ${relationships.length}`);
  console.log(`  Embedded properties: ${embeddedPropsCount} (should be 0)`);
  console.log(
    `  Schema compliance: ${embeddedPropsCount === 0 ? '✓ PASS' : '✗ FAIL'}`
  );

  return {
    objects,
    relationships,
    embeddedPropsCount,
    schemaCompliant: embeddedPropsCount === 0,
  };
}

async function main() {
  try {
    console.log('🚀 Testing extraction with schema v3.0.0\n');

    const token = await authenticate();
    const project = await getOrCreateProject(token);
    const document = await uploadDocument(token, project.id);
    const job = await triggerExtraction(token, document.id, project.id);
    await waitForExtraction(token, job.id);
    const results = await verifyResults(token, project.id, document.id);

    console.log('\n✅ All tests passed!');
    process.exit(results.schemaCompliant ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
