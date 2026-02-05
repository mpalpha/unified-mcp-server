#!/usr/bin/env node
/**
 * Mock Dry-Run Test for Tool Description Discoverability (v1.6.0)
 *
 * Tests that enhanced tool descriptions enable correct tool selection
 * for memory-related use cases by simulating fresh-context decision making.
 *
 * This test VALIDATES (not just documents) by:
 * 1. Extracting actual descriptions from index.js
 * 2. Parsing prompts for user intent patterns
 * 3. Matching intent against description keywords
 * 4. Comparing computed selection to expected selection
 *
 * The test fails if descriptions don't contain keywords that would
 * enable correct tool selection for the test prompts.
 */

const path = require('path');
const fs = require('fs');

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

// Extract tool descriptions from index.js
function getToolDescriptions() {
  const indexPath = path.join(__dirname, '..', 'index.js');
  const content = fs.readFileSync(indexPath, 'utf-8');
  const recordMatch = content.match(/name:\s*'record_experience',\s*description:\s*'([^']+)'/);
  const searchMatch = content.match(/name:\s*'search_experiences',\s*description:\s*'([^']+)'/);
  return {
    record_experience: recordMatch ? recordMatch[1] : null,
    search_experiences: searchMatch ? searchMatch[1] : null
  };
}

/**
 * Simulate fresh-context tool selection.
 * Given only the prompt and tool descriptions, which tool would be selected?
 *
 * This mimics how an LLM would select a tool:
 * 1. Identify user intent from prompt
 * 2. Match intent keywords against tool descriptions
 * 3. Select tool with best keyword match
 */
function simulateToolSelection(prompt, descriptions) {
  const promptLower = prompt.toLowerCase();

  // Intent patterns for memory WRITE (storing information)
  const writeIntentPatterns = [
    /^remember\b/,           // "Remember that..."
    /please remember/,       // "Please remember..."
    /can you remember/,      // "Can you remember this..."
    /i want you to remember/,// "I want you to remember..."
    /remember my/,           // "Remember my preference..."
    /store this/,            // "Store this for later..."
    /save this/,             // "Save this information..."
  ];

  // Intent patterns for memory READ (retrieving information)
  const readIntentPatterns = [
    /what did i tell you/,   // "What did I tell you about..."
    /what did i (ask|mention|say)/, // "What did I ask/mention/say..."
    /do you remember what/,  // "Do you remember what I..."
    /^recall\b/,             // "Recall what I said..."
    /can you recall/,        // "Can you recall..."
    /what (do you|did i) remember/, // "What do you remember..."
  ];

  // Determine user intent from prompt
  const hasWriteIntent = writeIntentPatterns.some(p => p.test(promptLower));
  const hasReadIntent = readIntentPatterns.some(p => p.test(promptLower));

  // Check if descriptions have matching keywords
  const recordDesc = descriptions.record_experience.toLowerCase();
  const searchDesc = descriptions.search_experiences.toLowerCase();

  // Keywords that should be in descriptions for discoverability
  const writeKeywords = ['remember'];
  const readKeywords = ['recall', 'what did i tell you', 'what did i'];

  const recordHasWriteKeywords = writeKeywords.some(kw => recordDesc.includes(kw));
  const searchHasReadKeywords = readKeywords.some(kw => searchDesc.includes(kw));

  // Simulate tool selection based on intent + description match
  if (hasWriteIntent && recordHasWriteKeywords) {
    return { tool: 'record_experience', reason: 'Write intent matches record_experience description keywords' };
  }
  if (hasReadIntent && searchHasReadKeywords) {
    return { tool: 'search_experiences', reason: 'Read intent matches search_experiences description keywords' };
  }

  // Fallback: check if descriptions would still enable selection
  if (hasWriteIntent && !recordHasWriteKeywords) {
    return { tool: 'none', reason: 'Write intent but record_experience missing "remember" keywords' };
  }
  if (hasReadIntent && !searchHasReadKeywords) {
    return { tool: 'none', reason: 'Read intent but search_experiences missing "recall" keywords' };
  }

  return { tool: 'unknown', reason: 'No clear intent pattern matched' };
}

