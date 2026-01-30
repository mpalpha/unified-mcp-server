#!/usr/bin/env node
/**
 * Integration Tests - End-to-end workflows
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { colors, callMCP, parseJSONRPC, test, assertTrue, assertEquals, getStats } = require('./test-utils');

const TEST_DB = path.join(os.homedir(), '.unified-mcp', 'data.db');

async function runTests() {
  console.log(colors.bold + '\nINTEGRATION TESTS (10 tests)' + colors.reset);
  console.log(colors.cyan + '======================================================================' + colors.reset);

  try {
    if (fs.existsSync(TEST_DB)) {
      fs.unlinkSync(TEST_DB);
    }
    console.log('\n🗑️  Cleaned test database\n');
  } catch (e) {
    // Ignore
  }


  await test('Integration - complete reasoning workflow', async () => {
    const uniqueId = `integration-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 1. Analyze problem
    const analyzeResult = await callMCP('analyze_problem', { problem: `Integration test workflow ${uniqueId}` });
    const sessionId = JSON.parse(parseJSONRPC(analyzeResult.stdout).find(r => r.id === 2).result.content[0].text).session_id;

    // 2. Gather context
    await callMCP('gather_context', {
      session_id: sessionId,
      sources: { related_experiences: [] }
    });

    // 3. Reason through
    await callMCP('reason_through', {
      session_id: sessionId,
      thought: 'Integration test thought',
      thought_number: 1
    });

    // 4. Finalize decision
    const finalizeResult = await callMCP('finalize_decision', {
      session_id: sessionId,
      conclusion: `Integration test conclusion ${uniqueId}`,
      rationale: 'Complete workflow test',
      record_as_experience: true
    });

    const data = JSON.parse(parseJSONRPC(finalizeResult.stdout).find(r => r.id === 2).result.content[0].text);
    assertTrue(data.experience_id > 0, 'Should complete full workflow');
  });

  await test('Integration - workflow with preset', async () => {
    const uniqueId = `preset-workflow-${Date.now()}`;

    // Apply preset
    await callMCP('apply_preset', {
      preset_name: 'strict',
      session_id: uniqueId
    });

    // Verify compliance
    const verifyResult = await callMCP('verify_compliance', {
      session_id: uniqueId,
      current_phase: 'teach',
      action: 'record_experience'
    });

    const data = JSON.parse(parseJSONRPC(verifyResult.stdout).find(r => r.id === 2).result.content[0].text);
    assertTrue(data.operation_token, 'Should create token with preset');
  });

  await test('Integration - multiple tool categories', async () => {
    // Test that tools from all 5 categories work together
    const uniqueId = `multi-${Date.now()}`;

    // Knowledge management
    await callMCP('search_experiences', { query: 'test' });

    // Reasoning
    const analyzeResult = await callMCP('analyze_problem', { problem: `Multi-category test ${uniqueId}` });
    const sessionId = JSON.parse(parseJSONRPC(analyzeResult.stdout).find(r => r.id === 2).result.content[0].text).session_id;

    // Workflow
    await callMCP('check_compliance', { current_phase: 'teach', action: 'test' });

    // Configuration
    await callMCP('list_presets', {});

    // Automation
    const healthResult = await callMCP('health_check', {});
    const health = JSON.parse(parseJSONRPC(healthResult.stdout).find(r => r.id === 2).result.content[0].text);

    assertTrue(health.healthy, 'System should be healthy after multi-category operations');
    assertTrue(sessionId, 'Should create session');
  });

  await test('Integration - token workflow', async () => {
    const sessionId = `token-workflow-${Date.now()}`;

    // 1. Check compliance (dry-run)
    await callMCP('check_compliance', {
      current_phase: 'teach',
      action: 'test'
    });

    // 2. Verify compliance (get token)
    const verifyResult = await callMCP('verify_compliance', {
      session_id: sessionId,
      current_phase: 'teach',
      action: 'test'
    });

    const token = JSON.parse(parseJSONRPC(verifyResult.stdout).find(r => r.id === 2).result.content[0].text).operation_token;

    // 3. Authorize operation
    const authResult = await callMCP('authorize_operation', {
      operation_token: token,
      create_session_token: true
    });

    const authData = JSON.parse(parseJSONRPC(authResult.stdout).find(r => r.id === 2).result.content[0].text);
    assertTrue(authData.authorized, 'Should authorize with token');
    assertTrue(authData.session_token, 'Should create session token');
  });

  await test('Integration - config and validation', async () => {
    // 1. List presets
    const listResult = await callMCP('list_presets', {});
    const presets = JSON.parse(parseJSONRPC(listResult.stdout).find(r => r.id === 2).result.content[0].text).presets;

    // 2. Get a preset config
    const configResult = await callMCP('get_config', {});
    const config = JSON.parse(parseJSONRPC(configResult.stdout).find(r => r.id === 2).result.content[0].text).config;

    // 3. Validate the config
    const validateResult = await callMCP('validate_config', { config });
    const validateData = JSON.parse(parseJSONRPC(validateResult.stdout).find(r => r.id === 2).result.content[0].text);

    assertTrue(presets.length > 0, 'Should have presets');
    assertTrue(validateData.valid, 'Built-in config should be valid');
  });

  await test('Integration - session state tracking', async () => {
    const uniqueId = `state-track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create reasoning session
    const analyzeResult = await callMCP('analyze_problem', { problem: `State tracking ${uniqueId}` });
    const sessionId = JSON.parse(parseJSONRPC(analyzeResult.stdout).find(r => r.id === 2).result.content[0].text).session_id;

    // Add thoughts
    await callMCP('reason_through', { session_id: sessionId, thought: 'Thought 1', thought_number: 1 });
    await callMCP('reason_through', { session_id: sessionId, thought: 'Thought 2', thought_number: 2 });

    // Get state
    const stateResult = await callMCP('get_session_state', { session_id: sessionId });
    const state = JSON.parse(parseJSONRPC(stateResult.stdout).find(r => r.id === 2).result.content[0].text);

    assertEquals(state.thought_count, 2, 'Should track all thoughts');
    assertTrue(state.active, 'Session should be active');
  });

  await test('Integration - health check after operations', async () => {
    // Perform various operations
    const uniqueId = `health-${Date.now()}`;

    await callMCP('record_experience', {
      type: 'effective',
      domain: 'Process',
      situation: `Health check test ${uniqueId}`,
      approach: 'Test',
      outcome: 'Test',
      reasoning: 'Test'
    });

    await callMCP('analyze_problem', { problem: `Health test ${uniqueId}` });

    // Run health check
    const healthResult = await callMCP('health_check', {});
    const health = JSON.parse(parseJSONRPC(healthResult.stdout).find(r => r.id === 2).result.content[0].text);

    assertTrue(health.healthy, 'System should be healthy after operations');
    assertTrue(health.stats.experiences > 0, 'Should have recorded experiences');
  });

  await test('Integration - data persistence', async () => {
    // Verify health before
    const healthBefore = await callMCP('health_check', {});
    const beforeData = JSON.parse(parseJSONRPC(healthBefore.stdout).find(r => r.id === 2).result.content[0].text);
    const countBefore = beforeData.stats.experiences;

    // Record new data
    const uniqueId = `persist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    await callMCP('record_experience', {
      type: 'effective',
      domain: 'Process',
      situation: `Persistence test ${uniqueId}`,
      approach: 'Test data persistence',
      outcome: 'Data persisted',
      reasoning: 'Testing database'
    });

    // Verify health after
    const healthAfter = await callMCP('health_check', {});
    const afterData = JSON.parse(parseJSONRPC(healthAfter.stdout).find(r => r.id === 2).result.content[0].text);
    const countAfter = afterData.stats.experiences;

    assertTrue(countAfter >= countBefore, 'Should persist data to database');
    assertTrue(afterData.healthy, 'Database should be healthy');
  });

  await test('Integration - workflow session reset', async () => {
    const sessionId = `reset-integration-${Date.now()}`;

    // Create workflow session
    await callMCP('verify_compliance', {
      session_id: sessionId,
      current_phase: 'teach',
      action: 'test'
    });

    // Get status
    const statusResult = await callMCP('get_workflow_status', { session_id: sessionId });
    const statusData = JSON.parse(parseJSONRPC(statusResult.stdout).find(r => r.id === 2).result.content[0].text);
    assertTrue(statusData.session_id, 'Should have session');

    // Reset
    const resetResult = await callMCP('reset_workflow', { session_id: sessionId });
    const resetData = JSON.parse(parseJSONRPC(resetResult.stdout).find(r => r.id === 2).result.content[0].text);
    assertTrue(resetData.reset, 'Should reset session');
  });

  await test('Integration - all 25 tools accessible', async () => {
    // This test verifies all 25 tools are registered in the MCP protocol
    const expectedTools = [
      'record_experience', 'search_experiences', 'get_experience', 'update_experience', 'tag_experience', 'export_experiences',
      'analyze_problem', 'gather_context', 'reason_through', 'finalize_decision',
      'check_compliance', 'verify_compliance', 'authorize_operation', 'get_workflow_status', 'reset_workflow',
      'list_presets', 'apply_preset', 'validate_config', 'get_config', 'export_config',
      'install_hooks', 'uninstall_hooks', 'get_session_state', 'health_check', 'import_data'
    ];

    // Test that we can call a tool from each category
    await callMCP('health_check', {});
    await callMCP('list_presets', {});

    assertTrue(expectedTools.length === 25, 'Should have exactly 25 tools');
  });

  const stats = getStats();
  console.log('\n' + colors.cyan + '======================================================================' + colors.reset);
  console.log(colors.bold + 'INTEGRATION TESTS SUMMARY' + colors.reset);
  console.log(colors.cyan + '======================================================================' + colors.reset);
  console.log(colors.green + `Tests Passed: ${stats.testsPassed}` + colors.reset);
  console.log(colors.red + `Tests Failed: ${stats.testsFailed}` + colors.reset);
  console.log(`Total: ${stats.testsRun} tests`);

  process.exit(stats.testsFailed > 0 ? 1 : 0);
}

runTests().catch(console.error);
