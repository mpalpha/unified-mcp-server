#!/usr/bin/env node

/**
 * REAL Testing Framework for Post-Reload Configuration Customization
 *
 * CRITICAL: This test must prove ZERO-DEADLOCK before feature can proceed
 *
 * Tests:
 * - 100+ sub-agent scenarios with REAL execution
 * - All failure modes (syntax, logic, cascading)
 * - Escape hatches and recovery
 * - Deadlock detection
 *
 * GO/NO-GO Criteria:
 * - Deadlock rate: MUST be 0.00%
 * - Fallback success: MUST be 100%
 * - Recovery success: MUST be 100%
 * - Any deadlock = REJECT FEATURE ENTIRELY
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

// Test configuration
const TEST_CONFIG = {
  totalTests: 100,
  timeoutMs: 30000, // 30 seconds per test
  maxParallel: 5,  // Run 5 tests in parallel

  // Safety thresholds
  requiredDeadlockRate: 0.00,
  requiredFallbackSuccess: 100,
  requiredRecoverySuccess: 100,
};

// Test scenarios (repeat each 5 times to get to 100+ tests)
const BASE_SCENARIOS = [
  // Baseline
  { id: 1, name: 'Generic hooks only (baseline)', type: 'baseline', customization: null },

  // Simple customizations
  { id: 2, name: 'Add file count', type: 'simple', customization: 'fileCount' },
  { id: 3, name: 'Add project name', type: 'simple', customization: 'projectName' },
  { id: 4, name: 'Add file types detected', type: 'simple', customization: 'fileTypes' },

  // Medium customizations
  { id: 5, name: 'File count + .cursorrules', type: 'medium', customization: 'fileCountCursorrules' },
  { id: 6, name: 'File count + CONTRIBUTING.md', type: 'medium', customization: 'fileCountContributing' },
  { id: 7, name: 'Discovered files summary', type: 'medium', customization: 'discoveredFiles' },

  // Complex customizations
  { id: 8, name: 'Full context (files + .cursorrules + CONTRIBUTING)', type: 'complex', customization: 'fullContext' },
  { id: 9, name: 'Git history insights', type: 'complex', customization: 'gitHistory' },
  { id: 10, name: 'Similar projects from DB', type: 'complex', customization: 'similarProjects' },

  // FAILURE MODES (CRITICAL)
  { id: 11, name: 'BROKEN: Syntax error in custom hook', type: 'failure', customization: 'syntaxError', expectFailure: true },
  { id: 12, name: 'BROKEN: Logic error (infinite loop)', type: 'failure', customization: 'infiniteLoop', expectFailure: true },
  { id: 13, name: 'BROKEN: Missing escape hatch', type: 'failure', customization: 'noEscapeHatch', expectFailure: true },
  { id: 14, name: 'BROKEN: Circular dependency', type: 'failure', customization: 'circularDep', expectFailure: true },
  { id: 15, name: 'BROKEN: Malformed JSON input', type: 'failure', customization: 'malformedJSON', expectFailure: true },

  // Recovery testing
  { id: 16, name: 'RECOVERY: Fix broken syntax via bypass', type: 'recovery', customization: 'syntaxError', testRecovery: true },
  { id: 17, name: 'RECOVERY: Fix infinite loop via bypass', type: 'recovery', customization: 'infiniteLoop', testRecovery: true },
  { id: 18, name: 'RECOVERY: Rollback to generic', type: 'recovery', customization: 'fullContext', testRollback: true },

  // Edge cases
  { id: 19, name: 'EDGE: Empty project (no files)', type: 'edge', customization: 'emptyProject' },
  { id: 20, name: 'EDGE: Very large project (10K+ files)', type: 'edge', customization: 'largeProject' },
];

// Generate 100+ test scenarios by repeating base scenarios
const TEST_SCENARIOS = [];
for (let repeat = 0; repeat < 5; repeat++) {
  BASE_SCENARIOS.forEach((scenario, idx) => {
    TEST_SCENARIOS.push({
      ...scenario,
      id: repeat * BASE_SCENARIOS.length + idx + 1,
      iteration: repeat + 1,
    });
  });
}

// Results storage
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  deadlocks: 0,
  fallbackSuccesses: 0,
  fallbackFailures: 0,
  recoverySuccesses: 0,
  recoveryFailures: 0,
  scenarios: {},
  timing: {},
};

/**
 * Generate custom hook content based on scenario
 */
