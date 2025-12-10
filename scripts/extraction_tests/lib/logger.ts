/**
 * Shared logging utilities with colors for extraction tests
 */

import { ExtractionResult, TestSummary, ExtractedEntity } from './types.js';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',

  // Foreground
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Background
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
} as const;

type Color = keyof typeof colors;

function colorize(text: string, ...colorCodes: Color[]): string {
  const codes = colorCodes.map((c) => colors[c]).join('');
  return `${codes}${text}${colors.reset}`;
}

// Helper functions
export const c = {
  success: (text: string) => colorize(text, 'green'),
  error: (text: string) => colorize(text, 'red'),
  warn: (text: string) => colorize(text, 'yellow'),
  info: (text: string) => colorize(text, 'blue'),
  dim: (text: string) => colorize(text, 'dim'),
  bold: (text: string) => colorize(text, 'bold'),
  cyan: (text: string) => colorize(text, 'cyan'),
  magenta: (text: string) => colorize(text, 'magenta'),
};

export function printHeader(title: string): void {
  const line = '═'.repeat(60);
  console.log();
  console.log(c.cyan(line));
  console.log(c.cyan('║') + c.bold(` ${title.padEnd(58)}`));
  console.log(c.cyan(line));
}

export function printSubHeader(title: string): void {
  console.log();
  console.log(c.bold(`▸ ${title}`));
  console.log(c.dim('─'.repeat(50)));
}

export function printEntity(entity: ExtractedEntity, index: number): void {
  const confidence = entity.confidence
    ? c.dim(` (${(entity.confidence * 100).toFixed(0)}%)`)
    : '';

  console.log(
    `  ${c.dim(`${index + 1}.`)} ${c.bold(entity.name)} ${c.cyan(
      `[${entity.type}]`
    )}${confidence}`
  );

  if (entity.description) {
    console.log(
      `     ${c.dim(entity.description.substring(0, 80))}${
        entity.description.length > 80 ? '...' : ''
      }`
    );
  }
}

export function printExtractionResult(result: ExtractionResult): void {
  const status = result.success ? c.success('✓ SUCCESS') : c.error('✗ FAILED');

  console.log();
  console.log(`${status} ${c.dim(`(${result.durationMs}ms)`)}`);

  if (result.error) {
    console.log(c.error(`  Error: ${result.error}`));
  }

  if (result.entities.length > 0) {
    console.log(c.info(`\n  Extracted ${result.entities.length} entities:`));
    result.entities.forEach((entity, i) => printEntity(entity, i));
  }

  if (result.tokenUsage) {
    console.log(
      c.dim(
        `\n  Tokens: ${result.tokenUsage.input ?? '?'} in / ${
          result.tokenUsage.output ?? '?'
        } out`
      )
    );
  }

  if (result.promptLength) {
    console.log(c.dim(`  Prompt length: ${result.promptLength} chars`));
  }
}

export function printTestSummary(summary: TestSummary): void {
  const { stats } = summary;

  printHeader(`Summary: ${summary.testName}`);

  console.log(`  ${c.dim('Method:')}       ${c.cyan(summary.method)}`);
  console.log(
    `  ${c.dim('Success rate:')} ${
      stats.successRate === 100
        ? c.success(`${stats.successRate}%`)
        : stats.successRate >= 50
        ? c.warn(`${stats.successRate}%`)
        : c.error(`${stats.successRate}%`)
    }`
  );
  console.log(
    `  ${c.dim('Runs:')}         ${stats.successfulRuns}/${
      stats.totalRuns
    } successful`
  );

  console.log();
  console.log(c.bold('  Performance:'));
  console.log(
    `    ${c.dim('Average:')} ${c.bold(stats.avgDurationMs.toFixed(0))}ms`
  );
  console.log(`    ${c.dim('Min:')}     ${stats.minDurationMs.toFixed(0)}ms`);
  console.log(`    ${c.dim('Max:')}     ${stats.maxDurationMs.toFixed(0)}ms`);
  console.log(`    ${c.dim('Std Dev:')} ±${stats.stdDevMs.toFixed(0)}ms`);

  console.log();
  console.log(`  ${c.dim('Avg entities:')} ${stats.avgEntities.toFixed(1)}`);
}

export function printRunProgress(
  runNumber: number,
  totalRuns: number,
  result: ExtractionResult
): void {
  const status = result.success ? c.success('✓') : c.error('✗');
  const entities = result.entities.length;
  const duration = result.durationMs;

  console.log(
    `  ${c.dim(
      `[${runNumber}/${totalRuns}]`
    )} ${status} ${duration}ms, ${entities} entities`
  );
}

export function printMultiTestSummary(summaries: TestSummary[]): void {
  printHeader('All Tests Summary');

  // Sort by success rate, then by avg duration
  const sorted = [...summaries].sort((a, b) => {
    if (b.stats.successRate !== a.stats.successRate) {
      return b.stats.successRate - a.stats.successRate;
    }
    return a.stats.avgDurationMs - b.stats.avgDurationMs;
  });

  console.log();
  console.log(
    `  ${c.dim('Test Name'.padEnd(35))} ${c.dim('Method'.padEnd(18))} ${c.dim(
      'Success'.padEnd(10)
    )} ${c.dim('Avg Time')}`
  );
  console.log(c.dim('  ' + '─'.repeat(75)));

  for (const summary of sorted) {
    const successColor =
      summary.stats.successRate === 100
        ? 'success'
        : summary.stats.successRate >= 50
        ? 'warn'
        : 'error';

    const successText = c[successColor](
      `${summary.stats.successRate.toFixed(0)}%`.padEnd(10)
    );

    console.log(
      `  ${summary.testName.padEnd(35)} ${c.cyan(
        summary.method.padEnd(18)
      )} ${successText} ${summary.stats.avgDurationMs.toFixed(0)}ms`
    );
  }

  // Best performer
  const best = sorted[0];
  if (best && best.stats.successRate > 0) {
    console.log();
    console.log(
      c.success(
        `  ★ Best: ${best.testName} (${
          best.stats.successRate
        }% success, ${best.stats.avgDurationMs.toFixed(0)}ms avg)`
      )
    );
  }
}

// Basic logging methods
export function logDebug(message: string): void {
  if (process.env.DEBUG === 'true') {
    console.log(c.dim(`[DEBUG] ${message}`));
  }
}

export function logInfo(message: string): void {
  console.log(c.info(`[INFO] ${message}`));
}

export function logWarn(message: string): void {
  console.log(c.warn(`[WARN] ${message}`));
}

export function logError(message: string): void {
  console.log(c.error(`[ERROR] ${message}`));
}

export function logSuccess(message: string): void {
  console.log(c.success(`[OK] ${message}`));
}

export const logger = {
  // Basic logging
  debug: logDebug,
  info: logInfo,
  warn: logWarn,
  error: logError,
  success: logSuccess,

  // Pretty printing
  header: printHeader,
  subHeader: printSubHeader,
  entity: printEntity,
  result: printExtractionResult,
  summary: printTestSummary,
  progress: printRunProgress,
  multiSummary: printMultiTestSummary,
  c,
};

export default logger;
