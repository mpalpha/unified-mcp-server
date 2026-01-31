#!/usr/bin/env node

/**
 * Session Start Hook
 *
 * Runs when Claude Code session starts.
 * Displays welcome message and available presets.
 * Auto-injects post-install prompt if present.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// Display existing generic prompts
console.log('🎯 Unified MCP Server - Workflow Enforcement Active\n');
console.log('Available presets: three-gate (default), minimal, strict, custom\n');
console.log('Use list_presets to see configuration options.');
console.log('Use apply_preset to change workflow enforcement.\n');

// Check for post-install prompt file
const MCP_DIR = path.join(os.homedir(), '.unified-mcp');
const promptsDir = path.join(MCP_DIR, 'post-install-prompts');
const projectHash = crypto.createHash('md5').update(process.cwd()).digest('hex');
const promptFilePath = path.join(promptsDir, `${projectHash}.md`);

if (fs.existsSync(promptFilePath)) {
  try {
    // Read and inject the post-install prompt
    const promptContent = fs.readFileSync(promptFilePath, 'utf8');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('🎉 POST-INSTALLATION CONFIGURATION\n');
    console.log('The following prompt was generated during installation.');
    console.log('Please review and respond:\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(promptContent);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Delete the file after injection
    fs.unlinkSync(promptFilePath);

  } catch (err) {
    // Silent fail - don't block session start if file operations fail
    // File will remain and can be manually handled
  }
}

process.exit(0);
