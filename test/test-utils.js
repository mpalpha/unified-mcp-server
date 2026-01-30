/**
 * Test Utilities - Shared helpers for all test files
 */

const { spawn } = require('child_process');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

// Helper: Call MCP tool
async function callMCP(toolName, args) {
  return new Promise((resolve, reject) => {
    const path = require('path');
    const indexPath = path.join(__dirname, '..', 'index.js');
    const server = spawn('node', [indexPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    server.stdout.on('data', (data) => { stdout += data.toString(); });
    server.stderr.on('data', (data) => { stderr += data.toString(); });

    server.on('close', (code) => {
      resolve({ stdout, stderr, code });
    });

    // Initialize
    server.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0' }
      }
    }) + '\n');

    // Call tool
    server.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    }) + '\n');

    // Wait a bit for the response before closing stdin
    // This ensures complex tools have time to process and respond
    setTimeout(() => {
      server.stdin.end();
    }, 1000);
  });
}

// Helper: Parse JSON-RPC responses
function parseJSONRPC(output) {
  const responses = [];
  const starts = [];

  for (let i = 0; i < output.length - 10; i++) {
    if (output.substring(i, i + 11) === '{"jsonrpc":') {
      starts.push(i);
    }
  }

  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const end = (i < starts.length - 1) ? starts[i + 1] : output.length;
    const segment = output.substring(start, end).trim();

    try {
      const parsed = JSON.parse(segment);
      if (parsed.jsonrpc) {
        responses.push(parsed);
      }
    } catch (e) {
      // Invalid JSON, skip
    }
  }

  return responses;
}

// Test case
async function test(name, fn) {
  testsRun++;
  try {
    await fn();
    testsPassed++;
    console.log(`  ${colors.green}✓ PASS${colors.reset} - ${name}`);
  } catch (e) {
    testsFailed++;
    console.log(`  ${colors.red}✗ FAIL${colors.reset} - ${name}`);
    console.log(`    ${colors.red}Error: ${e.message}${colors.reset}`);
  }
}

// Assertions
function assertTrue(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertFalse(condition, message) {
  if (condition) {
    throw new Error(message || 'Assertion failed: expected false');
  }
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertContains(text, substring, message) {
  if (!text || !text.includes(substring)) {
    throw new Error(message || `Expected text to contain "${substring}"`);
  }
}

// Get test stats
function getStats() {
  return { testsRun, testsPassed, testsFailed };
}

// Reset stats
function resetStats() {
  testsRun = 0;
  testsPassed = 0;
  testsFailed = 0;
}

module.exports = {
  colors,
  callMCP,
  parseJSONRPC,
  test,
  assertTrue,
  assertFalse,
  assertEquals,
  assertContains,
  getStats,
  resetStats
};
