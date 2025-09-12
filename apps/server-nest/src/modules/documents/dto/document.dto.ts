import { ApiProperty } from '@nestjs/swagger';

export class DocumentDto {
    @ApiProperty({ example: 'doc_1' })
    id!: string;
    @ApiProperty({ example: '11111111-2222-3333-4444-555555555555', required: false, nullable: true })
    orgId?: string;
    @ApiProperty({ example: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', required: false, nullable: true })
    projectId?: string;
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
    @ApiProperty({ example: 12, description: 'Number of chunks associated with this document' })
    chunks!: number;
}
