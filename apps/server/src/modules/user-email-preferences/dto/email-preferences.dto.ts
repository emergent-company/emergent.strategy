import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class EmailPreferencesDto {
  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({
    description: 'Whether user receives release notification emails',
    default: true,
  })
  releaseEmailsEnabled: boolean;

  @ApiProperty({
    description: 'Whether user receives marketing emails',
    default: true,
  })
  marketingEmailsEnabled: boolean;

  @ApiProperty({ description: 'When preferences were last updated' })
  updatedAt: string;
}

export class UpdateEmailPreferencesDto {
  @ApiPropertyOptional({
    description: 'Enable/disable release notification emails',
  })
  @IsOptional()
  @IsBoolean()
  releaseEmailsEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable/disable marketing emails' })
  @IsOptional()
  @IsBoolean()
  marketingEmailsEnabled?: boolean;
}

export class UnsubscribeResultDto {
  @ApiProperty({ description: 'Whether unsubscribe was successful' })
  success: boolean;

  @ApiProperty({ description: 'Type of email unsubscribed from' })
  emailType: 'release' | 'marketing' | 'all';

  @ApiPropertyOptional({ description: 'Message describing the result' })
  message?: string;
}

export class UnsubscribeInfoDto {
  @ApiProperty({ description: 'Email address associated with this token' })
  email: string;

  @ApiProperty({ description: 'Current release emails preference' })
  releaseEmailsEnabled: boolean;

  @ApiProperty({ description: 'Current marketing emails preference' })
  marketingEmailsEnabled: boolean;
}
