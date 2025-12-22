import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationMetaDto } from './pagination.dto';

export class SuperadminOrgDto {
  @ApiProperty({ description: 'Organization ID' })
  id: string;

  @ApiProperty({ description: 'Organization name' })
  name: string;

  @ApiProperty({ description: 'Number of members' })
  memberCount: number;

  @ApiProperty({ description: 'Number of projects' })
  projectCount: number;

  @ApiProperty({ description: 'When the organization was created' })
  createdAt: Date;

  @ApiPropertyOptional({ description: 'When the organization was deleted' })
  deletedAt: Date | null;
}

export class ListOrganizationsResponseDto {
  @ApiProperty({ type: [SuperadminOrgDto] })
  organizations: SuperadminOrgDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
