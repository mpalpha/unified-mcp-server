#!/usr/bin/env node

/**
 * Native Module Compatibility Check
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

function checkAndRebuild() {
  try {
    // Try to load better-sqlite3
    require(REQUIRED_MODULE);
    log(`✓ ${REQUIRED_MODULE} loaded successfully`);
    return true;
  } catch (error) {
    if (error.code === 'ERR_DLOPEN_FAILED') {
      log(`✗ Native module version mismatch detected`);
      log(`  Current Node.js: ${process.version}`);
      log(`  Attempting to rebuild ${REQUIRED_MODULE}...`);

      try {
        // Attempt to rebuild
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
        log(`  This may happen when using npx or global install`);
        log(`  The module will attempt auto-repair on first use`);
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
