import { VertexAI } from '@google-cloud/vertexai';
import { Logger } from '@nestjs/common';

export interface VertexAIHealthCheckConfig {
  projectId: string;
  location: string;
  model: string;
  timeoutMs?: number;
}

export interface VertexAIHealthCheckResult {
  success: boolean;
  message: string;
  details?: {
    projectId: string;
    location: string;
    model: string;
    latencyMs?: number;
    error?: string;
  };
}

/**
 * Fast health check for Vertex AI configuration and connectivity.
 *
 * This performs a minimal API call to verify:
 * 1. Credentials are present and valid
 * 2. Project ID is correct
 * 3. Location is valid
 * 4. Model is accessible
 * 5. API returns JSON (not HTML error pages)
 */
export class VertexAIHealthCheck {
  private readonly logger = new Logger(VertexAIHealthCheck.name);

  /**
   * Perform a fast health check on Vertex AI configuration.
   * Throws an error if the check fails, which should stop server startup.
   */
  async check(
    config: VertexAIHealthCheckConfig
  ): Promise<VertexAIHealthCheckResult> {
    const { projectId, location, model, timeoutMs = 10000 } = config;

    // Validate configuration
    if (!projectId) {
      return {
        success: false,
        message: 'GCP_PROJECT_ID or VERTEX_AI_PROJECT_ID not configured',
        details: { projectId, location, model },
      };
    }

    if (!location) {
      return {
        success: false,
        message: 'VERTEX_AI_LOCATION not configured',
        details: { projectId, location, model },
      };
    }

    if (!model) {
      return {
        success: false,
        message: 'VERTEX_AI_MODEL not configured',
        details: { projectId, location, model },
      };
    }

    // Test API connectivity
    const startTime = Date.now();

    try {
      this.logger.log(
        `Testing Vertex AI: project=${projectId}, location=${location}, model=${model}`
      );

      const vertexAI = new VertexAI({
        project: projectId,
        location: location,
      });

      const generativeModel = vertexAI.getGenerativeModel({
        model: model,
      });

      // Send minimal test prompt with timeout
      const testPromise = generativeModel.generateContent({
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello' }],
          },
        ],
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () =>
            reject(new Error(`Health check timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
      });

      const result = await Promise.race([testPromise, timeoutPromise]);
      const latencyMs = Date.now() - startTime;

      const response = (result as any).response;
      const text = response?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        return {
          success: false,
          message: 'Vertex AI returned empty response',
          details: {
            projectId,
            location,
            model,
            latencyMs,
            error: 'No text in response',
          },
        };
      }

      this.logger.log(`✅ Vertex AI health check passed in ${latencyMs}ms`);

      return {
        success: true,
        message: `Vertex AI is healthy (${latencyMs}ms)`,
        details: {
          projectId,
          location,
          model,
          latencyMs,
        },
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Detect common error patterns
      let friendlyMessage = 'Vertex AI health check failed';

      if (
        errorMessage.includes('Unexpected token') ||
        errorMessage.includes('<!DOCTYPE')
      ) {
        friendlyMessage =
          'Vertex AI returned HTML instead of JSON - likely auth/config error';
      } else if (errorMessage.includes('timeout')) {
        friendlyMessage = 'Vertex AI request timed out';
      } else if (
        errorMessage.includes('ENOTFOUND') ||
        errorMessage.includes('ECONNREFUSED')
      ) {
        friendlyMessage = 'Cannot reach Vertex AI API - network issue';
      } else if (errorMessage.includes('403')) {
        friendlyMessage =
          'Vertex AI API access denied (403) - check permissions';
      } else if (errorMessage.includes('401')) {
        friendlyMessage =
          'Vertex AI authentication failed (401) - check credentials';
      } else if (errorMessage.includes('404')) {
        friendlyMessage =
          'Vertex AI resource not found (404) - check project/location/model';
      }

      this.logger.error(`❌ ${friendlyMessage}: ${errorMessage}`);

      return {
        success: false,
        message: friendlyMessage,
        details: {
          projectId,
          location,
          model,
          latencyMs,
          error: errorMessage,
        },
      };
    }
  }
}
