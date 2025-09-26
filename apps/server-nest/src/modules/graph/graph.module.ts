import { Module } from '@nestjs/common';
import { GraphObjectsController } from './graph.controller';
import { GraphService } from './graph.service';
import { DatabaseModule } from '../../common/database/database.module';
import { SchemaRegistryService } from './schema-registry.service';

@Module({
    imports: [DatabaseModule],
    controllers: [GraphObjectsController],
    providers: [GraphService, SchemaRegistryService],
    exports: [GraphService]
})
export class GraphModule { }
