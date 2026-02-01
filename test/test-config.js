#!/usr/bin/env node
/**
 * Configuration Tests - Presets and config validation
 * v1.4.0: Updated for project-scoped experiences
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { colors, callMCP, parseJSONRPC, test, assertTrue, assertEquals, getStats, createTestProject, cleanupTestProject, getTestDbPath } = require('./test-utils');

let testDir;

async function runTests() {
  console.log(colors.bold + '\nCONFIGURATION TESTS (15 tests)' + colors.reset);
  console.log(colors.cyan + '======================================================================' + colors.reset);

  // v1.4.0: Create project-scoped test directory
  testDir = createTestProject();
  const TEST_DB = getTestDbPath(testDir);
  console.log(`\n📁 Test project: ${testDir}\n`);

  // Helper to call MCP with project context
  const call = (tool, args) => callMCP(tool, args, { cwd: testDir });

  console.log(colors.bold + 'Configuration Tools' + colors.reset);
  console.log(colors.cyan + '======================================================================' + colors.reset);


  // ===== list_presets tests =====
  await test('list_presets - list built-in presets', async () => {
    const result = await call('list_presets', {});

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.result, 'Should return result');
    const data = JSON.parse(response.result.content[0].text);
    assertTrue(data.presets.length >= 4, 'Should have at least 4 built-in presets');
    assertTrue(data.built_in_count === 4, 'Should have 4 built-in presets');
  });

  await test('list_presets - preset structure', async () => {
    const result = await call('list_presets', {});

    const data = JSON.parse(parseJSONRPC(result.stdout).find(r => r.id === 2).result.content[0].text);
    const preset = data.presets[0];
    assertTrue(preset.name, 'Preset should have name');
    assertTrue(preset.description, 'Preset should have description');
    assertTrue(preset.type, 'Preset should have type');
  });

  await test('list_presets - includes three-gate', async () => {
    const result = await call('list_presets', {});

    const data = JSON.parse(parseJSONRPC(result.stdout).find(r => r.id === 2).result.content[0].text);
    const threeGate = data.presets.find(p => p.name === 'three-gate');
    assertTrue(threeGate, 'Should include three-gate preset');
    assertTrue(threeGate.type === 'built-in', 'Should be built-in type');
  });

  // ===== apply_preset tests =====
  await test('apply_preset - apply three-gate', async () => {
    const sessionId = 'preset_test_' + Date.now();
    const result = await call('apply_preset', {
      preset_name: 'three-gate',
      session_id: sessionId
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.result, 'Should return result');
    const data = JSON.parse(response.result.content[0].text);
    assertTrue(data.applied === true, 'Should be applied');
    assertEquals(data.preset_name, 'three-gate', 'Should apply three-gate');
  });

  await test('apply_preset - missing preset_name', async () => {
    const result = await call('apply_preset', {});

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.error, 'Should return error for missing preset_name');
  });

  await test('apply_preset - invalid preset', async () => {
    const result = await call('apply_preset', {
      preset_name: 'nonexistent-preset'
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.error, 'Should return error for invalid preset');
  });

  await test('apply_preset - minimal preset', async () => {
    const sessionId = 'minimal_test_' + Date.now();
    const result = await call('apply_preset', {
      preset_name: 'minimal',
      session_id: sessionId
    });

    const data = JSON.parse(parseJSONRPC(result.stdout).find(r => r.id === 2).result.content[0].text);
    assertEquals(data.enforcement, 'lenient', 'Minimal should have lenient enforcement');
  });

  // ===== validate_config tests =====
  await test('validate_config - valid config', async () => {
    const config = {
      name: 'test-config',
      description: 'Test configuration',
      gates: {
        teach: { required_tools: [], description: 'Test' },
        learn: { required_tools: [], description: 'Test' },
        reason: { required_tools: [], description: 'Test' }
      }
    };

    const result = await call('validate_config', { config });

    const data = JSON.parse(parseJSONRPC(result.stdout).find(r => r.id === 2).result.content[0].text);
    assertTrue(data.valid === true, 'Should be valid');
    assertTrue(data.errors.length === 0, 'Should have no errors');
  });

  await test('validate_config - missing required fields', async () => {
    const config = {
      description: 'Missing name'
    };

    const result = await call('validate_config', { config });

    const data = JSON.parse(parseJSONRPC(result.stdout).find(r => r.id === 2).result.content[0].text);
    assertTrue(data.valid === false, 'Should be invalid');
    assertTrue(data.errors.length > 0, 'Should have errors');
  });

  await test('validate_config - missing config parameter', async () => {
    const result = await call('validate_config', {});

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.error, 'Should return error');
  });

  // ===== get_config tests =====
  await test('get_config - default config', async () => {
    const result = await call('get_config', {});

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.result, 'Should return result');
    const data = JSON.parse(response.result.content[0].text);
    assertTrue(data.active_preset, 'Should have active preset');
    assertTrue(data.config, 'Should have config object');
  });

  await test('get_config - with session', async () => {
    const sessionId = 'config_test_' + Date.now();

    // Apply preset first
    await call('apply_preset', {
      preset_name: 'strict',
      session_id: sessionId
    });

    // Get config
    const result = await call('get_config', {
      session_id: sessionId
    });

    const data = JSON.parse(parseJSONRPC(result.stdout).find(r => r.id === 2).result.content[0].text);
    assertEquals(data.active_preset, 'strict', 'Should have strict preset active');
  });

  // ===== export_config tests =====
  await test('export_config - export three-gate', async () => {
    const result = await call('export_config', {
      preset_name: 'three-gate'
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.result, 'Should return result');
    const data = JSON.parse(response.result.content[0].text);
    assertTrue(data.exported === true, 'Should be exported');
    assertTrue(data.file_path, 'Should have file path');
  });

  await test('export_config - missing preset_name', async () => {
    const result = await call('export_config', {});

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.error, 'Should return error');
  });

  await test('export_config - invalid preset', async () => {
    const result = await call('export_config', {
      preset_name: 'nonexistent'
    });

    const responses = parseJSONRPC(result.stdout);
    const response = responses.find(r => r.id === 2);
    assertTrue(response && response.error, 'Should return error for invalid preset');
  });

  // ========================================================================

  const stats = getStats();
  console.log('\n' + colors.cyan + '======================================================================' + colors.reset);
  console.log(colors.bold + 'CONFIGURATION TESTS SUMMARY' + colors.reset);
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
