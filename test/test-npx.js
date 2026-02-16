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
 * v1.8.5: WASM-only (removed native/hybrid tests)
 * v1.7.2: Added WASM fallback and Node version compatibility tests
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

// Test 6: --init flag falls back to --install in non-TTY
// v1.8.0: --init now requires TTY and falls back to --install in non-interactive mode
test('--init flag falls back to --install in non-TTY', () => {
  // Capture both stdout and stderr (warning goes to stderr)
  const output = execSync('echo "" | node bootstrap.js --init 2>&1', { encoding: 'utf8', shell: '/bin/bash' });
  // In non-TTY mode, should show warning and fall back to --install
  if (!output.includes('Warning: --init requires an interactive terminal')) {
    throw new Error('Init output missing TTY warning');
  }
  if (!output.includes('Falling back to non-interactive --install mode')) {
    throw new Error('Init output missing fallback message');
  }
  if (!output.includes('Non-Interactive Install')) {
    throw new Error('Init output missing install mode indicator');
  }
  if (!output.includes('INSTALLATION COMPLETE')) {
    throw new Error('Init output missing completion message');
  }
});

// Test 6b: --install flag works (non-interactive)
test('--install flag works', () => {
  const output = execSync('node bootstrap.js --install --preset three-gate 2>&1', { encoding: 'utf8' });
  if (!output.includes('Non-Interactive Install')) {
    throw new Error('Install output missing expected header');
  }
  if (!output.includes('Preset: three-gate')) {
    throw new Error('Install output missing preset info');
  }
  if (!output.includes('INSTALLATION COMPLETE')) {
    throw new Error('Install output missing completion message');
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

// Test 10: All 34 tools accessible via MCP - v1.9.0: added 6 memory system tools
test('All 34 tools accessible via MCP', () => {
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
  if (toolCount !== 34) {
    throw new Error(`Expected 34 tools, got ${toolCount}`);
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

// v1.7.2: WASM Fallback Tests
// Test 13: WASM adapter module exists
test('WASM adapter module exists', () => {
  const wasmAdapterPath = path.join(__dirname, '..', 'src', 'database-wasm.js');
  if (!fs.existsSync(wasmAdapterPath)) {
    throw new Error('WASM adapter not found at src/database-wasm.js');
  }
});

// Test 14: WASM adapter exports correct interface
test('WASM adapter exports correct interface', () => {
  const { Database, isWasmAvailable } = require('../src/database-wasm.js');
  if (typeof Database !== 'function') {
    throw new Error('WASM adapter must export Database class');
  }
  if (typeof isWasmAvailable !== 'function') {
    throw new Error('WASM adapter must export isWasmAvailable function');
  }
});

// Test 15: node-sqlite3-wasm is installed
test('node-sqlite3-wasm dependency installed', () => {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
  if (!pkg.dependencies['node-sqlite3-wasm']) {
    throw new Error('node-sqlite3-wasm not in dependencies');
  }
  // Verify it's actually installed
  const { isWasmAvailable } = require('../src/database-wasm.js');
  if (!isWasmAvailable()) {
    throw new Error('node-sqlite3-wasm not actually installed');
  }
});

// Test 16: WASM adapter has better-sqlite3 compatible API
test('WASM adapter has better-sqlite3 compatible API', () => {
  const { Database } = require('../src/database-wasm.js');
  const db = new Database(':memory:');

  // Test core API methods exist
  const methods = ['exec', 'prepare', 'pragma', 'run', 'get', 'all', 'close'];
  for (const method of methods) {
    if (typeof db[method] !== 'function') {
      db.close();
      throw new Error(`WASM Database missing method: ${method}`);
    }
  }

  // Test basic operations
  db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
  db.run('INSERT INTO test (name) VALUES (?)', 'test1');
  const row = db.get('SELECT * FROM test WHERE id = 1');
  if (!row || row.name !== 'test1') {
    db.close();
    throw new Error('WASM basic query failed');
  }

  // Test pragma method
  db.pragma('journal_mode = DELETE');

  db.close();
});

// Test 17: WASM adapter supports FTS5
test('WASM adapter supports FTS5', () => {
  const { Database } = require('../src/database-wasm.js');
  const db = new Database(':memory:');

  try {
    // Create FTS5 table (same as production schema)
    db.exec(`
      CREATE VIRTUAL TABLE test_fts USING fts5(
        content,
        tokenize='porter unicode61'
      )
    `);

    // Insert and search
    db.run("INSERT INTO test_fts (content) VALUES ('hello world')");
    const results = db.all("SELECT * FROM test_fts WHERE test_fts MATCH 'hello'");

    if (results.length !== 1) {
      throw new Error('FTS5 search returned unexpected results');
    }
  } finally {
    db.close();
  }
});

// Test 18: Bootstrap exports getDatabaseBackend (always 'wasm' in v1.8.5+)
test('Bootstrap exports getDatabaseBackend', () => {
  const { getDatabaseBackend } = require('../bootstrap.js');
  if (typeof getDatabaseBackend !== 'function') {
    throw new Error('Bootstrap must export getDatabaseBackend');
  }
  // v1.8.5: Should always return 'wasm'
  const backend = getDatabaseBackend();
  if (backend !== 'wasm') {
    throw new Error(`Expected backend 'wasm', got '${backend}'`);
  }
});

// Test 19: engines.node requires Node 18+
test('engines.node requires Node 18+', () => {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
  if (!pkg.engines || !pkg.engines.node) {
    throw new Error('Missing engines.node in package.json');
  }
  // Should be >=18.0.0 for WASM compatibility
  if (!pkg.engines.node.includes('18')) {
    throw new Error(`Expected engines.node to require 18+, got: ${pkg.engines.node}`);
  }
});

// Test 20: Database module uses WASM-only (v1.8.5)
test('Database module uses WASM-only', () => {
  const dbModulePath = path.join(__dirname, '..', 'src', 'database.js');
  const content = fs.readFileSync(dbModulePath, 'utf8');
  if (!content.includes('getDatabaseClass')) {
    throw new Error('Database module must use getDatabaseClass factory');
  }
  // v1.8.5: Should import from database-wasm directly
  if (!content.includes("require('./database-wasm')")) {
    throw new Error('Database module must use WASM adapter');
  }
});

// v1.4.0: Cleanup test project
try {
  fs.rmSync(TEST_PROJECT, { recursive: true, force: true });
} catch (e) {
  // Ignore cleanup errors
}

const totalTests = 20;
console.log(`\n=== Results ===`);
console.log(`Passed: ${passed}/${totalTests}`);
console.log(`Failed: ${failed}/${totalTests}`);

if (failed > 0) {
  process.exit(1);
}

console.log('\n✓ All NPX compatibility tests passed!\n');
