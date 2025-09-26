import { IsOptional, IsObject, IsArray, ArrayMaxSize, Matches, IsBoolean } from 'class-validator';

export class PatchGraphObjectDto {
    @IsOptional()
    @IsObject()
    properties?: Record<string, unknown>;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(32)
    @Matches(/^[A-Za-z0-9_.:-]{1,64}$/, { each: true })
    labels?: string[];

    @IsOptional()
    @IsBoolean()
    replaceLabels?: boolean;
}
