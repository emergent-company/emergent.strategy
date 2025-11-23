import { Pool } from 'pg';
import { GoogleAuth } from 'google-auth-library';

const pool = new Pool({
  host: 'localhost',
  port: 5438,
  user: 'spec',
  password: 'spec',
  database: 'spec_e2e',
});

async function generateEmbedding(text: string): Promise<number[]> {
  const projectId = process.env.VERTEX_EMBEDDING_PROJECT;
  const location = process.env.VERTEX_EMBEDDING_LOCATION || 'europe-north1';
  const model = process.env.VERTEX_EMBEDDING_MODEL || 'text-embedding-004';

  if (!projectId) {
    throw new Error(
      'VERTEX_EMBEDDING_PROJECT environment variable is required'
    );
  }

  // Use REST API approach (same as GoogleVertexEmbeddingProvider)
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;

  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();

  if (!accessToken.token) {
    throw new Error('Failed to get access token from Google Auth');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instances: [{ content: text }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Vertex AI API error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const result = await response.json();
  return result.predictions[0].embeddings.values;
}

async function seed() {
  try {
    console.log('🌱 Seeding E2E database with test objects...');

    // Create test organization
    const org = await pool.query(`
      INSERT INTO kb.orgs (id, name, created_at, updated_at)
      VALUES (gen_random_uuid(), 'Test Org', NOW(), NOW())
      RETURNING id
    `);
    const orgId = org.rows[0].id;
    console.log(`  ✅ Created org: ${orgId}`);

    // Create test project
    const proj = await pool.query(
      `
      INSERT INTO kb.projects (id, name, organization_id, created_at, updated_at)
      VALUES (gen_random_uuid(), 'Test Project', $1, NOW(), NOW())
      RETURNING id
    `,
      [orgId]
    );
    const projectId = proj.rows[0].id;
    console.log(`  ✅ Created project: ${projectId}`);

    // Seed diverse test objects with embeddings
    // Biblical/religious content to match test queries
    const testData = [
      // Person objects (biblical figures) - need at least 5 for type filter test
      {
        type: 'Person',
        key: 'moses',
        properties: {
          name: 'Moses',
          role: 'Prophet who spoke to the people',
          description:
            'Led the Israelites out of Egypt and received the Ten Commandments',
        },
      },
      {
        type: 'Person',
        key: 'abraham',
        properties: {
          name: 'Abraham',
          role: 'Father of faith',
          description:
            'Made a covenant with God and is ancestor of many nations',
        },
      },
      {
        type: 'Person',
        key: 'elijah',
        properties: {
          name: 'Elijah',
          role: 'Prophet and miracle worker',
          description: 'Performed miracles and confronted false prophets',
        },
      },
      {
        type: 'Person',
        key: 'jesus',
        properties: {
          name: 'Jesus',
          role: 'Messiah and healer',
          description:
            'Performed miracles of healing the sick and demonstrated divine power',
        },
      },
      {
        type: 'Person',
        key: 'paul',
        properties: {
          name: 'Paul',
          role: 'Apostle and teacher',
          description:
            'Spread the message of faith and belief in divine salvation',
        },
      },
      {
        type: 'Person',
        key: 'noah',
        properties: {
          name: 'Noah',
          role: 'Righteous man saved by God',
          description:
            'Survived the flood through divine intervention and salvation',
        },
      },

      // Events - miracles and divine intervention
      {
        type: 'Event',
        key: 'parting-red-sea',
        properties: {
          name: 'Parting of the Red Sea',
          description:
            'Divine intervention where God parted the sea for the Israelites to escape',
          category: 'miracle',
        },
      },
      {
        type: 'Event',
        key: 'healing-blind',
        properties: {
          name: 'Healing of the Blind',
          description:
            'Jesus performed miracle of healing, restoring sight to the blind',
          category: 'miracle and healing of the sick',
        },
      },
      {
        type: 'Event',
        key: 'resurrection',
        properties: {
          name: 'Resurrection',
          description:
            'The ultimate divine intervention and demonstration of power over death',
          category: 'miracle',
        },
      },

      // Concepts - faith, covenant, promises
      {
        type: 'Concept',
        key: 'covenant-abraham',
        properties: {
          name: 'Abrahamic Covenant',
          description:
            'Promise and covenant with ancestors that established Gods relationship with humanity',
          theme: 'covenant',
        },
      },
      {
        type: 'Concept',
        key: 'faith-salvation',
        properties: {
          name: 'Faith and Salvation',
          description:
            'Belief in divine power leads to salvation and eternal life',
          theme: 'faith and belief',
        },
      },
      {
        type: 'Concept',
        key: 'divine-promise',
        properties: {
          name: 'Divine Promises',
          description:
            'Gods promises to his people throughout history, covenant between God and people',
          theme: 'promise and covenant',
        },
      },

      // Documents - scriptures and teachings
      {
        type: 'Document',
        key: 'exodus',
        properties: {
          name: 'Book of Exodus',
          description:
            'Story of Moses leading the people and the covenant at Sinai',
          theme: 'deliverance',
        },
      },
      {
        type: 'Document',
        key: 'psalms',
        properties: {
          name: 'Book of Psalms',
          description:
            'Songs and prayers expressing faith and belief in divine power',
          theme: 'worship',
        },
      },
      {
        type: 'Document',
        key: 'gospel-mark',
        properties: {
          name: 'Gospel of Mark',
          description:
            'Account of Jesus ministry including miracles and healings',
          theme: 'good news',
        },
      },
    ];

    for (const item of testData) {
      const text = `${item.type}: ${JSON.stringify(item.properties)}`;
      console.log(`  Generating embedding for: ${item.key}...`);
      const embedding = await generateEmbedding(text);

      await pool.query(
        `
        INSERT INTO kb.graph_objects (
          id, project_id, type, key, canonical_id, properties, 
          embedding_v2, created_at, updated_at
        )
        VALUES (
          gen_random_uuid(), $1, $2, $3, gen_random_uuid(), $4, 
          $5::vector(768), NOW(), NOW()
        )
      `,
        [
          projectId,
          item.type,
          item.key,
          item.properties,
          `[${embedding.join(',')}]`,
        ]
      );
    }

    console.log(`✅ Seeded ${testData.length} objects with embeddings`);

    // Verify
    const count = await pool.query(`
      SELECT COUNT(*) as count FROM kb.graph_objects WHERE embedding_v2 IS NOT NULL
    `);
    console.log(`✅ Total objects with embeddings: ${count.rows[0].count}`);

    // Show breakdown by type
    const breakdown = await pool.query(`
      SELECT type, COUNT(*) as count 
      FROM kb.graph_objects 
      WHERE embedding_v2 IS NOT NULL
      GROUP BY type
      ORDER BY count DESC
    `);
    console.log('  Breakdown by type:');
    breakdown.rows.forEach((row) => {
      console.log(`    - ${row.type}: ${row.count}`);
    });
  } catch (error) {
    console.error('❌ Error seeding:', error);
  } finally {
    await pool.end();
  }
}

seed();
