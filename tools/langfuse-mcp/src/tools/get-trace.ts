import { LangfuseClient } from '../langfuse-client.js';

export const getTraceSchema = {
  type: 'object' as const,
  properties: {
    traceId: {
      type: 'string',
      description: 'The unique Langfuse trace ID to retrieve',
    },
  },
  required: ['traceId'],
};

export interface GetTraceInput {
  traceId: string;
}

export async function getTrace(
  client: LangfuseClient,
  input: GetTraceInput
): Promise<string> {
  const trace = await client.getTrace(input.traceId);

  // Format observations for readability
  const formattedObservations = trace.observations.map((obs) => ({
    id: obs.id,
    type: obs.type,
    name: obs.name,
    model: obs.model,
    startTime: obs.startTime,
    endTime: obs.endTime,
    latency: obs.latency ? `${obs.latency.toFixed(2)}s` : null,
    level: obs.level,
    statusMessage: obs.statusMessage,
    parentObservationId: obs.parentObservationId,
    promptName: obs.promptName,
    promptVersion: obs.promptVersion,
    usage: obs.usage
      ? {
          input: obs.usage.input,
          output: obs.usage.output,
          total: obs.usage.total,
          inputCost: obs.usage.inputCost
            ? `$${obs.usage.inputCost.toFixed(6)}`
            : null,
          outputCost: obs.usage.outputCost
            ? `$${obs.usage.outputCost.toFixed(6)}`
            : null,
          totalCost: obs.usage.totalCost
            ? `$${obs.usage.totalCost.toFixed(6)}`
            : null,
        }
      : null,
    // Truncate large input/output for readability
    input: truncateValue(obs.input, 500),
    output: truncateValue(obs.output, 500),
    metadata: obs.metadata,
  }));

  // Format scores
  const formattedScores = trace.scores.map((score) => ({
    name: score.name,
    value: score.value,
    stringValue: score.stringValue,
    dataType: score.dataType,
    comment: score.comment,
    observationId: score.observationId,
  }));

  const result = {
    id: trace.id,
    name: trace.name,
    timestamp: trace.timestamp,
    userId: trace.userId,
    sessionId: trace.sessionId,
    tags: trace.tags,
    latency: trace.latency ? `${trace.latency.toFixed(2)}s` : null,
    totalCost: trace.totalCost ? `$${trace.totalCost.toFixed(6)}` : null,
    release: trace.release,
    version: trace.version,
    url: trace.htmlPath,
    input: truncateValue(trace.input, 500),
    output: truncateValue(trace.output, 500),
    metadata: trace.metadata,
    observationsCount: trace.observations.length,
    observations: formattedObservations,
    scoresCount: trace.scores.length,
    scores: formattedScores,
  };

  return JSON.stringify(result, null, 2);
}

/**
 * Truncate large values for readability.
 */
function truncateValue(value: unknown, maxLength: number): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    if (value.length > maxLength) {
      return (
        value.substring(0, maxLength) +
        `... [truncated, ${value.length} chars total]`
      );
    }
    return value;
  }

  if (typeof value === 'object') {
    const str = JSON.stringify(value);
    if (str.length > maxLength) {
      return (
        JSON.stringify(value, null, 2).substring(0, maxLength) +
        `\n... [truncated, ${str.length} chars total]`
      );
    }
    return value;
  }

  return value;
}
