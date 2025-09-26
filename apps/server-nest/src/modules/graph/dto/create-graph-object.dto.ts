import { IsString, IsOptional, IsObject, IsArray, ArrayMaxSize, Matches, MaxLength, IsUUID } from 'class-validator';

export class CreateGraphObjectDto {
    @IsString()
    @Matches(/^[A-Za-z0-9_.:-]{1,64}$/)
    type!: string;

    @IsOptional()
    @IsString()
    @MaxLength(128)
    key?: string;

    @IsOptional()
    @IsObject()
    properties?: Record<string, unknown>;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(32)
    @Matches(/^[A-Za-z0-9_.:-]{1,64}$/, { each: true })
    labels?: string[];

    @IsOptional()
    @IsUUID()
    org_id?: string;

    @IsOptional()
    @IsUUID()
    project_id?: string;
}
