import { IsOptional, IsObject } from 'class-validator';

export class PatchGraphRelationshipDto {
  @IsOptional() @IsObject() properties?: Record<string, unknown>;
}
