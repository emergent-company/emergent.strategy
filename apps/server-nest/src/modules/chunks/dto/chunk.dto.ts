import { ApiProperty } from '@nestjs/swagger';

export class ChunkDto {
    @ApiProperty({ example: 'chunk_1' })
    id!: string;
    @ApiProperty({ example: 'doc_1' })
    documentId!: string;
    @ApiProperty({ example: 512 })
    size!: number;
}
