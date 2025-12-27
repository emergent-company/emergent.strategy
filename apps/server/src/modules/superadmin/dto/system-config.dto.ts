import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsBoolean } from 'class-validator';

export class ExternalServiceDto {
  @ApiProperty({ description: 'Service name' })
  name: string;

  @ApiProperty({ description: 'Service URL (if available)' })
  url: string | null;

  @ApiProperty({ description: 'Whether service is enabled/configured' })
  enabled: boolean;
}

export class EnvironmentVariableDto {
  @ApiProperty({ description: 'Variable name' })
  name: string;

  @ApiProperty({ description: 'Variable value (may be masked if sensitive)' })
  value: string;

  @ApiProperty({ description: 'Whether the value is sensitive' })
  sensitive: boolean;

  @ApiProperty({ description: 'Category of the variable' })
  category: string;
}

export class DeploymentInfoDto {
  @ApiProperty({ description: 'Environment type' })
  environment: string;

  @ApiProperty({ description: 'Node.js version' })
  nodeVersion: string;

  @ApiProperty({ description: 'Admin port' })
  adminPort: number;

  @ApiProperty({ description: 'Server port' })
  serverPort: number;

  @ApiProperty({ description: 'Admin URL' })
  adminUrl: string;

  @ApiProperty({ description: 'Server URL' })
  serverUrl: string;
}

export class SystemConfigResponseDto {
  @ApiProperty({
    description: 'External services configuration',
    type: [ExternalServiceDto],
  })
  externalServices: ExternalServiceDto[];

  @ApiProperty({
    description: 'Deployment information',
    type: DeploymentInfoDto,
  })
  deployment: DeploymentInfoDto;

  @ApiProperty({
    description: 'Environment variables grouped by category',
    type: [EnvironmentVariableDto],
  })
  environmentVariables: EnvironmentVariableDto[];
}

export class RevealEnvQueryDto {
  @ApiPropertyOptional({
    description: 'Set to true to reveal sensitive values',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  reveal?: boolean;
}
