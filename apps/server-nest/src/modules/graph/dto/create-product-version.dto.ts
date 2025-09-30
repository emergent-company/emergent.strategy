import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreateProductVersionDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  // Optional base snapshot to link lineage (for future diffing)
  @IsOptional()
  @IsUUID()
  base_product_version_id?: string;
}
