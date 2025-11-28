#!/usr/bin/env node
/**
 * Reset stuck extraction job
 */

import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  host: 'localhost',
  port: 5437,
  database: 'spec',
  user: 'spec',
  password: 'spec',
});

async function resetStuckJob(jobId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE kb.object_extraction_jobs 
       SET status = 'failed',
           error_message = $2,
           error_details = jsonb_build_object(
             'error_type', 'vertex_api_error',
             'error_code', 500,
             'stuck_duration_minutes', EXTRACT(EPOCH FROM (NOW() - updated_at))/60,
             'manually_reset_at', NOW()
           ),
           updated_at = NOW(),
           completed_at = NOW()
       WHERE id = $1
       RETURNING id, status, error_message`,
      [
        jobId,
        'Google Vertex AI API returned 500 Internal Server Error. Job manually reset.',
      ]
    );

    if (result.rowCount === 0) {
      console.log(`❌ Job ${jobId} not found`);
      return false;
    }

    const job = result.rows[0];
    console.log(`✅ Job ${job.id} reset to status: ${job.status}`);
    console.log(`   Error: ${job.error_message}`);
    return true;
  } finally {
    client.release();
  }
}

const jobId = process.argv[2] || 'c110f3ee-20f6-4dd5-9233-82caf239155d';

resetStuckJob(jobId)
  .then(() => {
    console.log('\n✅ Done');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Error:', err.message);
    console.error('Stack:', err.stack);
    console.error('Full error:', err);
    process.exit(1);
  });
