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

console.log('□ CONSTRAINTS');
console.log('  • Re-read user\'s current request');
console.log('  • Discover project rules intelligently:');
console.log('    - Check root for config/instruction files');
console.log('    - Search for rule-related files based on project type');
console.log('    - Read files that may contain agent behavior guidance');
console.log('  • Apply discovered rules to your response');
console.log('  • Work within tool limits (multiple calls if needed, offset/limit for large files)\n');

console.log('□ HALLUCINATION');
console.log('  • Verify facts using appropriate tools for the claim type:');
console.log('    - File existence/content → Glob, Read');
console.log('    - Code patterns → Grep, Read');
console.log('    - Project structure → Glob, ls');
console.log('  • Cite verification: "Found X [via ToolName(\'args\')]"');
console.log('  • Do NOT rely on prior knowledge or conversation history for current state');
console.log('  • If unverifiable with available tools, say "I cannot verify this"\n');

console.log('□ OVERREACH');
console.log('  • Understand the scope of what was asked');
console.log('  • Do ONLY what\'s within that scope');
console.log('  • Don\'t add features, refactoring, docs, or "improvements" not requested');
console.log('  • Don\'t create files unless necessary for the task');
console.log('  • If scope is unclear, ask before expanding\n');

console.log('□ REASONING');
console.log('  • Explain WHY, not just WHAT - match depth to complexity');
console.log('  • Cite evidence from tool output or user\'s request');
console.log('  • Connect decisions to discovered constraints/rules');
console.log('  • If uncertain, state confidence level and what would increase it\n');

console.log('□ ETHICS');
console.log('  • Consider security implications relevant to this change');
console.log('  • Check for sensitive data before committing (secrets, credentials, PII)');
console.log('  • Review for vulnerabilities appropriate to the project type');
console.log('  • If unsure about security impact, flag it\n');

console.log('□ SYCOPHANCY');
console.log('  • Evaluate user\'s assumptions critically before proceeding');
console.log('  • If something seems wrong, state disagreement with evidence');
console.log('  • Don\'t confirm without verification');
console.log('  • Accuracy over agreement - even if user won\'t like it\n');

console.log('State which items apply and how you addressed them.\n');

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
