import { Module } from '@nestjs/common';
import { OrgsController } from './orgs.controller';

@Module({ controllers: [OrgsController] })
export class OrgsModule { }
