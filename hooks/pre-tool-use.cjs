#!/usr/bin/env node

/**
 * Pre-Tool-Use Hook
 *
 * Runs before each tool execution in Claude Code.
 * Blocks Write/Edit/NotebookEdit operations until workflow compliance verified.
 *
 * Checks for valid session token created by authorize_operation tool.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

try {
  // Read stdin
  const input = fs.readFileSync(0, 'utf-8');
  const data = JSON.parse(input);

  // CHORES reference - verify before every tool use
  console.log('⚠️  Verify CHORES before tool use\n');
  console.log('State why this action is compliant.\n');

  // Check if tool is a file modification tool
  const fileTools = ['Write', 'Edit', 'NotebookEdit'];
  if (!fileTools.includes(data.toolName)) {
    // Not a file tool, allow operation
    process.exit(0);
  }

  // Check for valid session token
  const homeDir = path.join(os.homedir(), '.unified-mcp');
  const tokenDir = path.join(homeDir, 'tokens');

  let hasValidToken = false;

  if (fs.existsSync(tokenDir)) {
    const tokenFiles = fs.readdirSync(tokenDir);

    for (const file of tokenFiles) {
      if (file.startsWith('session-')) {
        const tokenPath = path.join(tokenDir, file);
        try {
          const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));

          // Check if token is still valid
          if (tokenData.expires_at > Date.now()) {
            hasValidToken = true;
            break;
          }
        } catch (e) {
          // Invalid token file, skip
          continue;
        }
      }
    }
  }

  if (!hasValidToken) {
    // Block the operation
    console.error('🔵 WORKFLOW ENFORCEMENT (Research-Based)\n');
    console.error('This file operation requires workflow compliance.\n');
    console.error('WHY: Research shows agents fail without systematic learning:');
    console.error('  • ChatDev: 25% correctness without workflow (arXiv:2503.13657)');
    console.error('  • AgentErrorTaxonomy: Memory, planning, action failures (arXiv:2509.25370)');
    console.error('  • Multi-agent fragility: Context not shared (Cognition.ai 2025)\n');
    console.error('SOLUTION: TEACH → LEARN → REASON workflow before file operations\n');
    console.error('Required steps:');
    console.error('1. record_experience   (TEACH: Document approach)');
    console.error('2. search_experiences  (LEARN: Find similar patterns)');
    console.error('3. analyze_problem     (REASON: Synthesize solution)');
    console.error('4. verify_compliance   (Get operation token)');
    console.error('5. authorize_operation (Create 60-min session token)\n');
    console.error('This ensures every request builds on accumulated knowledge.\n');

    process.exit(1); // Block the operation
  }

  // Token is valid, allow operation
  process.exit(0);

} catch (e) {
  // If hook fails, default to allowing the operation
  console.error(`Hook error: ${e.message}`);
  process.exit(0);
}
