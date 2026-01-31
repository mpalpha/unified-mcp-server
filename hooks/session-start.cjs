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

// CHORES - Behavioral compliance framework (highest priority)
console.log('⚠️  CHORES - VERIFY BEFORE EVERY RESPONSE:\n');
console.log('□ CONSTRAINTS: Following all stated rules/limitations?');
console.log('□ HALLUCINATION: Facts verified, not assumed?');
console.log('□ OVERREACH: Only what was asked, no extras?');
console.log('□ REASONING: Logic shown with evidence?');
console.log('□ ETHICS: Security/safety checked?');
console.log('□ SYCOPHANCY: Accurate, not just agreeable?\n');

// Display existing generic prompts
console.log('🎯 Unified MCP Server - Workflow Enforcement Active\n');
console.log('Available presets: three-gate (default), minimal, strict, custom\n');
console.log('Use list_presets to see configuration options.');
console.log('Use apply_preset to change workflow enforcement.\n');

// Check for post-install prompt file
const MCP_DIR = path.join(os.homedir(), '.unified-mcp');
const promptsDir = path.join(MCP_DIR, 'post-install-prompts');

// Use PWD env var if available (more reliable than process.cwd() in hooks)
const projectDir = process.env.PWD || process.cwd();
const projectHash = crypto.createHash('md5').update(projectDir).digest('hex');
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

    // DO NOT auto-delete - prompt content contains deletion instructions

  } catch (err) {
    // Silent fail - don't block session start if file operations fail
  }
}

process.exit(0);
