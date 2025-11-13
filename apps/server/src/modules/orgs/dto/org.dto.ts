import { ApiProperty } from '@nestjs/swagger';

export class OrgDto {
  @ApiProperty({ example: 'org_1' })
  id!: string;

  @ApiProperty({ example: 'Example Org' })
  name!: string;
}
