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

  // Check for valid session token (v1.4.0: project-scoped)
  const projectDir = process.env.PWD || process.cwd();
  const tokenDir = path.join(projectDir, '.claude', 'tokens');

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
    console.error('⛔ STOP: This file operation is BLOCKED.\n');
    console.error('Complete these steps IN ORDER before file operations:\n');
    console.error('1. □ search_experiences  (LEARN: Find similar patterns)');
    console.error('   REQUIRED CALL: search_experiences({ query: "<keywords>" })\n');
    console.error('2. □ analyze_problem     (REASON: Synthesize solution)');
    console.error('   REQUIRED CALL: analyze_problem({ problem: "<task>" })\n');
    console.error('3. □ verify_compliance   (Get operation token)');
    console.error('   REQUIRED CALL: verify_compliance({ session_id: "...", ... })\n');
    console.error('4. □ authorize_operation (Create 60-min session token)');
    console.error('   REQUIRED CALL: authorize_operation({ operation_token: "...", ... })\n');
    console.error('DO NOT call Write, Edit, or NotebookEdit until steps 1-4 are complete.\n');
    console.error('Skipping this workflow will result in incomplete context and potential rework.\n');

    process.exit(1); // Block the operation
  }

  // Token is valid, allow operation
  process.exit(0);

} catch (e) {
  // If hook fails, default to allowing the operation
  console.error(`Hook error: ${e.message}`);
  process.exit(0);
}