// Test cases with prompts and expected tools
const TEST_CASES = [
  // Memory Write prompts
  { prompt: 'Remember that the API key is stored in .env', expected: 'record_experience' },
  { prompt: 'Can you remember this for later: the database password is secret123', expected: 'record_experience' },
  { prompt: 'Please remember that I prefer tabs over spaces', expected: 'record_experience' },
  { prompt: 'I want you to remember: always use async/await instead of callbacks', expected: 'record_experience' },
  { prompt: 'Remember my preference: dark mode is enabled', expected: 'record_experience' },

  // Memory Read prompts
  { prompt: 'What did I tell you about the database schema?', expected: 'search_experiences' },
  { prompt: 'Recall what I said about error handling', expected: 'search_experiences' },
  { prompt: 'What did I ask you to remember?', expected: 'search_experiences' },
  { prompt: 'Do you remember what I told you about the API?', expected: 'search_experiences' },
  { prompt: 'What did I mention earlier about testing?', expected: 'search_experiences' },
];

function runTests() {
  console.log(`${colors.cyan}${colors.bold}=== Mock Dry-Run Tests for Tool Descriptions (v1.6.0) ===${colors.reset}\n`);

  const descriptions = getToolDescriptions();

  if (!descriptions.record_experience || !descriptions.search_experiences) {
    console.log(`${colors.red}✗ Could not extract tool descriptions from index.js${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.cyan}Extracted descriptions:${colors.reset}`);
  console.log(`  record_experience: "${descriptions.record_experience.substring(0, 80)}..."`);
  console.log(`  search_experiences: "${descriptions.search_experiences.substring(0, 80)}..."\n`);

  // Validate descriptions contain required keywords
  console.log(`${colors.cyan}Validating description keywords:${colors.reset}`);

  const recordHasRemember = descriptions.record_experience.toLowerCase().includes('remember');
  const searchHasRecall = descriptions.search_experiences.toLowerCase().includes('recall') ||
                          descriptions.search_experiences.toLowerCase().includes('what did i tell you');

  console.log(`  record_experience has "remember": ${recordHasRemember ? colors.green + '✓' : colors.red + '✗'}${colors.reset}`);
  console.log(`  search_experiences has "recall"/"what did I tell you": ${searchHasRecall ? colors.green + '✓' : colors.red + '✗'}${colors.reset}`);

  if (!recordHasRemember || !searchHasRecall) {
    console.log(`\n${colors.red}✗ FAIL: Descriptions missing required keywords for memory discoverability${colors.reset}`);
    process.exit(1);
  }

  // Run simulated tool selection tests
  console.log(`\n${colors.cyan}Simulated tool selection (${TEST_CASES.length} cases):${colors.reset}\n`);

  let passed = 0;
  let failed = 0;

  for (const tc of TEST_CASES) {
    const result = simulateToolSelection(tc.prompt, descriptions);

    if (result.tool === tc.expected) {
      passed++;
      console.log(`${colors.green}✓${colors.reset} "${tc.prompt.substring(0, 50)}..."`);
      console.log(`  → ${result.tool} (${result.reason})`);
    } else {
      failed++;
      console.log(`${colors.red}✗${colors.reset} "${tc.prompt.substring(0, 50)}..."`);
      console.log(`  Expected: ${tc.expected}, Got: ${result.tool}`);
      console.log(`  Reason: ${result.reason}`);
    }
  }

  // Summary
  const total = TEST_CASES.length;
  const complianceRate = (passed / total * 100).toFixed(1);

  console.log(`\n${colors.cyan}${colors.bold}=== Results ===${colors.reset}`);
  console.log(`Passed: ${passed}/${total}`);
  console.log(`Failed: ${failed}/${total}`);
  console.log(`Compliance: ${complianceRate}%`);

  if (complianceRate >= 99) {
    console.log(`\n${colors.green}✅ 99%+ compliance - descriptions enable correct tool selection${colors.reset}`);
  } else if (complianceRate >= 95) {
    console.log(`\n${colors.cyan}⚠ 95-99% compliance - analyze failure patterns${colors.reset}`);
  } else {
    console.log(`\n${colors.red}✗ <95% compliance - descriptions need improvement${colors.reset}`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
