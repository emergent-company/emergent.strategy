import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for a single tool definition returned by GET /api/chat-sdk/tools
 */
export class ToolDefinitionDto {
  @ApiProperty({
    description: 'Tool name (identifier)',
    example: 'search_knowledge_base',
  })
  name: string;

  @ApiProperty({
    description: 'Human-readable description',
    example: 'Search documents and knowledge graph',
  })
  description: string;

  @ApiProperty({ description: 'Iconify icon class', example: 'lucide--search' })
  icon: string;

  @ApiProperty({ description: 'Group identifier', example: 'knowledge-base' })
  group: string;

  @ApiProperty({
    description: 'Human-readable group label',
    example: 'Knowledge Base',
  })
  groupLabel: string;

  @ApiProperty({
    description: 'Iconify icon for the group',
    example: 'lucide--database',
  })
  groupIcon: string;
}

/**
 * Response DTO for GET /api/chat-sdk/tools
 */
export class ToolDefinitionsResponseDto {
  @ApiProperty({
    description: 'Array of tool definitions with metadata',
    type: [ToolDefinitionDto],
  })
  tools: ToolDefinitionDto[];
}
