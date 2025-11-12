import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOkResponse({
    description: 'Health probe',
    schema: {
      example: {
        ok: true,
        model: 'text-embedding-004',
        db: 'up',
        embeddings: 'enabled',
        rls_policies_ok: true,
        rls_policy_count: 8,
        rls_policy_hash: 'policies:123:1a2b',
      },
    },
  })
  @ApiStandardErrors({ unauthorized: false, forbidden: false })
  get(): any {
    return this.health.get();
  }
}
