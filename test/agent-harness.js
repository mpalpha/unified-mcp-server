#!/usr/bin/env node
/**
 * Agent Test Harness - Automated testing with real agent behavior
 *
 * This harness:
 * 1. Acts as an MCP client to our server
 * 2. Simulates Claude Code agent behavior
 * 3. Records tool call sequences
 * 4. Verifies workflow compliance
 *
 * Cannot fully replace real Claude Code testing, but provides
 * automated verification of expected tool sequences for common scenarios.
 *
 * v1.4.0: Updated for project-scoped experiences
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// v1.4.0: Create project-scoped test directory
const TEST_PROJECT = fs.mkdtempSync(path.join(os.tmpdir(), 'unified-mcp-harness-'));
const CLAUDE_DIR = path.join(TEST_PROJECT, '.claude');
fs.mkdirSync(CLAUDE_DIR);
const TOKEN_DIR = path.join(CLAUDE_DIR, 'tokens');
fs.mkdirSync(TOKEN_DIR);
const TEST_DB = path.join(CLAUDE_DIR, 'experiences.db');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

console.log(`Test project: ${TEST_PROJECT}`);

class MCPClient {
  constructor() {
    this.server = null;
    this.messageId = 0;
    this.pendingRequests = new Map();
    this.toolCallLog = [];
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.server = spawn('node', [path.join(__dirname, '../index.js')], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: TEST_PROJECT,
        env: { ...process.env, PWD: TEST_PROJECT }
      });

      let initTimeout = setTimeout(() => {
        reject(new Error('Server initialization timeout'));
      }, 5000);

      this.server.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const message = JSON.parse(line);

            if (message.id && this.pendingRequests.has(message.id)) {
              const { resolve, reject } = this.pendingRequests.get(message.id);
              this.pendingRequests.delete(message.id);

              if (message.error) {
                reject(new Error(message.error.message));
              } else {
                resolve(message.result);
              }
            }
          } catch (e) {
            // Not JSON, ignore
          }
        }
      });

      this.server.on('error', reject);

      // Initialize
      this.call('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'agent-harness', version: '1.0' }
      }).then(() => {
        clearTimeout(initTimeout);
        resolve();
      }).catch(reject);
    });
  }

  async call(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;

      this.pendingRequests.set(id, { resolve, reject });

      const message = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      this.server.stdin.write(JSON.stringify(message) + '\n');

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 10000);
    });
  }

  async callTool(toolName, args) {
    this.toolCallLog.push({ tool: toolName, args, timestamp: Date.now() });

    try {
      const result = await this.call('tools/call', {
        name: toolName,
        arguments: args
      });
      return result;
    } catch (error) {
      throw error;
    }
  }

  getToolSequence() {
    return this.toolCallLog.map(entry => entry.tool);
  }

  clearToolLog() {
    this.toolCallLog = [];
  }

  async stop() {
    if (this.server) {
      this.server.stdin.end();
      await new Promise(resolve => {
        this.server.on('close', resolve);
        setTimeout(() => {
          this.server.kill();
          resolve();
        }, 1000);
      });
    }
  }
}

class AgentScenario {
  constructor(name, description) {
    this.name = name;
    this.description = description;
    this.steps = [];
  }

  addStep(description, toolCalls) {
    this.steps.push({ description, toolCalls });
    return this;
  }

  expectedSequence() {
    return this.steps.flatMap(step => step.toolCalls.map(tc => tc.name));
  }

  async execute(client) {
    console.log(`\n${colors.bold}${colors.blue}Scenario: ${this.name}${colors.reset}`);
    console.log(`${colors.cyan}${this.description}${colors.reset}`);
    console.log('');

    client.clearToolLog();
    const results = [];
    let sessionId = null;
    let operationToken = null;

    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      console.log(`${colors.yellow}Step ${i + 1}:${colors.reset} ${step.description}`);

      for (const toolCall of step.toolCalls) {
        // Replace DYNAMIC session_id with actual session ID
        if (toolCall.args.session_id === 'DYNAMIC' && sessionId) {
          toolCall.args.session_id = sessionId;
        }

        // Replace DYNAMIC operation_token with actual token
        if (toolCall.args.operation_token === 'DYNAMIC' && operationToken) {
          toolCall.args.operation_token = operationToken;
        }

        try {
          const result = await client.callTool(toolCall.name, toolCall.args);
          console.log(`  ✓ ${toolCall.name}`);
          results.push({ success: true, tool: toolCall.name, result });

          // Extract session ID from analyze_problem
          if (toolCall.name === 'analyze_problem' && result.content) {
            try {
              const data = JSON.parse(result.content[0].text);
              sessionId = data.session_id;
            } catch (e) {
              // Ignore parse errors
            }
          }

          // Extract operation token from verify_compliance
          if (toolCall.name === 'verify_compliance' && result.content) {
            try {
              const data = JSON.parse(result.content[0].text);
              operationToken = data.operation_token;
            } catch (e) {
              // Ignore parse errors
            }
          }
        } catch (error) {
          console.log(`  ${colors.red}✗ ${toolCall.name}: ${error.message}${colors.reset}`);
          results.push({ success: false, tool: toolCall.name, error: error.message });
        }
      }
    }

    return {
      scenario: this.name,
      results,
      sequence: client.getToolSequence(),
      expectedSequence: this.expectedSequence()
    };
  }
}

// Define test scenarios
function createScenarios() {
  const scenarios = [];

  // Scenario 1: Bug Fix Workflow
  const bugFix = new AgentScenario(
    'Bug Fix: Authentication 401 Error',
    'Agent needs to fix a JWT token timezone bug'
  );

  bugFix
    .addStep('TEACH: Record debugging experience', [{
      name: 'record_experience',
      args: {
        type: 'effective',
        domain: 'Debugging',
        situation: 'Authentication fails with 401 on valid credentials',
        approach: 'Check JWT token expiration logic - timezone issue',
        outcome: 'Found token expiry using local time instead of UTC',
        reasoning: 'Token validation must use consistent timezone'
      }
    }])
    .addStep('LEARN: Search for similar issues', [{
      name: 'search_experiences',
      args: {
        query: 'authentication JWT token timezone',
        domain: 'Debugging'
      }
    }])
    .addStep('REASON: Analyze and plan fix', [
      {
        name: 'analyze_problem',
        args: {
          problem: 'Fix JWT token validation to use UTC timestamps'
        }
      },
      {
        name: 'reason_through',
        args: {
          session_id: 'DYNAMIC', // Will be replaced
          thought: 'Update token validation to use UTC instead of local time',
          thought_number: 1,
          confidence: 0.9
        }
      },
      {
        name: 'finalize_decision',
        args: {
          session_id: 'DYNAMIC',
          conclusion: 'Change JWT validation to Date.now() UTC',
          rationale: 'Prevents timezone-related auth failures',
          confidence: 0.95
        }
      }
    ])
    .addStep('AUTHORIZE: Get permission for file operations', [
      {
        name: 'verify_compliance',
        args: {
          session_id: 'bugfix-test',
          current_phase: 'reason',
          action: 'edit_auth_file'
        }
      },
      {
        name: 'authorize_operation',
        args: {
          operation_token: 'DYNAMIC',
          create_session_token: true
        }
      }
    ]);

  scenarios.push(bugFix);

  // Scenario 2: New Feature Implementation
  const newFeature = new AgentScenario(
    'New Feature: Rate Limiting',
    'Agent adds rate limiting to API endpoints'
  );

  newFeature
    .addStep('TEACH: Record rate limiting pattern', [{
      name: 'record_experience',
      args: {
        type: 'effective',
        domain: 'Tools',
        situation: 'Need to prevent API abuse',
        approach: 'Implement sliding window rate limiter with Redis',
        outcome: 'Rate limiting working, reduced abuse by 95%',
        reasoning: 'Sliding window more accurate than fixed window'
      }
    }])
    .addStep('LEARN: Search for similar implementations', [{
      name: 'search_experiences',
      args: {
        query: 'rate limiting API redis sliding window',
        type: 'effective'
      }
    }])
    .addStep('REASON: Plan implementation', [
      {
        name: 'analyze_problem',
        args: {
          problem: 'Add rate limiting middleware to API'
        }
      },
      {
        name: 'gather_context',
        args: {
          session_id: 'DYNAMIC',
          sources: {
            experiences: []
          }
        }
      },
      {
        name: 'reason_through',
        args: {
          session_id: 'DYNAMIC',
          thought: 'Use Express middleware with Redis-backed sliding window',
          thought_number: 1,
          confidence: 0.85
        }
      }
    ])
    .addStep('AUTHORIZE: Get permission', [
      {
        name: 'verify_compliance',
        args: {
          session_id: 'feature-test',
          current_phase: 'reason',
          action: 'create_rate_limiter'
        }
      },
      {
        name: 'authorize_operation',
        args: {
          operation_token: 'DYNAMIC'
        }
      }
    ]);

  scenarios.push(newFeature);

  // Scenario 3: Code Refactoring
  const refactor = new AgentScenario(
    'Refactoring: Legacy Authentication Module',
    'Agent refactors 500-line auth function'
  );

  refactor
    .addStep('TEACH: Record refactoring approach', [{
      name: 'record_experience',
      args: {
        type: 'effective',
        domain: 'Process',
        situation: 'Legacy code with 500-line functions',
        approach: 'Extract methods, create service classes, add tests',
        outcome: 'Code coverage 80%, bugs reduced 60%',
        reasoning: 'Small focused functions easier to test'
      }
    }])
    .addStep('LEARN: Find refactoring patterns', [{
      name: 'search_experiences',
      args: {
        query: 'refactoring legacy code testing',
        type: 'effective'
      }
    }])
    .addStep('REASON: Plan refactoring strategy', [
      {
        name: 'analyze_problem',
        args: {
          problem: 'Refactor monolithic auth module into testable components'
        }
      },
      {
        name: 'reason_through',
        args: {
          session_id: 'DYNAMIC',
          thought: 'Add unit tests first, then extract methods incrementally',
          thought_number: 1,
          confidence: 0.88
        }
      }
    ]);

  scenarios.push(refactor);

  return scenarios;
}

// Workflow verification
function verifyWorkflow(scenarioResult) {
  const { scenario, sequence, expectedSequence, results } = scenarioResult;

  console.log(`\n${colors.bold}Verification: ${scenario}${colors.reset}`);
  console.log(`Expected: ${expectedSequence.join(' → ')}`);
  console.log(`Actual:   ${sequence.join(' → ')}`);

  const checks = {
    hasTeach: false,
    hasLearn: false,
    hasReason: false,
    teachBeforeLearn: false,
    learnBeforeReason: false,
    reasonBeforeAuthorize: false,
    correctOrder: false
  };

  // Check for three gates
  checks.hasTeach = sequence.includes('record_experience');
  checks.hasLearn = sequence.includes('search_experiences');
  checks.hasReason = sequence.includes('reason_through') || sequence.includes('analyze_problem');

  // Check ordering
  const teachIdx = sequence.indexOf('record_experience');
  const learnIdx = sequence.indexOf('search_experiences');
  const reasonIdx = Math.max(
    sequence.indexOf('analyze_problem'),
    sequence.indexOf('reason_through')
  );
  const authorizeIdx = sequence.indexOf('verify_compliance');

  if (teachIdx !== -1 && learnIdx !== -1) {
    checks.teachBeforeLearn = teachIdx < learnIdx;
  }
  if (learnIdx !== -1 && reasonIdx !== -1) {
    checks.learnBeforeReason = learnIdx < reasonIdx;
  }
  if (reasonIdx !== -1 && authorizeIdx !== -1) {
    checks.reasonBeforeAuthorize = reasonIdx < authorizeIdx;
  }

  checks.correctOrder = checks.teachBeforeLearn &&
                        checks.learnBeforeReason &&
                        checks.reasonBeforeAuthorize;

  // Display results
  console.log('\nWorkflow Compliance:');
  console.log(`  TEACH phase present:     ${checks.hasTeach ? colors.green + '✓' : colors.red + '✗'}${colors.reset}`);
  console.log(`  LEARN phase present:     ${checks.hasLearn ? colors.green + '✓' : colors.red + '✗'}${colors.reset}`);
  console.log(`  REASON phase present:    ${checks.hasReason ? colors.green + '✓' : colors.red + '✗'}${colors.reset}`);
  console.log(`  TEACH before LEARN:      ${checks.teachBeforeLearn ? colors.green + '✓' : colors.red + '✗'}${colors.reset}`);
  console.log(`  LEARN before REASON:     ${checks.learnBeforeReason ? colors.green + '✓' : colors.red + '✗'}${colors.reset}`);
  console.log(`  REASON before AUTHORIZE: ${checks.reasonBeforeAuthorize ? colors.green + '✓' : colors.red + '✗'}${colors.reset}`);
  console.log(`  Correct order overall:   ${checks.correctOrder ? colors.green + '✓' : colors.red + '✗'}${colors.reset}`);

  return checks;
}

async function runHarness() {
  console.log(colors.bold + '\n╔════════════════════════════════════════════════════════════╗' + colors.reset);
  console.log(colors.bold + '║  AGENT TEST HARNESS - Automated Workflow Verification    ║' + colors.reset);
  console.log(colors.bold + '╚════════════════════════════════════════════════════════════╝' + colors.reset);

  // Clean test environment
  try {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    if (fs.existsSync(TOKEN_DIR)) {
      fs.readdirSync(TOKEN_DIR).forEach(f => fs.unlinkSync(path.join(TOKEN_DIR, f)));
    }
    console.log(`\n${colors.cyan}✓ Cleaned test environment${colors.reset}`);
  } catch (e) {
    // Ignore
  }

  const client = new MCPClient();

  try {
    await client.start();
    console.log(`${colors.cyan}✓ MCP server started${colors.reset}\n`);

    const scenarios = createScenarios();
    const results = [];

    for (const scenario of scenarios) {
      // Handle dynamic session IDs
      let sessionId = null;

      for (const step of scenario.steps) {
        for (const toolCall of step.toolCalls) {
          if (toolCall.args.session_id === 'DYNAMIC' && sessionId) {
            toolCall.args.session_id = sessionId;
          }
        }
      }

      const result = await scenario.execute(client);

      // Extract session ID from analyze_problem result
      const analyzeResult = result.results.find(r => r.tool === 'analyze_problem');
      if (analyzeResult && analyzeResult.result) {
        try {
          const data = JSON.parse(analyzeResult.result.content[0].text);
          sessionId = data.session_id;
        } catch (e) {
          // Ignore
        }
      }

      const verification = verifyWorkflow(result);
      results.push({ scenario: result.scenario, verification });
    }

    // Summary
    console.log('\n' + colors.bold + '═══════════════════════════════════════════════════════════' + colors.reset);
    console.log(colors.bold + 'HARNESS SUMMARY' + colors.reset);
    console.log(colors.bold + '═══════════════════════════════════════════════════════════' + colors.reset);

    let allPassed = true;
    for (const result of results) {
      const passed = result.verification.correctOrder &&
                     result.verification.hasTeach &&
                     result.verification.hasLearn &&
                     result.verification.hasReason;

      console.log(`${passed ? colors.green + '✓' : colors.red + '✗'} ${result.scenario}${colors.reset}`);
      if (!passed) allPassed = false;
    }

    console.log('');
    if (allPassed) {
      console.log(colors.green + '✅ All scenarios follow three-gate workflow correctly!' + colors.reset);
    } else {
      console.log(colors.red + '⚠️  Some scenarios did not follow proper workflow order' + colors.reset);
    }
    console.log('');

  } catch (error) {
    console.error(colors.red + 'Harness error:' + colors.reset, error.message);
    // v1.4.0: Cleanup test project
    try { fs.rmSync(TEST_PROJECT, { recursive: true, force: true }); } catch (e) {}
    process.exit(1);
  } finally {
    await client.stop();
    // v1.4.0: Cleanup test project
    try { fs.rmSync(TEST_PROJECT, { recursive: true, force: true }); } catch (e) {}
  }
}

if (require.main === module) {
  runHarness().catch(e => {
    // v1.4.0: Cleanup test project on error
    try { fs.rmSync(TEST_PROJECT, { recursive: true, force: true }); } catch (err) {}
    console.error(e);
    process.exit(1);
  });
}

module.exports = { MCPClient, AgentScenario };
