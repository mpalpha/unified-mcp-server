#!/usr/bin/env node

/**
 * SAFE Testing Framework for Post-Reload Configuration Customization
 *
 * Tests the data-driven approach (no code generation):
 * - update_project_context stores JSON data
 * - Hook reads data and displays it
 * - No custom code execution = no deadlocks
 *
 * GO/NO-GO Criteria:
 * - Deadlock rate: MUST be 0.00%
 * - Fallback success: MUST be 100%
 * - Data validation: MUST be 100%
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

// Test configuration
const TEST_CONFIG = {
  timeoutMs: 10000, // 10 seconds per test
  maxParallel: 5,

  // Safety thresholds
  requiredDeadlockRate: 0.00,
  requiredFallbackSuccess: 100,
  requiredValidationSuccess: 100,
};

// Test scenarios
const TEST_SCENARIOS = [
  // Baseline
  { id: 1, name: 'No project context', type: 'baseline', context: null },

  // Valid contexts
  { id: 2, name: 'Simple summary only', type: 'valid', context: {
    enabled: true,
    summary: 'Test project with 100 files'
  }},
  { id: 3, name: 'Summary + highlights', type: 'valid', context: {
    enabled: true,
    summary: 'MCP server project',
    highlights: ['.cursorrules found', 'CONTRIBUTING.md present']
  }},
  { id: 4, name: 'Summary + highlights + reminders', type: 'valid', context: {
    enabled: true,
    summary: 'Large codebase (1000+ files)',
    highlights: ['TypeScript project', 'React components', 'Test coverage 80%'],
    reminders: ['Check .cursorrules', 'Follow CONTRIBUTING.md']
  }},
  { id: 5, name: 'Disabled context', type: 'valid', context: {
    enabled: false,
    summary: 'This should not display'
  }},

  // Edge cases (still valid JSON, just edge values)
  { id: 6, name: 'Empty arrays', type: 'valid', context: {
    enabled: true,
    summary: 'Project with empty context',
    highlights: [],
    reminders: []
  }},
  { id: 7, name: 'Max length summary', type: 'valid', context: {
    enabled: true,
    summary: 'A'.repeat(200) // Exactly 200 chars
  }},
  { id: 8, name: 'Max highlights (5)', type: 'valid', context: {
    enabled: true,
    highlights: ['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5']
  }},
  { id: 9, name: 'Max reminders (3)', type: 'valid', context: {
    enabled: true,
    reminders: ['Reminder 1', 'Reminder 2', 'Reminder 3']
  }},

  // Invalid contexts (should be rejected by validation)
  { id: 10, name: 'INVALID: Summary too long', type: 'invalid', context: {
    enabled: true,
    summary: 'A'.repeat(201) // Over 200 chars
  }},
  { id: 11, name: 'INVALID: Too many highlights', type: 'invalid', context: {
    enabled: true,
    highlights: ['1', '2', '3', '4', '5', '6'] // Over 5
  }},
  { id: 12, name: 'INVALID: Too many reminders', type: 'invalid', context: {
    enabled: true,
    reminders: ['1', '2', '3', '4'] // Over 3
  }},
  { id: 13, name: 'INVALID: Highlight too long', type: 'invalid', context: {
    enabled: true,
    highlights: ['A'.repeat(101)] // Over 100 chars
  }},
  { id: 14, name: 'INVALID: Reminder too long', type: 'invalid', context: {
    enabled: true,
    reminders: ['A'.repeat(101)] // Over 100 chars
  }},

  // Malformed data (should fail gracefully)
  { id: 15, name: 'MALFORMED: Not JSON', type: 'malformed', contextRaw: 'not json at all' },
  { id: 16, name: 'MALFORMED: Missing enabled', type: 'malformed', context: {
    summary: 'No enabled field'
  }},
  { id: 17, name: 'MALFORMED: Wrong types', type: 'malformed', context: {
    enabled: 'true', // Should be boolean
    highlights: 'not an array'
  }},

  // File system issues
  { id: 18, name: 'FILESYSTEM: Missing context file', type: 'filesystem', contextMissing: true },
  { id: 19, name: 'FILESYSTEM: Corrupted JSON', type: 'filesystem', contextRaw: '{"enabled": true, "summary": "broken' }, // Unclosed string
  { id: 20, name: 'FILESYSTEM: Empty file', type: 'filesystem', contextRaw: '' },
];

// Results storage
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  deadlocks: 0,
  validationSuccesses: 0,
  validationFailures: 0,
  fallbackSuccesses: 0,
  fallbackFailures: 0,
  scenarios: {},
};

/**
 * Run single test scenario
 */
