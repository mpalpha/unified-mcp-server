#!/usr/bin/env node
/**
 * Tool Guidance Tests - Verify tool descriptions guide agents properly
 * Tests that MCP tool schemas contain proper guidance for workflow
 */

const fs = require('fs');
const path = require('path');
const { colors, callMCP, parseJSONRPC, test, assertTrue, assertContains, getStats } = require('./test-utils');

async function runTests() {
  console.log(colors.bold + '\nTOOL GUIDANCE TESTS (10 tests)' + colors.reset);
  console.log(colors.cyan + '======================================================================' + colors.reset);
  console.log('These tests verify tool descriptions guide agents to use workflow correctly\n');

  // Get tools/list to check all tool descriptions
  const result = await callMCP('health_check', {});

  // Read index.js to check tool schemas
  const indexPath = path.join(__dirname, '../index.js');
  const indexContent = fs.readFileSync(indexPath, 'utf8');

  // Test 1: analyze_problem description mentions "first step"
  await test('analyze_problem indicates it is first step in reasoning', () => {
    console.log('\n  Checking: analyze_problem tool description');

    // Match tool description immediately after name (not parameter descriptions)
    const match = indexContent.match(/name: 'analyze_problem',[\s\n]*description: '([^']+)'/);
    assertTrue(match, 'Should find analyze_problem schema');

    const description = match[1];
    console.log(`  Description: "${description}"`);

    assertTrue(
      description.includes('First step') || description.includes('first step'),
      'Description should indicate this is the first step'
    );
    console.log('  ✅ Description clearly marks as "First step"');
  });

  // Test 2: gather_context mentions prerequisite
  await test('gather_context indicates analyze_problem prerequisite', () => {
    console.log('\n  Checking: gather_context tool description');

    const match = indexContent.match(/name: 'gather_context',[\s\n]*description: '([^']+)'/);
    assertTrue(match, 'Should find gather_context schema');

    const description = match[1];
    console.log(`  Description: "${description}"`);

    // Check input schema mentions session_id from analyze_problem
    const schemaMatch = indexContent.match(/name: 'gather_context',[\s\S]{0,1000}session_id: \{ type: 'string', description: '([^']+)'/);
    assertTrue(schemaMatch, 'Should have session_id parameter');

    const sessionIdDesc = schemaMatch[1];
    console.log(`  session_id description: "${sessionIdDesc}"`);

    assertContains(sessionIdDesc, 'analyze_problem', 'Should reference analyze_problem');
    console.log('  ✅ Parameter clearly links to analyze_problem');
  });

  // Test 3: verify_compliance description mentions phases
  await test('verify_compliance describes three-gate phases', () => {
    console.log('\n  Checking: verify_compliance tool description');

    const match = indexContent.match(/name: 'verify_compliance'[\s\S]{0,1000}current_phase:[\s\S]{0,200}enum: \[([^\]]+)\]/);
    assertTrue(match, 'Should find current_phase enum');

    const phases = match[1];
    console.log(`  Phases enum: ${phases}`);

    assertContains(phases, 'teach', 'Should have teach phase');
    assertContains(phases, 'learn', 'Should have learn phase');
    assertContains(phases, 'reason', 'Should have reason phase');
    console.log('  ✅ All three gates defined in enum');
  });

  // Test 4: authorize_operation mentions token prerequisite
  await test('authorize_operation indicates token prerequisite', () => {
    console.log('\n  Checking: authorize_operation tool description');

    const match = indexContent.match(/name: 'authorize_operation',[\s\S]{0,1000}operation_token: \{ type: 'string', description: '([^']+)'/);
    assertTrue(match, 'Should have operation_token parameter');

    const tokenDesc = match[1];
    console.log(`  operation_token description: "${tokenDesc}"`);

    assertContains(tokenDesc, 'verify_compliance', 'Should reference verify_compliance');
    console.log('  ✅ Token parameter links to verify_compliance');
  });

  // Test 5: record_experience description implies teaching
  await test('record_experience description implies TEACH phase', () => {
    console.log('\n  Checking: record_experience tool description');

    const match = indexContent.match(/name: 'record_experience'[\s\S]{0,500}description: '([^']+)'/);
    assertTrue(match, 'Should find record_experience schema');

    const description = match[1];
    console.log(`  Description: "${description}"`);

    assertTrue(
      description.includes('Record') || description.includes('record'),
      'Should indicate recording/teaching'
    );
    console.log('  ✅ Description implies teaching/recording knowledge');
  });

  // Test 6: search_experiences description implies learning
  await test('search_experiences description implies LEARN phase', () => {
    console.log('\n  Checking: search_experiences tool description');

    const match = indexContent.match(/name: 'search_experiences',[\s\n]*description: '([^']+)'/);
    assertTrue(match, 'Should find search_experiences schema');

    const description = match[1];
    console.log(`  Description: "${description}"`);

    assertTrue(
      description.includes('Search') || description.includes('past') || description.includes('knowledge'),
      'Should indicate searching/learning'
    );
    console.log('  ✅ Description implies learning from past experiences');
  });

  // Test 7: reason_through description implies reasoning
  await test('reason_through description implies REASON phase', () => {
    console.log('\n  Checking: reason_through tool description');

    const match = indexContent.match(/name: 'reason_through',[\s\n]*description: '([^']+)'/);
    assertTrue(match, 'Should find reason_through schema');

    const description = match[1];
    console.log(`  Description: "${description}"`);

    assertTrue(
      description.includes('Evaluate') || description.includes('reason') || description.includes('thought'),
      'Should indicate reasoning/evaluation'
    );
    console.log('  ✅ Description implies reasoning/evaluation');
  });

  // Test 8: Tool descriptions use active voice
  await test('Tool descriptions use clear, active language', () => {
    console.log('\n  Checking: Tool description language style');

    const toolDescriptions = [
      { name: 'record_experience', pattern: /name: 'record_experience',[\s\n]*description: '([^']+)'/ },
      { name: 'analyze_problem', pattern: /name: 'analyze_problem',[\s\n]*description: '([^']+)'/ },
      { name: 'verify_compliance', pattern: /name: 'verify_compliance',[\s\n]*description: '([^']+)'/ }
    ];

    let allClear = true;
    for (const tool of toolDescriptions) {
      const match = indexContent.match(tool.pattern);
      if (match) {
        const desc = match[1];
        // Check for verbs in active voice (starts with verb)
        const startsWithVerb = /^[A-Z][a-z]+\s/.test(desc);
        console.log(`  ${tool.name}: ${startsWithVerb ? '✓' : '✗'} "${desc}"`);
        if (!startsWithVerb) allClear = false;
      }
    }

    assertTrue(allClear, 'All descriptions should use active voice');
    console.log('  ✅ Tool descriptions use clear active language');
  });

  // Test 9: Parameter descriptions include examples or context
  await test('Parameter descriptions provide sufficient context', () => {
    console.log('\n  Checking: Parameter description quality');

    // Check key parameters have good descriptions
    const parameters = [
      { tool: 'record_experience', param: 'domain', pattern: /name: 'record_experience'[\s\S]{0,2000}domain:[\s\S]{0,300}enum: \[([^\]]+)\]/ },
      { tool: 'verify_compliance', param: 'current_phase', pattern: /name: 'verify_compliance'[\s\S]{0,2000}current_phase:[\s\S]{0,300}enum: \[([^\]]+)\]/ }
    ];

    let allGood = true;
    for (const param of parameters) {
      const match = indexContent.match(param.pattern);
      if (match) {
        const enumValues = match[1];
        const hasMultipleOptions = enumValues.includes(',');
        console.log(`  ${param.tool}.${param.param}: ${hasMultipleOptions ? '✓' : '✗'} enum with options`);
        if (!hasMultipleOptions) allGood = false;
      }
    }

    assertTrue(allGood, 'Parameters should have enums with clear options');
    console.log('  ✅ Parameters provide clear options via enums');
  });

  // Test 10: Tool order implicit in MCP tools/list response
  await test('Tools listed in logical workflow order', () => {
    console.log('\n  Checking: Tool listing order in MCP response');

    // Extract tool names in order from the tools array
    // Look for pattern: name: 'tool_name',\n description: (this ensures we're matching tool definitions, not parameters)
    const toolPattern = /name: '([^']+)',[\s\n]*description:/g;
    const toolOrder = [];
    let match;

    while ((match = toolPattern.exec(indexContent)) !== null) {
      toolOrder.push(match[1]);
    }

    console.log(`  Tool order in schema: ${toolOrder.slice(0, 10).join(', ')}...`);

    // Check knowledge tools come before reasoning
    const recordIdx = toolOrder.indexOf('record_experience');
    const searchIdx = toolOrder.indexOf('search_experiences');
    const analyzeIdx = toolOrder.indexOf('analyze_problem');

    assertTrue(recordIdx >= 0 && searchIdx >= 0 && analyzeIdx >= 0, 'Key tools should be present');
    assertTrue(recordIdx < analyzeIdx, 'record_experience should come before analyze_problem (TEACH before REASON)');
    assertTrue(searchIdx < analyzeIdx, 'search_experiences should come before analyze_problem (LEARN before REASON)');

    console.log('  ✅ Tools listed in logical workflow order');
  });

  const stats = getStats();
  console.log('\n' + colors.cyan + '======================================================================' + colors.reset);
  console.log(colors.bold + 'TOOL GUIDANCE TESTS SUMMARY' + colors.reset);
  console.log(colors.cyan + '======================================================================' + colors.reset);
  console.log(colors.green + `Tests Passed: ${stats.testsPassed}` + colors.reset);
  console.log(colors.red + `Tests Failed: ${stats.testsFailed}` + colors.reset);
  console.log(`Total: ${stats.testsRun} tests`);

  if (stats.testsPassed === stats.testsRun) {
    console.log('\n' + colors.green + '✅ Tool descriptions properly guide agents through workflow!' + colors.reset);
  } else {
    console.log('\n' + colors.red + '⚠️  Tool descriptions may not guide agents clearly - review needed!' + colors.reset);
  }

  process.exit(stats.testsFailed > 0 ? 1 : 0);
}

runTests().catch(console.error);
