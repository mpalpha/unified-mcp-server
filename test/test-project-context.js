#!/usr/bin/env node

/**
 * Project Context Tools Tests
 *
 * Tests for update_project_context and get_project_context tools.
 * Verifies context file creation, storage, and retrieval.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { colors, callMCP, parseJSONRPC, test, assertTrue, assertEquals, getStats } = require('./test-utils');

async function runTests() {
  console.log(colors.bold + '\nPROJECT CONTEXT TESTS (14 tests)' + colors.reset);
  console.log(colors.cyan + '======================================================================' + colors.reset);

  // Note: Context files are now stored in .claude/project-context.json per project
  // Cleanup happens automatically as test projects use /tmp paths

  console.log('\n📁  Using per-project .claude/project-context.json format\n');

  console.log(colors.bold + 'Project Context Tools' + colors.reset);
  console.log(colors.cyan + '======================================================================' + colors.reset);

  // Test 1: update_project_context with valid data
  await test('update_project_context - create new context', async () => {
    const testProjectPath = '/tmp/test-project-' + Date.now();
    const result = await callMCP('update_project_context', {
      enabled: true,
      summary: "Test project summary",
      highlights: ["Feature A", "Feature B"],
      reminders: ["Check docs"],
      project_path: testProjectPath
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.result, 'Should return result');

    const data = JSON.parse(response.result.content[0].text);
    assertTrue(data.success, 'Should be successful');
    assertTrue(data.context_file, 'Should have context_file');

    // Verify file exists
    assertTrue(fs.existsSync(data.context_file), 'Context file should exist');

    // Cleanup
    fs.unlinkSync(data.context_file);
  });

  // Test 2: update_project_context - missing required field
  await test('update_project_context - missing enabled field', async () => {
    const result = await callMCP('update_project_context', {
      summary: "Test",
      highlights: ["A"],
      reminders: ["B"]
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.error, 'Should return error');
  });

  // Test 3: update_project_context - summary too long
  await test('update_project_context - summary exceeds 200 chars', async () => {
    const testProjectPath = '/tmp/test-project-summary-' + Date.now();
    const longSummary = 'A'.repeat(201);

    const result = await callMCP('update_project_context', {
      enabled: true,
      summary: longSummary,
      highlights: ["A"],
      reminders: ["B"],
      project_path: testProjectPath
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.error, 'Should return error for too long summary');
  });

  // Test 4: update_project_context - too many highlights
  await test('update_project_context - highlights exceed 5 items', async () => {
    const testProjectPath = '/tmp/test-project-highlights-' + Date.now();

    const result = await callMCP('update_project_context', {
      enabled: true,
      summary: "Test",
      highlights: ["A", "B", "C", "D", "E", "F"],
      reminders: ["X"],
      project_path: testProjectPath
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.error, 'Should return error for too many highlights');
  });

  // Test 5: update_project_context - too many reminders
  await test('update_project_context - reminders exceed 3 items', async () => {
    const testProjectPath = '/tmp/test-project-reminders-' + Date.now();

    const result = await callMCP('update_project_context', {
      enabled: true,
      summary: "Test",
      highlights: ["A"],
      reminders: ["W", "X", "Y", "Z"],
      project_path: testProjectPath
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.error, 'Should return error for too many reminders');
  });

  // Test 6: update_project_context - disabled context
  await test('update_project_context - create disabled context', async () => {
    const testProjectPath = '/tmp/test-project-disabled-' + Date.now();
    const result = await callMCP('update_project_context', {
      enabled: false,
      summary: "Disabled project",
      highlights: [],
      reminders: [],
      project_path: testProjectPath
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.result, 'Should return result');

    const data = JSON.parse(response.result.content[0].text);
    assertTrue(data.success, 'Should be successful');

    // Verify file and content
    const content = JSON.parse(fs.readFileSync(data.context_file, 'utf8'));
    assertEquals(content.enabled, false, 'Context should be disabled');

    // Cleanup
    fs.unlinkSync(data.context_file);
  });

  // Test 7: get_project_context - retrieve existing context
  await test('get_project_context - retrieve existing context', async () => {
    const testProjectPath = '/tmp/test-project-get-' + Date.now();

    // Create context first
    const createResult = await callMCP('update_project_context', {
      enabled: true,
      summary: "Get test project",
      highlights: ["H1", "H2"],
      reminders: ["R1"],
      project_path: testProjectPath
    });

    const createResponses = parseJSONRPC(createResult.stdout);
    const createResponse = createResponses.find(r => r.id === 2);
    const createData = JSON.parse(createResponse.result.content[0].text);

    // Now retrieve it
    const getResult = await callMCP('get_project_context', {
      project_path: testProjectPath
    });

    const getResponses = parseJSONRPC(getResult.stdout);
    const getResponse = getResponses.find(r => r.id === 2);
    assertTrue(getResponse && getResponse.result, 'Should return result');

    const getData = JSON.parse(getResponse.result.content[0].text);
    assertTrue(getData.exists, 'Context should exist');
    assertEquals(getData.summary, "Get test project", 'Summary should match');
    assertEquals(getData.highlights.length, 2, 'Should have 2 highlights');

    // Cleanup
    fs.unlinkSync(createData.context_file);
  });

  // Test 8: get_project_context - non-existent context
  await test('get_project_context - non-existent context', async () => {
    const testProjectPath = '/tmp/test-project-nonexist-' + Date.now();

    const result = await callMCP('get_project_context', {
      project_path: testProjectPath
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.result, 'Should return result');

    const data = JSON.parse(response.result.content[0].text);
    assertEquals(data.exists, false, 'Context should not exist');
    assertTrue(data.project_path, 'Should still return project_path');
  });

  // Test 9: update_project_context - update existing context
  await test('update_project_context - update existing context', async () => {
    const testProjectPath = '/tmp/test-project-update-' + Date.now();

    // Create initial context
    const createResult = await callMCP('update_project_context', {
      enabled: true,
      summary: "Original summary",
      highlights: ["A"],
      reminders: ["X"],
      project_path: testProjectPath
    });

    const createResponses = parseJSONRPC(createResult.stdout);
    const createData = JSON.parse(createResponses.find(r => r.id === 2).result.content[0].text);

    // Update it
    const updateResult = await callMCP('update_project_context', {
      enabled: true,
      summary: "Updated summary",
      highlights: ["B", "C"],
      reminders: ["Y", "Z"],
      project_path: testProjectPath
    });

    const updateResponses = parseJSONRPC(updateResult.stdout);
    assertTrue(updateResponses.find(r => r.id === 2).result, 'Update should succeed');

    // Verify update
    const getResult = await callMCP('get_project_context', {
      project_path: testProjectPath
    });

    const getResponses = parseJSONRPC(getResult.stdout);
    const getData = JSON.parse(getResponses.find(r => r.id === 2).result.content[0].text);
    assertEquals(getData.summary, "Updated summary", 'Summary should be updated');
    assertEquals(getData.highlights.length, 2, 'Should have 2 highlights');

    // Cleanup
    fs.unlinkSync(createData.context_file);
  });

  // Test 10: Context file in correct location
  await test('Context file created in .claude/project-context.json', async () => {
    const testProjectPath = '/tmp/test-project-location-' + Date.now();

    const result = await callMCP('update_project_context', {
      enabled: true,
      summary: "Location test",
      highlights: [],
      reminders: [],
      project_path: testProjectPath
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    const data = JSON.parse(response.result.content[0].text);

    // Verify location is .claude/project-context.json in project root
    const expectedPath = path.join(testProjectPath, '.claude', 'project-context.json');
    assertEquals(data.context_file, expectedPath, 'Should be at .claude/project-context.json');
    assertTrue(data.context_file.endsWith('.claude/project-context.json'), 'Should end with .claude/project-context.json');

    // Cleanup
    fs.unlinkSync(data.context_file);
    fs.rmdirSync(path.join(testProjectPath, '.claude'));
  });

  // Test 11: update_project_context with preImplementation checklist
  await test('update_project_context - create with preImplementation', async () => {
    const testProjectPath = '/tmp/test-project-pre-' + Date.now();
    const result = await callMCP('update_project_context', {
      enabled: true,
      summary: "Test with checklists",
      highlights: [],
      reminders: [],
      preImplementation: ["Review patterns", "Check for reusable code"],
      project_path: testProjectPath
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.result, 'Should return result');

    const data = JSON.parse(response.result.content[0].text);
    assertTrue(data.success, 'Should be successful');

    // Verify content
    const content = JSON.parse(fs.readFileSync(data.context_file, 'utf8'));
    assertTrue(Array.isArray(content.preImplementation), 'preImplementation should be an array');
    assertEquals(content.preImplementation.length, 2, 'Should have 2 preImplementation items');

    // Cleanup
    fs.unlinkSync(data.context_file);
    fs.rmdirSync(path.join(testProjectPath, '.claude'));
  });

  // Test 12: update_project_context with postImplementation checklist
  await test('update_project_context - create with postImplementation', async () => {
    const testProjectPath = '/tmp/test-project-post-' + Date.now();
    const result = await callMCP('update_project_context', {
      enabled: true,
      summary: "Test with checklists",
      highlights: [],
      reminders: [],
      postImplementation: ["Run tests", "Run linter", "Check accessibility"],
      project_path: testProjectPath
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.result, 'Should return result');

    const data = JSON.parse(response.result.content[0].text);
    assertTrue(data.success, 'Should be successful');

    // Verify content
    const content = JSON.parse(fs.readFileSync(data.context_file, 'utf8'));
    assertTrue(Array.isArray(content.postImplementation), 'postImplementation should be an array');
    assertEquals(content.postImplementation.length, 3, 'Should have 3 postImplementation items');

    // Cleanup
    fs.unlinkSync(data.context_file);
    fs.rmdirSync(path.join(testProjectPath, '.claude'));
  });

  // Test 13: update_project_context - many preImplementation items allowed (no limit)
  await test('update_project_context - preImplementation allows many items', async () => {
    const testProjectPath = '/tmp/test-project-pre-many-' + Date.now();
    const manyItems = Array(15).fill('checklist item'); // v1.4.2: No item count limit

    const result = await callMCP('update_project_context', {
      enabled: true,
      summary: "Test",
      highlights: [],
      reminders: [],
      preImplementation: manyItems,
      project_path: testProjectPath
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.result, 'Should allow many preImplementation items');
  });

  // Test 14: get_project_context - retrieve with checklists
  await test('get_project_context - retrieve with pre/post checklists', async () => {
    const testProjectPath = '/tmp/test-project-get-checklists-' + Date.now();

    // Create context with checklists
    const createResult = await callMCP('update_project_context', {
      enabled: true,
      summary: "Checklist test",
      highlights: [],
      reminders: [],
      preImplementation: ["Pre item 1", "Pre item 2"],
      postImplementation: ["Post item 1"],
      project_path: testProjectPath
    });

    const createResponses = parseJSONRPC(createResult.stdout);
    const createData = JSON.parse(createResponses.find(r => r.id === 2).result.content[0].text);

    // Retrieve it
    const getResult = await callMCP('get_project_context', {
      project_path: testProjectPath
    });

    const getResponses = parseJSONRPC(getResult.stdout);
    const getResponse = getResponses.find(r => r.id === 2);
    assertTrue(getResponse && getResponse.result, 'Should return result');

    const getData = JSON.parse(getResponse.result.content[0].text);
    assertTrue(getData.exists, 'Context should exist');
    assertEquals(getData.preImplementation.length, 2, 'Should have 2 preImplementation items');
    assertEquals(getData.postImplementation.length, 1, 'Should have 1 postImplementation item');

    // Cleanup
    fs.unlinkSync(createData.context_file);
    fs.rmdirSync(path.join(testProjectPath, '.claude'));
  });

  // Summary
  const stats = getStats();
  console.log('\n' + colors.cyan + '======================================================================' + colors.reset);
  console.log(colors.bold + 'PROJECT CONTEXT TESTS SUMMARY' + colors.reset);
  console.log(colors.cyan + '======================================================================' + colors.reset);
  console.log(colors.green + `Tests Passed: ${stats.testsPassed}` + colors.reset);
  console.log(colors.red + `Tests Failed: ${stats.testsFailed}` + colors.reset);
  console.log(`Total: ${stats.testsRun} tests\n`);

  if (stats.testsFailed > 0) {
    process.exit(1);
  } else {
    console.log(colors.green + '✅ All project context tests passed!' + colors.reset + '\n');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