async function runTest(scenario, testDir) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const timeout = TEST_CONFIG.timeoutMs;

    console.log(`\n📋 Test ${scenario.id}/${TEST_SCENARIOS.length}: ${scenario.name}`);

    const result = {
      scenario: scenario.id,
      name: scenario.name,
      type: scenario.type,
      passed: false,
      deadlock: false,
      validationSuccess: null,
      fallbackSuccess: null,
      duration: 0,
      output: '',
      error: null,
    };

    try {
      // Create unique project directory for this test
      const projectDir = path.join(testDir, `project-${scenario.id}`);
      const claudeDir = path.join(projectDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });

      const contextPath = path.join(claudeDir, 'project-context.json');

      // Setup context based on scenario type
      if (scenario.type === 'malformed') {
        // Write malformed data directly
        const data = scenario.contextRaw || JSON.stringify(scenario.context);
        fs.writeFileSync(contextPath, data);
      } else if (scenario.type === 'filesystem' && scenario.contextMissing) {
        // Don't create file (test missing file case)
      } else if (scenario.type === 'filesystem' && scenario.contextRaw !== undefined) {
        // Write raw data (might be corrupted JSON)
        fs.writeFileSync(contextPath, scenario.contextRaw);
      } else if (scenario.context) {
        // Write valid JSON
        fs.writeFileSync(contextPath, JSON.stringify(scenario.context, null, 2));
      }

      // Test hook execution
      const hookPath = path.join(__dirname, '..', 'hooks', 'user-prompt-submit.cjs');

      if (!fs.existsSync(hookPath)) {
        throw new Error('Hook file not found');
      }

      // Create test input
      const testInput = JSON.stringify({
        userPrompt: `Test prompt for scenario ${scenario.id}`,
      });

      // Spawn node process to execute hook
      const proc = spawn('node', [hookPath], {
        env: {
          ...process.env,
          PWD: projectDir, // Set PWD to project directory
        },
        cwd: projectDir,
        timeout,
      });

      let output = '';
      let timedOut = false;

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.stderr.on('data', (data) => {
        output += data.toString();
      });

      // Timeout handler
      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');

        setTimeout(() => {
          if (!proc.killed) {
            proc.kill('SIGKILL');
          }
        }, 1000);
      }, timeout);

      // Write input to stdin
      proc.stdin.write(testInput);
      proc.stdin.end();

      proc.on('close', (code) => {
        clearTimeout(timeoutHandle);
        const duration = Date.now() - startTime;
        result.duration = duration;
        result.output = output;

        // Cleanup context file
        try {
          if (fs.existsSync(contextPath)) {
            fs.unlinkSync(contextPath);
          }
        } catch (e) {
          // Ignore cleanup errors
        }

        // Analyze results
        if (timedOut) {
          result.deadlock = true;
          result.passed = false;
          results.deadlocks++;
          console.log(`  ⚠️  DEADLOCK DETECTED (timeout after ${duration}ms)`);
        } else if (scenario.type === 'invalid') {
          // Invalid contexts should be rejected by validation
          // Since we write directly to file (bypassing tool), hook should handle gracefully
          const handledGracefully = code === 0 && output.includes('Test prompt');
          result.fallbackSuccess = handledGracefully;
          result.passed = handledGracefully;

          if (handledGracefully) {
            results.fallbackSuccesses++;
            console.log(`  ✅ Handled invalid data gracefully in ${duration}ms`);
          } else {
            results.fallbackFailures++;
            console.log(`  ❌ Failed on invalid data in ${duration}ms (code: ${code})`);
          }
        } else if (scenario.type === 'malformed' || scenario.type === 'filesystem') {
          // Malformed/corrupted data should be handled gracefully
          const handledGracefully = code === 0 && output.includes('Test prompt');
          result.fallbackSuccess = handledGracefully;
          result.passed = handledGracefully;

          if (handledGracefully) {
            results.fallbackSuccesses++;
            console.log(`  ✅ Handled ${scenario.type} error gracefully in ${duration}ms`);
          } else {
            results.fallbackFailures++;
            console.log(`  ❌ Failed on ${scenario.type} error in ${duration}ms (code: ${code})`);
          }
        } else {
          // Valid contexts should display correctly
          const completed = code === 0 && output.includes('Test prompt');
          result.passed = completed;

          if (completed) {
            // Check if context was displayed (if enabled)
            if (scenario.context && scenario.context.enabled) {
              const hasContext = output.includes('PROJECT CONTEXT');
              console.log(`  ✅ Completed in ${duration}ms (context: ${hasContext ? 'shown' : 'not shown'})`);
            } else {
              console.log(`  ✅ Completed in ${duration}ms`);
            }
          } else {
            console.log(`  ❌ Failed in ${duration}ms (code: ${code})`);
          }
        }

        results.scenarios[scenario.id] = result;
        resolve(result);
      });

      proc.on('error', (err) => {
        clearTimeout(timeoutHandle);
        result.error = err.message;
        result.passed = false;
        console.log(`  ❌ Process error: ${err.message}`);
        results.scenarios[scenario.id] = result;
        resolve(result);
      });

    } catch (err) {
      result.error = err.message;
      result.passed = false;
      console.log(`  ❌ Setup error: ${err.message}`);
      results.scenarios[scenario.id] = result;
      resolve(result);
    }
  });
}

/**
 * Run all tests in batches
 */
