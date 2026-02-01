#!/usr/bin/env node
/**
 * Workflow Tests - Common workflow patterns
 * v1.4.0: Updated for project-scoped experiences
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { colors, callMCP, parseJSONRPC, test, assertTrue, assertEquals, getStats, createTestProject, cleanupTestProject, getTestDbPath } = require('./test-utils');

let testDir;

async function runTests() {
  console.log(colors.bold + '\nWORKFLOW TESTS (10 tests)' + colors.reset);
  console.log(colors.cyan + '======================================================================' + colors.reset);

  // v1.4.0: Create project-scoped test directory
  testDir = createTestProject();
  const TEST_DB = getTestDbPath(testDir);
  console.log(`\n📁 Test project: ${testDir}\n`);

  // Helper to call MCP with project context
  const call = (tool, args) => callMCP(tool, args, { cwd: testDir });

  // Test 1: Complete reasoning workflow
  await test('Complete reasoning workflow', async () => {
    // Analyze
    const analyze = await call('analyze_problem', {
      problem: 'How to implement caching?'
    });
    const analyzeResp = parseJSONRPC(analyze.stdout).find(r => r.id === 2);
    assertTrue(analyzeResp && analyzeResp.result, 'Analyze should succeed');
    
    const analyzeData = JSON.parse(analyzeResp.result.content[0].text);
    const sessionId = analyzeData.session_id;
    
    // Gather context
    const gather = await call('gather_context', {
      session_id: sessionId,
      sources: { related_experiences: ['cache', 'performance'] }
    });
    const gatherResp = parseJSONRPC(gather.stdout).find(r => r.id === 2);
    assertTrue(gatherResp && gatherResp.result, 'Gather should succeed');
    
    // Reason through
    const reason = await call('reason_through', {
      session_id: sessionId,
      thought: 'Redis provides fast in-memory caching',
      thought_number: 1,
      confidence: 0.8
    });
    const reasonResp = parseJSONRPC(reason.stdout).find(r => r.id === 2);
    assertTrue(reasonResp && reasonResp.result, 'Reason should succeed');
    
    // Finalize
    const finalize = await call('finalize_decision', {
      session_id: sessionId,
      conclusion: 'Use Redis for caching',
      rationale: 'Fast and scalable'
    });
    const finalizeResp = parseJSONRPC(finalize.stdout).find(r => r.id === 2);
    assertTrue(finalizeResp && finalizeResp.result, 'Finalize should succeed');
  });

  // Test 2: Workflow with preset
  await test('Workflow with preset application', async () => {
    const result = await call('apply_preset', {
      preset_name: 'three-gate',
      session_id: 'test-preset-session'
    });
    const resp = parseJSONRPC(result.stdout).find(r => r.id === 2);
    assertTrue(resp && resp.result, 'Preset should apply');
    
    const data = JSON.parse(resp.result.content[0].text);
    assertTrue(data.applied, 'Preset should be applied');
  });

  // Test 3: Token workflow
  await test('Token-based workflow', async () => {
    // Verify compliance
    const verify = await call('verify_compliance', {
      current_phase: 'teach',
      action: 'record_experience'
    });
    const verifyResp = parseJSONRPC(verify.stdout).find(r => r.id === 2);
    assertTrue(verifyResp && verifyResp.result, 'Verify should succeed');
    
    const verifyData = JSON.parse(verifyResp.result.content[0].text);
    
    // Authorize operation
    const auth = await call('authorize_operation', {
      operation_token: verifyData.operation_token
    });
    const authResp = parseJSONRPC(auth.stdout).find(r => r.id === 2);
    assertTrue(authResp && authResp.result, 'Authorize should succeed');
  });

  // Test 4-10: Add more workflow tests
  await test('Search and record workflow', async () => {
    // Search
    const search = await call('search_experiences', {
      query: 'testing patterns'
    });
    const searchResp = parseJSONRPC(search.stdout).find(r => r.id === 2);
    assertTrue(searchResp && searchResp.result, 'Search should work');
    
    // Record
    const record = await call('record_experience', {
      type: 'effective',
      domain: 'Process',
      situation: 'Need comprehensive test coverage',
      approach: 'Split tests into separate files',
      outcome: 'Better organization',
      reasoning: 'Easier to run specific test suites'
    });
    const recordResp = parseJSONRPC(record.stdout).find(r => r.id === 2);
    assertTrue(recordResp && recordResp.result, 'Record should work');
  });

  await test('Config validation workflow', async () => {
    const config = {
      name: 'test-config',
      description: 'Test configuration',
      gates: {
        teach: { required_tools: [], description: 'Test' },
        learn: { required_tools: [], description: 'Test' },
        reason: { required_tools: [], description: 'Test' }
      },
      token_ttl: { operation: 300000, session: 3600000 },
      enforcement: 'moderate'
    };
    
    const result = await call('validate_config', { config });
    const resp = parseJSONRPC(result.stdout).find(r => r.id === 2);
    assertTrue(resp && resp.result, 'Validation should work');
    
    const data = JSON.parse(resp.result.content[0].text);
    assertTrue(data.valid, 'Config should be valid');
  });

  await test('Health check workflow', async () => {
    const result = await call('health_check', {});
    const resp = parseJSONRPC(result.stdout).find(r => r.id === 2);
    assertTrue(resp && resp.result, 'Health check should work');
    
    const data = JSON.parse(resp.result.content[0].text);
    assertTrue(data.status === 'OK', 'Should be healthy');
  });

  await test('Session state workflow', async () => {
    // Create a session first
    const analyze = await call('analyze_problem', {
      problem: 'Test session state'
    });
    const analyzeResp = parseJSONRPC(analyze.stdout).find(r => r.id === 2);
    const analyzeData = JSON.parse(analyzeResp.result.content[0].text);
    const sessionId = analyzeData.session_id;
    
    // Get session state
    const result = await call('get_session_state', { session_id: sessionId });
    const resp = parseJSONRPC(result.stdout).find(r => r.id === 2);
    assertTrue(resp && resp.result, 'Should get session state');
    
    const data = JSON.parse(resp.result.content[0].text);
    assertTrue(data.session_id === sessionId, 'Should match session ID');
  });

  await test('Export and import workflow', async () => {
    // Record an experience
    await call('record_experience', {
      type: 'effective',
      domain: 'Process',
      situation: 'Export test',
      approach: 'Test export',
      outcome: 'Works',
      reasoning: 'Testing'
    });
    
    // Export
    const exportPath = path.join(os.tmpdir(), `export-test-${Date.now()}.json`);
    const exportResult = await call('export_experiences', {
      output_path: exportPath,
      format: 'json'
    });
    const exportResp = parseJSONRPC(exportResult.stdout).find(r => r.id === 2);
    assertTrue(exportResp && exportResp.result, 'Export should work');
    
    // Import
    const importResult = await call('import_data', {
      source_file: exportPath
    });
    const importResp = parseJSONRPC(importResult.stdout).find(r => r.id === 2);
    assertTrue(importResp && importResp.result, 'Import should work');
    
    // Cleanup
    if (fs.existsSync(exportPath)) {
      fs.unlinkSync(exportPath);
    }
  });

  await test('Hook installation workflow', async () => {
    const result = await call('install_hooks', {
      hooks: ['all']
    });
    const resp = parseJSONRPC(result.stdout).find(r => r.id === 2);
    assertTrue(resp && resp.result, 'Install should work');
    
    const data = JSON.parse(resp.result.content[0].text);
    assertTrue(data.installed, 'Should be installed');
    assertTrue(data.hooks.length > 0, 'Should have hooks');
  });

  await test('Workflow reset', async () => {
    const result = await call('reset_workflow', {
      session_id: 'test-reset'
    });
    const resp = parseJSONRPC(result.stdout).find(r => r.id === 2);
    assertTrue(resp && resp.result, 'Reset should work');
    
    const data = JSON.parse(resp.result.content[0].text);
    assertTrue(data.reset, 'Should be reset');
  });

  const stats = getStats();
  console.log('\n' + colors.cyan + '======================================================================' + colors.reset);
  console.log(colors.bold + 'WORKFLOW TESTS SUMMARY' + colors.reset);
  console.log(colors.cyan + '======================================================================' + colors.reset);
  console.log(colors.green + `Tests Passed: ${stats.testsPassed}` + colors.reset);
  console.log(colors.red + `Tests Failed: ${stats.testsFailed}` + colors.reset);
  console.log(`Total: ${stats.testsRun} tests`);

  // v1.4.0: Cleanup test project
  cleanupTestProject(testDir);

  process.exit(stats.testsFailed > 0 ? 1 : 0);
}

runTests().catch(e => {
  cleanupTestProject(testDir);
  console.error(e);
  process.exit(1);
});
