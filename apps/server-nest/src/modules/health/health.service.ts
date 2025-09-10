import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';

@Injectable()
export class HealthService {
    constructor(private readonly db: DatabaseService) { }

    get() {
        return {
            ok: true,
            model: 'gemini-1.5',
            db: this.db.isOnline() ? 'up' : 'down',
        };
    }
}
