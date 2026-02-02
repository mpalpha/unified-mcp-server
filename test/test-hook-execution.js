#!/usr/bin/env node
/**
 * Hook Execution Tests - Actually execute hooks and verify blocking behavior
 * These tests run the real hook scripts to verify they work correctly
 *
 * v1.2.1: Added test for user-prompt-submit output format (should not re-echo prompt)
 * v1.4.0: Updated for project-scoped experiences
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');
const { colors, callMCP, parseJSONRPC, test, assertTrue, getStats, createTestProject, cleanupTestProject, getTestClaudeDir, getTestDbPath } = require('./test-utils');

let testDir;
let CLAUDE_DIR;
let HOOKS_DIR;
let TOKEN_DIR;
let TEST_DB;

async function runTests() {
  console.log(colors.bold + '\nHOOK EXECUTION TESTS (6 tests)' + colors.reset);
  console.log(colors.cyan + '======================================================================' + colors.reset);
  console.log('These tests execute real hooks and verify blocking behavior\n');

  // v1.4.0: Create project-scoped test directory
  testDir = createTestProject();
  CLAUDE_DIR = getTestClaudeDir(testDir);
  HOOKS_DIR = path.join(CLAUDE_DIR, 'hooks');
  TOKEN_DIR = path.join(CLAUDE_DIR, 'tokens');
  TEST_DB = getTestDbPath(testDir);
  console.log(`📁 Test project: ${testDir}\n`);

  // Helper to call MCP with project context
  const call = (tool, args) => callMCP(tool, args, { cwd: testDir });

  // Install hooks first (don't modify global settings)
  await call('install_hooks', { hooks: ['all'], update_settings: false });
  console.log('✓ Hooks installed\n');

  // Test 1: pre-tool-use hook blocks Write without token
  await test('Hook BLOCKS Write tool without session token', () => {
    console.log('\n  📋 Testing: Write operation with no token');
    console.log('  ─────────────────────────────────────────');

    // Ensure no tokens exist
    if (fs.existsSync(TOKEN_DIR)) {
      fs.readdirSync(TOKEN_DIR).forEach(f => {
        if (f.startsWith('session-')) fs.unlinkSync(path.join(TOKEN_DIR, f));
      });
    }

    const hookPath = path.join(HOOKS_DIR, 'pre-tool-use.cjs');
    assertTrue(fs.existsSync(hookPath), 'Hook file must exist');

    // Execute hook with Write tool
    const hookInput = JSON.stringify({
      toolName: 'Write',
      arguments: { file_path: '/tmp/test.txt', content: 'test' }
    });

    try {
      execSync(`echo '${hookInput}' | node "${hookPath}"`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: testDir,
        env: { ...process.env, PWD: testDir }
      });
      throw new Error('Hook should have blocked operation (exit 1)');
    } catch (error) {
      assertTrue(error.status === 1, 'Hook should exit with code 1 to block operation');
      console.log('  ✅ Hook correctly BLOCKED Write operation (exit code 1)');
    }
  });

  // Test 2: pre-tool-use hook allows Write WITH valid token
  await test('Hook ALLOWS Write tool with valid session token', async () => {
    console.log('\n  📋 Testing: Write operation with valid token');
    console.log('  ────────────────────────────────────────────');

    // Create a valid session token
    const sessionToken = `session-${Date.now()}-test`;
    const tokenPath = path.join(TOKEN_DIR, `${sessionToken}.json`);
    const tokenData = {
      token_id: sessionToken,
      created_at: Date.now(),
      expires_at: Date.now() + (60 * 60 * 1000), // 60 minutes
      type: 'session'
    };
    fs.writeFileSync(tokenPath, JSON.stringify(tokenData, null, 2));
    console.log('  ✓ Created valid session token');

    const hookPath = path.join(HOOKS_DIR, 'pre-tool-use.cjs');
    const hookInput = JSON.stringify({
      toolName: 'Write',
      arguments: { file_path: '/tmp/test.txt', content: 'test' }
    });

    // Execute hook - should NOT block (exit 0)
    try {
      const output = execSync(`echo '${hookInput}' | node "${hookPath}"`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: testDir,
        env: { ...process.env, PWD: testDir }
      });
      console.log('  ✅ Hook correctly ALLOWED Write operation (exit code 0)');
    } catch (error) {
      throw new Error(`Hook should have allowed operation with valid token, but exited with ${error.status}`);
    }

    // Cleanup
    fs.unlinkSync(tokenPath);
  });

  // Test 3: pre-tool-use hook blocks Edit without token
  await test('Hook BLOCKS Edit tool without session token', () => {
    console.log('\n  📋 Testing: Edit operation with no token');
    console.log('  ───────────────────────────────────────');

    // Remove all tokens
    if (fs.existsSync(TOKEN_DIR)) {
      fs.readdirSync(TOKEN_DIR).forEach(f => {
        if (f.startsWith('session-')) fs.unlinkSync(path.join(TOKEN_DIR, f));
      });
    }

    const hookPath = path.join(HOOKS_DIR, 'pre-tool-use.cjs');
    const hookInput = JSON.stringify({
      toolName: 'Edit',
      arguments: {
        file_path: '/tmp/test.txt',
        old_string: 'old',
        new_string: 'new'
      }
    });

    try {
      execSync(`echo '${hookInput}' | node "${hookPath}"`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: testDir,
        env: { ...process.env, PWD: testDir }
      });
      throw new Error('Hook should have blocked Edit operation');
    } catch (error) {
      assertTrue(error.status === 1, 'Hook should exit with code 1');
      console.log('  ✅ Hook correctly BLOCKED Edit operation (exit code 1)');
    }
  });

  // Test 4: pre-tool-use hook allows non-file-operation tools
  await test('Hook ALLOWS non-file operations (search_experiences)', () => {
    console.log('\n  📋 Testing: Non-file operation (no token needed)');
    console.log('  ───────────────────────────────────────────────');

    // Remove all tokens
    if (fs.existsSync(TOKEN_DIR)) {
      fs.readdirSync(TOKEN_DIR).forEach(f => {
        if (f.startsWith('session-')) fs.unlinkSync(path.join(TOKEN_DIR, f));
      });
    }

    const hookPath = path.join(HOOKS_DIR, 'pre-tool-use.cjs');
    const hookInput = JSON.stringify({
      toolName: 'search_experiences',
      arguments: { query: 'test' }
    });

    // Should NOT block - search doesn't require tokens
    try {
      execSync(`echo '${hookInput}' | node "${hookPath}"`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: testDir,
        env: { ...process.env, PWD: testDir }
      });
      console.log('  ✅ Hook correctly ALLOWED search_experiences (exit code 0)');
    } catch (error) {
      throw new Error(`Hook should allow search_experiences, but exited with ${error.status}`);
    }
  });

  // Test 5: Full workflow - get token, verify hook allows operation
  await test('Complete workflow: Verify → Authorize → Hook Allows', async () => {
    console.log('\n  📋 Testing: Complete authorization workflow');
    console.log('  ──────────────────────────────────────────────');

    const sessionId = `hook-workflow-${Date.now()}`;

    // Step 1: Verify compliance and get operation token
    console.log('  1️⃣  Verifying compliance...');
    const verifyResult = await call('verify_compliance', {
      session_id: sessionId,
      current_phase: 'reason',
      action: 'edit_file'
    });
    const verifyData = JSON.parse(parseJSONRPC(verifyResult.stdout).find(r => r.id === 2).result.content[0].text);
    assertTrue(verifyData.operation_token, 'Should get operation token');
    console.log('  ✓ Operation token received');

    // Step 2: Authorize and create session token
    console.log('  2️⃣  Authorizing operation...');
    const authResult = await call('authorize_operation', {
      operation_token: verifyData.operation_token,
      create_session_token: true
    });
    const authData = JSON.parse(parseJSONRPC(authResult.stdout).find(r => r.id === 2).result.content[0].text);
    assertTrue(authData.session_token, 'Should get session token');
    console.log('  ✓ Session token created');

    // Step 3: Verify token file exists
    const tokenFiles = fs.readdirSync(TOKEN_DIR).filter(f => f.startsWith('session-'));
    assertTrue(tokenFiles.length > 0, 'Session token file should exist');
    console.log(`  ✓ Token file exists: ${tokenFiles[0]}`);

    // Step 4: Test hook allows operation with this token
    console.log('  3️⃣  Testing hook with valid token...');
    const hookPath = path.join(HOOKS_DIR, 'pre-tool-use.cjs');
    const hookInput = JSON.stringify({
      toolName: 'Write',
      arguments: { file_path: '/tmp/authorized.txt', content: 'authorized' }
    });

    try {
      execSync(`echo '${hookInput}' | node "${hookPath}"`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: testDir,
        env: { ...process.env, PWD: testDir }
      });
      console.log('  ✅ Hook allowed operation after full authorization workflow');
    } catch (error) {
      throw new Error(`Hook should allow operation after authorization, but exited with ${error.status}`);
    }

    // Cleanup
    tokenFiles.forEach(f => fs.unlinkSync(path.join(TOKEN_DIR, f)));
  });

  // Test 6: user-prompt-submit hook output format (v1.2.1 fix)
  await test('user-prompt-submit outputs ONLY context, not original prompt', () => {
    console.log('\n  📋 Testing: user-prompt-submit output format');
    console.log('  ─────────────────────────────────────────────');

    const hookPath = path.join(HOOKS_DIR, 'user-prompt-submit.cjs');
    assertTrue(fs.existsSync(hookPath), 'user-prompt-submit.cjs must exist');

    // Use a unique test string that should NOT appear in output
    const testPrompt = 'UNIQUE_TEST_PROMPT_12345_SHOULD_NOT_APPEAR';
    const hookInput = JSON.stringify({ userPrompt: testPrompt });

    try {
      const output = execSync(`echo '${hookInput}' | node "${hookPath}"`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: testDir,
        env: { ...process.env, PWD: testDir }
      });

      // Output should NOT contain the original prompt
      assertTrue(
        !output.includes(testPrompt),
        `Hook output should NOT contain original prompt. Found: "${testPrompt}" in output`
      );
      console.log('  ✅ Hook output does NOT contain original prompt');

      // Output SHOULD contain workflow guidance (if config exists)
      // Note: May not show guidance if no config, but should never show prompt
      console.log('  ✅ Hook correctly outputs only context');

    } catch (error) {
      // Hook should exit 0 for user-prompt-submit
      throw new Error(`user-prompt-submit hook should exit 0, but exited with ${error.status}`);
    }
  });

  const stats = getStats();
  console.log('\n' + colors.cyan + '======================================================================' + colors.reset);
  console.log(colors.bold + 'HOOK EXECUTION TESTS SUMMARY' + colors.reset);
  console.log(colors.cyan + '======================================================================' + colors.reset);
  console.log(colors.green + `Tests Passed: ${stats.testsPassed}` + colors.reset);
  console.log(colors.red + `Tests Failed: ${stats.testsFailed}` + colors.reset);
  console.log(`Total: ${stats.testsRun} tests`);

  if (stats.testsPassed === stats.testsRun) {
    console.log('\n' + colors.green + '✅ All hooks execute correctly and enforce workflow!' + colors.reset);
  }

  // v1.4.0: Cleanup test project
  cleanupTestProject(testDir);

  process.exit(stats.testsFailed > 0 ? 1 : 0);
}

runTests().catch(e => {
  cleanupTestProject(testDir);
  console.error(e);
  process.exit(1);
});
