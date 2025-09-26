import { IsString, IsOptional, IsObject, Matches } from 'class-validator';

export class CreateGraphRelationshipDto {
    @IsString() @Matches(/^[A-Za-z0-9_.:-]{1,64}$/) type!: string;
    @IsString() src_id!: string;
    @IsString() dst_id!: string;
    @IsOptional() @IsObject() properties?: Record<string, unknown>;
}
