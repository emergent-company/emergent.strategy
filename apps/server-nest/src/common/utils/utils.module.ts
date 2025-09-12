import { Global, Module } from '@nestjs/common';
import { ChunkerService } from './chunker.service';
import { HashService } from './hash.service';

@Global()
@Module({
    providers: [ChunkerService, HashService],
    exports: [ChunkerService, HashService],
})
export class UtilsModule { }
