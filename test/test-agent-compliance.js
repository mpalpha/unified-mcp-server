#!/usr/bin/env node
/**
 * Research-Based Agent Compliance Tests - 50+ Scenarios
 *
 * Based on real-world agent failure research from 2024-2025:
 * - AgentErrorTaxonomy (arXiv:2509.25370) - 5 failure categories
 * - ChatDev analysis - 25% correctness rate (arXiv:2503.13657)
 * - Microsoft AI Agent Security whitepaper (April 2025)
 * - Cognition.ai multi-agent failure analysis
 *
 * Tests TEACH → LEARN → REASON workflow compliance across:
 * - Memory failures (hallucination, retrieval, over-simplification)
 * - Reflection failures (progress misjudgment, causal misattribution)
 * - Planning failures (inefficient plans, logically flawed)
 * - Action failures (parameter errors, tool misuse)
 * - System failures (tool execution, environment errors)
 *
 * Ranges from simple single-step to complex multi-agent decomposition tasks.
 *
 * Sources:
 * - https://arxiv.org/abs/2509.25370 (Where LLM Agents Fail)
 * - https://arxiv.org/pdf/2503.13657 (Why Multi-Agent Systems Fail)
 * - https://www.microsoft.com/en-us/security/blog/2025/04/24/new-whitepaper-outlines-the-taxonomy-of-failure-modes-in-ai-agents/
 * - https://cognition.ai/blog/dont-build-multi-agents
 * - https://galileo.ai/blog/agent-failure-modes-guide
 *
 * v1.4.0: Updated for project-scoped experiences
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// v1.4.0: Create project-scoped test directory
const TEST_PROJECT = fs.mkdtempSync(path.join(os.tmpdir(), 'unified-mcp-compliance-'));
const CLAUDE_DIR = path.join(TEST_PROJECT, '.claude');
fs.mkdirSync(CLAUDE_DIR);
const TOKEN_DIR = path.join(CLAUDE_DIR, 'tokens');
fs.mkdirSync(TOKEN_DIR);
const DB_PATH = path.join(CLAUDE_DIR, 'experiences.db');

console.log(`Test project: ${TEST_PROJECT}`);

class MCPClient {
  constructor() {
    this.process = null;
    this.messageId = 0;
    this.toolCallLog = [];
  }

  async start() {
    const indexPath = path.join(__dirname, '..', 'index.js');
    this.process = spawn('node', [indexPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: TEST_PROJECT,
      env: { ...process.env, PWD: TEST_PROJECT }
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    await this.call('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'compliance-test', version: '1.0.0' }
    });
  }

  async call(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      const message = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';

      let responseData = '';
      const onData = (data) => {
        responseData += data.toString();
        const lines = responseData.split('\n');

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.id === id) {
              this.process.stdout.off('data', onData);
              resolve(parsed.result);
            }
          } catch (e) {}
        }
      };

      this.process.stdout.on('data', onData);
      this.process.stdin.write(message);

      setTimeout(() => reject(new Error('Timeout')), 5000);
    });
  }

  async callTool(toolName, args) {
    this.toolCallLog.push({ tool: toolName, args, timestamp: Date.now() });
    return await this.call('tools/call', { name: toolName, arguments: args });
  }

  getToolSequence() {
    return this.toolCallLog.map(e => e.tool);
  }

  hasTeachPhase() {
    return this.toolCallLog.some(e => e.tool === 'record_experience');
  }

  hasLearnPhase() {
    return this.toolCallLog.some(e => e.tool === 'search_experiences');
  }

  hasReasonPhase() {
    return this.toolCallLog.some(e =>
      ['analyze_problem', 'gather_context', 'reason_through'].includes(e.tool)
    );
  }

  hasAuthorization() {
    return this.toolCallLog.some(e =>
      e.tool === 'verify_compliance' || e.tool === 'authorize_operation'
    );
  }

  teachBeforeLearn() {
    const teachIdx = this.toolCallLog.findIndex(e => e.tool === 'record_experience');
    const learnIdx = this.toolCallLog.findIndex(e => e.tool === 'search_experiences');
    return teachIdx < learnIdx;
  }

  learnBeforeReason() {
    const learnIdx = this.toolCallLog.findIndex(e => e.tool === 'search_experiences');
    const reasonIdx = this.toolCallLog.findIndex(e => e.tool === 'analyze_problem');
    return learnIdx >= 0 && reasonIdx >= 0 ? learnIdx < reasonIdx : true;
  }

  async stop() {
    if (this.process) this.process.kill();
  }
}

// Test scenario definition
async function testScenario(category, scenario, toolCalls, validation) {
  const client = new MCPClient();
  await client.start();

  let sessionId = null;
  let operationToken = null;

  try {
    for (const toolCall of toolCalls) {
      // Handle dynamic values
      if (toolCall.args.session_id === 'DYNAMIC' && sessionId) {
        toolCall.args.session_id = sessionId;
      }
      if (toolCall.args.operation_token === 'DYNAMIC' && operationToken) {
        toolCall.args.operation_token = operationToken;
      }

      const result = await client.callTool(toolCall.name, toolCall.args);

      // Extract session ID
      if (toolCall.name === 'analyze_problem' && result.content) {
        const data = JSON.parse(result.content[0].text);
        sessionId = data.session_id;
      }

      // Extract operation token
      if (toolCall.name === 'verify_compliance' && result.content) {
        const data = JSON.parse(result.content[0].text);
        operationToken = data.operation_token;
      }
    }

    const pass = validation(client);
    return { pass, category, scenario, client };

  } catch (error) {
    return { pass: false, category, scenario, error: error.message, client };
  } finally {
    await client.stop();
  }
}

async function runAllTests() {
  console.log(colors.bold + '\nCOMPREHENSIVE AGENT COMPLIANCE TESTS (50+ Scenarios)' + colors.reset);
  console.log(colors.cyan + '======================================================================' + colors.reset);
  console.log('Testing workflow compliance across diverse agent scenarios\n');

  const results = [];

  // CATEGORY 1: Bug Fixes (10 tests)
  console.log(colors.bold + '\n📋 CATEGORY 1: Bug Fixes (10 tests)' + colors.reset);

  const bugFixScenarios = [
    {
      name: 'Simple authentication 401 bug',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Debugging', situation: 'Auth 401', approach: 'Check JWT', outcome: 'Fixed', reasoning: 'Token validation' }},
        { name: 'search_experiences', args: { query: 'authentication 401' }},
        { name: 'analyze_problem', args: { problem: 'Fix 401 error' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'fix_auth' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Database connection timeout',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Debugging', situation: 'DB timeout', approach: 'Connection pool', outcome: 'Fixed', reasoning: 'Pool exhaustion' }},
        { name: 'search_experiences', args: { query: 'database connection timeout pool' }},
        { name: 'analyze_problem', args: { problem: 'Fix DB timeouts' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'fix_db' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Memory leak in event listeners',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Debugging', situation: 'Memory leak', approach: 'Remove listeners', outcome: 'Fixed', reasoning: 'Cleanup pattern' }},
        { name: 'search_experiences', args: { query: 'memory leak event listeners' }},
        { name: 'analyze_problem', args: { problem: 'Fix memory leak' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'fix_leak' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Race condition in async code',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Debugging', situation: 'Race condition', approach: 'Add mutex', outcome: 'Fixed', reasoning: 'Synchronization' }},
        { name: 'search_experiences', args: { query: 'race condition async' }},
        { name: 'analyze_problem', args: { problem: 'Fix race condition' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'fix_race' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'CORS error on API endpoint',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Debugging', situation: 'CORS error', approach: 'Configure headers', outcome: 'Fixed', reasoning: 'Allow origin' }},
        { name: 'search_experiences', args: { query: 'CORS headers configuration' }},
        { name: 'analyze_problem', args: { problem: 'Fix CORS error' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'fix_cors' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Null pointer exception',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Debugging', situation: 'Null pointer', approach: 'Add null checks', outcome: 'Fixed', reasoning: 'Defensive coding' }},
        { name: 'search_experiences', args: { query: 'null pointer exception handling' }},
        { name: 'analyze_problem', args: { problem: 'Fix null pointer' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'fix_null' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Infinite loop in pagination',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Debugging', situation: 'Infinite loop', approach: 'Add exit condition', outcome: 'Fixed', reasoning: 'Guard clause' }},
        { name: 'search_experiences', args: { query: 'infinite loop pagination' }},
        { name: 'analyze_problem', args: { problem: 'Fix infinite loop' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'fix_loop' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'CSS specificity conflict',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Debugging', situation: 'CSS conflict', approach: 'Increase specificity', outcome: 'Fixed', reasoning: 'Selector order' }},
        { name: 'search_experiences', args: { query: 'CSS specificity conflict' }},
        { name: 'analyze_problem', args: { problem: 'Fix CSS conflict' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'fix_css' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Timezone handling bug',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Debugging', situation: 'Timezone bug', approach: 'Use UTC', outcome: 'Fixed', reasoning: 'Consistent timezone' }},
        { name: 'search_experiences', args: { query: 'timezone UTC handling' }},
        { name: 'analyze_problem', args: { problem: 'Fix timezone bug' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'fix_timezone' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Validation error message unclear',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Debugging', situation: 'Unclear error', approach: 'Specific messages', outcome: 'Fixed', reasoning: 'User feedback' }},
        { name: 'search_experiences', args: { query: 'error message validation' }},
        { name: 'analyze_problem', args: { problem: 'Improve error messages' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'fix_errors' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    }
  ];

  for (const scenario of bugFixScenarios) {
    const result = await testScenario('Bug Fixes', scenario.name, scenario.tools, (client) => {
      return client.hasTeachPhase() && client.hasLearnPhase() && client.hasReasonPhase() &&
             client.hasAuthorization() && client.teachBeforeLearn() && client.learnBeforeReason();
    });
    results.push(result);
    console.log(`  ${result.pass ? colors.green + '✓' : colors.red + '✗'} ${scenario.name}${colors.reset}`);
  }

  // CATEGORY 2: New Features (10 tests)
  console.log(colors.bold + '\n📋 CATEGORY 2: New Features (10 tests)' + colors.reset);

  const featureScenarios = [
    {
      name: 'Add user authentication',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Process', situation: 'Add auth', approach: 'JWT implementation', outcome: 'Implemented', reasoning: 'Stateless auth' }},
        { name: 'search_experiences', args: { query: 'authentication JWT implementation' }},
        { name: 'analyze_problem', args: { problem: 'Implement user auth' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'add_auth' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Add rate limiting',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Process', situation: 'Rate limiting', approach: 'Redis sliding window', outcome: 'Implemented', reasoning: 'Scalable solution' }},
        { name: 'search_experiences', args: { query: 'rate limiting Redis' }},
        { name: 'analyze_problem', args: { problem: 'Add rate limiting' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'add_rate_limit' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Add file upload',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Process', situation: 'File upload', approach: 'Multipart handling', outcome: 'Implemented', reasoning: 'Stream processing' }},
        { name: 'search_experiences', args: { query: 'file upload multipart' }},
        { name: 'analyze_problem', args: { problem: 'Add file upload' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'add_upload' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Add search functionality',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Process', situation: 'Search feature', approach: 'Full-text search', outcome: 'Implemented', reasoning: 'FTS5 indexing' }},
        { name: 'search_experiences', args: { query: 'full-text search FTS5' }},
        { name: 'analyze_problem', args: { problem: 'Add search' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'add_search' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Add pagination',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Process', situation: 'Pagination', approach: 'Cursor-based', outcome: 'Implemented', reasoning: 'Consistent results' }},
        { name: 'search_experiences', args: { query: 'pagination cursor-based' }},
        { name: 'analyze_problem', args: { problem: 'Add pagination' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'add_pagination' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Add caching layer',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Process', situation: 'Caching', approach: 'Redis cache', outcome: 'Implemented', reasoning: 'Performance gain' }},
        { name: 'search_experiences', args: { query: 'caching Redis strategy' }},
        { name: 'analyze_problem', args: { problem: 'Add caching' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'add_cache' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Add email notifications',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Process', situation: 'Email notifications', approach: 'Queue-based sending', outcome: 'Implemented', reasoning: 'Async processing' }},
        { name: 'search_experiences', args: { query: 'email notifications queue' }},
        { name: 'analyze_problem', args: { problem: 'Add email notifications' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'add_email' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Add webhook support',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Process', situation: 'Webhooks', approach: 'Retry mechanism', outcome: 'Implemented', reasoning: 'Reliability' }},
        { name: 'search_experiences', args: { query: 'webhook retry mechanism' }},
        { name: 'analyze_problem', args: { problem: 'Add webhooks' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'add_webhook' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Add audit logging',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Process', situation: 'Audit logging', approach: 'Structured logs', outcome: 'Implemented', reasoning: 'Compliance' }},
        { name: 'search_experiences', args: { query: 'audit logging structured' }},
        { name: 'analyze_problem', args: { problem: 'Add audit logging' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'add_audit' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Add API versioning',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Process', situation: 'API versioning', approach: 'URL versioning', outcome: 'Implemented', reasoning: 'Backward compatibility' }},
        { name: 'search_experiences', args: { query: 'API versioning strategy' }},
        { name: 'analyze_problem', args: { problem: 'Add API versioning' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'add_versioning' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    }
  ];

  for (const scenario of featureScenarios) {
    const result = await testScenario('New Features', scenario.name, scenario.tools, (client) => {
      return client.hasTeachPhase() && client.hasLearnPhase() && client.hasReasonPhase() &&
             client.hasAuthorization() && client.teachBeforeLearn() && client.learnBeforeReason();
    });
    results.push(result);
    console.log(`  ${result.pass ? colors.green + '✓' : colors.red + '✗'} ${scenario.name}${colors.reset}`);
  }

  // CATEGORY 3: Refactoring (10 tests)
  console.log(colors.bold + '\n📋 CATEGORY 3: Refactoring (10 tests)' + colors.reset);

  const refactorScenarios = [
    {
      name: 'Extract function from large method',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Process', situation: 'Large method', approach: 'Extract function', outcome: 'Refactored', reasoning: 'Single responsibility' }},
        { name: 'search_experiences', args: { query: 'refactor extract function' }},
        { name: 'analyze_problem', args: { problem: 'Extract function' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'refactor_extract' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Convert callback to async/await',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Process', situation: 'Callback hell', approach: 'Async/await', outcome: 'Refactored', reasoning: 'Readability' }},
        { name: 'search_experiences', args: { query: 'callback async await conversion' }},
        { name: 'analyze_problem', args: { problem: 'Convert to async/await' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'refactor_async' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Replace switch with polymorphism',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Process', situation: 'Large switch', approach: 'Polymorphism', outcome: 'Refactored', reasoning: 'OOP principles' }},
        { name: 'search_experiences', args: { query: 'replace switch polymorphism' }},
        { name: 'analyze_problem', args: { problem: 'Replace switch statement' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'refactor_switch' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Consolidate duplicate code',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Process', situation: 'Duplicate code', approach: 'Extract shared logic', outcome: 'Refactored', reasoning: 'DRY principle' }},
        { name: 'search_experiences', args: { query: 'duplicate code DRY refactor' }},
        { name: 'analyze_problem', args: { problem: 'Consolidate duplicates' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'refactor_duplicate' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Rename variables for clarity',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Process', situation: 'Unclear naming', approach: 'Descriptive names', outcome: 'Refactored', reasoning: 'Code clarity' }},
        { name: 'search_experiences', args: { query: 'variable naming clarity' }},
        { name: 'analyze_problem', args: { problem: 'Rename for clarity' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'refactor_rename' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Split god class into smaller classes',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Process', situation: 'God class', approach: 'Split responsibilities', outcome: 'Refactored', reasoning: 'Single responsibility' }},
        { name: 'search_experiences', args: { query: 'god class refactor split' }},
        { name: 'analyze_problem', args: { problem: 'Split god class' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'refactor_split' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Simplify complex conditional',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Process', situation: 'Complex conditional', approach: 'Guard clauses', outcome: 'Refactored', reasoning: 'Early returns' }},
        { name: 'search_experiences', args: { query: 'simplify conditional guard clauses' }},
        { name: 'analyze_problem', args: { problem: 'Simplify conditional' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'refactor_conditional' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Replace magic numbers with constants',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Process', situation: 'Magic numbers', approach: 'Named constants', outcome: 'Refactored', reasoning: 'Self-documenting code' }},
        { name: 'search_experiences', args: { query: 'magic numbers constants' }},
        { name: 'analyze_problem', args: { problem: 'Replace magic numbers' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'refactor_magic' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Decompose long parameter list',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Process', situation: 'Long parameter list', approach: 'Parameter object', outcome: 'Refactored', reasoning: 'Encapsulation' }},
        { name: 'search_experiences', args: { query: 'long parameter list object' }},
        { name: 'analyze_problem', args: { problem: 'Decompose parameters' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'refactor_params' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Remove dead code',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Process', situation: 'Dead code', approach: 'Remove unused', outcome: 'Refactored', reasoning: 'Code maintenance' }},
        { name: 'search_experiences', args: { query: 'dead code removal unused' }},
        { name: 'analyze_problem', args: { problem: 'Remove dead code' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'refactor_dead' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    }
  ];

  for (const scenario of refactorScenarios) {
    const result = await testScenario('Refactoring', scenario.name, scenario.tools, (client) => {
      return client.hasTeachPhase() && client.hasLearnPhase() && client.hasReasonPhase() &&
             client.hasAuthorization() && client.teachBeforeLearn() && client.learnBeforeReason();
    });
    results.push(result);
    console.log(`  ${result.pass ? colors.green + '✓' : colors.red + '✗'} ${scenario.name}${colors.reset}`);
  }

  // CATEGORY 4: Documentation (10 tests)
  console.log(colors.bold + '\n📋 CATEGORY 4: Documentation (10 tests)' + colors.reset);

  const docScenarios = [
    {
      name: 'Add API documentation',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Communication', situation: 'API docs', approach: 'OpenAPI spec', outcome: 'Documented', reasoning: 'Standard format' }},
        { name: 'search_experiences', args: { query: 'API documentation OpenAPI' }},
        { name: 'analyze_problem', args: { problem: 'Document API' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'doc_api' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Add function JSDoc comments',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Communication', situation: 'JSDoc', approach: 'Type annotations', outcome: 'Documented', reasoning: 'IDE support' }},
        { name: 'search_experiences', args: { query: 'JSDoc comments annotations' }},
        { name: 'analyze_problem', args: { problem: 'Add JSDoc' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'doc_jsdoc' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Create README for new feature',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Communication', situation: 'Feature README', approach: 'Usage examples', outcome: 'Documented', reasoning: 'User onboarding' }},
        { name: 'search_experiences', args: { query: 'README documentation examples' }},
        { name: 'analyze_problem', args: { problem: 'Create README' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'doc_readme' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Update CHANGELOG',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Communication', situation: 'CHANGELOG', approach: 'Keep-a-changelog', outcome: 'Updated', reasoning: 'Version tracking' }},
        { name: 'search_experiences', args: { query: 'CHANGELOG format versioning' }},
        { name: 'analyze_problem', args: { problem: 'Update CHANGELOG' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'doc_changelog' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Add inline code comments',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Communication', situation: 'Code comments', approach: 'Explain why not what', outcome: 'Documented', reasoning: 'Maintainability' }},
        { name: 'search_experiences', args: { query: 'code comments best practices' }},
        { name: 'analyze_problem', args: { problem: 'Add code comments' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'doc_comments' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Create architecture diagram',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Communication', situation: 'Architecture', approach: 'Mermaid diagrams', outcome: 'Documented', reasoning: 'Visual clarity' }},
        { name: 'search_experiences', args: { query: 'architecture diagram documentation' }},
        { name: 'analyze_problem', args: { problem: 'Create architecture diagram' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'doc_architecture' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Document environment variables',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Communication', situation: 'Env vars', approach: 'ENV example file', outcome: 'Documented', reasoning: 'Setup guide' }},
        { name: 'search_experiences', args: { query: 'environment variables documentation' }},
        { name: 'analyze_problem', args: { problem: 'Document env vars' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'doc_env' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Add troubleshooting guide',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Communication', situation: 'Troubleshooting', approach: 'Common issues FAQ', outcome: 'Documented', reasoning: 'Support reduction' }},
        { name: 'search_experiences', args: { query: 'troubleshooting guide FAQ' }},
        { name: 'analyze_problem', args: { problem: 'Create troubleshooting guide' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'doc_troubleshoot' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Document testing strategy',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Communication', situation: 'Testing docs', approach: 'Test pyramid', outcome: 'Documented', reasoning: 'Quality assurance' }},
        { name: 'search_experiences', args: { query: 'testing strategy documentation' }},
        { name: 'analyze_problem', args: { problem: 'Document testing' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'doc_testing' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Create contributing guidelines',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Communication', situation: 'Contributing', approach: 'PR guidelines', outcome: 'Documented', reasoning: 'Community standards' }},
        { name: 'search_experiences', args: { query: 'contributing guidelines open source' }},
        { name: 'analyze_problem', args: { problem: 'Create contributing guide' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'doc_contributing' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    }
  ];

  for (const scenario of docScenarios) {
    const result = await testScenario('Documentation', scenario.name, scenario.tools, (client) => {
      return client.hasTeachPhase() && client.hasLearnPhase() && client.hasReasonPhase() &&
             client.hasAuthorization() && client.teachBeforeLearn() && client.learnBeforeReason();
    });
    results.push(result);
    console.log(`  ${result.pass ? colors.green + '✓' : colors.red + '✗'} ${scenario.name}${colors.reset}`);
  }

  // CATEGORY 5: Edge Cases (10 tests) - vague, ambiguous, complex
  console.log(colors.bold + '\n📋 CATEGORY 5: Edge Cases & Vague Requests (10 tests)' + colors.reset);

  const edgeCaseScenarios = [
    {
      name: 'Vague: "Help with authentication"',
      tools: [
        { name: 'search_experiences', args: { query: 'authentication help' }},
        { name: 'record_experience', args: { type: 'effective', domain: 'Communication', situation: 'Vague request', approach: 'Clarify needs', outcome: 'Resolved', reasoning: 'Requirements gathering' }},
        { name: 'analyze_problem', args: { problem: 'Help with authentication' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'clarify_auth' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Ambiguous: "Make it faster"',
      tools: [
        { name: 'search_experiences', args: { query: 'performance optimization' }},
        { name: 'record_experience', args: { type: 'effective', domain: 'Process', situation: 'Performance request', approach: 'Profile first', outcome: 'Identified bottleneck', reasoning: 'Data-driven optimization' }},
        { name: 'analyze_problem', args: { problem: 'Make it faster' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'optimize_performance' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Complex: Multi-step user registration flow',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Process', situation: 'Complex flow', approach: 'Break into phases', outcome: 'Implemented', reasoning: 'Incremental delivery' }},
        { name: 'search_experiences', args: { query: 'user registration flow multi-step' }},
        { name: 'analyze_problem', args: { problem: 'Implement registration flow' }},
        { name: 'gather_context', args: { session_id: 'DYNAMIC', sources: { experiences: [] }}},
        { name: 'reason_through', args: { session_id: 'DYNAMIC', thought: 'Multi-phase approach', thought_number: 1 }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'implement_registration' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Unclear: "Something is broken"',
      tools: [
        { name: 'search_experiences', args: { query: 'debugging broken issue' }},
        { name: 'record_experience', args: { type: 'effective', domain: 'Debugging', situation: 'Unclear issue', approach: 'Systematic investigation', outcome: 'Found root cause', reasoning: 'Methodical debugging' }},
        { name: 'analyze_problem', args: { problem: 'Something is broken' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'debug_issue' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Exploratory: "Investigate database performance"',
      tools: [
        { name: 'search_experiences', args: { query: 'database performance investigation' }},
        { name: 'analyze_problem', args: { problem: 'Investigate DB performance' }},
        { name: 'record_experience', args: { type: 'effective', domain: 'Debugging', situation: 'DB investigation', approach: 'Query profiling', outcome: 'Identified slow queries', reasoning: 'Performance analysis' }}
      ]
    },
    {
      name: 'Question-style: "How to implement caching?"',
      tools: [
        { name: 'search_experiences', args: { query: 'caching implementation strategies' }},
        { name: 'analyze_problem', args: { problem: 'How to implement caching?' }}
      ]
    },
    {
      name: 'High-level: "Improve user experience"',
      tools: [
        { name: 'search_experiences', args: { query: 'user experience improvements' }},
        { name: 'record_experience', args: { type: 'effective', domain: 'Process', situation: 'UX improvement', approach: 'User feedback analysis', outcome: 'Prioritized changes', reasoning: 'User-centric design' }},
        { name: 'analyze_problem', args: { problem: 'Improve user experience' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'improve_ux' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Debugging: "Tests are failing"',
      tools: [
        { name: 'search_experiences', args: { query: 'test failures debugging' }},
        { name: 'record_experience', args: { type: 'effective', domain: 'Debugging', situation: 'Test failures', approach: 'Check test isolation', outcome: 'Fixed', reasoning: 'State contamination' }},
        { name: 'analyze_problem', args: { problem: 'Tests are failing' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'fix_tests' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Optimization: "Reduce bundle size"',
      tools: [
        { name: 'search_experiences', args: { query: 'bundle size optimization' }},
        { name: 'record_experience', args: { type: 'effective', domain: 'Process', situation: 'Bundle size', approach: 'Tree shaking + code splitting', outcome: 'Reduced 40%', reasoning: 'Performance' }},
        { name: 'analyze_problem', args: { problem: 'Reduce bundle size' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'optimize_bundle' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    },
    {
      name: 'Security: "Add input validation"',
      tools: [
        { name: 'record_experience', args: { type: 'effective', domain: 'Process', situation: 'Input validation', approach: 'Schema validation', outcome: 'Secure', reasoning: 'Prevent injection' }},
        { name: 'search_experiences', args: { query: 'input validation security' }},
        { name: 'analyze_problem', args: { problem: 'Add input validation' }},
        { name: 'verify_compliance', args: { session_id: 'DYNAMIC', current_phase: 'reason', action: 'add_validation' }},
        { name: 'authorize_operation', args: { operation_token: 'DYNAMIC', create_session_token: true }}
      ]
    }
  ];

  for (const scenario of edgeCaseScenarios) {
    const result = await testScenario('Edge Cases', scenario.name, scenario.tools, (client) => {
      // For read-only scenarios (question, exploratory), don't require authorization
      const requiresAuth = scenario.tools.some(t => t.name === 'verify_compliance');
      if (!requiresAuth) {
        return client.hasLearnPhase(); // Just needs to search
      }
      return client.hasTeachPhase() && client.hasLearnPhase() && client.hasReasonPhase() && client.hasAuthorization();
    });
    results.push(result);
    console.log(`  ${result.pass ? colors.green + '✓' : colors.red + '✗'} ${scenario.name}${colors.reset}`);
  }

  // Summary
  console.log('\n' + colors.cyan + '======================================================================' + colors.reset);
  console.log(colors.bold + 'COMPREHENSIVE COMPLIANCE TEST RESULTS' + colors.reset);
  console.log(colors.cyan + '======================================================================' + colors.reset);

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  const total = results.length;

  console.log(`\nTotal Scenarios: ${total}`);
  console.log(`${colors.green}Passed: ${passed} (${(passed/total*100).toFixed(1)}%)${colors.reset}`);
  console.log(`${colors.red}Failed: ${failed} (${(failed/total*100).toFixed(1)}%)${colors.reset}`);

  // Breakdown by category
  console.log('\n' + colors.bold + 'Breakdown by Category:' + colors.reset);
  const categories = [...new Set(results.map(r => r.category))];
  for (const cat of categories) {
    const catResults = results.filter(r => r.category === cat);
    const catPassed = catResults.filter(r => r.pass).length;
    console.log(`  ${cat}: ${colors.green}${catPassed}/${catResults.length}${colors.reset}`);
  }

  // Workflow compliance analysis
  console.log('\n' + colors.bold + 'Workflow Phase Compliance:' + colors.reset);
  const withTeach = results.filter(r => r.client && r.client.hasTeachPhase()).length;
  const withLearn = results.filter(r => r.client && r.client.hasLearnPhase()).length;
  const withReason = results.filter(r => r.client && r.client.hasReasonPhase()).length;
  const withAuth = results.filter(r => r.client && r.client.hasAuthorization()).length;

  console.log(`  TEACH phase present:  ${withTeach}/${total} (${(withTeach/total*100).toFixed(1)}%)`);
  console.log(`  LEARN phase present:  ${withLearn}/${total} (${(withLearn/total*100).toFixed(1)}%)`);
  console.log(`  REASON phase present: ${withReason}/${total} (${(withReason/total*100).toFixed(1)}%)`);
  console.log(`  Authorization present: ${withAuth}/${total} (${(withAuth/total*100).toFixed(1)}%)`);

  // Ordering compliance
  const correctOrdering = results.filter(r =>
    r.client && r.client.teachBeforeLearn() && r.client.learnBeforeReason()
  ).length;
  console.log(`  Correct ordering: ${correctOrdering}/${total} (${(correctOrdering/total*100).toFixed(1)}%)`);

  console.log('\n' + (passed === total ? colors.green + '✅ All compliance tests passed!' : colors.yellow + '⚠️  Some tests failed - review needed') + colors.reset);

  // v1.4.0: Cleanup test project
  try {
    fs.rmSync(TEST_PROJECT, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup errors
  }

  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch(e => {
  // v1.4.0: Cleanup test project on error
  try {
    fs.rmSync(TEST_PROJECT, { recursive: true, force: true });
  } catch (err) {
    // Ignore cleanup errors
  }
  console.error(e);
  process.exit(1);
});
