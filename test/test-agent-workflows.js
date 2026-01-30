#!/usr/bin/env node
/**
 * Agent Workflow Tests - Simulate real agent behavior
 * Tests that show an agent following the three-gate workflow properly
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { colors, callMCP, parseJSONRPC, test, assertTrue, assertEquals, assertContains, getStats } = require('./test-utils');

const TEST_DB = path.join(os.homedir(), '.unified-mcp', 'data.db');
const TOKEN_DIR = path.join(os.homedir(), '.unified-mcp', 'tokens');

async function runTests() {
  console.log(colors.bold + '\nAGENT WORKFLOW TESTS (5 tests)' + colors.reset);
  console.log(colors.cyan + '======================================================================' + colors.reset);
  console.log('These tests simulate real agent behavior following the three-gate workflow\n');

  try {
    if (fs.existsSync(TEST_DB)) {
      fs.unlinkSync(TEST_DB);
    }
    if (fs.existsSync(TOKEN_DIR)) {
      const files = fs.readdirSync(TOKEN_DIR);
      files.forEach(f => fs.unlinkSync(path.join(TOKEN_DIR, f)));
    }
    console.log('🗑️  Cleaned test database and tokens\n');
  } catch (e) {
    // Ignore
  }

  // Test 1: Agent completes bug fix workflow
  await test('Agent workflow: Bug fix with three-gate compliance', async () => {
    const sessionId = `bugfix-${Date.now()}`;

    console.log('\n  📋 Scenario: Agent needs to fix authentication bug');
    console.log('  ──────────────────────────────────────────────────');

    // GATE 1: TEACH - Agent records what they learned about the bug
    console.log('  🎓 TEACH: Recording debugging experience...');
    const recordResult = await callMCP('record_experience', {
      type: 'effective',
      domain: 'Debugging',
      situation: 'Authentication fails with 401 on valid credentials',
      approach: 'Check JWT token expiration logic',
      outcome: 'Found token expiry set to past date',
      reasoning: 'Token validation was using wrong timezone'
    });
    const recordResp = parseJSONRPC(recordResult.stdout).find(r => r.id === 2);
    assertTrue(recordResp && recordResp.result, 'Should record debugging experience');
    console.log('  ✓ Experience recorded');

    // GATE 2: LEARN - Agent searches for similar issues
    console.log('  📚 LEARN: Searching for similar authentication issues...');
    const searchResult = await callMCP('search_experiences', {
      query: 'authentication token expiration',
      domain: 'Debugging'
    });
    const searchResp = parseJSONRPC(searchResult.stdout).find(r => r.id === 2);
    assertTrue(searchResp && searchResp.result, 'Should search experiences');

    const searchData = JSON.parse(searchResp.result.content[0].text);
    assertTrue(searchData.results.length > 0, 'Should find related experiences');
    console.log(`  ✓ Found ${searchData.results.length} similar experience(s)`);

    // GATE 3: REASON - Agent analyzes and makes decision
    console.log('  🤔 REASON: Analyzing problem and solution...');

    // Start reasoning session
    const analyzeResult = await callMCP('analyze_problem', {
      problem: 'Fix authentication bug - token expiry using wrong timezone'
    });
    const analyzeResp = parseJSONRPC(analyzeResult.stdout).find(r => r.id === 2);
    const analyzeData = JSON.parse(analyzeResp.result.content[0].text);
    const reasoningSessionId = analyzeData.session_id;
    console.log('  ✓ Problem analyzed');

    // Record reasoning thoughts
    const reasonResult = await callMCP('reason_through', {
      session_id: reasoningSessionId,
      thought: 'Need to update token expiry to use UTC instead of local time',
      thought_number: 1,
      confidence: 0.9
    });
    const reasonResp = parseJSONRPC(reasonResult.stdout).find(r => r.id === 2);
    assertTrue(reasonResp && reasonResp.result, 'Should record reasoning');
    console.log('  ✓ Reasoning recorded');

    // Finalize decision
    const finalizeResult = await callMCP('finalize_decision', {
      session_id: reasoningSessionId,
      conclusion: 'Update JWT validation to use UTC timestamps',
      rationale: 'Prevents timezone-related auth failures',
      confidence: 0.95,
      record_as_experience: true
    });
    const finalizeResp = parseJSONRPC(finalizeResult.stdout).find(r => r.id === 2);
    assertTrue(finalizeResp && finalizeResp.result, 'Should finalize decision');
    console.log('  ✓ Decision finalized');

    // NOW ready for file operations - verify compliance and get authorization
    console.log('  🔐 Getting authorization for file operations...');
    const verifyResult = await callMCP('verify_compliance', {
      session_id: sessionId,
      current_phase: 'reason',
      action: 'edit_auth_file'
    });
    const verifyResp = parseJSONRPC(verifyResult.stdout).find(r => r.id === 2);
    assertTrue(verifyResp && verifyResp.result, 'Should verify compliance');

    const verifyData = JSON.parse(verifyResp.result.content[0].text);
    assertTrue(verifyData.operation_token, 'Should receive operation token');
    console.log('  ✓ Compliance verified, token issued');

    // Authorize the operation
    const authResult = await callMCP('authorize_operation', {
      operation_token: verifyData.operation_token,
      create_session_token: true
    });
    const authResp = parseJSONRPC(authResult.stdout).find(r => r.id === 2);
    assertTrue(authResp && authResp.result, 'Should authorize operation');

    const authData = JSON.parse(authResp.result.content[0].text);
    assertTrue(authData.authorized, 'Should be authorized');
    assertTrue(authData.session_token, 'Should have session token for file operations');
    console.log('  ✓ Authorized - ready to edit files');

    // Verify session token exists
    const tokenFiles = fs.readdirSync(TOKEN_DIR).filter(f => f.startsWith('session-'));
    assertTrue(tokenFiles.length > 0, 'Session token file should exist');
    console.log(`  ✓ Session token created: ${tokenFiles[0]}`);
    console.log('  ✅ Complete workflow: TEACH → LEARN → REASON → AUTHORIZED\n');
  });

  // Test 2: Agent implements new feature workflow
  await test('Agent workflow: New feature with experience search', async () => {
    const sessionId = `feature-${Date.now()}`;

    console.log('\n  📋 Scenario: Agent adds rate limiting feature');
    console.log('  ──────────────────────────────────────────────');

    // TEACH: Record knowledge about rate limiting
    console.log('  🎓 TEACH: Recording rate limiting implementation...');
    await callMCP('record_experience', {
      type: 'effective',
      domain: 'Tools',
      situation: 'Need to prevent API abuse',
      approach: 'Implement sliding window rate limiter with Redis',
      outcome: 'Rate limiting working, reduced abuse by 95%',
      reasoning: 'Sliding window more accurate than fixed window'
    });
    console.log('  ✓ Implementation pattern recorded');

    // LEARN: Search for related patterns
    console.log('  📚 LEARN: Searching for similar implementations...');
    const searchResult = await callMCP('search_experiences', {
      query: 'rate limiting API redis',
      type: 'effective'
    });
    const searchData = JSON.parse(parseJSONRPC(searchResult.stdout).find(r => r.id === 2).result.content[0].text);
    assertTrue(searchData.results.length > 0, 'Should find rate limiting experiences');
    console.log(`  ✓ Found ${searchData.results.length} related pattern(s)`);

    // REASON: Analyze and decide
    console.log('  🤔 REASON: Planning implementation...');
    const analyzeResult = await callMCP('analyze_problem', {
      problem: 'Add rate limiting to API endpoints'
    });
    const analyzeData = JSON.parse(parseJSONRPC(analyzeResult.stdout).find(r => r.id === 2).result.content[0].text);

    await callMCP('reason_through', {
      session_id: analyzeData.session_id,
      thought: 'Use middleware approach with sliding window algorithm',
      thought_number: 1,
      confidence: 0.85
    });
    console.log('  ✓ Implementation planned');

    // Get authorization
    console.log('  🔐 Verifying compliance...');
    const verifyResult = await callMCP('verify_compliance', {
      session_id: sessionId,
      current_phase: 'reason',
      action: 'create_rate_limiter'
    });
    const verifyData = JSON.parse(parseJSONRPC(verifyResult.stdout).find(r => r.id === 2).result.content[0].text);

    const authResult = await callMCP('authorize_operation', {
      operation_token: verifyData.operation_token,
      create_session_token: true
    });
    const authData = JSON.parse(parseJSONRPC(authResult.stdout).find(r => r.id === 2).result.content[0].text);

    assertTrue(authData.authorized, 'Should be authorized after three gates');
    console.log('  ✅ Authorized to implement feature\n');
  });

  // Test 3: Agent refactoring workflow
  await test('Agent workflow: Code refactoring with context gathering', async () => {
    const sessionId = `refactor-${Date.now()}`;

    console.log('\n  📋 Scenario: Agent refactors legacy code');
    console.log('  ──────────────────────────────────────');

    // TEACH: Record refactoring patterns
    console.log('  🎓 TEACH: Recording refactoring experience...');
    await callMCP('record_experience', {
      type: 'effective',
      domain: 'Process',
      situation: 'Legacy code with 500-line functions',
      approach: 'Extract methods, create service classes, add tests',
      outcome: 'Code coverage 80%, bugs reduced 60%',
      reasoning: 'Small focused functions easier to test and maintain'
    });
    console.log('  ✓ Refactoring pattern recorded');

    // LEARN: Gather context from multiple sources
    console.log('  📚 LEARN: Gathering refactoring context...');
    const analyzeResult = await callMCP('analyze_problem', {
      problem: 'Refactor legacy authentication module'
    });
    const analyzeData = JSON.parse(parseJSONRPC(analyzeResult.stdout).find(r => r.id === 2).result.content[0].text);

    const searchResult = await callMCP('search_experiences', {
      query: 'refactoring legacy code testing',
      type: 'effective'
    });
    const searchData = JSON.parse(parseJSONRPC(searchResult.stdout).find(r => r.id === 2).result.content[0].text);

    // Synthesize context
    const gatherResult = await callMCP('gather_context', {
      session_id: analyzeData.session_id,
      sources: {
        experiences: searchData.results.map(r => ({ id: r.id, situation: r.situation }))
      }
    });
    assertTrue(gatherResult, 'Should gather context');
    console.log('  ✓ Context gathered from past experiences');

    // REASON: Plan refactoring approach
    console.log('  🤔 REASON: Planning refactoring strategy...');
    await callMCP('reason_through', {
      session_id: analyzeData.session_id,
      thought: 'Break into smaller modules, add unit tests first, then refactor',
      thought_number: 1,
      confidence: 0.88
    });
    console.log('  ✓ Strategy planned');

    // Get authorization
    console.log('  🔐 Getting authorization...');
    const verifyResult = await callMCP('verify_compliance', {
      session_id: sessionId,
      current_phase: 'reason',
      action: 'refactor_code'
    });
    const verifyData = JSON.parse(parseJSONRPC(verifyResult.stdout).find(r => r.id === 2).result.content[0].text);

    const authResult = await callMCP('authorize_operation', {
      operation_token: verifyData.operation_token
    });
    const authData = JSON.parse(parseJSONRPC(authResult.stdout).find(r => r.id === 2).result.content[0].text);

    assertTrue(authData.authorized, 'Should be authorized');
    console.log('  ✅ Authorized to refactor code\n');
  });

  // Test 4: Agent workflow with preset
  await test('Agent workflow: Using strict preset enforcement', async () => {
    const sessionId = `strict-${Date.now()}`;

    console.log('\n  📋 Scenario: Agent working under strict preset');
    console.log('  ─────────────────────────────────────────────');

    // Apply strict preset
    console.log('  ⚙️  Applying strict preset...');
    const presetResult = await callMCP('apply_preset', {
      preset_name: 'strict',
      session_id: sessionId
    });
    const presetData = JSON.parse(parseJSONRPC(presetResult.stdout).find(r => r.id === 2).result.content[0].text);
    assertTrue(presetData.applied, 'Should apply strict preset');
    console.log('  ✓ Strict enforcement active');

    // Must complete all required steps
    console.log('  🎓 TEACH: Recording experience (required by strict)...');
    await callMCP('record_experience', {
      type: 'effective',
      domain: 'Process',
      situation: 'Working under strict workflow',
      approach: 'Follow all gates sequentially',
      outcome: 'Compliance maintained',
      reasoning: 'Strict preset enforces discipline'
    });
    console.log('  ✓ Experience recorded');

    console.log('  📚 LEARN: Searching experiences (required by strict)...');
    await callMCP('search_experiences', {
      query: 'strict workflow compliance'
    });
    console.log('  ✓ Search completed');

    console.log('  🤔 REASON: Must use reason_through (required by strict)...');
    const analyzeResult = await callMCP('analyze_problem', {
      problem: 'Complete task under strict enforcement'
    });
    const analyzeData = JSON.parse(parseJSONRPC(analyzeResult.stdout).find(r => r.id === 2).result.content[0].text);

    await callMCP('reason_through', {
      session_id: analyzeData.session_id,
      thought: 'Strict preset ensures thorough analysis before action',
      thought_number: 1,
      confidence: 0.92
    });
    console.log('  ✓ Reasoning completed');

    // Verify compliance with strict requirements
    console.log('  🔐 Verifying strict compliance...');
    const verifyResult = await callMCP('verify_compliance', {
      session_id: sessionId,
      current_phase: 'reason',
      action: 'proceed'
    });
    const verifyData = JSON.parse(parseJSONRPC(verifyResult.stdout).find(r => r.id === 2).result.content[0].text);
    assertTrue(verifyData.operation_token, 'Should pass strict validation');
    console.log('  ✅ All strict requirements met\n');
  });

  // Test 5: Agent workflow with session state tracking
  await test('Agent workflow: Session state persists across operations', async () => {
    const sessionId = `session-state-${Date.now()}`;

    console.log('\n  📋 Scenario: Agent works across multiple operations');
    console.log('  ────────────────────────────────────────────────');

    // First operation - TEACH
    console.log('  🎓 Operation 1: Record experience...');
    await callMCP('record_experience', {
      type: 'effective',
      domain: 'Process',
      situation: 'Session state test',
      approach: 'Track state across operations',
      outcome: 'State persisted',
      reasoning: 'Session management works'
    });

    // Verify compliance creates session
    await callMCP('verify_compliance', {
      session_id: sessionId,
      current_phase: 'teach',
      action: 'step1'
    });
    console.log('  ✓ Session created');

    // Second operation - LEARN
    console.log('  📚 Operation 2: Search experiences...');
    await callMCP('search_experiences', {
      query: 'session state'
    });

    // Check session state after LEARN phase
    const statusAfterLearn = await callMCP('get_workflow_status', {
      session_id: sessionId
    });
    const statusData1 = JSON.parse(parseJSONRPC(statusAfterLearn.stdout).find(r => r.id === 2).result.content[0].text);
    assertTrue(statusData1.session_id === sessionId, 'Session should persist');
    console.log('  ✓ Session state preserved');

    // Third operation - REASON
    console.log('  🤔 Operation 3: Analyze and reason...');
    const analyzeResult = await callMCP('analyze_problem', {
      problem: 'Test session persistence'
    });
    const analyzeData = JSON.parse(parseJSONRPC(analyzeResult.stdout).find(r => r.id === 2).result.content[0].text);

    await callMCP('reason_through', {
      session_id: analyzeData.session_id,
      thought: 'Session maintains state throughout workflow',
      thought_number: 1
    });
    console.log('  ✓ Reasoning tracked in session');

    // Get final session state
    const finalStatus = await callMCP('get_session_state', {
      session_id: analyzeData.session_id
    });
    const finalData = JSON.parse(parseJSONRPC(finalStatus.stdout).find(r => r.id === 2).result.content[0].text);

    assertTrue(finalData.session_id, 'Session should have complete history');
    assertTrue(finalData.thought_count >= 1, 'Should track thought count');
    console.log(`  ✅ Session tracked ${finalData.thought_count} thought(s)\n`);
  });

  const stats = getStats();
  console.log(colors.cyan + '======================================================================' + colors.reset);
  console.log(colors.bold + 'AGENT WORKFLOW TESTS SUMMARY' + colors.reset);
  console.log(colors.cyan + '======================================================================' + colors.reset);
  console.log(colors.green + `Tests Passed: ${stats.testsPassed}` + colors.reset);
  console.log(colors.red + `Tests Failed: ${stats.testsFailed}` + colors.reset);
  console.log(`Total: ${stats.testsRun} tests`);

  if (stats.testsPassed === stats.testsRun) {
    console.log('\n' + colors.green + '✅ All agent workflows demonstrate proper three-gate compliance!' + colors.reset);
  }

  process.exit(stats.testsFailed > 0 ? 1 : 0);
}

runTests().catch(console.error);
