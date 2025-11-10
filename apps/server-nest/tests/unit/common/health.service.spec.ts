import { describe, it, expect } from 'vitest';
import { HealthService } from '../../../src/modules/health/health.service';

class FakeDb {
  constructor(
    private online: boolean,
    private rlsOk = true,
    private rlsCount = 8
  ) {}
  isOnline() {
    return this.online;
  }
  async getRlsPolicyStatus() {
    return {
      policies_ok: this.rlsOk,
      count: this.rlsCount,
      hash: 'policies:test',
    };
  }
}
class FakeConfig {
  constructor(public embeddingsEnabled: boolean) {}
}

describe('HealthService', () => {
  it('reports embeddings enabled and db up incl RLS status', async () => {
    const svc = new HealthService(
      new FakeDb(true) as any,
      new FakeConfig(true) as any
    );
    const res = await svc.get();
    expect(res).toEqual({
      ok: true,
      model: 'text-embedding-004',
      db: 'up',
      embeddings: 'enabled',
      rls_policies_ok: true,
      rls_policy_count: 8,
      rls_policy_hash: 'policies:test',
    });
  });
  it('reports embeddings disabled and db down (no RLS fields when offline)', async () => {
    const svc = new HealthService(
      new FakeDb(false) as any,
      new FakeConfig(false) as any
    );
    const res = await svc.get();
    expect(res).toEqual({
      ok: true,
      model: null,
      db: 'down',
      embeddings: 'disabled',
    });
  });
});
