import { ApiProperty } from '@nestjs/swagger';
import { SearchMode } from './search-query.dto';

export class SearchResultDto {
    @ApiProperty({ example: 'mock-1' }) id!: string;
    @ApiProperty({ example: 'Result snippet for "foo" (#1, mode=hybrid)' }) snippet!: string;
    @ApiProperty({ example: 0.98 }) score!: number;
    @ApiProperty({ example: 'source.doc#L10', required: false }) source?: string;
}

export class SearchResponseDto {
    @ApiProperty({ enum: SearchMode }) mode!: SearchMode;
    @ApiProperty({ type: SearchResultDto, isArray: true }) results!: SearchResultDto[];
    @ApiProperty({ required: false, example: 'Embeddings unavailable; fell back to lexical.' }) warning?: string;
}
