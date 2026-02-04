#!/usr/bin/env node

/**
 * ⚠️  DO NOT MODIFY THIS FILE
 *
 * This hook is managed by unified-mcp-server.
 * Customization: Use update_project_context() to configure behavior.
 * Location: ~/.claude/hooks/ (global, immutable)
 * Data source: .claude/project-context.json (project-local, customizable)
 *
 * Stop Hook
 *
 * Runs when Claude Code session ends.
 * Cleans up expired session tokens.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

try {
  // v1.5.0: Universal record prompt - remind to capture experience before exit
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚠️  SESSION ENDING - RECORD YOUR EXPERIENCE\n');
  console.log('EXECUTE BEFORE EXIT:');
  console.log('record_experience({');
  console.log('  type: "effective",');
  console.log('  domain: "<category>",');
  console.log('  situation: "<task from this session>",');
  console.log('  approach: "<solution implemented>",');
  console.log('  outcome: "<result achieved>",');
  console.log('  reasoning: "<key insight>"');
  console.log('})\n');
  console.log('Session ends in 5 seconds. Record now or lose this knowledge.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // v1.4.0: project-scoped tokens
  const projectDir = process.env.PWD || process.cwd();
  const tokenDir = path.join(projectDir, '.claude', 'tokens');

  if (fs.existsSync(tokenDir)) {
    const tokenFiles = fs.readdirSync(tokenDir);
    let cleanedCount = 0;

    for (const file of tokenFiles) {
      if (file.startsWith('session-')) {
        const tokenPath = path.join(tokenDir, file);
        try {
          fs.unlinkSync(tokenPath);
          cleanedCount++;
        } catch (e) {
          // Silent cleanup failure
        }
      }
    }

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} session token(s).`);
    }
  }

  process.exit(0);

} catch (e) {
  // Silent failure on cleanup
  process.exit(0);
}
