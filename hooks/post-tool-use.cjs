#!/usr/bin/env node

/**
 * ⚠️  DO NOT MODIFY THIS FILE
 *
 * This hook is managed by unified-mcp-server.
 * Customization: Use update_project_context() to configure behavior.
 * Location: ~/.claude/hooks/ (global, immutable)
 * Data source: .claude/project-context.json (project-local, customizable)
 *
 * Post-Tool-Use Hook
 *
 * Runs after each tool execution in Claude Code.
 * Suggests recording experiences after file operations (TEACH gate).
 * Displays postImplementation checklist items after file modifications.
 */

const fs = require('fs');
const path = require('path');

try {
  // Read stdin
  const input = fs.readFileSync(0, 'utf-8');
  const data = JSON.parse(input);

  // Check if tool was a file modification tool
  const fileTools = ['Write', 'Edit', 'NotebookEdit'];

  if (fileTools.includes(data.toolName)) {
    // Load project context from .claude/project-context.json in project root
    let projectContext = null;
    const cwd = process.env.PWD || process.cwd();
    const contextPath = path.join(cwd, '.claude', 'project-context.json');

    if (fs.existsSync(contextPath)) {
      try {
        projectContext = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
      } catch (e) {
        // Invalid context file, skip
      }
    }

    // Display postImplementation checklist if available
    if (projectContext && projectContext.enabled &&
        projectContext.postImplementation &&
        Array.isArray(projectContext.postImplementation) &&
        projectContext.postImplementation.length > 0) {
      console.log('\n📋 POST-IMPLEMENTATION CHECKLIST:\n');
      console.log('Report status of each item:\n');
      projectContext.postImplementation.forEach(item => {
        if (typeof item === 'string') {
          console.log(`  □ ${item}`);
        }
      });
      console.log('');
    }

    console.log('\n💡 Consider recording this experience:\n');
    console.log('  record_experience({');
    console.log('    type: "effective",');
    console.log('    domain: "Decision",');
    console.log('    situation: "What was happening",');
    console.log('    approach: "What you did",');
    console.log('    outcome: "What happened",');
    console.log('    reasoning: "Why it worked"');
    console.log('  })\n');
    console.log('This helps future tasks by building a knowledge base of patterns.\n');
  }

  // v1.5.2: Universal record prompt - Agent-Directed Instruction Design
  console.log('User rule: record_experience if task complete + state what recorded. Always.\n');

  process.exit(0);

} catch (e) {
  // If hook fails, exit silently
  console.error(`Hook error: ${e.message}`);
  process.exit(0);
}
