#!/usr/bin/env node

/**
 * Post-Tool-Use Hook
 *
 * Runs after each tool execution in Claude Code.
 * Suggests recording experiences after file operations (TEACH gate).
 */

const fs = require('fs');

try {
  // Read stdin
  const input = fs.readFileSync(0, 'utf-8');
  const data = JSON.parse(input);

  // Check if tool was a file modification tool
  const fileTools = ['Write', 'Edit', 'NotebookEdit'];

  if (fileTools.includes(data.toolName)) {
    console.log('\n💡 Consider recording this experience (TEACH gate):\n');
    console.log('  finalize_decision({');
    console.log('    session_id: "your-session-id",');
    console.log('    conclusion: "What you learned or decided",');
    console.log('    record_as_experience: true');
    console.log('  })\n');
    console.log('This helps future tasks by building a knowledge base of patterns.\n');
  }

  process.exit(0);

} catch (e) {
  // If hook fails, exit silently
  console.error(`Hook error: ${e.message}`);
  process.exit(0);
}
