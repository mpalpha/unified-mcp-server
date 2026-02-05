#!/usr/bin/env node

/**
 * ⚠️  DO NOT MODIFY THIS FILE
 *
 * This hook is managed by unified-mcp-server.
 * Customization: Use update_project_context() to configure behavior.
 * Location: ~/.claude/hooks/ (global, immutable)
 * Data source: .claude/project-context.json (project-local, customizable)
 *
 * PreCompact Hook
 *
 * Runs before Claude Code context compaction.
 * Prompts memory maintenance to clean up stale experiences.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

try {
  // v1.5.3: Memory maintenance prompt - Agent-Directed Instruction Design (Problem 5)
  console.log('User rule: Before context compaction, review experiences for maintenance:');
  console.log('AUTO (no confirmation): Archive experiences >90 days old with 0 retrievals');
  console.log('REVIEW: Consolidate experiences with >80% similarity (present merge proposal)');
  console.log('ASK: Delete any experience (requires explicit user approval)');
  console.log('Run search_experiences({ query: "*", limit: 100 }) to identify candidates.');
  console.log('State maintenance actions taken.\n');

  process.exit(0);

} catch (e) {
  // Silent failure
  process.exit(0);
}
