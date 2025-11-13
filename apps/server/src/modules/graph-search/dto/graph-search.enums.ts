import { ApiProperty } from '@nestjs/swagger';

export enum GraphChannel {
  LEXICAL = 'lexical',
  VECTOR = 'vector',
  NEIGHBOR_BOOST = 'neighbor_boost',
  DOC = 'doc',
}

export enum GraphIntent {
  EXPLAIN = 'explain',
  LOCATE_CONFIG = 'locate_config',
  DEBUG_ERROR = 'debug_error',
  ROADMAP = 'roadmap',
}

export enum GraphRole {
  PRIMARY = 'primary',
  NEIGHBOR = 'neighbor',
  REFERENCE = 'reference',
  DOCUMENT_CHUNK = 'document_chunk',
}

export class ChannelsEnumArrayExample {
  @ApiProperty({
    enum: GraphChannel,
    isArray: true,
    example: [GraphChannel.LEXICAL, GraphChannel.VECTOR],
  })
  channels!: GraphChannel[];
}
