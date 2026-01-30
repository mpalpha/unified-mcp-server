/**
 * Automation Tools
 * 
 * Tools for managing git hooks, session state, health checks, and data import.
 * Supports automated workflow integration.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { getDatabase, logActivity, MCP_DIR, TOKEN_DIR, DB_FILE } = require('../database.js');
const { ValidationError } = require('../validation.js');

function installHooks(params) {
  // Default to installing all hooks if not specified
  const hooks = params.hooks || ['all'];

  // Validate parameters
  if (!Array.isArray(hooks)) {
    throw new ValidationError(
      'Invalid "hooks" parameter',
      'Required: hooks = array of hook names or ["all"]'
    );
  }

  // Available hooks
  const availableHooks = {
    'user_prompt_submit': 'user-prompt-submit.cjs',
    'pre_tool_use': 'pre-tool-use.cjs',
    'post_tool_use': 'post-tool-use.cjs',
    'stop': 'stop.cjs',
    'session_start': 'session-start.cjs'
  };

  // Determine hooks to install
  const hooksToInstall = hooks[0] === 'all'
    ? Object.keys(availableHooks)
    : hooks;

  // Detect Claude Code settings path
  let settingsPath = params.settings_path;
  if (!settingsPath) {
    const possiblePaths = [
      path.join(os.homedir(), '.config', 'claude', 'settings.json'),
      path.join(os.homedir(), '.claude', 'settings.json'),
      path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'settings.json')
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        settingsPath = p;
        break;
      }
    }
  }

  // Determine hook installation location
  const hooksDir = params.project_hooks
    ? path.join(process.cwd(), '.claude', 'hooks')
    : path.join(MCP_DIR, 'hooks');

  // Create target directory
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  // Copy hook files from source directory
  const sourceDir = path.join(__dirname, 'hooks');
  const installedHooks = [];
  const errors = [];

  for (const hookName of hooksToInstall) {
    if (!availableHooks[hookName]) {
      errors.push({ hook: hookName, error: 'Unknown hook name' });
      continue;
    }

    const fileName = availableHooks[hookName];
    const sourcePath = path.join(sourceDir, fileName);
    const destPath = path.join(hooksDir, fileName);

    try {
      // Check if source exists
      if (!fs.existsSync(sourcePath)) {
        errors.push({ hook: hookName, error: 'Source file not found' });
        continue;
      }

      // Copy file
      fs.copyFileSync(sourcePath, destPath);

      // Ensure executable permissions
      fs.chmodSync(destPath, 0o755);

      installedHooks.push({
        name: hookName,
        path: destPath,
        executable: true
      });
    } catch (e) {
      errors.push({ hook: hookName, error: e.message });
    }
  }

  // Update Claude Code settings if requested
  let settingsUpdated = false;
  if (params.update_settings !== false && settingsPath) {
    try {
      let settings = {};

      if (fs.existsSync(settingsPath)) {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      }

      if (!settings.hooks) {
        settings.hooks = {};
      }

      for (const hook of installedHooks) {
        settings.hooks[hook.name] = {
          command: hook.path
        };
      }

      // Ensure directory exists
      const settingsDir = path.dirname(settingsPath);
      if (!fs.existsSync(settingsDir)) {
        fs.mkdirSync(settingsDir, { recursive: true });
      }

      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      settingsUpdated = true;
    } catch (e) {
      errors.push({ hook: 'settings', error: `Failed to update settings: ${e.message}` });
    }
  }

  return {
    installed: installedHooks.length > 0,
    hooks: installedHooks,
    location: hooksDir,
    settings_updated: settingsUpdated,
    settings_path: settingsPath || 'not found',
    errors: errors.length > 0 ? errors : undefined,
    message: `Installed ${installedHooks.length} hook(s) successfully`
  };
}

/**
 * Tool 22: uninstall_hooks
 * Remove installed hooks
 */
function uninstallHooks(params) {
  // Default to uninstalling all hooks if not specified
  const hooks = params.hooks || 'all';

  // Validate parameters
  if (!Array.isArray(hooks) && hooks !== 'all') {
    throw new ValidationError(
      'Invalid "hooks" parameter',
      'Required: hooks = array of hook names or "all"'
    );
  }

  // Detect Claude Code settings path
  let settingsPath = params.settings_path;
  if (!settingsPath) {
    const possiblePaths = [
      path.join(os.homedir(), '.config', 'claude', 'settings.json'),
      path.join(os.homedir(), '.claude', 'settings.json'),
      path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'settings.json')
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        settingsPath = p;
        break;
      }
    }
  }

  // Read settings
  let settings = {};
  if (settingsPath && fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (e) {
      // Settings file corrupted or invalid
    }
  }

  // Determine hooks to remove
  const hooksToRemove = hooks === 'all'
    ? Object.keys(settings.hooks || {})
    : hooks;

  const removedHooks = [];
  const errors = [];

  // Remove from settings and delete files
  if (settings.hooks) {
    for (const hookName of hooksToRemove) {
      if (settings.hooks[hookName]) {
        const hookPath = settings.hooks[hookName].command;

        // Delete hook file
        if (fs.existsSync(hookPath)) {
          try {
            fs.unlinkSync(hookPath);
            removedHooks.push({ name: hookName, path: hookPath });
          } catch (e) {
            errors.push({ hook: hookName, error: `Failed to delete file: ${e.message}` });
          }
        }

        // Remove from settings
        delete settings.hooks[hookName];
      } else {
        errors.push({ hook: hookName, error: 'Hook not found in settings' });
      }
    }

    // Write updated settings
    if (settingsPath && removedHooks.length > 0) {
      try {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      } catch (e) {
        errors.push({ hook: 'settings', error: `Failed to update settings: ${e.message}` });
      }
    }
  }

  return {
    uninstalled: true,  // Always true for idempotency
    removed_count: removedHooks.length,
    removed_hooks: removedHooks,
    errors: errors.length > 0 ? errors : undefined,
    message: removedHooks.length > 0
      ? `Removed ${removedHooks.length} hook(s) successfully`
      : 'No hooks were removed (already clean)'
  };
}

