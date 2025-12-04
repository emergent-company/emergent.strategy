import { ApiProperty } from '@nestjs/swagger';

export class ChunkDto {
  @ApiProperty({ example: 'chunk_1' })
  id!: string;
  @ApiProperty({ example: 'doc_1' })
  documentId!: string;
  @ApiProperty({
    example: 'User Guide.pdf',
    description:
      'Best-effort document title derived from filename or source URL',
  })
  documentTitle!: string;
  @ApiProperty({
    example: 0,
    description: 'Zero-based index of chunk inside the document',
  })
  index!: number;
  @ApiProperty({ example: 512, description: 'Size in characters' })
  size!: number;
  @ApiProperty({
    example: true,
    description: 'Whether an embedding vector exists for this chunk',
  })
  hasEmbedding!: boolean;
  @ApiProperty({
    example: 'This is the chunk text...',
    description:
      'Plaintext content of the chunk (may be truncated client-side)',
  })
  text!: string;
  @ApiProperty({ required: false })
  createdAt?: string;
  @ApiProperty({
    required: false,
    description: 'Total characters across all chunks in document',
  })
  totalChars?: number;
  @ApiProperty({
    required: false,
    description: 'Total number of chunks in document',
  })
  chunkCount?: number;
  @ApiProperty({
    required: false,
    description: 'Number of embedded chunks in document',
  })
  embeddedChunks?: number;
}
