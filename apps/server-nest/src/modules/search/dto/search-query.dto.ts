import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export enum SearchMode {
    HYBRID = 'hybrid',
    LEXICAL = 'lexical',
    VECTOR = 'vector',
}

export class SearchQueryDto {
    @ApiProperty({ description: 'Query string', example: 'vector index design' })
    @IsString()
    q!: string;

    @ApiProperty({ description: 'Result limit (1..50)', minimum: 1, maximum: 50, default: 10, required: false })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(50)
    limit: number = 10;

    @ApiProperty({ enum: SearchMode, default: SearchMode.HYBRID, required: false })
    @IsOptional()
    @IsEnum(SearchMode)
    mode: SearchMode = SearchMode.HYBRID;
}
