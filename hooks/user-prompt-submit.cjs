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

  // Load project context if available
  let projectContext = null;
  const cwd = process.env.PWD || process.cwd();
  const projectHash = require('crypto').createHash('md5').update(cwd).digest('hex');
  const contextPath = path.join(homeDir, 'project-contexts', `${projectHash}.json`);

  if (fs.existsSync(contextPath)) {
    try {
      projectContext = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
    } catch (e) {
      // Invalid context file, skip
    }
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
      console.log('⚠️  WORKFLOW ENFORCEMENT ACTIVE\n');
      console.log('This hook was installed to REQUIRE workflow compliance.');
      console.log('File operations will be BLOCKED until you complete:\n');

      if (hasLearnGate) {
        console.log('✓ LEARN: Search experiences for relevant patterns');
        console.log('  → search_experiences({ query: "keywords for this task" })\n');
      }

      if (hasReasonGate) {
        console.log('✓ REASON: Analyze problem and gather context');
        console.log('  → analyze_problem({ problem: "describe task" })');
        console.log('  → gather_context({ session_id: "...", sources: {...} })\n');
      }

      if (hasTeachGate) {
        console.log('✓ TEACH: Record your solution after completion');
        console.log('  → record_experience({ type: "effective", ... })\n');
      }

      // Display project-specific context if available
      if (projectContext && projectContext.enabled) {
        try {
          // Validate types before displaying
          if (projectContext.highlights && !Array.isArray(projectContext.highlights)) {
            throw new TypeError('highlights must be an array');
          }
          if (projectContext.reminders && !Array.isArray(projectContext.reminders)) {
            throw new TypeError('reminders must be an array');
          }

          console.log('📋 PROJECT CONTEXT:\n');

          if (projectContext.summary && typeof projectContext.summary === 'string') {
            console.log(`${projectContext.summary}\n`);
          }

          if (projectContext.highlights && projectContext.highlights.length > 0) {
            projectContext.highlights.forEach(highlight => {
              if (typeof highlight === 'string') {
                console.log(`  • ${highlight}`);
              }
            });
            console.log('');
          }

          if (projectContext.reminders && projectContext.reminders.length > 0) {
            projectContext.reminders.forEach(reminder => {
              if (typeof reminder === 'string') {
                console.log(`  ⚠️  ${reminder}`);
              }
            });
            console.log('');
          }
        } catch (typeError) {
          // Skip malformed context silently
        }
      }

      console.log('After completing workflow: Authorization granted for 60 minutes\n');
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
