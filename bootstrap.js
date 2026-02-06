#!/usr/bin/env node

/**
 * Bootstrap Script for Unified MCP Server
 *
 * v1.7.2: Hybrid loading - try native better-sqlite3 first, fallback to WASM
 *
 * Handles native module errors gracefully by:
 * 1. Attempting to load native better-sqlite3
 * 2. On ABI mismatch (ERR_DLOPEN_FAILED), try auto-rebuild (non-npx only)
 * 3. On rebuild failure or npx context, fallback to WASM-based node-sqlite3-wasm
 * 4. Only show error help if WASM fallback also fails
 */

const { execSync } = require('child_process');

// Track which database backend is in use (for diagnostics)
let databaseBackend = null;

function detectPackageManager() {
  // Check if installed globally or locally
  const isGlobal = __dirname.includes('/node_modules/unified-mcp-server') ||
                   __dirname.includes('/.npm/_npx/');
  return { isGlobal, isNpx: __dirname.includes('/.npm/_npx/') };
}

function printErrorHelp(error, context, wasmError) {
  console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('❌ Unified MCP Server - Database Initialization Error');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (error.code === 'ERR_DLOPEN_FAILED') {
    console.error('PROBLEM: better-sqlite3 was compiled for a different Node.js version');
    console.error(`         WASM fallback also failed\n`);

    console.error(`Your Node.js: ${process.version}\n`);

    if (wasmError) {
      console.error(`WASM Error: ${wasmError.message}\n`);
    }

    console.error('RECOMMENDED SOLUTION (works with any Node version):\n');
    console.error('  npm install -g mpalpha/unified-mcp-server --build-from-source');
    console.error('  unified-mcp-server --init\n');

    if (context.isNpx) {
      console.error('Alternative for npx users:');
      console.error('  npm install -g mpalpha/unified-mcp-server');
      console.error('  npm rebuild -g better-sqlite3');
      console.error('  unified-mcp-server --init\n');
    } else if (context.isGlobal) {
      console.error('Alternative for global install:');
      console.error('  npm rebuild -g better-sqlite3\n');
    } else {
      console.error('Alternative for local install:');
      console.error('  npm rebuild better-sqlite3\n');
    }

    console.error('If build-from-source fails, you may need build tools:');
    console.error('  macOS: xcode-select --install');
    console.error('  Ubuntu/Debian: sudo apt-get install build-essential');
    console.error('  Windows: npm install -g windows-build-tools\n');

    console.error('For more help, see:');
    console.error('  https://github.com/mpalpha/unified-mcp-server#troubleshooting\n');
  } else {
    console.error(`ERROR: ${error.message}\n`);
    console.error('Please report this issue at:');
    console.error('  https://github.com/mpalpha/unified-mcp-server/issues\n');
  }

  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

function attemptAutoRebuild() {
  try {
    console.error('[bootstrap] Attempting automatic rebuild...');
    execSync('npm rebuild better-sqlite3', {
      cwd: __dirname,
      stdio: 'inherit'
    });
    console.error('[bootstrap] ✓ Rebuild successful\n');
    return true;
  } catch (rebuildError) {
    console.error('[bootstrap] ✗ Automatic rebuild failed\n');
    return false;
  }
}

/**
 * Try to load WASM fallback
 * @returns {boolean} true if WASM is available and working
 */
function tryWasmFallback() {
  try {
    // Check if node-sqlite3-wasm is available
    const { Database, isWasmAvailable } = require('./src/database-wasm.js');

    if (!isWasmAvailable()) {
      console.error('[bootstrap] WASM fallback not available (node-sqlite3-wasm not installed)');
      return false;
    }

    // Test that WASM actually works by creating an in-memory database
    const testDb = new Database(':memory:');
    testDb.exec('SELECT 1');
    testDb.close();

    console.error('[bootstrap] ✓ WASM fallback available and working');
    return true;
  } catch (e) {
    console.error(`[bootstrap] ✗ WASM fallback failed: ${e.message}`);
    return false;
  }
}

/**
 * Set database backend for the application
 * This is read by src/database.js to determine which implementation to use
 */
function setDatabaseBackend(backend) {
  databaseBackend = backend;
  // Set environment variable so child modules can detect backend
  process.env.UNIFIED_MCP_DB_BACKEND = backend;
}

/**
 * Get current database backend
 * @returns {'native'|'wasm'|null}
 */
function getDatabaseBackend() {
  return databaseBackend || process.env.UNIFIED_MCP_DB_BACKEND || null;
}

// Main bootstrap logic
function bootstrap() {
  const context = detectPackageManager();
  let nativeError = null;
  let wasmError = null;

  // Strategy 1: Try native better-sqlite3
  try {
    require('better-sqlite3');
    setDatabaseBackend('native');
    // Success - continue to main script
    require('./index.js');
    return;
  } catch (error) {
    if (error.code === 'ERR_DLOPEN_FAILED') {
      nativeError = error;
      console.error(`[bootstrap] Native better-sqlite3 failed: ABI mismatch (Node ${process.version})`);
    } else {
      // Different error, re-throw
      throw error;
    }
  }

  // Strategy 2: Try auto-rebuild
  // v1.7.2: npx cache is NOT read-only, so we try rebuild there too
  // This may fail if user doesn't have build tools, but WASM fallback catches that
  if (attemptAutoRebuild()) {
    try {
      delete require.cache[require.resolve('better-sqlite3')];
      require('better-sqlite3');
      setDatabaseBackend('native');
      require('./index.js');
      return;
    } catch (retryError) {
      console.error('[bootstrap] Rebuild succeeded but load still failed');
      nativeError = retryError;
    }
  }

  // Strategy 3: Fallback to WASM
  console.error('[bootstrap] Trying WASM fallback...');
  try {
    if (tryWasmFallback()) {
      setDatabaseBackend('wasm');
      console.error('[bootstrap] Using WASM SQLite backend (slower but compatible)');
      require('./index.js');
      return;
    }
  } catch (e) {
    wasmError = e;
  }

  // All strategies failed
  printErrorHelp(nativeError, context, wasmError);
  process.exit(1);
}

// Export for testing
module.exports = { getDatabaseBackend, setDatabaseBackend };

// Run bootstrap if executed directly
if (require.main === module) {
  bootstrap();
}
