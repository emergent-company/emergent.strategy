#!/usr/bin/env node

/**
 * Pretty-print ClickUp import log files (JSONL format)
 * 
 * Usage:
 *   npm run log:pretty <log-file-path>
 *   npm run log:pretty logs/clickup-import/abc-123.jsonl
 *   npm run log:pretty logs/clickup-import/abc-123.jsonl --errors-only
 *   npm run log:pretty logs/clickup-import/abc-123.jsonl --operation-type=fetch_docs
 *   npm run log:pretty logs/clickup-import/abc-123.jsonl --verbose
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',

    // Foreground colors
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',

    // Background colors
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
};

function colorize(text, color) {
    return `${colors[color]}${text}${colors.reset}`;
}

function getStatusSymbol(status) {
    switch (status) {
        case 'success': return colorize('✓', 'green');
        case 'error': return colorize('✗', 'red');
        case 'warning': return colorize('⚠', 'yellow');
        case 'info': return colorize('ℹ', 'blue');
        case 'pending': return colorize('○', 'gray');
        default: return colorize('•', 'gray');
    }
}

function getStatusColor(status) {
    switch (status) {
        case 'success': return 'green';
        case 'error': return 'red';
        case 'warning': return 'yellow';
        case 'info': return 'blue';
        case 'pending': return 'gray';
        default: return 'white';
    }
}

function formatTimestamp(isoString) {
    const date = new Date(isoString);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const ms = date.getMilliseconds().toString().padStart(3, '0');
    return colorize(`${hours}:${minutes}:${seconds}.${ms}`, 'gray');
}

function formatDuration(ms) {
    if (!ms) return colorize('0ms', 'dim');
    if (ms < 1000) return colorize(`${ms}ms`, 'cyan');
    if (ms < 60000) return colorize(`${(ms / 1000).toFixed(2)}s`, 'cyan');
    return colorize(`${(ms / 60000).toFixed(2)}m`, 'cyan');
}

function formatOperationType(type) {
    const typeColors = {
        discovery: 'magenta',
        fetch_spaces: 'blue',
        fetch_docs: 'blue',
        fetch_pages: 'blue',
        store_document: 'green',
        create_extraction: 'yellow',
        api_call: 'cyan',
        error: 'red',
    };
    const color = typeColors[type] || 'white';
    return colorize(type.padEnd(18), color);
}

function formatJson(obj, indent = '  ') {
    return JSON.stringify(obj, null, 2)
        .split('\n')
        .map(line => indent + colorize(line, 'dim'))
        .join('\n');
}

function truncate(str, maxLen = 80) {
    if (!str || str.length <= maxLen) return str;
    return str.substring(0, maxLen - 3) + '...';
}

function printLogEntry(entry, options) {
    const { verbose } = options;

    const timestamp = formatTimestamp(entry.timestamp);
    const symbol = getStatusSymbol(entry.status);
    const operationType = formatOperationType(entry.operation_type);
    const duration = formatDuration(entry.duration_ms);
    const stepIndex = colorize(`#${entry.step_index.toString().padStart(3, '0')}`, 'gray');

    // Main line
    let mainLine = `${timestamp} ${symbol} ${stepIndex} ${operationType} ${duration}`;

    // Add operation name if present
    if (entry.operation_name) {
        mainLine += ` ${colorize(entry.operation_name, 'white')}`;
    }

    // Add items processed if present
    if (entry.items_processed !== null && entry.items_processed !== undefined) {
        mainLine += ` ${colorize(`(${entry.items_processed} items)`, 'dim')}`;
    }

    console.log(mainLine);

    // Error details
    if (entry.error_message) {
        console.log(colorize(`  Error: ${entry.error_message}`, 'red'));
        if (verbose && entry.error_stack) {
            const stackLines = entry.error_stack.split('\n').slice(0, 5);
            stackLines.forEach(line => {
                console.log(colorize(`    ${truncate(line, 120)}`, 'dim'));
            });
        }
    }

    // Input data (verbose only)
    if (verbose && entry.input_data) {
        console.log(colorize('  Input:', 'dim'));
        console.log(formatJson(entry.input_data, '    '));
    }

    // Output data (verbose only, or if it's a small summary)
    if (verbose && entry.output_data) {
        console.log(colorize('  Output:', 'dim'));
        console.log(formatJson(entry.output_data, '    '));
    } else if (entry.output_data && typeof entry.output_data === 'object') {
        // Show small summary for non-verbose
        const summary = Object.keys(entry.output_data)
            .filter(key => ['count', 'total', 'success', 'failed', 'docs', 'pages'].includes(key))
            .map(key => `${key}=${entry.output_data[key]}`)
            .join(', ');
        if (summary) {
            console.log(colorize(`  ${summary}`, 'dim'));
        }
    }

    // Metadata (verbose only)
    if (verbose && entry.metadata) {
        console.log(colorize('  Metadata:', 'dim'));
        console.log(formatJson(entry.metadata, '    '));
    }

    console.log(); // Blank line between entries
}

function printSummary(stats) {
    console.log('\n' + colorize('═'.repeat(80), 'gray'));
    console.log(colorize('SUMMARY', 'bright'));
    console.log(colorize('═'.repeat(80), 'gray') + '\n');

    const totalSymbol = colorize('•', 'white');
    const successSymbol = getStatusSymbol('success');
    const errorSymbol = getStatusSymbol('error');
    const warningSymbol = getStatusSymbol('warning');
    const infoSymbol = getStatusSymbol('info');

    console.log(`${totalSymbol} Total Steps:     ${colorize(stats.totalSteps.toString(), 'bright')}`);
    console.log(`${successSymbol} Success:         ${colorize(stats.successCount.toString(), 'green')}`);
    console.log(`${errorSymbol} Errors:          ${colorize(stats.errorCount.toString(), 'red')}`);
    console.log(`${warningSymbol} Warnings:        ${colorize(stats.warningCount.toString(), 'yellow')}`);
    console.log(`${infoSymbol} Info:            ${colorize(stats.infoCount.toString(), 'blue')}`);
    console.log(`${totalSymbol} Total Duration:  ${formatDuration(stats.totalDuration)}`);
    console.log(`${totalSymbol} Items Processed: ${colorize(stats.totalItems.toString(), 'cyan')}`);

    if (Object.keys(stats.operationCounts).length > 0) {
        console.log('\n' + colorize('Operations:', 'dim'));
        Object.entries(stats.operationCounts)
            .sort(([, a], [, b]) => b - a)
            .forEach(([op, count]) => {
                const formatted = formatOperationType(op).trim();
                console.log(`  ${formatted}: ${colorize(count.toString(), 'white')}`);
            });
    }

    console.log('\n' + colorize('═'.repeat(80), 'gray') + '\n');
}

function parseLogFile(filePath, options) {
    const { errorsOnly, operationType } = options;

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.trim().split('\n').filter(line => line.trim());

    const entries = lines.map(line => {
        try {
            return JSON.parse(line);
        } catch (err) {
            console.error(colorize(`Failed to parse line: ${truncate(line, 60)}`, 'red'));
            return null;
        }
    }).filter(Boolean);

    // Apply filters
    let filtered = entries;
    if (errorsOnly) {
        filtered = filtered.filter(e => e.status === 'error');
    }
    if (operationType) {
        filtered = filtered.filter(e => e.operation_type === operationType);
    }

    // Calculate stats
    const stats = {
        totalSteps: entries.length,
        successCount: entries.filter(e => e.status === 'success').length,
        errorCount: entries.filter(e => e.status === 'error').length,
        warningCount: entries.filter(e => e.status === 'warning').length,
        infoCount: entries.filter(e => e.status === 'info').length,
        totalDuration: entries.reduce((sum, e) => sum + (e.duration_ms || 0), 0),
        totalItems: entries.reduce((sum, e) => sum + (e.items_processed || 0), 0),
        operationCounts: {},
    };

    entries.forEach(e => {
        stats.operationCounts[e.operation_type] = (stats.operationCounts[e.operation_type] || 0) + 1;
    });

    return { entries: filtered, stats };
}

function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(`
${colorize('ClickUp Import Log Pretty Printer', 'bright')}

Usage:
  npm run log:pretty <log-file-path> [options]

Options:
  --errors-only           Show only error entries
  --operation-type=TYPE   Show only entries of specific type
  --verbose              Show full input/output data and stack traces
  --help, -h             Show this help

Examples:
  npm run log:pretty logs/clickup-import/abc-123.jsonl
  npm run log:pretty logs/clickup-import/abc-123.jsonl --errors-only
  npm run log:pretty logs/clickup-import/abc-123.jsonl --operation-type=fetch_docs
  npm run log:pretty logs/clickup-import/abc-123.jsonl --verbose

Operation Types:
  ${colorize('discovery', 'magenta')}       - Discovering workspace structure
  ${colorize('fetch_spaces', 'blue')}     - Fetching spaces
  ${colorize('fetch_docs', 'blue')}       - Fetching documents
  ${colorize('fetch_pages', 'blue')}      - Fetching pages
  ${colorize('store_document', 'green')}  - Storing document in DB
  ${colorize('create_extraction', 'yellow')} - Creating extraction job
  ${colorize('api_call', 'cyan')}         - Generic API call
  ${colorize('error', 'red')}            - Error occurred
        `);
        process.exit(0);
    }

    const logFile = args[0];
    const options = {
        errorsOnly: args.includes('--errors-only'),
        operationType: args.find(a => a.startsWith('--operation-type='))?.split('=')[1],
        verbose: args.includes('--verbose'),
    };

    if (!fs.existsSync(logFile)) {
        console.error(colorize(`Error: Log file not found: ${logFile}`, 'red'));
        process.exit(1);
    }

    const { entries, stats } = parseLogFile(logFile, options);

    // Print header
    console.log('\n' + colorize('═'.repeat(80), 'gray'));
    console.log(colorize(`ClickUp Import Log: ${path.basename(logFile)}`, 'bright'));
    console.log(colorize('═'.repeat(80), 'gray') + '\n');

    if (options.errorsOnly) {
        console.log(colorize('(Showing errors only)', 'yellow') + '\n');
    }
    if (options.operationType) {
        console.log(colorize(`(Showing ${options.operationType} only)`, 'yellow') + '\n');
    }

    // Print entries
    entries.forEach(entry => printLogEntry(entry, options));

    // Print summary
    printSummary(stats);
}

main();
