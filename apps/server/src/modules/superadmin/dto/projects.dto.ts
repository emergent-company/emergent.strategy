import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto, PaginationMetaDto } from './pagination.dto';

export class ListProjectsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by organization ID',
  })
  @IsOptional()
  @IsUUID()
  orgId?: string;
}

export class SuperadminProjectDto {
  @ApiProperty({ description: 'Project ID' })
  id: string;

  @ApiProperty({ description: 'Project name' })
  name: string;

  @ApiProperty({ description: 'Organization ID' })
  organizationId: string;

  @ApiProperty({ description: 'Organization name' })
  organizationName: string;

  @ApiProperty({ description: 'Number of documents' })
  documentCount: number;

  @ApiProperty({ description: 'When the project was created' })
  createdAt: Date;

  @ApiPropertyOptional({ description: 'When the project was deleted' })
  deletedAt: Date | null;
}

export class ListProjectsResponseDto {
  @ApiProperty({ type: [SuperadminProjectDto] })
  projects: SuperadminProjectDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
