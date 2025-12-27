import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsDateString } from 'class-validator';
import { PaginationQueryDto, PaginationMetaDto } from './pagination.dto';

export type EmailJobStatus = 'pending' | 'processing' | 'sent' | 'failed';

export type EmailDeliveryStatus =
  | 'pending'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'soft_bounced'
  | 'complained'
  | 'unsubscribed'
  | 'failed';

export class ListEmailJobsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: ['pending', 'processing', 'sent', 'failed'],
  })
  @IsOptional()
  @IsEnum(['pending', 'processing', 'sent', 'failed'])
  status?: EmailJobStatus;

  @ApiPropertyOptional({
    description: 'Filter by recipient email (partial match)',
  })
  @IsOptional()
  @IsString()
  recipient?: string;

  @ApiPropertyOptional({
    description: 'Filter by start date (ISO 8601)',
    example: '2025-01-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by end date (ISO 8601)',
    example: '2025-12-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}

export class SuperadminEmailJobDto {
  @ApiProperty({ description: 'Email job ID' })
  id: string;

  @ApiProperty({ description: 'Email template name' })
  templateName: string;

  @ApiProperty({ description: 'Recipient email address' })
  toEmail: string;

  @ApiPropertyOptional({ description: 'Recipient name' })
  toName: string | null;

  @ApiProperty({ description: 'Email subject' })
  subject: string;

  @ApiProperty({
    description: 'Job status',
    enum: ['pending', 'processing', 'sent', 'failed'],
  })
  status: EmailJobStatus;

  @ApiProperty({ description: 'Number of send attempts' })
  attempts: number;

  @ApiProperty({ description: 'Maximum send attempts' })
  maxAttempts: number;

  @ApiPropertyOptional({ description: 'Last error message if failed' })
  lastError: string | null;

  @ApiProperty({ description: 'When the job was created' })
  createdAt: Date;

  @ApiPropertyOptional({ description: 'When the job was processed' })
  processedAt: Date | null;

  @ApiPropertyOptional({ description: 'Source type (e.g., invitation)' })
  sourceType: string | null;

  @ApiPropertyOptional({ description: 'Source entity ID' })
  sourceId: string | null;

  @ApiPropertyOptional({
    description: 'Delivery status from Mailgun events',
    enum: [
      'pending',
      'delivered',
      'opened',
      'clicked',
      'bounced',
      'soft_bounced',
      'complained',
      'unsubscribed',
      'failed',
    ],
  })
  deliveryStatus: EmailDeliveryStatus | null;

  @ApiPropertyOptional({
    description: 'When the delivery status event occurred',
  })
  deliveryStatusAt: Date | null;
}

export class ListEmailJobsResponseDto {
  @ApiProperty({ type: [SuperadminEmailJobDto] })
  emailJobs: SuperadminEmailJobDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class EmailJobPreviewResponseDto {
  @ApiProperty({ description: 'Rendered HTML content' })
  html: string;

  @ApiProperty({ description: 'Email subject' })
  subject: string;

  @ApiProperty({ description: 'Recipient email address' })
  toEmail: string;

  @ApiPropertyOptional({ description: 'Recipient name' })
  toName: string | null;
}
