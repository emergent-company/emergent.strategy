import { Module } from '@nestjs/common';
import { IngestionController } from './ingestion.controller';

@Module({ controllers: [IngestionController] })
export class IngestionModule { }
