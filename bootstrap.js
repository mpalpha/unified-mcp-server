#!/usr/bin/env node

/**
 * Bootstrap Script for Unified MCP Server
 *
 * Handles native module errors gracefully and provides
 * actionable error messages for users.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function detectPackageManager() {
  // Check if installed globally or locally
  const isGlobal = __dirname.includes('/node_modules/unified-mcp-server') ||
                   __dirname.includes('/.npm/_npx/');
  return { isGlobal, isNpx: __dirname.includes('/.npm/_npx/') };
}

function printErrorHelp(error, context) {
  console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('❌ Unified MCP Server - Native Module Error');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (error.code === 'ERR_DLOPEN_FAILED') {
    console.error('PROBLEM: better-sqlite3 was compiled for a different Node.js version\n');

    console.error(`Your Node.js: ${process.version}\n`);

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

// Main bootstrap logic
function bootstrap() {
  const context = detectPackageManager();

  try {
    // Try to load better-sqlite3
    require('better-sqlite3');
    // Success - continue to main script
    require('./index.js');
  } catch (error) {
    if (error.code === 'ERR_DLOPEN_FAILED') {
      // Native module version mismatch
      if (!context.isNpx && attemptAutoRebuild()) {
        // Rebuild succeeded, try again
        try {
          delete require.cache[require.resolve('better-sqlite3')];
          require('better-sqlite3');
          require('./index.js');
          return;
        } catch (retryError) {
          // Still failed after rebuild
          printErrorHelp(retryError, context);
          process.exit(1);
        }
      } else {
        // Can't auto-rebuild (npx) or rebuild failed
        printErrorHelp(error, context);
        process.exit(1);
      }
    } else {
      // Different error, re-throw
      throw error;
    }
  }
}

// Run bootstrap
bootstrap();
