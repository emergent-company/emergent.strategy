import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { BranchService } from './branch.service';
import { BranchRow, CreateBranchDto } from './graph.types';

@Controller('graph/branches')
export class BranchController {
  constructor(private readonly branches: BranchService) {}

  @Post()
  async create(@Body() dto: CreateBranchDto): Promise<BranchRow> {
    return this.branches.create(dto);
  }

  @Get()
  async list(@Query('project_id') project_id?: string): Promise<BranchRow[]> {
    return this.branches.list(project_id ?? null);
  }
}