/**
 * Tool 23: get_session_state
 * Get complete session state
 */
function getSessionState(params) {
  if (!params.session_id) {
    throw new ValidationError(
      'Missing "session_id" parameter',
      'Required: session_id = session to get state for'
    );
  }

  // Get reasoning session
  const reasoningSession = getDatabase().prepare(`
    SELECT * FROM reasoning_sessions WHERE session_id = ?
  `).get(params.session_id);

  // Get reasoning thoughts
  const thoughts = getDatabase().prepare(`
    SELECT * FROM reasoning_thoughts WHERE session_id = ? ORDER BY thought_number
  `).all(params.session_id);

  // Get workflow session
  const workflowSession = getDatabase().prepare(`
    SELECT * FROM workflow_sessions WHERE session_id = ?
  `).get(params.session_id);

  return {
    session_id: params.session_id,
    reasoning_session: reasoningSession || null,
    thoughts: thoughts || [],
    workflow_session: workflowSession || null,
    thought_count: thoughts ? thoughts.length : 0,
    active: (reasoningSession && reasoningSession.phase !== 'finalized') || false
  };
}

/**
 * Tool 24: health_check
 * System health diagnostics
 */
function healthCheck(params) {
  const issues = [];
  const warnings = [];

  // Check database
  try {
    getDatabase().prepare('SELECT 1').get();
  } catch (e) {
    issues.push('Database connection failed');
  }

  // Check database tables
  const tables = ['experiences', 'reasoning_sessions', 'reasoning_thoughts', 'workflow_sessions', 'activity_log'];
  for (const table of tables) {
    try {
      getDatabase().prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
    } catch (e) {
      issues.push(`Table "${table}" missing or corrupted`);
    }
  }

  // Check token directory
  if (!fs.existsSync(TOKEN_DIR)) {
    warnings.push('Token directory does not exist');
  }

  // Check FTS5
  try {
    getDatabase().prepare('SELECT COUNT(*) FROM experiences_fts').get();
  } catch (e) {
    issues.push('FTS5 index corrupted or missing');
  }

  // Count records
  const experienceCount = getDatabase().prepare('SELECT COUNT(*) as count FROM experiences').get().count;
  const sessionCount = getDatabase().prepare('SELECT COUNT(*) as count FROM reasoning_sessions').get().count;
  const workflowCount = getDatabase().prepare('SELECT COUNT(*) as count FROM workflow_sessions').get().count;

  const healthy = issues.length === 0;

  return {
    healthy,
    status: healthy ? 'OK' : 'DEGRADED',
    issues,
    warnings,
    stats: {
      experiences: experienceCount,
      reasoning_sessions: sessionCount,
      workflow_sessions: workflowCount
    },
    database_path: DB_FILE,
    token_dir: TOKEN_DIR
  };
}

/**
 * Tool 25: import_data
 * Import experiences from legacy servers
 */
function importData(params) {
  if (!params.source_file) {
    throw new ValidationError(
      'Missing "source_file" parameter',
      'Required: source_file = path to JSON file with experiences'
    );
  }

  if (!fs.existsSync(params.source_file)) {
    throw new ValidationError(
      'Source file not found',
      `File does not exist: ${params.source_file}`
    );
  }

  // Read source file
  const sourceData = JSON.parse(fs.readFileSync(params.source_file, 'utf8'));

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  // Import experiences
  if (Array.isArray(sourceData.experiences)) {
    for (const exp of sourceData.experiences) {
      try {
        // Check for required fields
        if (!exp.type || !exp.domain || !exp.situation || !exp.approach || !exp.outcome || !exp.reasoning) {
          skipped++;
          continue;
        }

        // Import (will trigger duplicate detection)
        recordExperience({
          type: exp.type,
          domain: exp.domain,
          situation: exp.situation,
          approach: exp.approach,
          outcome: exp.outcome,
          reasoning: exp.reasoning,
          confidence: exp.confidence || 0.5,
          tags: exp.tags || []
        });

        imported++;
      } catch (e) {
        errors++;
      }
    }
  }

  return {
    imported,
    skipped,
    errors,
    total_records: sourceData.experiences ? sourceData.experiences.length : 0,
    source_file: params.source_file,
    message: `Imported ${imported} experiences (${skipped} skipped, ${errors} errors)`
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Log activity to database
 */
module.exports = {
  installHooks,
  uninstallHooks,
  getSessionState,
  healthCheck,
  importData
};
