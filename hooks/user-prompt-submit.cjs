#!/usr/bin/env node

/**
 * User Prompt Submit Hook
 *
 * Runs when user submits a prompt in Claude Code.
 * Provides workflow guidance based on three-gate protocol (TEACH → LEARN → REASON).
 *
 * Outputs plain text guidance followed by the original prompt.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Read stdin
let input = '';
try {
  input = fs.readFileSync(0, 'utf-8');
  const data = JSON.parse(input);

  // Load configuration from ~/.unified-mcp/config.json
  const homeDir = path.join(os.homedir(), '.unified-mcp');
  let config = null;

  const configPath = path.join(homeDir, 'config.json');
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  // Check for valid session token (fast-track)
  const tokenDir = path.join(homeDir, 'tokens');
  let hasValidToken = false;

  if (fs.existsSync(tokenDir)) {
    const tokenFiles = fs.readdirSync(tokenDir);
    for (const file of tokenFiles) {
      if (file.startsWith('session-')) {
        const tokenPath = path.join(tokenDir, file);
        try {
          const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
          if (tokenData.expires_at > Date.now()) {
            hasValidToken = true;
            break;
          }
        } catch (e) {
          // Invalid token file, skip
        }
      }
    }
  }

  // If fast-track token exists, skip guidance
  if (!hasValidToken && config) {
    // Determine required gates based on config
    const gates = config.gates || {};
    const hasTeachGate = gates.teach && gates.teach.required_tools && gates.teach.required_tools.length > 0;
    const hasLearnGate = gates.learn && gates.learn.required_tools && gates.learn.required_tools.length > 0;
    const hasReasonGate = gates.reason && gates.reason.required_tools && gates.reason.required_tools.length > 0;

    if (hasLearnGate || hasReasonGate || hasTeachGate) {
      console.log('🔵 CONFIGURED HOOK - Protocol Guidance\n');
      console.log('Your workflow requires following the three-gate protocol:\n');

      if (hasLearnGate) {
        console.log('LEARN Gate: Search for relevant patterns before making changes.');
        console.log('  Suggested: search_experiences({ query: "your task keywords" })\n');
      }

      if (hasReasonGate) {
        console.log('REASON Gate: Analyze and gather context before implementing.');
        console.log('  Suggested: analyze_problem({ problem: "your task" })');
        console.log('  Then: gather_context({ session_id: "...", sources: {...} })\n');
      }

      if (hasTeachGate) {
        console.log('TEACH Gate: Record your approach after completion.');
        console.log('  Suggested: record_experience({ type: "effective", ... })\n');
      }

      console.log('⚡ Fast-track available after completing workflow once (valid 60 minutes)\n');
    }
  }

  // Return original prompt (required by Claude Code hook protocol)
  console.log('---\n');
  console.log(data.userPrompt || data.prompt || '');

} catch (e) {
  // If hook fails, pass through original prompt
  console.error(`Hook error: ${e.message}`);
  process.exit(0);
}
