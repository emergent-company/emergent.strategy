import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { AppConfigService } from '../../common/config/config.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: AppConfigService
  ) {}

  get() {
    const base = {
      ok: true,
      model: this.config.embeddingsEnabled ? 'text-embedding-004' : null,
      db: this.db.isOnline() ? 'up' : 'down',
      embeddings: this.config.embeddingsEnabled ? 'enabled' : 'disabled',
    } as any;
    if (
      this.db.isOnline() &&
      typeof (this.db as any).getRlsPolicyStatus === 'function'
    ) {
      // Fire and forget; do not let a failure in status query break health response
      return (async () => {
        const rls = await (this.db as any).getRlsPolicyStatus();
        return {
          ...base,
          rls_policies_ok: rls.policies_ok,
          rls_policy_count: rls.count,
          rls_policy_hash: rls.hash,
        };
      })();
    }
    return base;
  }
}
