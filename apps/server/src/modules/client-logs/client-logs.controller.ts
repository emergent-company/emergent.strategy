import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiBody } from '@nestjs/swagger';
import { ClientLogsService } from './client-logs.service';
import { ClientLogsRequestDto } from './client-logs.dto';

/**
 * Controller for receiving browser client logs
 *
 * This endpoint receives console errors and warnings from the browser
 * client and writes them to the server log files for debugging.
 *
 * The endpoint is intentionally unauthenticated to avoid circular
 * dependencies where auth failures can't be logged.
 */
@ApiTags('Logs')
@Controller('logs')
export class ClientLogsController {
  constructor(private readonly clientLogsService: ClientLogsService) {}

  @Post('client')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit browser client logs',
    description:
      'Receives batched console logs from browser clients for server-side storage. Used for debugging client-side errors.',
  })
  @ApiBody({ type: ClientLogsRequestDto })
  @ApiOkResponse({
    description: 'Logs received successfully',
    schema: {
      example: { ok: true, written: 5 },
    },
  })
  submitLogs(@Body() body: ClientLogsRequestDto) {
    const result = this.clientLogsService.writeLogs(body.logs);
    return { ok: true, written: result.written };
  }
}
