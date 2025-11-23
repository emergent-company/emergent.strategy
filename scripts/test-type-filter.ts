import { Pool } from 'pg';
import { GoogleAuth } from 'google-auth-library';

const pool = new Pool({
  host: 'localhost',
  port: 5438,
  user: 'spec',
  password: 'spec',
  database: 'spec_e2e'
});

async function generateEmbedding(text: string): Promise<number[]> {
  const projectId = process.env.VERTEX_EMBEDDING_PROJECT;
  const location = process.env.VERTEX_EMBEDDING_LOCATION || 'europe-north1';
  const model = process.env.VERTEX_EMBEDDING_MODEL || 'text-embedding-004';

  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;

  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instances: [{ content: text }],
    }),
  });

  const result = await response.json();
  return result.predictions[0].embeddings.values;
}

async function test() {
  try {
    console.log('Generating embedding for "software engineer"...');
    const embedding = await generateEmbedding('software engineer');
    const vectorLiteral = `[${embedding.join(',')}]`;
    
    console.log('\nQuerying with type=Person filter...');
    const result = await pool.query(`
      SELECT id, type, key, properties, (embedding_v2 <=> $1::vector(768)) as distance
      FROM kb.graph_objects
      WHERE embedding_v2 IS NOT NULL AND type = 'Person'
      ORDER BY embedding_v2 <=> $1::vector(768)
      LIMIT 10
    `, [vectorLiteral]);
    
    console.log(`\nFound ${result.rows.length} results:`);
    result.rows.forEach((row, i) => {
      console.log(`  ${i+1}. ${row.key} (${row.type}) - distance: ${row.distance.toFixed(4)}`);
      console.log(`     Properties: ${JSON.stringify(row.properties)}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

test();
