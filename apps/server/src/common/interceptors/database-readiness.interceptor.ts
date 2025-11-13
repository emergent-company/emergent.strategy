import { CallHandler, ExecutionContext, Injectable, NestInterceptor, ServiceUnavailableException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { DatabaseService } from '../database/database.service';

/**
 * Ensures that if the database is not online, user requests receive a clear 503
 * instead of cascading errors. Schema is now managed entirely by migrations,
 * so we only check database connectivity.
 */
@Injectable()
export class DatabaseReadinessInterceptor implements NestInterceptor {
    constructor(private readonly db: DatabaseService) { }
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        if (!this.db.isOnline()) {
            throw new ServiceUnavailableException({
                error: {
                    code: 'db-not-online',
                    message: 'Database connection not available. Ensure database is running and accessible.'
                }
            });
        }
        return next.handle();
    }
}
