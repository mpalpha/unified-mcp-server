#!/usr/bin/env node

/**
 * Protocol Enforcement with Project Context Test
 *
 * Verifies that project context display does NOT interfere with:
 * - Workflow enforcement (TEACH → LEARN → REASON)
 * - Token validation
 * - Blocking behavior
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

// Test configuration
const HOME_DIR = path.join(os.homedir(), '.unified-mcp');
const CONTEXT_DIR = path.join(HOME_DIR, 'project-contexts');
const TOKEN_DIR = path.join(HOME_DIR, 'tokens');
const HOOK_PATH = path.join(__dirname, '..', 'hooks', 'user-prompt-submit.cjs');

// Test project directory
const TEST_PROJECT = path.join(os.tmpdir(), 'test-protocol-context');
const PROJECT_HASH = crypto.createHash('md5').update(TEST_PROJECT).digest('hex');
const CONTEXT_PATH = path.join(CONTEXT_DIR, `${PROJECT_HASH}.json`);

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS - ${name}`);
    passCount++;
  } catch (error) {
    console.log(`  ❌ FAIL - ${name}`);
    console.log(`     ${error.message}`);
    failCount++;
  }
}

/**
 * Run hook with input
 */
function runHook(input, env = {}) {
  return new Promise((resolve) => {
    const proc = spawn('node', [HOOK_PATH], {
      env: { ...process.env, PWD: TEST_PROJECT, ...env },
      cwd: TEST_PROJECT,
      timeout: 5000
    });

    let output = '';
    proc.stdout.on('data', (data) => output += data.toString());
    proc.stderr.on('data', (data) => output += data.toString());

    proc.stdin.write(JSON.stringify(input));
    proc.stdin.end();

    proc.on('close', (code) => {
      resolve({ code, output });
    });

    setTimeout(() => {
      proc.kill('SIGTERM');
      resolve({ code: -1, output: 'Timeout' });
    }, 5000);
  });
}

/**
 * Setup test environment
 */
function setup() {
  // Create test project directory
  if (!fs.existsSync(TEST_PROJECT)) {
    fs.mkdirSync(TEST_PROJECT, { recursive: true });
  }

  // Ensure context directory exists
  if (!fs.existsSync(CONTEXT_DIR)) {
    fs.mkdirSync(CONTEXT_DIR, { recursive: true });
  }

  // Clean up any existing test tokens
  if (fs.existsSync(TOKEN_DIR)) {
    const files = fs.readdirSync(TOKEN_DIR);
    files.forEach(file => {
      if (file.startsWith('session-')) {
        fs.unlinkSync(path.join(TOKEN_DIR, file));
      }
    });
  }
}

/**
 * Cleanup test environment
 */
function cleanup() {
  // Remove test project context
  if (fs.existsSync(CONTEXT_PATH)) {
    fs.unlinkSync(CONTEXT_PATH);
  }

  // Remove test project directory
  if (fs.existsSync(TEST_PROJECT)) {
    fs.rmSync(TEST_PROJECT, { recursive: true, force: true });
  }

  // Clean up test tokens
  if (fs.existsSync(TOKEN_DIR)) {
    const files = fs.readdirSync(TOKEN_DIR);
    files.forEach(file => {
      if (file.startsWith('session-')) {
        fs.unlinkSync(path.join(TOKEN_DIR, file));
      }
    });
  }
}

/**
 * Main test execution
 */
