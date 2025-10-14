#!/usr/bin/env node
/**
 * E2E Test Runner with Comprehensive Logging
 * 
 * This script:
 * 1. Runs E2E tests with full output capture
 * 2. Saves test output to timestamped log files
 * 3. Analyzes backend error logs for 500 errors
 * 4. Creates a summary report
 * 
 * Usage:
 *   node scripts/run-e2e-with-logs.mjs <test-spec>
 *   node scripts/run-e2e-with-logs.mjs console-errors.all-pages.spec.ts
 */

import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = process.cwd();
const LOGS_DIR = join(PROJECT_ROOT, 'logs', 'e2e-tests');
const BACKEND_ERRORS_LOG = join(PROJECT_ROOT, 'logs', 'errors.log');

// Create logs directory
if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
}

// Generate timestamp for this run
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' +
    new Date().toISOString().split('T')[1].split('.')[0].replace(/:/g, '-');
const runId = `e2e-${timestamp}`;

// Get test spec from command line argument
const testSpec = process.argv[2] || 'console-errors.all-pages.spec.ts';
const testName = testSpec.replace('.spec.ts', '');

console.log(`\n📋 E2E Test Run: ${runId}`);
console.log(`🎯 Test Spec: ${testSpec}`);
console.log(`📁 Logs will be saved to: ${LOGS_DIR}`);
console.log(`\n${'─'.repeat(80)}\n`);

// Record backend error count before test
let backendErrorsBefore = 0;
if (existsSync(BACKEND_ERRORS_LOG)) {
    const beforeContent = readFileSync(BACKEND_ERRORS_LOG, 'utf-8');
    backendErrorsBefore = beforeContent.split('\n').filter(line => line.trim()).length;
}
console.log(`📊 Backend errors before test: ${backendErrorsBefore}`);

// Create log files
const stdoutLogPath = join(LOGS_DIR, `${runId}_${testName}_stdout.log`);
const stderrLogPath = join(LOGS_DIR, `${runId}_${testName}_stderr.log`);
const summaryLogPath = join(LOGS_DIR, `${runId}_${testName}_summary.json`);

// Run the E2E test
const startTime = Date.now();
const child = spawn('npm', ['run', 'dev-manager:admin:e2e:console-errors'], {
    cwd: PROJECT_ROOT,
    shell: true,
    env: {
        ...process.env,
        E2E_FORCE_TOKEN: '1',
        FORCE_COLOR: '1', // Preserve color in logs
    }
});

// Capture stdout
child.stdout.on('data', (data) => {
    const text = data.toString();
    process.stdout.write(text); // Echo to console
    appendFileSync(stdoutLogPath, text, 'utf-8');
});

// Capture stderr
child.stderr.on('data', (data) => {
    const text = data.toString();
    process.stderr.write(text); // Echo to console
    appendFileSync(stderrLogPath, text, 'utf-8');
});

// Handle completion
child.on('close', (exitCode) => {
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`\n${'─'.repeat(80)}\n`);
    console.log(`✅ E2E Test completed in ${duration}s with exit code: ${exitCode}`);

    // Analyze backend errors after test
    let backendErrorsAfter = 0;
    let newBackendErrors = [];
    if (existsSync(BACKEND_ERRORS_LOG)) {
        const afterContent = readFileSync(BACKEND_ERRORS_LOG, 'utf-8');
        const allErrors = afterContent.split('\n').filter(line => line.trim());
        backendErrorsAfter = allErrors.length;

        // Extract new errors
        if (backendErrorsAfter > backendErrorsBefore) {
            newBackendErrors = allErrors.slice(backendErrorsBefore);
        }
    }

    const newErrorCount = backendErrorsAfter - backendErrorsBefore;
    console.log(`📊 Backend errors after test: ${backendErrorsAfter} (${newErrorCount > 0 ? '+' : ''}${newErrorCount} new)`);

    // Parse stdout for test results
    let testsPassed = 0;
    let testsFailed = 0;
    let testsTotal = 0;

    const stdoutContent = readFileSync(stdoutLogPath, 'utf-8');
    const passedMatch = stdoutContent.match(/(\d+) passed/);
    const failedMatch = stdoutContent.match(/(\d+) failed/);

    if (passedMatch) testsPassed = parseInt(passedMatch[1], 10);
    if (failedMatch) testsFailed = parseInt(failedMatch[1], 10);
    testsTotal = testsPassed + testsFailed;

    // Create summary report
    const summary = {
        runId,
        timestamp: new Date().toISOString(),
        testSpec,
        testName,
        exitCode,
        duration: `${duration}s`,
        tests: {
            total: testsTotal,
            passed: testsPassed,
            failed: testsFailed,
            passRate: testsTotal > 0 ? `${((testsPassed / testsTotal) * 100).toFixed(1)}%` : '0%'
        },
        backendErrors: {
            before: backendErrorsBefore,
            after: backendErrorsAfter,
            new: newErrorCount,
            newErrors: newBackendErrors.map(line => {
                try {
                    return JSON.parse(line);
                } catch {
                    return { raw: line };
                }
            })
        },
        logs: {
            stdout: stdoutLogPath,
            stderr: stderrLogPath,
            summary: summaryLogPath,
            backendErrors: BACKEND_ERRORS_LOG
        }
    };

    writeFileSync(summaryLogPath, JSON.stringify(summary, null, 2), 'utf-8');

    console.log(`\n📄 Summary Report:`);
    console.log(`   Tests: ${testsPassed}/${testsTotal} passed (${summary.tests.passRate})`);
    console.log(`   Backend Errors: ${newErrorCount} new errors during test`);
    console.log(`   Duration: ${duration}s`);
    console.log(`\n📁 Log Files:`);
    console.log(`   Stdout:  ${stdoutLogPath}`);
    console.log(`   Stderr:  ${stderrLogPath}`);
    console.log(`   Summary: ${summaryLogPath}`);

    if (newErrorCount > 0) {
        console.log(`\n⚠️  NEW BACKEND ERRORS DETECTED:`);
        console.log(`   View details: cat ${BACKEND_ERRORS_LOG} | tail -${newErrorCount}`);
        console.log(`\n   Error Summary:`);
        newBackendErrors.slice(0, 3).forEach((errorLine, idx) => {
            try {
                const error = JSON.parse(errorLine);
                console.log(`   ${idx + 1}. [${error.code}] ${error.message}`);
                console.log(`      Path: ${error.method} ${error.path}`);
            } catch {
                console.log(`   ${idx + 1}. ${errorLine.substring(0, 100)}...`);
            }
        });
        if (newBackendErrors.length > 3) {
            console.log(`   ... and ${newBackendErrors.length - 3} more errors`);
        }
    }

    console.log(`\n${'─'.repeat(80)}\n`);

    process.exit(exitCode);
});

// Handle errors
child.on('error', (error) => {
    console.error('Failed to start E2E test:', error);
    process.exit(1);
});
