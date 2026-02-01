#!/usr/bin/env node
/**
 * Compliance Tests - Workflow enforcement and protocol compliance
 * v1.4.0: Updated for project-scoped experiences
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { colors, callMCP, parseJSONRPC, test, assertTrue, assertEquals, getStats, createTestProject, cleanupTestProject, getTestDbPath } = require('./test-utils');

let testDir;

async function runTests() {
  console.log(colors.bold + '\nCOMPLIANCE TESTS (20 tests)' + colors.reset);
  console.log(colors.cyan + '======================================================================' + colors.reset);

  // v1.4.0: Create project-scoped test directory
  testDir = createTestProject();
  const TEST_DB = getTestDbPath(testDir);
  console.log(`\n📁 Test project: ${testDir}\n`);

  // Helper to call MCP with project context
  const call = (tool, args) => callMCP(tool, args, { cwd: testDir });

  console.log(colors.bold + 'Workflow Enforcement Tools' + colors.reset);
  console.log(colors.cyan + '======================================================================' + colors.reset);


  // ===== check_compliance tests =====
  await test('check_compliance - teach phase dry-run', async () => {
    const result = await call('check_compliance', {
      current_phase: 'teach',
      action: 'record_experience'
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.result, 'Should return success');
    const data = JSON.parse(response.result.content[0].text);
    assertTrue(data.compliant !== undefined, 'Should check compliance');
  });

  await test('check_compliance - learn phase', async () => {
    const result = await call('check_compliance', {
      current_phase: 'learn',
      action: 'gather_context'
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.result, 'Should return success');
  });

  await test('check_compliance - reason phase', async () => {
    const result = await call('check_compliance', {
      current_phase: 'reason',
      action: 'reason_through'
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.result, 'Should return success');
  });

  await test('check_compliance - missing action', async () => {
    const result = await call('check_compliance', {
      current_phase: 'teach'
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.error, 'Should return error for missing action');
  });

  // ===== verify_compliance tests =====
  await test('verify_compliance - create operation token', async () => {
    const result = await call('verify_compliance', {
      session_id: 'test_verify_' + Date.now(),
      current_phase: 'teach',
      action: 'record_experience'
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.result, 'Should return success');
    const data = JSON.parse(response.result.content[0].text);
    assertTrue(data.operation_token, 'Should generate operation token');
    assertTrue(data.operation_token.length > 20, 'Token should be substantial');
  });

  await test('verify_compliance - invalid phase', async () => {
    const result = await call('verify_compliance', {
      current_phase: 'invalid',
      action: 'test'
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.error, 'Should return error for invalid phase');
  });

  await test('verify_compliance - missing action', async () => {
    const result = await call('verify_compliance', {
      current_phase: 'teach'
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.error, 'Should return error for missing action');
  });

  await test('verify_compliance - with session tracking', async () => {
    const sessionId = 'session_' + Date.now();
    const result = await call('verify_compliance', {
      session_id: sessionId,
      current_phase: 'learn',
      action: 'search_experiences'
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.result, 'Should return success');
    const data = JSON.parse(response.result.content[0].text);
    assertTrue(data.session_id === sessionId, 'Should track session');
  });

  // ===== authorize_operation tests =====
  await test('authorize_operation - valid token', async () => {
    // First get a token
    const verifyResult = await call('verify_compliance', {
      current_phase: 'teach',
      action: 'test_action'
    });
    const verifyResponses = parseJSONRPC(verifyResult.stdout);
    const verifyResponse = verifyResponses.find(r => r.id === 2);
    const verifyData = JSON.parse(verifyResponse.result.content[0].text);
    const token = verifyData.operation_token;

    // Now authorize with it
    const result = await call('authorize_operation', {
      operation_token: token
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.result, 'Should authorize valid token');
    const data = JSON.parse(response.result.content[0].text);
    assertTrue(data.authorized === true, 'Should be authorized');
  });

  await test('authorize_operation - create session token', async () => {
    // First get a token
    const verifyResult = await call('verify_compliance', {
      current_phase: 'learn',
      action: 'test_action'
    });
    const verifyResponses = parseJSONRPC(verifyResult.stdout);
    const verifyResponse = verifyResponses.find(r => r.id === 2);
    const verifyData = JSON.parse(verifyResponse.result.content[0].text);
    const token = verifyData.operation_token;

    // Authorize and request session token
    const result = await call('authorize_operation', {
      operation_token: token,
      create_session_token: true
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.result, 'Should create session token');
    const data = JSON.parse(response.result.content[0].text);
    assertTrue(data.session_token, 'Should have session token');
    assertTrue(data.session_token.length > 20, 'Session token should be substantial');
  });

  await test('authorize_operation - invalid token', async () => {
    const result = await call('authorize_operation', {
      operation_token: 'invalid_token_12345'
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.error, 'Should reject invalid token');
  });

  await test('authorize_operation - missing token', async () => {
    const result = await call('authorize_operation', {});

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.error, 'Should require operation_token');
  });

  // ===== get_workflow_status tests =====
  await test('get_workflow_status - existing session', async () => {
    const sessionId = 'status_test_' + Date.now();

    // First create a session
    await call('verify_compliance', {
      session_id: sessionId,
      current_phase: 'teach',
      action: 'test'
    });

    // Now get status
    const result = await call('get_workflow_status', {
      session_id: sessionId
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.result, 'Should return status');
    const data = JSON.parse(response.result.content[0].text);
    assertTrue(data.session_id === sessionId, 'Should match session ID');
    assertTrue(data.current_phase, 'Should have current phase');
  });

  await test('get_workflow_status - new session', async () => {
    const result = await call('get_workflow_status', {
      session_id: 'new_session_' + Date.now()
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.result, 'Should return status for new session');
    const data = JSON.parse(response.result.content[0].text);
    assertTrue(data.session_id, 'Should have session ID');
  });

  await test('get_workflow_status - without session_id', async () => {
    const result = await call('get_workflow_status', {});

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.result, 'Should return default status');
  });

  await test('get_workflow_status - phase transitions', async () => {
    const sessionId = 'transition_test_' + Date.now();

    // Create session in teach phase
    await call('verify_compliance', {
      session_id: sessionId,
      current_phase: 'teach',
      action: 'test'
    });

    // Get status
    const result = await call('get_workflow_status', {
      session_id: sessionId
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.result, 'Should track phase');
  });

  // ===== reset_workflow tests =====
  await test('reset_workflow - specific session', async () => {
    const sessionId = 'reset_test_' + Date.now();

    // Create a session
    await call('verify_compliance', {
      session_id: sessionId,
      current_phase: 'teach',
      action: 'test'
    });

    // Reset it
    const result = await call('reset_workflow', {
      session_id: sessionId
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.result, 'Should reset session');
    const data = JSON.parse(response.result.content[0].text);
    assertTrue(data.reset === true, 'Should confirm reset');
  });

  await test('reset_workflow - cleanup expired tokens', async () => {
    const result = await call('reset_workflow', {
      cleanup_only: true
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.result, 'Should cleanup tokens');
    const data = JSON.parse(response.result.content[0].text);
    assertTrue(data.cleaned_up !== undefined, 'Should report cleanup count');
  });

  await test('reset_workflow - without parameters', async () => {
    const result = await call('reset_workflow', {});

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.result, 'Should handle empty parameters');
  });

  await test('reset_workflow - session with multiple operations', async () => {
    const sessionId = 'multi_op_' + Date.now();

    // Create session with multiple operations
    await call('verify_compliance', {
      session_id: sessionId,
      current_phase: 'teach',
      action: 'op1'
    });

    await call('verify_compliance', {
      session_id: sessionId,
      current_phase: 'learn',
      action: 'op2'
    });

    // Reset
    const result = await call('reset_workflow', {
      session_id: sessionId
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.result, 'Should reset session with multiple ops');
  });

  // ========================================================================

  // v1.4.0: Cleanup test project
  cleanupTestProject(testDir);

  const stats = getStats();
  console.log('\n' + colors.cyan + '======================================================================' + colors.reset);
  console.log(colors.bold + 'COMPLIANCE TESTS SUMMARY' + colors.reset);
  console.log(colors.cyan + '======================================================================' + colors.reset);
  console.log(colors.green + `Tests Passed: ${stats.testsPassed}` + colors.reset);
  console.log(colors.red + `Tests Failed: ${stats.testsFailed}` + colors.reset);
  console.log(`Total: ${stats.testsRun} tests`);

  process.exit(stats.testsFailed > 0 ? 1 : 0);
}

runTests().catch(e => {
  cleanupTestProject(testDir);
  console.error(e);
  process.exit(1);
});
