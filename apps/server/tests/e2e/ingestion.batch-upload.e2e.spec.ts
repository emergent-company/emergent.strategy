import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import {
  uploadBatch,
  uploadBatchExpectError,
  uploadText,
} from './utils/ingestion';

// Batch upload e2e tests:
// 1. Successfully upload multiple files
// 2. Handle duplicate detection in batch
// 3. Handle mixed results (success + duplicate)
// 4. Reject batch with no files
// 5. Handle empty file content in batch (partial success)

let ctx: E2EContext;

describe('Batch Upload E2E', () => {
  beforeAll(async () => {
    ctx = await createE2EContext('batch-upload');
  });
  beforeEach(async () => {
    await ctx.cleanup();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('successfully uploads multiple files', async () => {
    const result = await uploadBatch(
      ctx,
      [
        {
          content: 'First document content for batch test',
          filename: 'batch-doc1.txt',
        },
        {
          content: 'Second document content for batch test',
          filename: 'batch-doc2.txt',
        },
      ],
      { userSuffix: 'batch-upload' }
    );

    expect(result.status).toBe(201);
    expect(result.json.summary).toBeDefined();
    expect(result.json.summary?.total).toBe(2);
    expect(result.json.summary?.successful).toBe(2);
    expect(result.json.summary?.duplicates).toBe(0);
    expect(result.json.summary?.failed).toBe(0);
    expect(result.json.results).toHaveLength(2);
    expect(result.json.results?.[0].status).toBe('success');
    expect(result.json.results?.[1].status).toBe('success');
    expect(result.json.results?.[0].documentId).toBeDefined();
    expect(result.json.results?.[1].documentId).toBeDefined();
  });

  it('detects duplicates in batch upload', async () => {
    // First, upload a document
    const first = await uploadText(
      ctx,
      'This is duplicate content for batch test',
      {
        filename: 'original',
        userSuffix: 'batch-upload',
      }
    );
    expect(first.status).toBe(201);

    // Now try to upload the same content in a batch
    const result = await uploadBatch(
      ctx,
      [
        {
          content: 'This is duplicate content for batch test',
          filename: 'dup-in-batch.txt',
        },
      ],
      { userSuffix: 'batch-upload' }
    );

    expect(result.status).toBe(201);
    expect(result.json.summary?.total).toBe(1);
    expect(result.json.summary?.successful).toBe(0);
    expect(result.json.summary?.duplicates).toBe(1);
    expect(result.json.summary?.failed).toBe(0);
    expect(result.json.results?.[0].status).toBe('duplicate');
    expect(result.json.results?.[0].documentId).toBe(first.json.documentId);
  });

  it('handles mixed results in batch upload', async () => {
    // First, upload a document that will be duplicated
    const first = await uploadText(
      ctx,
      'Existing content for mixed batch test',
      {
        filename: 'existing',
        userSuffix: 'batch-upload',
      }
    );
    expect(first.status).toBe(201);

    // Upload batch with one new and one duplicate
    const result = await uploadBatch(
      ctx,
      [
        {
          content: 'Brand new content for mixed batch test',
          filename: 'new-file.txt',
        },
        {
          content: 'Existing content for mixed batch test',
          filename: 'dup-file.txt',
        },
      ],
      { userSuffix: 'batch-upload' }
    );

    expect(result.status).toBe(201);
    expect(result.json.summary?.total).toBe(2);
    expect(result.json.summary?.successful).toBe(1);
    expect(result.json.summary?.duplicates).toBe(1);
    expect(result.json.summary?.failed).toBe(0);

    const successResult = result.json.results?.find(
      (r) => r.status === 'success'
    );
    const dupResult = result.json.results?.find(
      (r) => r.status === 'duplicate'
    );

    expect(successResult).toBeDefined();
    expect(successResult?.filename).toBe('new-file.txt');
    expect(dupResult).toBeDefined();
    expect(dupResult?.filename).toBe('dup-file.txt');
    expect(dupResult?.documentId).toBe(first.json.documentId);
  });

  it('rejects batch with no files', async () => {
    const result = await uploadBatchExpectError(
      ctx,
      () => {
        // Don't add any files
      },
      { userSuffix: 'batch-upload' }
    );

    expect(result.status).toBe(400);
    expect(result.json.error?.code).toBe('files-required');
  });

  it('handles empty file content in batch (partial success)', async () => {
    const result = await uploadBatch(
      ctx,
      [
        { content: '   ', filename: 'empty.txt' }, // Empty/whitespace content
        {
          content: 'Valid content for partial batch test',
          filename: 'valid.txt',
        },
      ],
      { userSuffix: 'batch-upload' }
    );

    expect(result.status).toBe(201);
    expect(result.json.summary?.total).toBe(2);
    expect(result.json.summary?.successful).toBe(1);
    expect(result.json.summary?.failed).toBe(1);

    const failedResult = result.json.results?.find(
      (r) => r.status === 'failed'
    );
    const successResult = result.json.results?.find(
      (r) => r.status === 'success'
    );

    expect(failedResult).toBeDefined();
    expect(failedResult?.filename).toBe('empty.txt');
    expect(failedResult?.error).toContain('empty');
    expect(successResult).toBeDefined();
    expect(successResult?.filename).toBe('valid.txt');
  });

  it('uploads a larger batch of files', async () => {
    const files = Array.from({ length: 5 }, (_, i) => ({
      content: `Content for batch file number ${i + 1} with unique text`,
      filename: `batch-file-${i + 1}.txt`,
    }));

    const result = await uploadBatch(ctx, files, {
      userSuffix: 'batch-upload',
    });

    expect(result.status).toBe(201);
    expect(result.json.summary?.total).toBe(5);
    expect(result.json.summary?.successful).toBe(5);
    expect(result.json.summary?.duplicates).toBe(0);
    expect(result.json.summary?.failed).toBe(0);
    expect(result.json.results).toHaveLength(5);

    // Verify all files were processed
    for (let i = 0; i < 5; i++) {
      const res = result.json.results?.find(
        (r) => r.filename === `batch-file-${i + 1}.txt`
      );
      expect(res).toBeDefined();
      expect(res?.status).toBe('success');
      expect(res?.documentId).toBeDefined();
    }
  });
});
