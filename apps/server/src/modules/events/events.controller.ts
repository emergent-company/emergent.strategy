import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  UseGuards,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthGuard } from '../auth/auth.guard';
import { EventsService } from './events.service';
import { HealthService } from '../health/health.service';
import {
  EntityEvent,
  SSEConnection,
  ConnectedEvent,
  HeartbeatEvent,
  HealthStatus,
} from './events.types';

/**
 * Controller for Server-Sent Events (SSE) real-time updates.
 * Clients connect to GET /api/events/stream to receive entity updates.
 */
@ApiTags('Events')
@Controller('events')
export class EventsController implements OnModuleDestroy {
  private readonly logger = new Logger(EventsController.name);
  private readonly connections = new Map<string, SSEConnection>();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  // Heartbeat interval in milliseconds (30 seconds)
  private readonly HEARTBEAT_INTERVAL_MS = 30000;

  constructor(
    private readonly eventsService: EventsService,
    private readonly healthService: HealthService
  ) {
    this.startHeartbeat();
  }

  onModuleDestroy() {
    this.stopHeartbeat();
    // Close all connections
    for (const [connectionId, connection] of this.connections) {
      try {
        connection.response.end();
      } catch {
        // Ignore errors on cleanup
      }
      this.connections.delete(connectionId);
    }
  }

  /**
   * Start the heartbeat interval to keep connections alive
   * Heartbeats also include health status data
   */
  private startHeartbeat() {
    if (this.heartbeatInterval) return;

    this.heartbeatInterval = setInterval(async () => {
      const now = new Date();

      // Fetch health data once for all connections
      let health: HealthStatus | undefined;
      try {
        const healthResult = await this.healthService.get();
        health = healthResult as HealthStatus;
      } catch (error) {
        this.logger.warn('Failed to fetch health data for heartbeat', error);
        // Continue without health data
      }

      for (const [connectionId, connection] of this.connections) {
        try {
          const heartbeat: HeartbeatEvent = {
            timestamp: now.toISOString(),
            health,
          };
          this.sendEvent(connection.response, 'heartbeat', heartbeat);
          connection.lastHeartbeat = now;
        } catch (error) {
          this.logger.warn(
            `Failed to send heartbeat to connection ${connectionId}, removing`
          );
          this.connections.delete(connectionId);
        }
      }
    }, this.HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Stop the heartbeat interval
   */
  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Send an SSE event to a response
   */
  private sendEvent(res: Response, event: string, data: any) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  /**
   * SSE endpoint for real-time entity updates
   */
  @Get('stream')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Subscribe to real-time entity updates (SSE)',
    description:
      'Establishes a Server-Sent Events connection for receiving real-time updates. ' +
      'Events are scoped to the project specified in the projectId query parameter. ' +
      'Note: EventSource API does not support custom headers, so projectId must be passed as a query param.',
  })
  @ApiQuery({
    name: 'projectId',
    description: 'Project ID to receive events for',
    required: true,
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'SSE stream established',
    content: {
      'text/event-stream': {
        schema: {
          type: 'string',
          example:
            'event: connected\ndata: {"connectionId":"abc","projectId":"proj_123"}\n\n',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 400,
    description: 'Missing projectId query parameter',
  })
  async stream(
    @Req() req: Request & { user?: { id: string } },
    @Res() res: Response,
    @Query('projectId') projectIdQuery?: string
  ): Promise<void> {
    // Support both query param (for EventSource) and header (for other clients)
    const projectId = projectIdQuery || (req.headers['x-project-id'] as string);
    const userId = req.user?.id;

    if (!projectId) {
      res.status(400).json({ error: 'Missing projectId query parameter' });
      return;
    }

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const connectionId = uuidv4();

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Store connection
    const connection: SSEConnection = {
      connectionId,
      userId,
      projectId,
      response: res,
      lastHeartbeat: new Date(),
    };
    this.connections.set(connectionId, connection);

    this.logger.log(
      `SSE connection established: ${connectionId} for user ${userId} on project ${projectId}`
    );

    // Send connected event
    const connectedEvent: ConnectedEvent = {
      connectionId,
      projectId,
    };
    this.sendEvent(res, 'connected', connectedEvent);

    // Subscribe to project events
    const unsubscribe = this.eventsService.subscribe(
      projectId,
      (event: EntityEvent) => {
        try {
          this.sendEvent(res, event.type, {
            entity: event.entity,
            id: event.id,
            ids: event.ids,
            data: event.data,
            timestamp: event.timestamp,
          });
        } catch (error) {
          this.logger.warn(
            `Failed to send event to connection ${connectionId}`
          );
        }
      }
    );

    // Handle client disconnect
    req.on('close', () => {
      this.logger.log(`SSE connection closed: ${connectionId}`);
      unsubscribe();
      this.connections.delete(connectionId);
    });

    // Handle errors
    req.on('error', (error) => {
      this.logger.warn(`SSE connection error: ${connectionId}`, error);
      unsubscribe();
      this.connections.delete(connectionId);
    });
  }

  /**
   * Get active connections count (for monitoring)
   */
  @Get('connections/count')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get active SSE connections count' })
  @ApiResponse({ status: 200, description: 'Connection count' })
  getConnectionsCount(): { count: number } {
    return { count: this.connections.size };
  }
}
