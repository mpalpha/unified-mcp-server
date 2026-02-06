#!/usr/bin/env node

/**
 * Native Module Compatibility Check
 *
 * v1.7.2: Enhanced for npx cache context - detects npx environment and
 *         provides appropriate guidance. WASM fallback available at runtime.
 *
 * This script attempts to load better-sqlite3 and rebuilds it if there's
 * a Node.js version mismatch. Runs automatically during postinstall.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const REQUIRED_MODULE = 'better-sqlite3';

function log(message) {
  console.error(`[native-check] ${message}`);
}

/**
 * Detect if running in npx cache context
 * v1.7.2: npx caches packages in ~/.npm/_npx/ - we can still rebuild there
 */
function detectNpxContext() {
  const isNpx = __dirname.includes('/.npm/_npx/') || __dirname.includes('\\.npm\\_npx\\');
  const cacheDir = isNpx ? __dirname.split('/_npx/')[0] + '/_npx/' : null;
  return { isNpx, cacheDir };
}

/**
 * Check if WASM fallback is available
 * v1.7.2: If native fails, bootstrap.js will use WASM at runtime
 */
function checkWasmFallback() {
  try {
    require.resolve('node-sqlite3-wasm');
    return true;
  } catch (e) {
    return false;
  }
}

function checkAndRebuild() {
  const context = detectNpxContext();
  const hasWasmFallback = checkWasmFallback();

  try {
    // Try to load better-sqlite3
    require(REQUIRED_MODULE);
    log(`✓ ${REQUIRED_MODULE} loaded successfully`);
    return true;
  } catch (error) {
    if (error.code === 'ERR_DLOPEN_FAILED') {
      log(`✗ Native module version mismatch detected`);
      log(`  Current Node.js: ${process.version}`);

      if (context.isNpx) {
        log(`  Context: npx cache (${context.cacheDir})`);
      }

      log(`  Attempting to rebuild ${REQUIRED_MODULE}...`);

      try {
        // Attempt to rebuild - works in npx cache too (it's not read-only)
        execSync(`npm rebuild ${REQUIRED_MODULE}`, {
          cwd: path.join(__dirname, '..'),
          stdio: 'inherit'
        });

        // Try loading again
        delete require.cache[require.resolve(REQUIRED_MODULE)];
        require(REQUIRED_MODULE);

        log(`✓ Rebuild successful`);
        return true;
      } catch (rebuildError) {
        log(`✗ Rebuild failed`);

        if (hasWasmFallback) {
          log(`  ✓ WASM fallback available - server will use node-sqlite3-wasm at runtime`);
          log(`  Note: WASM is slower than native but fully compatible`);
        } else {
          log(`  ✗ No WASM fallback available`);
          if (context.isNpx) {
            log(`  For npx users: The server may fail to start.`);
            log(`  Try: npm install -g mpalpha/unified-mcp-server --build-from-source`);
          } else {
            log(`  The module will attempt auto-repair on first use`);
          }
        }
        return false;
      }
    } else {
      // Different error, re-throw
      throw error;
    }
  }
}

// Run check
try {
  checkAndRebuild();
  process.exit(0);
} catch (error) {
  log(`Unexpected error: ${error.message}`);
  process.exit(0); // Don't fail postinstall for non-critical errors
}
