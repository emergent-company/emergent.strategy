import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { AppConfigModule } from '../config/config.module';
import { DatabaseReadinessInterceptor } from '../interceptors/database-readiness.interceptor';

@Global()
@Module({
    imports: [AppConfigModule],
    providers: [DatabaseService, DatabaseReadinessInterceptor],
    exports: [DatabaseService, DatabaseReadinessInterceptor]
})
export class DatabaseModule { }