async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('PROTOCOL ENFORCEMENT WITH PROJECT CONTEXT TESTS');
  console.log('='.repeat(70) + '\n');

  setup();

  // Test 1: Hook blocks WITHOUT context and WITHOUT token
  test('Hook blocks without token (no context)', async () => {
    const input = {
      userPrompt: 'Create test.txt',
      toolName: 'Write',
      args: { file_path: 'test.txt', content: 'test' }
    };

    const result = await runHook(input);

    if (result.code !== 1) {
      throw new Error(`Expected exit code 1 (blocked), got ${result.code}`);
    }

    if (!result.output.includes('WORKFLOW ENFORCEMENT ACTIVE')) {
      throw new Error('Missing workflow enforcement message');
    }
  });

  // Test 2: Add project context
  const projectContext = {
    enabled: true,
    summary: 'Test project with protocol enforcement',
    highlights: ['MCP tools available', 'Hooks installed'],
    reminders: ['Complete TEACH → LEARN → REASON workflow']
  };
  fs.writeFileSync(CONTEXT_PATH, JSON.stringify(projectContext, null, 2));

  // Test 3: Hook blocks WITH context and WITHOUT token
  test('Hook blocks without token (with context)', async () => {
    const input = {
      userPrompt: 'Create test.txt',
      toolName: 'Write',
      args: { file_path: 'test.txt', content: 'test' }
    };

    const result = await runHook(input);

    if (result.code !== 1) {
      throw new Error(`Expected exit code 1 (blocked), got ${result.code}`);
    }

    if (!result.output.includes('WORKFLOW ENFORCEMENT ACTIVE')) {
      throw new Error('Missing workflow enforcement message');
    }

    if (!result.output.includes('PROJECT CONTEXT')) {
      throw new Error('Missing project context display');
    }

    if (!result.output.includes('Test project with protocol enforcement')) {
      throw new Error('Missing project summary');
    }

    if (!result.output.includes('Complete TEACH → LEARN → REASON workflow')) {
      throw new Error('Missing project reminder');
    }
  });

  // Test 4: Create valid session token
  if (!fs.existsSync(TOKEN_DIR)) {
    fs.mkdirSync(TOKEN_DIR, { recursive: true });
  }

  const sessionToken = {
    token: 'test-token-12345',
    created_at: Date.now(),
    expires_at: Date.now() + 3600000, // 1 hour
    session_id: 'test-session'
  };
  const tokenFile = `session-${Date.now()}-testtoken.json`;
  fs.writeFileSync(
    path.join(TOKEN_DIR, tokenFile),
    JSON.stringify(sessionToken, null, 2)
  );

  // Test 5: Hook allows WITH context and WITH token
  test('Hook allows with valid token (with context)', async () => {
    const input = {
      userPrompt: 'Create test.txt',
      toolName: 'Write',
      args: { file_path: 'test.txt', content: 'test' }
    };

    const result = await runHook(input);

    if (result.code !== 0) {
      throw new Error(`Expected exit code 0 (allowed), got ${result.code}`);
    }

    // Should NOT show workflow enforcement when token exists
    if (result.output.includes('WORKFLOW ENFORCEMENT ACTIVE')) {
      throw new Error('Should skip workflow message when token exists');
    }

    // Should still pass through the prompt
    if (!result.output.includes('Create test.txt')) {
      throw new Error('Missing user prompt in output');
    }
  });

  // Test 6: Test with malformed context (should fallback gracefully)
  const malformedContext = {
    enabled: true,
    summary: 'Test summary',
    highlights: 'not an array', // Type error
    reminders: ['Valid reminder']
  };
  fs.writeFileSync(CONTEXT_PATH, JSON.stringify(malformedContext, null, 2));

  test('Hook handles malformed context gracefully', async () => {
    const input = {
      userPrompt: 'Create test.txt',
      toolName: 'Write',
      args: { file_path: 'test.txt', content: 'test' }
    };

    // Remove token to test blocking behavior
    fs.unlinkSync(path.join(TOKEN_DIR, tokenFile));

    const result = await runHook(input);

    if (result.code !== 1) {
      throw new Error(`Expected exit code 1 (blocked), got ${result.code}`);
    }

    if (!result.output.includes('WORKFLOW ENFORCEMENT ACTIVE')) {
      throw new Error('Missing workflow enforcement message');
    }

    // Should NOT crash, should skip malformed context silently
    if (result.output.includes('TypeError') || result.output.includes('is not a function')) {
      throw new Error('Hook crashed on malformed context instead of skipping it');
    }
  });

  // Test 7: Test with disabled context
  const disabledContext = {
    enabled: false,
    summary: 'This should not display',
    highlights: ['Should not display'],
    reminders: ['Should not display']
  };
  fs.writeFileSync(CONTEXT_PATH, JSON.stringify(disabledContext, null, 2));

  test('Hook respects disabled context', async () => {
    const input = {
      userPrompt: 'Create test.txt',
      toolName: 'Write',
      args: { file_path: 'test.txt', content: 'test' }
    };

    const result = await runHook(input);

    if (result.code !== 1) {
      throw new Error(`Expected exit code 1 (blocked), got ${result.code}`);
    }

    if (!result.output.includes('WORKFLOW ENFORCEMENT ACTIVE')) {
      throw new Error('Missing workflow enforcement message');
    }

    // Should NOT show project context when disabled
    if (result.output.includes('PROJECT CONTEXT')) {
      throw new Error('Should not display context when disabled');
    }

    if (result.output.includes('This should not display')) {
      throw new Error('Displayed disabled context content');
    }
  });

  cleanup();

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('TEST SUMMARY');
  console.log('='.repeat(70));
  console.log(`✅ Tests Passed: ${passCount}`);
  console.log(`❌ Tests Failed: ${failCount}`);
  console.log(`Total: ${passCount + failCount} tests\n`);

  if (failCount > 0) {
    console.log('❌ Protocol enforcement compromised by project context!\n');
    process.exit(1);
  } else {
    console.log('✅ Project context does NOT interfere with protocol enforcement!\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Test framework error:', err);
  cleanup();
  process.exit(1);
});