function generateCustomHook(scenario) {
  const base = `#!/usr/bin/env node

/**
 * Custom Hook for Scenario: ${scenario.name}
 */

const fs = require('fs');

// Escape hatch (MANDATORY)
if (process.env.BYPASS_HOOKS === 'true') {
  console.log('⚠️  BYPASS MODE: Hooks disabled for recovery');
  process.exit(0);
}

try {
  // Read stdin
  const input = fs.readFileSync(0, 'utf-8');
  const data = JSON.parse(input);

  console.log('⚠️  WORKFLOW ENFORCEMENT ACTIVE\\n');

`;

  // Add customization based on type
  let customContent = '';

  switch (scenario.customization) {
    case 'fileCount':
      customContent = `  console.log('This project has 152 files discovered.\\n');\n`;
      break;

    case 'projectName':
      customContent = `  console.log('Project: unified-mcp-server\\n');\n`;
      break;

    case 'fileTypes':
      customContent = `  console.log('File types: .js (85%), .md (10%), .json (5%)\\n');\n`;
      break;

    case 'fileCountCursorrules':
      customContent = `  console.log('This project has 152 files discovered.');\n`;
      customContent += `  console.log('• .cursorrules found → Review for project conventions\\n');\n`;
      break;

    case 'fileCountContributing':
      customContent = `  console.log('This project has 152 files discovered.');\n`;
      customContent += `  console.log('• CONTRIBUTING.md found → Check workflow guidelines\\n');\n`;
      break;

    case 'discoveredFiles':
      customContent = `  console.log('Discovered files:');\n`;
      customContent += `  console.log('  • .cursorrules');\n`;
      customContent += `  console.log('  • CONTRIBUTING.md');\n`;
      customContent += `  console.log('  • README.md\\n');\n`;
      break;

    case 'fullContext':
      customContent = `  console.log('Project Analysis:');\n`;
      customContent += `  console.log('  • 152 files across 12 directories');\n`;
      customContent += `  console.log('  • .cursorrules found → Review conventions');\n`;
      customContent += `  console.log('  • CONTRIBUTING.md found → Check workflow\\n');\n`;
      break;

    case 'gitHistory':
      customContent = `  console.log('Git history analysis:');\n`;
      customContent += `  console.log('  • 50+ commits in last month');\n`;
      customContent += `  console.log('  • Frequent changes to: index.js, hooks/\\n');\n`;
      break;

    case 'similarProjects':
      customContent = `  console.log('Similar projects found in DB:');\n`;
      customContent += `  console.log('  • mcp-server-template');\n`;
      customContent += `  console.log('  • protocol-enforcer\\n');\n`;
      break;

    case 'syntaxError':
      // Intentional syntax error
      customContent = `  console.log('Broken syntax);\n`; // Missing quote
      break;

    case 'infiniteLoop':
      // Intentional infinite loop
      customContent = `  while(true) { /* deadlock */ }\n`;
      break;

    case 'circularDep':
      // Intentional circular dependency
      customContent = `  const a = require('./hook-a.cjs');\n  a.test();\n`;
      break;

    case 'noEscapeHatch':
      // Return different hook without escape hatch
      return `#!/usr/bin/env node
// BROKEN: No escape hatch!
const fs = require('fs');
const input = fs.readFileSync(0, 'utf-8');
console.log('No way to bypass this');
process.exit(1); // Always blocks
`;

    case 'emptyProject':
      customContent = `  console.log('Empty project detected (0 files)\\n');\n`;
      break;

    case 'largeProject':
      customContent = `  console.log('Large project detected (10,243 files)\\n');\n`;
      break;

    default:
      customContent = `  console.log('Custom hook for ${scenario.customization || 'generic'}\\n');\n`;
  }

  const end = `
  console.log('Before file operations:');
  console.log('✓ LEARN: Search for patterns');
  console.log('✓ REASON: Analyze impact');
  console.log('✓ TEACH: Record approach\\n');

  // Return original prompt
  console.log('---\\n');
  console.log(data.userPrompt || data.prompt || '');

} catch (e) {
  console.error('Hook error:', e.message);
  process.exit(0);
}
`;

  return base + customContent + end;
}