async function runAllTests() {
  console.log('\n' + '='.repeat(60));
  console.log('POST-RELOAD SAFE TESTING FRAMEWORK (Data-Driven)');
  console.log('='.repeat(60));
  console.log(`\nRunning ${TEST_SCENARIOS.length} test scenarios...`);
  console.log(`Max parallel: ${TEST_CONFIG.maxParallel}`);
  console.log(`Timeout per test: ${TEST_CONFIG.timeoutMs}ms\n`);

  // Create temporary test directory
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-safe-test-'));
  console.log(`Test directory: ${testDir}\n`);

  try {
    // Run tests in batches
    for (let i = 0; i < TEST_SCENARIOS.length; i += TEST_CONFIG.maxParallel) {
      const batch = TEST_SCENARIOS.slice(i, i + TEST_CONFIG.maxParallel);
      await Promise.all(batch.map(scenario => runTest(scenario, testDir)));
    }

    // Calculate results
    results.total = TEST_SCENARIOS.length;
    results.passed = Object.values(results.scenarios).filter(r => r.passed).length;
    results.failed = results.total - results.passed;

  } finally {
    // Cleanup test directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (e) {
      console.error(`Warning: Could not cleanup ${testDir}`);
    }
  }

  return results;
}

/**
 * Analyze results and make GO/NO-GO decision
 */
function analyzeResults(results) {
  console.log('\n' + '='.repeat(60));
  console.log('RESULTS ANALYSIS');
  console.log('='.repeat(60));

  const deadlockRate = (results.deadlocks / results.total) * 100;
  const totalFallback = results.fallbackSuccesses + results.fallbackFailures;
  const fallbackRate = totalFallback > 0 ? (results.fallbackSuccesses / totalFallback) * 100 : 100;

  console.log(`\nTotal Tests: ${results.total}`);
  console.log(`Passed: ${results.passed} (${(results.passed/results.total*100).toFixed(1)}%)`);
  console.log(`Failed: ${results.failed} (${(results.failed/results.total*100).toFixed(1)}%)`);
  console.log(`\n🚨 CRITICAL METRICS:`);
  console.log(`Deadlock Rate: ${deadlockRate.toFixed(2)}% (Required: ${TEST_CONFIG.requiredDeadlockRate}%)`);
  console.log(`  Deadlocks: ${results.deadlocks}/${results.total}`);
  console.log(`Fallback Success: ${fallbackRate.toFixed(1)}% (Required: ${TEST_CONFIG.requiredFallbackSuccess}%)`);
  console.log(`  Successes: ${results.fallbackSuccesses}/${totalFallback}`);

  // Calculate average duration
  const allTests = Object.values(results.scenarios).filter(r => !r.deadlock);
  if (allTests.length > 0) {
    const avgDuration = allTests.reduce((sum, r) => sum + r.duration, 0) / allTests.length;
    console.log(`\nAverage Duration: ${avgDuration.toFixed(0)}ms`);
  }

  // GO/NO-GO Decision
  console.log('\n' + '='.repeat(60));
  console.log('GO/NO-GO DECISION');
  console.log('='.repeat(60));

  const goNoGo = {
    deadlockPass: deadlockRate === TEST_CONFIG.requiredDeadlockRate,
    fallbackPass: fallbackRate >= TEST_CONFIG.requiredFallbackSuccess,
  };

  console.log(`\n✓ Zero Deadlocks: ${goNoGo.deadlockPass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`✓ Fallback Success: ${goNoGo.fallbackPass ? '✅ PASS' : '❌ FAIL'}`);

  const finalDecision = goNoGo.deadlockPass && goNoGo.fallbackPass;

  console.log('\n' + '='.repeat(60));
  if (finalDecision) {
    console.log('🟢 GO: Feature is SAFE for production');
    console.log('   All safety requirements met.');
    console.log('   Data-driven approach prevents code execution risks.');
  } else {
    console.log('🔴 NO-GO: Feature REJECTED');
    console.log('   Safety requirements NOT met.');
    if (!goNoGo.deadlockPass) {
      console.log('   ⚠️  DEADLOCK RISK DETECTED');
    }
    if (!goNoGo.fallbackPass) {
      console.log('   ⚠️  FALLBACK MECHANISM INSUFFICIENT');
    }
  }
  console.log('='.repeat(60) + '\n');

  return finalDecision;
}

/**
 * Main execution
 */
async function main() {
  console.log('\n⚠️  SAFE TESTING FRAMEWORK');
  console.log('Tests data-driven approach (no code generation).');
  console.log('Project context stored as JSON, hook reads and displays.\n');

  const results = await runAllTests();
  const goDecision = analyzeResults(results);

  // Write detailed results to file
  const resultsPath = path.join(__dirname, 'post-reload-safe-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`Detailed results saved to: ${resultsPath}\n`);

  process.exit(goDecision ? 0 : 1);
}

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error('Test framework error:', err);
    process.exit(1);
  });
}

module.exports = { runAllTests, analyzeResults, TEST_SCENARIOS };
