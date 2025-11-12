import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VersionedObjectDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true }) org_id!: string | null;
  @ApiProperty({ nullable: true }) project_id!: string | null;
  @ApiProperty() canonical_id!: string;
  @ApiProperty({ nullable: true }) supersedes_id!: string | null;
  @ApiProperty() version!: number;
  @ApiProperty() type!: string;
  @ApiProperty({ nullable: true }) key!: string | null;
  @ApiProperty() properties!: Record<string, any>;
  @ApiProperty({ type: [String] }) labels!: string[];
  @ApiProperty() created_at!: string;
}

export class VersionedRelationshipDto {
  @ApiProperty() id!: string;
  @ApiProperty() canonical_id!: string;
  @ApiProperty({ nullable: true }) supersedes_id!: string | null;
  @ApiProperty() version!: number;
  @ApiProperty() type!: string;
  @ApiProperty() src_id!: string;
  @ApiProperty() dst_id!: string;
  @ApiProperty() properties!: Record<string, any>;
  @ApiProperty() created_at!: string;
  @ApiProperty({ nullable: true }) weight!: number | null;
  @ApiProperty({ nullable: true }) valid_from!: string | null;
  @ApiProperty({ nullable: true }) valid_to!: string | null;
}

export class HistoryResponseDto<T> {
  @ApiProperty({ isArray: true }) items!: T[];
  @ApiPropertyOptional({
    description:
      'Present when more pages available; pass as cursor query param',
  })
  next_cursor?: string;
}

export class ObjectHistoryResponseDto extends HistoryResponseDto<VersionedObjectDto> {
  @ApiProperty({ type: [VersionedObjectDto] })
  declare items: VersionedObjectDto[];
}

export class RelationshipHistoryResponseDto extends HistoryResponseDto<VersionedRelationshipDto> {
  @ApiProperty({ type: [VersionedRelationshipDto] })
  declare items: VersionedRelationshipDto[];
}

export class HistoryQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 20 })
  limit?: number;
  @ApiPropertyOptional({
    description: 'Opaque cursor (version) for descending pagination',
  })
  cursor?: string;
}
