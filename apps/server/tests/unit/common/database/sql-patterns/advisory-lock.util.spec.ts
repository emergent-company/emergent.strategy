import { PoolClient } from 'pg';
import { vi } from 'vitest';
import {
  acquireAdvisoryLock,
  acquireAdvisoryLockInTransaction,
  generateLockKey,
} from '../../../../../src/common/database/sql-patterns/advisory-lock.util';

describe('AdvisoryLockUtil', () => {
  describe('generateLockKey', () => {
    it('should return the input key unchanged', () => {
      const key = 'tag|project123|tagname';
      expect(generateLockKey(key)).toBe(key);
    });

    it('should handle different key formats', () => {
      expect(generateLockKey('resource1')).toBe('resource1');
      expect(generateLockKey('project|user|action')).toBe(
        'project|user|action'
      );
      expect(generateLockKey('')).toBe('');
    });
  });

  describe('acquireAdvisoryLock', () => {
    let mockClient: any;

    beforeEach(() => {
      mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        release: vi.fn(),
      } as any;
    });

    it('should begin transaction, acquire lock, execute function, and commit', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const lockKey = 'tag|project123|tagname';

      const result = await acquireAdvisoryLock(mockClient, lockKey, fn);

      expect(result).toBe('success');
      expect(mockClient.query).toHaveBeenCalledTimes(3);
      expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(mockClient.query).toHaveBeenNthCalledWith(
        2,
        'SELECT pg_advisory_xact_lock(hashtext($1)::bigint)',
        [lockKey]
      );
      expect(mockClient.query).toHaveBeenNthCalledWith(3, 'COMMIT');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should rollback transaction on error', async () => {
      const error = new Error('Function failed');
      const fn = vi.fn().mockRejectedValue(error);
      const lockKey = 'tag|project123|tagname';

      await expect(
        acquireAdvisoryLock(mockClient, lockKey, fn)
      ).rejects.toThrow('Function failed');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock(hashtext($1)::bigint)',
        [lockKey]
      );
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle rollback errors gracefully', async () => {
      const functionError = new Error('Function failed');
      const rollbackError = new Error('Rollback failed');
      const fn = vi.fn().mockRejectedValue(functionError);

      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // LOCK
        .mockRejectedValueOnce(rollbackError); // ROLLBACK

      await expect(acquireAdvisoryLock(mockClient, 'key', fn)).rejects.toThrow(
        'Function failed'
      );

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should propagate the result from the function', async () => {
      const expectedResult = { id: '123', name: 'test' };
      const fn = vi.fn().mockResolvedValue(expectedResult);

      const result = await acquireAdvisoryLock(mockClient, 'key', fn);

      expect(result).toEqual(expectedResult);
    });

    it('should use correct lock key format', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const projectId = 'project-abc';
      const name = 'MyTagName';
      const lockKey = `tag|${projectId}|${name.toLowerCase()}`;

      await acquireAdvisoryLock(mockClient, lockKey, fn);

      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock(hashtext($1)::bigint)',
        ['tag|project-abc|mytagname']
      );
    });
  });

  describe('acquireAdvisoryLockInTransaction', () => {
    let mockClient: any;

    beforeEach(() => {
      mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        release: vi.fn(),
      } as any;
    });

    it('should only acquire lock without transaction management', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const lockKey = 'resource1';

      const result = await acquireAdvisoryLockInTransaction(
        mockClient,
        lockKey,
        fn
      );

      expect(result).toBe('success');
      expect(mockClient.query).toHaveBeenCalledTimes(1);
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock(hashtext($1)::bigint)',
        [lockKey]
      );
      expect(fn).toHaveBeenCalledTimes(1);
      // Should NOT call BEGIN or COMMIT
      expect(mockClient.query).not.toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
    });

    it('should propagate errors without rollback', async () => {
      const error = new Error('Function failed');
      const fn = vi.fn().mockRejectedValue(error);

      await expect(
        acquireAdvisoryLockInTransaction(mockClient, 'key', fn)
      ).rejects.toThrow('Function failed');

      expect(mockClient.query).toHaveBeenCalledTimes(1);
      expect(mockClient.query).not.toHaveBeenCalledWith('ROLLBACK');
    });

    it('should propagate the result from the function', async () => {
      const expectedResult = { data: 'test' };
      const fn = vi.fn().mockResolvedValue(expectedResult);

      const result = await acquireAdvisoryLockInTransaction(
        mockClient,
        'key',
        fn
      );

      expect(result).toEqual(expectedResult);
    });
  });

  describe('Integration scenarios', () => {
    let mockClient: any;

    beforeEach(() => {
      mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        release: vi.fn(),
      } as any;
    });

    it('should handle duplicate prevention scenario', async () => {
      const projectId = 'project123';
      const tagName = 'v1.0';
      const lockKey = `tag|${projectId}|${tagName.toLowerCase()}`;

      // Simulate duplicate check and insert
      const fn = vi.fn().mockImplementation(async () => {
        // Check for existing
        await mockClient.query('SELECT id FROM kb.tags WHERE ...');
        // Insert new
        await mockClient.query('INSERT INTO kb.tags ...');
        return { id: 'new-tag-id', name: tagName };
      });

      const result = await acquireAdvisoryLock(mockClient, lockKey, fn);

      expect(result).toEqual({ id: 'new-tag-id', name: tagName });
      // BEGIN + LOCK + fn queries (SELECT + INSERT) + COMMIT = 5
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock(hashtext($1)::bigint)',
        [lockKey]
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should handle concurrent updates with different lock keys', async () => {
      const fn1 = vi.fn().mockResolvedValue('result1');
      const fn2 = vi.fn().mockResolvedValue('result2');

      // Simulate concurrent operations with different locks
      const [result1, result2] = await Promise.all([
        acquireAdvisoryLock(mockClient, 'resource1', fn1),
        acquireAdvisoryLock(mockClient, 'resource2', fn2),
      ]);

      expect(result1).toBe('result1');
      expect(result2).toBe('result2');
      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
    });

    it('should handle nested transaction scenario with in-transaction variant', async () => {
      // Outer transaction managed manually
      mockClient.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      }); // BEGIN

      const innerFn1 = vi.fn().mockResolvedValue('inner1');
      const innerFn2 = vi.fn().mockResolvedValue('inner2');

      // Simulate manual transaction with multiple locks
      await mockClient.query('BEGIN');

      const result1 = await acquireAdvisoryLockInTransaction(
        mockClient,
        'lock1',
        innerFn1
      );

      const result2 = await acquireAdvisoryLockInTransaction(
        mockClient,
        'lock2',
        innerFn2
      );

      await mockClient.query('COMMIT');

      expect(result1).toBe('inner1');
      expect(result2).toBe('inner2');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });
  });
});
