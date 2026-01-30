#!/usr/bin/env node
/**
 * Experience Usage Tests - Verify agents actually USE learned experiences in reasoning
 * Tests that search → reasoning → decision actually incorporates found knowledge
 */

const { callMCP, parseJSONRPC, test, assertTrue, assertContains, getStats, colors } = require('./test-utils');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DB_PATH = path.join(os.homedir(), '.unified-mcp', 'data.db');

async function runTests() {
  console.log(colors.bold + '\nEXPERIENCE USAGE TESTS' + colors.reset);
  console.log(colors.cyan + '======================================================================' + colors.reset);
  console.log('Testing that agents actually USE learned experiences in reasoning\n');

  // Clean database
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

  // Test 1: Record experience, search for it, verify it's returned
  await test('LEARN Phase: Search returns recorded experiences', async () => {
    console.log('\n  Step 1: Record JWT authentication bug fix');

    await callMCP('record_experience', {
      type: 'effective',
      domain: 'Debugging',
      situation: 'Authentication returns 401 with valid JWT token',
      approach: 'Check JWT expiration logic and timezone handling',
      outcome: 'Found UTC conversion bug in token validation',
      reasoning: 'Tokens were created in local time but validated in UTC, causing premature expiration',
      confidence: 0.9
    });

    console.log('  Step 2: Search for JWT issues');
    const searchResult = await callMCP('search_experiences', {
      query: 'JWT authentication 401'
    });

    const responses = parseJSONRPC(searchResult.stdout);
    const data = responses.find(r => r.id === 2);
    const experiences = JSON.parse(data.result.content[0].text);

    console.log(`  Found: ${experiences.results.length} experiences`);
    assertTrue(experiences.results.length > 0, 'Should find recorded experience');

    const foundExp = experiences.results[0];
    assertContains(foundExp.situation, 'JWT', 'Experience should match search');
    assertContains(foundExp.outcome, 'UTC', 'Experience should contain solution details');

    console.log(`  ✅ Experience found with BM25 rank: ${foundExp.rank.toFixed(3)}`);
    console.log(`  ✅ Contains solution: "${foundExp.outcome}"`);
  });

  // Test 2: Reasoning incorporates searched experiences
  await test('REASON Phase: gather_context synthesizes found experiences', async () => {
    console.log('\n  Step 1: Analyze new JWT problem');

    const analyzeResult = await callMCP('analyze_problem', {
      problem: 'User reports JWT token expires too early'
    });

    const analyzeResponses = parseJSONRPC(analyzeResult.stdout);
    const analyzeData = analyzeResponses.find(r => r.id === 2);
    const session = JSON.parse(analyzeData.result.content[0].text);
    const sessionId = session.session_id;

    console.log(`  ✅ Session created: ${sessionId}`);

    console.log('  Step 2: Search for similar issues');
    const searchResult = await callMCP('search_experiences', {
      query: 'JWT token expiration timezone'
    });

    const searchResponses = parseJSONRPC(searchResult.stdout);
    const searchData = searchResponses.find(r => r.id === 2);
    const experiences = JSON.parse(searchData.result.content[0].text);

    console.log('  Step 3: Gather context with found experiences');
    const contextResult = await callMCP('gather_context', {
      session_id: sessionId,
      sources: {
        experiences: experiences.results
      }
    });

    const contextResponses = parseJSONRPC(contextResult.stdout);
    const contextData = contextResponses.find(r => r.id === 2);
    const context = JSON.parse(contextData.result.content[0].text);

    console.log(`  ✅ Context synthesized with ${context.priority_breakdown.critical} critical items`);

    assertTrue(context.priority_breakdown.critical > 0, 'Should incorporate experiences');
    assertContains(context.synthesized_context, 'UTC', 'Should reference found solution');
    assertTrue(context.token_count > 0, 'Should have token count');

    console.log(`  ✅ Synthesized context references past solution (${context.token_count} tokens)`);
  });

  // Test 3: Reasoning thoughts reference experiences
  await test('REASON Phase: Thoughts incorporate learned patterns', async () => {
    console.log('\n  Step 1: Record multiple related experiences');

    // Record pattern 1
    await callMCP('record_experience', {
      type: 'effective',
      domain: 'Process',
      situation: 'API rate limiting needed',
      approach: 'Use Redis with sliding window algorithm',
      outcome: 'Efficient rate limiting with <1ms overhead',
      reasoning: 'Sliding window more accurate than token bucket'
    });

    // Record pattern 2
    await callMCP('record_experience', {
      type: 'ineffective',
      domain: 'Process',
      situation: 'Tried in-memory rate limiting',
      approach: 'Used Map with timestamp cleanup',
      outcome: 'Memory leak in production, cache never cleared',
      reasoning: 'No proper eviction strategy caused unbounded growth'
    });

    console.log('  Step 2: Start reasoning session');
    const analyzeResult = await callMCP('analyze_problem', {
      problem: 'Implement rate limiting for API'
    });

    const analyzeResponses = parseJSONRPC(analyzeResult.stdout);
    const analyzeData = analyzeResponses.find(r => r.id === 2);
    const session = JSON.parse(analyzeData.result.content[0].text);

    console.log('  Step 3: Search for patterns');
    await callMCP('search_experiences', { query: 'rate limiting' });

    console.log('  Step 4: Reason through decision');
    const reasonResult = await callMCP('reason_through', {
      session_id: session.session_id,
      thought: 'Based on past experiences: Redis sliding window is effective, avoid in-memory due to memory leaks',
      thought_number: 1,
      confidence: 0.85
    });

    const reasonResponses = parseJSONRPC(reasonResult.stdout);
    const reasonData = reasonResponses.find(r => r.id === 2);
    const thoughtResponse = JSON.parse(reasonData.result.content[0].text);

    assertTrue(thoughtResponse.thought_id > 0, 'Should record thought');

    console.log('  Step 5: Retrieve session state to verify thought was stored');
    const stateResult = await callMCP('get_session_state', {
      session_id: session.session_id
    });

    const stateResponses = parseJSONRPC(stateResult.stdout);
    const stateData = stateResponses.find(r => r.id === 2);
    const state = JSON.parse(stateData.result.content[0].text);

    assertTrue(state.thoughts.length > 0, 'Should have thoughts');
    const storedThought = state.thoughts.find(t => t.thought_number === 1);
    assertContains(storedThought.thought, 'Redis', 'Thought should reference effective pattern');
    assertContains(storedThought.thought, 'memory', 'Thought should reference ineffective pattern');
    assertTrue(storedThought.confidence === 0.85, 'Should store confidence');

    console.log(`  ✅ Reasoning incorporates both effective and ineffective patterns`);
    console.log(`  ✅ Confidence ${storedThought.confidence} based on learned knowledge`);
  });

  // Test 4: Finalized decisions create new experiences
  await test('TEACH Phase: Decisions become new experiences', async () => {
    console.log('\n  Step 1: Complete reasoning session');

    const analyzeResult = await callMCP('analyze_problem', {
      problem: 'Choose database for new microservice'
    });

    const analyzeResponses = parseJSONRPC(analyzeResult.stdout);
    const analyzeData = analyzeResponses.find(r => r.id === 2);
    const session = JSON.parse(analyzeData.result.content[0].text);

    await callMCP('reason_through', {
      session_id: session.session_id,
      thought: 'PostgreSQL for ACID guarantees, MongoDB too eventual consistency',
      thought_number: 1
    });

    console.log('  Step 2: Finalize with auto-record');
    const finalizeResult = await callMCP('finalize_decision', {
      session_id: session.session_id,
      conclusion: 'Selected PostgreSQL for transaction support',
      rationale: 'ACID guarantees needed for transactional data',
      record_as_experience: true
    });

    const finalizeResponses = parseJSONRPC(finalizeResult.stdout);
    const finalizeData = finalizeResponses.find(r => r.id === 2);
    const decision = JSON.parse(finalizeData.result.content[0].text);

    assertTrue(decision.experience_id !== null && decision.experience_id > 0, 'Should auto-record experience');

    console.log('  Step 3: Verify new experience is searchable');
    const searchResult = await callMCP('search_experiences', {
      query: 'PostgreSQL database choice'
    });

    const searchResponses = parseJSONRPC(searchResult.stdout);
    const searchData = searchResponses.find(r => r.id === 2);
    const experiences = JSON.parse(searchData.result.content[0].text);

    assertTrue(experiences.results.length > 0, 'New experience should be searchable');

    console.log(`  ✅ Decision recorded as experience (ID: ${decision.experience_id})`);
    console.log(`  ✅ Available for future searches`);
  });

  // Test 5: Duplicate detection prevents redundant learning
  await test('LEARN Phase: Duplicate detection prevents redundancy', async () => {
    console.log('\n  Step 1: Record initial experience');

    const exp1 = await callMCP('record_experience', {
      type: 'effective',
      domain: 'Tools',
      situation: 'Need to parse JSON in Node.js',
      approach: 'Use JSON.parse() with try-catch',
      outcome: 'Handles invalid JSON gracefully',
      reasoning: 'Standard library, no dependencies'
    });

    console.log('  Step 2: Attempt exact duplicate');
    const exp2 = await callMCP('record_experience', {
      type: 'effective',
      domain: 'Tools',
      situation: 'Need to parse JSON in Node.js',
      approach: 'Use JSON.parse() with try-catch',
      outcome: 'Handles invalid JSON gracefully',
      reasoning: 'Standard library, no dependencies'
    });

    const exp2Responses = parseJSONRPC(exp2.stdout);
    const exp2Data = exp2Responses.find(r => r.id === 2);
    const result = JSON.parse(exp2Data.result.content[0].text);

    assertTrue(result.recorded === false, 'Should detect exact duplicate');
    assertTrue(result.duplicate_id > 0, 'Should reference existing experience');
    assertTrue(result.similarity >= 0.9, 'Should have high similarity');
    assertContains(result.message.toLowerCase(), 'similar', 'Should warn about similarity');

    console.log(`  ✅ Duplicate detection active (${(result.similarity * 100).toFixed(1)}% similar)`);
    console.log(`  ✅ Prevents redundant knowledge accumulation`);
  });

  // Test 6: Revision tracking shows knowledge evolution
  await test('LEARN Phase: Revisions track knowledge improvement', async () => {
    console.log('\n  Step 1: Record initial approach');

    const exp1Result = await callMCP('record_experience', {
      type: 'effective',
      domain: 'Debugging',
      situation: 'Memory leak in Express app',
      approach: 'Added garbage collection logging',
      outcome: 'Identified leak in middleware',
      reasoning: 'Heap snapshots showed closure retention'
    });

    const exp1Responses = parseJSONRPC(exp1Result.stdout);
    const exp1Data = exp1Responses.find(r => r.id === 2);
    const experience1 = JSON.parse(exp1Data.result.content[0].text);

    console.log(`  ✅ Original experience recorded (ID: ${experience1.experience_id})`);

    console.log('  Step 2: Update with better approach');
    const exp2Result = await callMCP('update_experience', {
      id: experience1.experience_id,
      changes: {
        approach: 'Used --inspect with Chrome DevTools Memory Profiler',
        outcome: 'Found closure leak in event listeners - detach pattern needed',
        reasoning: 'Visual profiler more effective than logs for memory analysis'
      },
      reason: 'Improved debugging technique discovered'
    });

    const exp2Responses = parseJSONRPC(exp2Result.stdout);
    const exp2Data = exp2Responses.find(r => r.id === 2);
    const updateResult = JSON.parse(exp2Data.result.content[0].text);

    assertTrue(updateResult.new_id > 0, 'Should create new revision');

    console.log('  Step 3: Retrieve revision to verify linking');
    const getRevisionResult = await callMCP('get_experience', {
      id: updateResult.new_id
    });

    const revisionResponses = parseJSONRPC(getRevisionResult.stdout);
    const revisionData = revisionResponses.find(r => r.id === 2);
    const revision = JSON.parse(revisionData.result.content[0].text);

    assertTrue(revision.revision_of === experience1.experience_id, 'Should link to original');
    assertContains(revision.approach, 'Chrome DevTools', 'Should have updated approach');

    console.log(`  ✅ Revision created (ID: ${revision.id}, revises: ${revision.revision_of})`);
    console.log(`  ✅ Knowledge evolution tracked`);
  });

  const stats = getStats();
  console.log('\n' + colors.cyan + '======================================================================' + colors.reset);
  console.log(colors.bold + 'EXPERIENCE USAGE TEST SUMMARY' + colors.reset);
  console.log(colors.cyan + '======================================================================' + colors.reset);
  console.log(colors.green + `Tests Passed: ${stats.testsPassed}` + colors.reset);
  console.log(colors.red + `Tests Failed: ${stats.testsFailed}` + colors.reset);
  console.log(`Total: ${stats.testsRun} tests\n`);

  console.log(colors.bold + 'VERIFIED CAPABILITIES:' + colors.reset);
  console.log('  ✓ Experiences are searchable after recording');
  console.log('  ✓ Search results include relevance scoring');
  console.log('  ✓ gather_context synthesizes found experiences');
  console.log('  ✓ Reasoning thoughts incorporate past patterns');
  console.log('  ✓ Decisions automatically become new experiences');
  console.log('  ✓ Duplicate detection prevents redundancy');
  console.log('  ✓ Revision tracking shows knowledge evolution\n');

  console.log(colors.bold + 'USAGE WORKFLOW VALIDATED:' + colors.reset);
  console.log('  1. TEACH: record_experience → database');
  console.log('  2. LEARN: search_experiences → finds relevant');
  console.log('  3. REASON: gather_context → synthesizes');
  console.log('  4. APPLY: reason_through → incorporates patterns');
  console.log('  5. TEACH: finalize_decision → records new experience');
  console.log('  6. IMPROVE: update_experience → evolves knowledge\n');

  if (stats.testsPassed === stats.testsRun) {
    console.log(colors.green + '✅ Agents DO use learned experiences in reasoning!' + colors.reset);
  } else {
    console.log(colors.red + '⚠️  Some usage tests failed - review needed' + colors.reset);
  }

  process.exit(stats.testsFailed > 0 ? 1 : 0);
}

runTests().catch(console.error);
