#!/usr/bin/env node

/**
 * Stop Hook
 *
 * Runs when Claude Code session ends.
 * Cleans up expired session tokens.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

try {
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
