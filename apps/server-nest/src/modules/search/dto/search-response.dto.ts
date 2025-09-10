import { ApiProperty } from '@nestjs/swagger';

export class SearchResultDto {
    @ApiProperty({ example: 'mock-1' }) id!: string;
    @ApiProperty({ example: 'Result snippet for "foo" (#1, mode=hybrid)' }) snippet!: string;
    @ApiProperty({ example: 0.98 }) score!: number;
    @ApiProperty({ example: 'source.doc#L10', required: false }) source?: string;
}

export class SearchResponseDto {
    @ApiProperty({ type: SearchResultDto, isArray: true }) results!: SearchResultDto[];
}