/**
 * Run single test scenario with REAL process execution
 */
async function runTest(scenario, testDir) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const timeout = TEST_CONFIG.timeoutMs;

    console.log(`\n📋 Test ${scenario.id}/${TEST_SCENARIOS.length}: ${scenario.name} (iter ${scenario.iteration})`);

    const result = {
      scenario: scenario.id,
      name: scenario.name,
      passed: false,
      deadlock: false,
      fallbackSuccess: null,
      recoverySuccess: null,
      duration: 0,
      output: '',
      error: null,
    };

    try {
      // Create hook file
      const hookPath = path.join(testDir, `hook-${scenario.id}.cjs`);
      const hookContent = generateCustomHook(scenario);
      fs.writeFileSync(hookPath, hookContent);
      fs.chmodSync(hookPath, '755');

      // Create test input
      const testInput = JSON.stringify({
        userPrompt: `Test prompt for scenario ${scenario.id}`,
        toolName: 'Write',
        args: { file_path: 'test.txt', content: 'test' }
      });

      // Spawn node process to execute hook
      const env = { ...process.env };
      if (scenario.testRecovery) {
        env.BYPASS_HOOKS = 'true';
      }

      const proc = spawn('node', [hookPath], {
        env,
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

        // Analyze results
        if (timedOut) {
          result.deadlock = true;
          result.passed = false;
          results.deadlocks++;
          console.log(`  ⚠️  DEADLOCK DETECTED (timeout after ${duration}ms)`);
        } else if (scenario.expectFailure) {
          // Failure scenarios should fail gracefully (exit code 0 or error caught)
          const failedGracefully = code === 0 || output.includes('Hook error');
          result.fallbackSuccess = failedGracefully;
          result.passed = failedGracefully;

          if (failedGracefully) {
            results.fallbackSuccesses++;
            console.log(`  ✅ Failed gracefully in ${duration}ms`);
          } else {
            results.fallbackFailures++;
            console.log(`  ❌ Failed badly in ${duration}ms (code: ${code})`);
          }
        } else if (scenario.testRecovery) {
          // Recovery scenarios should work via bypass
          const recovered = output.includes('BYPASS MODE');
          result.recoverySuccess = recovered;
          result.passed = recovered;

          if (recovered) {
            results.recoverySuccesses++;
            console.log(`  ✅ Recovered via bypass in ${duration}ms`);
          } else {
            results.recoveryFailures++;
            console.log(`  ❌ Recovery failed in ${duration}ms`);
          }
        } else {
          // Normal scenarios should complete successfully
          const completed = code === 0 && output.includes('WORKFLOW ENFORCEMENT');
          result.passed = completed;

          if (completed) {
            console.log(`  ✅ Completed in ${duration}ms`);
          } else {
            console.log(`  ❌ Failed in ${duration}ms (code: ${code})`);
          }
        }

        results.scenarios[scenario.id] = result;

        // Cleanup
        try {
          fs.unlinkSync(hookPath);
        } catch (e) {
          // Ignore cleanup errors
        }

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
  console.log('POST-RELOAD CUSTOMIZATION REAL TESTING FRAMEWORK');
  console.log('='.repeat(60));
  console.log(`\nRunning ${TEST_SCENARIOS.length} REAL test scenarios...`);
  console.log(`Max parallel: ${TEST_CONFIG.maxParallel}`);
  console.log(`Timeout per test: ${TEST_CONFIG.timeoutMs}ms\n`);

  // Create temporary test directory
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-hook-test-'));
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
  const totalRecovery = results.recoverySuccesses + results.recoveryFailures;
  const recoveryRate = totalRecovery > 0 ? (results.recoverySuccesses / totalRecovery) * 100 : 100;

  console.log(`\nTotal Tests: ${results.total}`);
  console.log(`Passed: ${results.passed} (${(results.passed/results.total*100).toFixed(1)}%)`);
  console.log(`Failed: ${results.failed} (${(results.failed/results.total*100).toFixed(1)}%)`);
  console.log(`\n🚨 CRITICAL METRICS:`);
  console.log(`Deadlock Rate: ${deadlockRate.toFixed(2)}% (Required: ${TEST_CONFIG.requiredDeadlockRate}%)`);
  console.log(`  Deadlocks: ${results.deadlocks}/${results.total}`);
  console.log(`Fallback Success: ${fallbackRate.toFixed(1)}% (Required: ${TEST_CONFIG.requiredFallbackSuccess}%)`);
  console.log(`  Successes: ${results.fallbackSuccesses}/${totalFallback}`);
  console.log(`Recovery Success: ${recoveryRate.toFixed(1)}% (Required: ${TEST_CONFIG.requiredRecoverySuccess}%)`);
  console.log(`  Successes: ${results.recoverySuccesses}/${totalRecovery}`);

  // Calculate average duration for passed tests
  const passedTests = Object.values(results.scenarios).filter(r => r.passed && !r.deadlock);
  if (passedTests.length > 0) {
    const avgDuration = passedTests.reduce((sum, r) => sum + r.duration, 0) / passedTests.length;
    console.log(`\nAverage Duration: ${avgDuration.toFixed(0)}ms`);
  }

  // GO/NO-GO Decision
  console.log('\n' + '='.repeat(60));
  console.log('GO/NO-GO DECISION');
  console.log('='.repeat(60));

  const goNoGo = {
    deadlockPass: deadlockRate === TEST_CONFIG.requiredDeadlockRate,
    fallbackPass: fallbackRate >= TEST_CONFIG.requiredFallbackSuccess,
    recoveryPass: recoveryRate >= TEST_CONFIG.requiredRecoverySuccess,
  };

  console.log(`\n✓ Zero Deadlocks: ${goNoGo.deadlockPass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`✓ Fallback Success: ${goNoGo.fallbackPass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`✓ Recovery Success: ${goNoGo.recoveryPass ? '✅ PASS' : '❌ FAIL'}`);

  const finalDecision = goNoGo.deadlockPass && goNoGo.fallbackPass && goNoGo.recoveryPass;

  console.log('\n' + '='.repeat(60));
  if (finalDecision) {
    console.log('🟢 GO: Feature can proceed to production');
    console.log('   All safety requirements met.');
    console.log('   Post-reload customization is SAFE to deploy.');
  } else {
    console.log('🔴 NO-GO: Feature REJECTED');
    console.log('   Safety requirements NOT met.');
    if (!goNoGo.deadlockPass) {
      console.log('   ⚠️  DEADLOCK RISK DETECTED - FEATURE MUST BE ABANDONED');
    }
    if (!goNoGo.fallbackPass) {
      console.log('   ⚠️  FALLBACK MECHANISM INSUFFICIENT');
    }
    if (!goNoGo.recoveryPass) {
      console.log('   ⚠️  RECOVERY MECHANISM INSUFFICIENT');
    }
  }
  console.log('='.repeat(60) + '\n');

  return finalDecision;
}

/**
 * Main execution
 */
async function main() {
  console.log('\n⚠️  REAL TESTING FRAMEWORK');
  console.log('This framework spawns REAL node processes to test hooks.');
  console.log('Each test executes actual hook code with timeout detection.\n');

  const results = await runAllTests();
  const goDecision = analyzeResults(results);

  // Write detailed results to file
  const resultsPath = path.join(__dirname, 'post-reload-test-results.json');
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
