#!/usr/bin/env node

/**
 * Session Start Hook
 *
 * Runs when Claude Code session starts.
 * Displays welcome message and available presets.
 */

console.log('🎯 Unified MCP Server - Workflow Enforcement Active\n');
console.log('Available presets: three-gate (default), minimal, strict, custom\n');
console.log('Use list_presets to see configuration options.');
console.log('Use apply_preset to change workflow enforcement.\n');

process.exit(0);
