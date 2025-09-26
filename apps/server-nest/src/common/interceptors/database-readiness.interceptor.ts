import { CallHandler, ExecutionContext, Injectable, NestInterceptor, ServiceUnavailableException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { DatabaseService } from '../database/database.service';

/**
 * Ensures that if the database is online but schema has not been ensured (e.g., autoInit disabled
 * or failed early), user requests receive a clear 503 with remediation guidance instead of a cascade
 * of relation/column does not exist 500 errors.
 */
@Injectable()
export class DatabaseReadinessInterceptor implements NestInterceptor {
    constructor(private readonly db: DatabaseService) { }
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        if (this.db.isOnline() && !this.db.hasSchema()) {
            throw new ServiceUnavailableException({
                error: {
                    code: 'db-schema-not-ready',
                    message: 'Database schema not initialized. Set DB_AUTOINIT=true or run manual migration/init routine before serving requests.'
                }
            });
        }
        return next.handle();
    }
}
