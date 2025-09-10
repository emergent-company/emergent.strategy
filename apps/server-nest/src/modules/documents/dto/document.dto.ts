import { ApiProperty } from '@nestjs/swagger';

export class DocumentDto {
    @ApiProperty({ example: 'doc_1' })
    id!: string;
    @ApiProperty({ example: 'Spec.md' })
    name!: string;
    @ApiProperty({ required: false, nullable: true, example: 'https://example.com/file.pdf' })
    sourceUrl?: string | null;
    @ApiProperty({ required: false, nullable: true, example: 'text/markdown' })
    mimeType?: string | null;
    @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
    createdAt!: string;
    @ApiProperty({ example: '2025-01-01T00:05:00.000Z' })
    updatedAt!: string;
}
