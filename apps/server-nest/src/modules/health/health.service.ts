import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { AppConfigService } from '../../common/config/config.service';

@Injectable()
export class HealthService {
    constructor(private readonly db: DatabaseService, private readonly config: AppConfigService) { }

    get() {
        return {
            ok: true,
            model: this.config.embeddingsEnabled ? 'text-embedding-004' : null,
            db: this.db.isOnline() ? 'up' : 'down',
            embeddings: this.config.embeddingsEnabled ? 'enabled' : 'disabled',
        };
    }
}
