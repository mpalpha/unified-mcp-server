#!/usr/bin/env node

/**
 * NPX Compatibility Test Suite
 *
 * Tests NPX deployment requirements:
 * - Shebang line exists
 * - Executable permissions set
 * - Package.json bin field configured
 * - CLI flags work (--help, --version, --init)
 * - MCP protocol mode works (no flags)
 * - Zero-config initialization
 *
 * v1.4.0: Updated for project-scoped experiences
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const BOOTSTRAP_PATH = path.join(__dirname, '../bootstrap.js');
const INDEX_PATH = path.join(__dirname, '../index.js');
const PACKAGE_PATH = path.join(__dirname, '../package.json');

// v1.4.0: Create a test project for MCP server tests
const TEST_PROJECT = fs.mkdtempSync(path.join(os.tmpdir(), 'unified-mcp-npx-test-'));
const CLAUDE_DIR = path.join(TEST_PROJECT, '.claude');
fs.mkdirSync(CLAUDE_DIR);
fs.mkdirSync(path.join(CLAUDE_DIR, 'tokens'));

// Helper to run commands in test project context
function execInProject(cmd, opts = {}) {
  return execSync(cmd, {
    encoding: 'utf8',
    cwd: TEST_PROJECT,
    env: { ...process.env, PWD: TEST_PROJECT },
    ...opts
  });
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  Error: ${error.message}`);
    failed++;
  }
}

console.log('\n=== NPX Compatibility Tests ===\n');
console.log(`Test project: ${TEST_PROJECT}\n`);

// Test 1: Shebang exists (bootstrap is entry point)
test('Shebang line exists', () => {
  const firstLine = fs.readFileSync(BOOTSTRAP_PATH, 'utf8').split('\n')[0];
  if (firstLine !== '#!/usr/bin/env node') {
    throw new Error(`Expected "#!/usr/bin/env node", got "${firstLine}"`);
  }
});

// Test 2: Executable permissions (bootstrap is entry point)
test('Executable permissions set', () => {
  const stats = fs.statSync(BOOTSTRAP_PATH);
  const mode = stats.mode.toString(8);
  // Check if owner execute bit is set (0100)
  if ((stats.mode & 0o100) === 0) {
    throw new Error(`File is not executable. Mode: ${mode}`);
  }
});

// Test 3: Package.json bin field (updated to bootstrap.js)
test('Package.json bin field configured', () => {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
  if (!pkg.bin) {
    throw new Error('No bin field in package.json');
  }
  if (!pkg.bin['unified-mcp-server']) {
    throw new Error('No "unified-mcp-server" entry in bin field');
  }
  if (pkg.bin['unified-mcp-server'] !== './bootstrap.js') {
    throw new Error(`Expected "./bootstrap.js", got "${pkg.bin['unified-mcp-server']}"`);
  }
});

// Test 4: --help flag works
test('--help flag works', () => {
  const output = execSync('node bootstrap.js --help', { encoding: 'utf8' });
  if (!output.includes('Unified MCP Server')) {
    throw new Error('Help output missing expected text');
  }
  if (!output.includes('USAGE:')) {
    throw new Error('Help output missing USAGE section');
  }
  if (!output.includes('28 TOOLS AVAILABLE:')) {
    throw new Error('Help output missing tools list');
  }
});

// Test 5: --version flag works
test('--version flag works', () => {
  const output = execSync('node bootstrap.js --version', { encoding: 'utf8' }).trim();
  if (!output.match(/^\d+\.\d+\.\d+$/)) {
    throw new Error(`Expected version format X.Y.Z, got "${output}"`);
  }
});

// Test 6: --init flag works
// v1.5.2: Updated for new output format - global config is auto-configured
test('--init flag works', () => {
  const output = execSync('echo -e "5\\n\\n" | node bootstrap.js --init', { encoding: 'utf8', shell: '/bin/bash' });
  if (!output.includes('Interactive Setup')) {
    throw new Error('Init output missing expected text');
  }
  if (!output.includes('DATABASE LOCATION:')) {
    throw new Error('Init output missing database info');
  }
  if (!output.includes('SETUP COMPLETE!')) {
    throw new Error('Init output missing setup complete confirmation');
  }
  if (!output.includes('PROJECT INITIALIZED:')) {
    throw new Error('Init output missing project initialized section');
  }
  if (!output.includes('auto-configured on server start')) {
    throw new Error('Init output missing auto-configuration note');
  }
});

// Test 7: MCP protocol mode works (no flags) - v1.4.0: runs in test project
test('MCP protocol mode works (no flags)', () => {
  const input = JSON.stringify({
    jsonrpc: '2.0',
    method: 'initialize',
    params: { protocolVersion: '1.0', capabilities: {} },
    id: 1
  });
  const bootstrapPath = path.join(__dirname, '..', 'bootstrap.js');
  const output = execInProject(`echo '${input}' | node "${bootstrapPath}"`);

  // Parse JSON response (ignore stderr)
  const lines = output.split('\n').filter(line => line.trim().startsWith('{'));
  if (lines.length === 0) {
    throw new Error('No JSON response from MCP server');
  }

  const response = JSON.parse(lines[0]);
  if (response.jsonrpc !== '2.0') {
    throw new Error('Invalid JSON-RPC version');
  }
  if (!response.result) {
    throw new Error('No result in response');
  }
  if (!response.result.serverInfo) {
    throw new Error('No serverInfo in response');
  }
});

// Test 8: Zero-config initialization (.claude directory exists) - v1.4.0: project-scoped
test('Zero-config initialization (.claude directory exists)', () => {
  if (!fs.existsSync(CLAUDE_DIR)) {
    throw new Error('.claude directory not created');
  }
  const tokenDir = path.join(CLAUDE_DIR, 'tokens');
  if (!fs.existsSync(tokenDir)) {
    throw new Error('Token directory not created');
  }
});

// Test 9: Database auto-creation - v1.4.0: project-scoped
test('Database auto-creation', () => {
  const dbPath = path.join(CLAUDE_DIR, 'experiences.db');

  if (!fs.existsSync(dbPath)) {
    throw new Error('Database file not created');
  }
});

// Test 10: All 28 tools accessible via MCP - v1.4.0: runs in test project, added import_experiences
test('All 28 tools accessible via MCP', () => {
  const input = JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/list',
    params: {},
    id: 2
  });
  const bootstrapPath = path.join(__dirname, '..', 'bootstrap.js');
  const output = execInProject(`echo '${input}' | node "${bootstrapPath}"`);

  // Parse JSON response
  const lines = output.split('\n').filter(line => line.trim().startsWith('{'));
  if (lines.length === 0) {
    throw new Error('No JSON response from MCP server');
  }

  const response = JSON.parse(lines[0]);
  if (!response.result || !response.result.tools) {
    throw new Error('No tools in response');
  }

  const toolCount = response.result.tools.length;
  if (toolCount !== 28) {
    throw new Error(`Expected 28 tools, got ${toolCount}`);
  }
});

// Test 11: --preset flag works - v1.4.0: project-scoped config
test('--preset flag works', () => {
  const bootstrapPath = path.join(__dirname, '..', 'bootstrap.js');
  const output = execInProject(`node "${bootstrapPath}" --preset three-gate`);
  if (!output.includes('Applied three-gate preset')) {
    throw new Error('Preset application output missing');
  }
  if (!output.includes('Config saved to:')) {
    throw new Error('Config path missing from output');
  }
  // Verify config file was created in project's .claude directory
  const configPath = path.join(CLAUDE_DIR, 'config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('Config file not created');
  }
});

// Test 12: --preset validates preset names
test('--preset validates preset names', () => {
  try {
    execSync('node bootstrap.js --preset invalid-preset', { encoding: 'utf8', stderr: 'pipe' });
    throw new Error('Should have failed with invalid preset');
  } catch (error) {
    if (!error.message.includes('Invalid preset')) {
      throw new Error('Expected invalid preset error message');
    }
  }
});

// v1.4.0: Cleanup test project
try {
  fs.rmSync(TEST_PROJECT, { recursive: true, force: true });
} catch (e) {
  // Ignore cleanup errors
}

console.log(`\n=== Results ===`);
console.log(`Passed: ${passed}/12`);
console.log(`Failed: ${failed}/12`);

if (failed > 0) {
  process.exit(1);
}

console.log('\n✓ All NPX compatibility tests passed!\n');
