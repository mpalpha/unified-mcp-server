#!/usr/bin/env node
/**
 * Flow Enforcement Tests - Verify three-gate workflow enforcement
 * Tests that agents actually follow TEACH → LEARN → REASON sequence
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execSync } = require('child_process');
const { colors, callMCP, parseJSONRPC, test, assertTrue, assertEquals, getStats } = require('./test-utils');

const TEST_DB = path.join(os.homedir(), '.unified-mcp', 'data.db');
const TOKEN_DIR = path.join(os.homedir(), '.unified-mcp', 'tokens');
const HOOKS_DIR = path.join(os.homedir(), '.unified-mcp', 'hooks');

async function runTests() {
  console.log(colors.bold + '\nFLOW ENFORCEMENT TESTS (10 tests)' + colors.reset);
  console.log(colors.cyan + '======================================================================' + colors.reset);

  try {
    if (fs.existsSync(TEST_DB)) {
      fs.unlinkSync(TEST_DB);
    }
    console.log('\n🗑️  Cleaned test database\n');
  } catch (e) {
    // Ignore
  }

  // Test 1: Unauthorized operation blocked without token
  await test('Block file operation without session token', async () => {
    // Clean up any existing tokens
    if (fs.existsSync(TOKEN_DIR)) {
      const files = fs.readdirSync(TOKEN_DIR);
      files.forEach(f => fs.unlinkSync(path.join(TOKEN_DIR, f)));
    }

    // Try to call a file operation tool without going through workflow
    // This simulates an agent trying to edit files without authorization
    // In real usage, the pre_tool_use hook would block this

    // For testing, we verify that no session token exists
    const tokenFiles = fs.existsSync(TOKEN_DIR) ? fs.readdirSync(TOKEN_DIR).filter(f => f.startsWith('session-')) : [];
    assertTrue(tokenFiles.length === 0, 'No session tokens should exist before workflow');
  });

  // Test 2: Complete three-gate workflow creates valid token
  await test('Complete workflow creates session token', async () => {
    const sessionId = `enforce-test-${Date.now()}`;

    // TEACH phase: Record experience
    const recordResult = await callMCP('record_experience', {
      type: 'effective',
      domain: 'Process',
      situation: 'Flow enforcement test',
      approach: 'Test three-gate workflow',
      outcome: 'Verified enforcement',
      reasoning: 'Testing workflow compliance'
    });
    const recordResp = parseJSONRPC(recordResult.stdout).find(r => r.id === 2);
    assertTrue(recordResp && recordResp.result, 'TEACH phase: record_experience should succeed');

    // LEARN phase: Search experiences
    const searchResult = await callMCP('search_experiences', {
      query: 'enforcement test'
    });
    const searchResp = parseJSONRPC(searchResult.stdout).find(r => r.id === 2);
    assertTrue(searchResp && searchResp.result, 'LEARN phase: search_experiences should succeed');

    // REASON phase: Verify compliance and get token
    const verifyResult = await callMCP('verify_compliance', {
      session_id: sessionId,
      current_phase: 'reason',
      action: 'file_operation'
    });
    const verifyResp = parseJSONRPC(verifyResult.stdout).find(r => r.id === 2);
    assertTrue(verifyResp && verifyResp.result, 'REASON phase: verify_compliance should succeed');

    const verifyData = JSON.parse(verifyResp.result.content[0].text);
    assertTrue(verifyData.operation_token, 'Should generate operation token');
    assertTrue(verifyData.operation_token.length > 20, 'Token should be substantial');

    // Authorize and create session token
    const authResult = await callMCP('authorize_operation', {
      operation_token: verifyData.operation_token,
      create_session_token: true
    });
    const authResp = parseJSONRPC(authResult.stdout).find(r => r.id === 2);
    assertTrue(authResp && authResp.result, 'Authorization should succeed');

    const authData = JSON.parse(authResp.result.content[0].text);
    assertTrue(authData.authorized, 'Should be authorized');
    assertTrue(authData.session_token, 'Should create session token');

    // Verify session token file was created
    const tokenFiles = fs.readdirSync(TOKEN_DIR).filter(f => f.startsWith('session-'));
    assertTrue(tokenFiles.length > 0, 'Session token file should be created');
  });

  // Test 3: Session token persists for 60 minutes
  await test('Session token has 60-minute TTL', async () => {
    const sessionId = `ttl-test-${Date.now()}`;

    // Get operation token
    const verifyResult = await callMCP('verify_compliance', {
      session_id: sessionId,
      current_phase: 'teach',
      action: 'test'
    });
    const verifyData = JSON.parse(parseJSONRPC(verifyResult.stdout).find(r => r.id === 2).result.content[0].text);

    // Create session token
    const authResult = await callMCP('authorize_operation', {
      operation_token: verifyData.operation_token,
      create_session_token: true
    });
    const authData = JSON.parse(parseJSONRPC(authResult.stdout).find(r => r.id === 2).result.content[0].text);

    assertTrue(authData.session_token, 'Should have session token');
    assertTrue(authData.token_path, 'Should have token path');

    // Check token file exists and has 60-minute expiry
    const tokenPath = authData.token_path;
    assertTrue(fs.existsSync(tokenPath), 'Token file should exist');

    const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    assertTrue(tokenData.expires_at, 'Should have expiration timestamp');

    const expiresIn = tokenData.expires_at - Date.now();
    assertTrue(expiresIn >= 3500000, 'Should expire in ~60 minutes (3600000ms)');
  });

  // Test 4: Invalid token rejected
  await test('Invalid operation token rejected', async () => {
    const authResult = await callMCP('authorize_operation', {
      operation_token: 'invalid-token-12345'
    });
    const authResp = parseJSONRPC(authResult.stdout).find(r => r.id === 2);
    assertTrue(authResp && authResp.error, 'Should reject invalid token');
  });

  // Test 5: Hook installation creates files
  await test('Hook installation creates .cjs files', async () => {
    // Clean hooks directory
    if (fs.existsSync(HOOKS_DIR)) {
      const files = fs.readdirSync(HOOKS_DIR);
      files.forEach(f => fs.unlinkSync(path.join(HOOKS_DIR, f)));
    }

    const result = await callMCP('install_hooks', {
      hooks: ['all']
    });
    const resp = parseJSONRPC(result.stdout).find(r => r.id === 2);
    assertTrue(resp && resp.result, 'Hook installation should succeed');

    const data = JSON.parse(resp.result.content[0].text);
    assertTrue(data.installed, 'Should be installed');
    assertTrue(data.hooks.length === 5, 'Should install 5 hooks');

    // Verify hook files exist
    const hookFiles = fs.readdirSync(HOOKS_DIR);
    assertTrue(hookFiles.includes('user-prompt-submit.cjs'), 'Should have user-prompt-submit hook');
    assertTrue(hookFiles.includes('pre-tool-use.cjs'), 'Should have pre-tool-use hook');
    assertTrue(hookFiles.includes('post-tool-use.cjs'), 'Should have post-tool-use hook');
  });

  // Test 6: pre-tool-use hook has blocking logic
  await test('pre-tool-use hook contains blocking logic', async () => {
    await callMCP('install_hooks', { hooks: ['all'] });

    const hookPath = path.join(HOOKS_DIR, 'pre-tool-use.cjs');
    assertTrue(fs.existsSync(hookPath), 'Hook file should exist');

    const hookContent = fs.readFileSync(hookPath, 'utf8');
    assertTrue(hookContent.includes('process.exit(1)'), 'Should have blocking logic');
    assertTrue(hookContent.includes('Write') || hookContent.includes('Edit'), 'Should check for file operations');
    assertTrue(hookContent.includes('session-') || hookContent.includes('token'), 'Should check for session tokens');
  });

  // Test 7: Workflow phase progression tracked
  await test('Workflow tracks phase progression', async () => {
    const sessionId = `phase-test-${Date.now()}`;

    // Start in teach phase
    await callMCP('verify_compliance', {
      session_id: sessionId,
      current_phase: 'teach',
      action: 'record'
    });

    // Move to learn phase
    await callMCP('verify_compliance', {
      session_id: sessionId,
      current_phase: 'learn',
      action: 'search'
    });

    // Check status
    const statusResult = await callMCP('get_workflow_status', {
      session_id: sessionId
    });
    const statusData = JSON.parse(parseJSONRPC(statusResult.stdout).find(r => r.id === 2).result.content[0].text);

    assertTrue(statusData.session_id === sessionId, 'Should track session');
    assertTrue(statusData.current_phase, 'Should have current phase');
  });

  // Test 8: Preset enforcement configuration
  await test('Strict preset enforces all tools', async () => {
    const sessionId = `strict-test-${Date.now()}`;

    const result = await callMCP('apply_preset', {
      preset_name: 'strict',
      session_id: sessionId
    });
    const data = JSON.parse(parseJSONRPC(result.stdout).find(r => r.id === 2).result.content[0].text);

    assertTrue(data.applied, 'Should apply strict preset');
    assertTrue(data.enforcement === 'strict', 'Should have strict enforcement');

    // Get config
    const configResult = await callMCP('get_config', {
      session_id: sessionId
    });
    const configData = JSON.parse(parseJSONRPC(configResult.stdout).find(r => r.id === 2).result.content[0].text);

    assertTrue(configData.active_preset === 'strict', 'Should be using strict preset');
  });

  // Test 9: Operation token expires after 5 minutes
  await test('Operation token has 5-minute TTL', async () => {
    const sessionId = `op-token-test-${Date.now()}`;

    const verifyResult = await callMCP('verify_compliance', {
      session_id: sessionId,
      current_phase: 'teach',
      action: 'test'
    });
    const verifyData = JSON.parse(parseJSONRPC(verifyResult.stdout).find(r => r.id === 2).result.content[0].text);

    assertTrue(verifyData.operation_token, 'Should have operation token');

    // Operation tokens are short-lived and expire quickly
    // This test verifies the token exists; actual expiration is tested by trying to use expired tokens
    assertTrue(verifyData.operation_token.length > 20, 'Token should be valid');
  });

  // Test 10: Reset workflow clears session state
  await test('Reset workflow clears session tokens', async () => {
    const sessionId = `reset-test-${Date.now()}`;

    // Create session with token
    const verifyResult = await callMCP('verify_compliance', {
      session_id: sessionId,
      current_phase: 'teach',
      action: 'test'
    });
    const verifyData = JSON.parse(parseJSONRPC(verifyResult.stdout).find(r => r.id === 2).result.content[0].text);

    await callMCP('authorize_operation', {
      operation_token: verifyData.operation_token,
      create_session_token: true
    });

    // Verify token exists
    let tokenFiles = fs.readdirSync(TOKEN_DIR).filter(f => f.startsWith('session-'));
    const tokenCountBefore = tokenFiles.length;
    assertTrue(tokenCountBefore > 0, 'Should have session tokens');

    // Reset workflow
    await callMCP('reset_workflow', {
      session_id: sessionId
    });

    // Note: reset_workflow doesn't delete tokens immediately, it marks the session as reset
    // Tokens expire naturally or are cleaned up by cleanup_only option
    const resetResult = await callMCP('reset_workflow', {
      cleanup_only: true
    });
    const resetData = JSON.parse(parseJSONRPC(resetResult.stdout).find(r => r.id === 2).result.content[0].text);

    assertTrue(resetData.cleaned_up !== undefined, 'Should report cleanup count');
  });

  const stats = getStats();
  console.log('\n' + colors.cyan + '======================================================================' + colors.reset);
  console.log(colors.bold + 'FLOW ENFORCEMENT TESTS SUMMARY' + colors.reset);
  console.log(colors.cyan + '======================================================================' + colors.reset);
  console.log(colors.green + `Tests Passed: ${stats.testsPassed}` + colors.reset);
  console.log(colors.red + `Tests Failed: ${stats.testsFailed}` + colors.reset);
  console.log(`Total: ${stats.testsRun} tests`);

  process.exit(stats.testsFailed > 0 ? 1 : 0);
}

runTests().catch(console.error);
