import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { AppConfigModule } from '../config/config.module';

@Global()
@Module({ imports: [AppConfigModule], providers: [DatabaseService], exports: [DatabaseService] })
export class DatabaseModule { }
