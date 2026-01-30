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
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BOOTSTRAP_PATH = path.join(__dirname, '../bootstrap.js');
const INDEX_PATH = path.join(__dirname, '../index.js');
const PACKAGE_PATH = path.join(__dirname, '../package.json');

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
  if (!output.includes('25 TOOLS AVAILABLE:')) {
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
test('--init flag works', () => {
  const output = execSync('echo -e "5\\n\\n" | node bootstrap.js --init', { encoding: 'utf8', shell: '/bin/bash' });
  if (!output.includes('Interactive Setup')) {
    throw new Error('Init output missing expected text');
  }
  if (!output.includes('DATABASE LOCATION:')) {
    throw new Error('Init output missing database info');
  }
  if (!output.includes('NEXT STEPS:')) {
    throw new Error('Init output missing next steps');
  }
});

// Test 7: MCP protocol mode works (no flags)
test('MCP protocol mode works (no flags)', () => {
  const input = JSON.stringify({
    jsonrpc: '2.0',
    method: 'initialize',
    params: { protocolVersion: '1.0', capabilities: {} },
    id: 1
  });
  const output = execSync(`echo '${input}' | node bootstrap.js`, { encoding: 'utf8' });

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

// Test 8: Zero-config initialization (namespace exists)
test('Zero-config initialization (namespace exists)', () => {
  const homeDir = require('os').homedir();
  const mcpDir = path.join(homeDir, '.unified-mcp');
  const tokenDir = path.join(mcpDir, 'tokens');

  if (!fs.existsSync(mcpDir)) {
    throw new Error('MCP directory not created');
  }
  if (!fs.existsSync(tokenDir)) {
    throw new Error('Token directory not created');
  }
});

// Test 9: Database auto-creation
test('Database auto-creation', () => {
  const homeDir = require('os').homedir();
  const dbPath = path.join(homeDir, '.unified-mcp', 'data.db');

  if (!fs.existsSync(dbPath)) {
    throw new Error('Database file not created');
  }
});

// Test 10: All 25 tools accessible via MCP
test('All 25 tools accessible via MCP', () => {
  const input = JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/list',
    params: {},
    id: 2
  });
  const output = execSync(`echo '${input}' | node bootstrap.js`, { encoding: 'utf8' });

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
  if (toolCount !== 25) {
    throw new Error(`Expected 25 tools, got ${toolCount}`);
  }
});

console.log(`\n=== Results ===`);
console.log(`Passed: ${passed}/10`);
console.log(`Failed: ${failed}/10`);

if (failed > 0) {
  process.exit(1);
}

console.log('\n✓ All NPX compatibility tests passed!\n');
