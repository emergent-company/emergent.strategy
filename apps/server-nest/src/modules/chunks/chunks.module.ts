import { Module } from '@nestjs/common';
import { ChunksController } from './chunks.controller';

@Module({ controllers: [ChunksController] })
export class ChunksModule { }
