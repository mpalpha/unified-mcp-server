/**
 * Automation Tools Module (v1.7.0)
 *
 * Tools for managing hooks, session state, health checks, and data import:
 * - install_hooks: Install workflow hooks for automation
 * - uninstall_hooks: Remove installed hooks
 * - get_session_state: Get complete session state
 * - health_check: System health diagnostics
 * - import_data: Import experiences from legacy servers
 * - update_project_context: Update project-specific context
 * - get_project_context: Get current project context
 *
 * v1.7.0: Synchronized with index.js implementation
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { getDatabase, tryGetDatabase, getTokenDir, getDbPath, getDatabaseError, isDatabaseAvailable, logActivity } = require('../database.js');
const { ValidationError } = require('../validation.js');

// Import recordExperience for import_data - lazy load to avoid circular dependency
let recordExperience = null;
function getRecordExperience() {
  if (!recordExperience) {
    recordExperience = require('./knowledge.js').recordExperience;
  }
  return recordExperience;
}

/**
 * Tool 21: install_hooks
 * Install workflow hooks for automation
 */
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

  // Available hooks - MUST use PascalCase for Claude Code to recognize them
  const availableHooks = {
    'UserPromptSubmit': 'user-prompt-submit.cjs',
    'PreToolUse': 'pre-tool-use.cjs',
    'PostToolUse': 'post-tool-use.cjs',
    'Stop': 'stop.cjs',
    'SessionStart': 'session-start.cjs'
  };

  // Determine hooks to install
  const hooksToInstall = hooks[0] === 'all'
    ? Object.keys(availableHooks)
    : hooks;

  // Detect Claude Code settings path
  // v1.5.0: Default to global settings (hooks are global infrastructure)
  let settingsPath = params.settings_path;
  if (!settingsPath) {
    // Default to global settings
    const possiblePaths = [
      path.join(os.homedir(), '.claude', 'settings.json'),
      path.join(os.homedir(), '.config', 'claude', 'settings.json'),
      path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'settings.json')
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        settingsPath = p;
        break;
      }
    }

    // If no global settings found, create in default location
    if (!settingsPath) {
      settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    }
  }

  // Determine hook installation location
  // v1.5.0: Default to global hooks (project_hooks: false by default)
  // Global hooks prevent agent modification and provide consistent behavior
  const projectHooks = params.project_hooks === true; // Default false (global)
  const hooksDir = projectHooks
    ? path.join(process.cwd(), '.claude', 'hooks')
    : path.join(os.homedir(), '.claude', 'hooks');

  // Create target directory
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  // Copy hook files from source directory
  // Note: __dirname points to src/tools/, hooks are in project root /hooks/
  const sourceDir = path.join(__dirname, '..', '..', 'hooks');
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
        // Claude Code expects nested array structure:
        // "HookName": [{ "hooks": [{ "type": "command", "command": "..." }] }]
        settings.hooks[hook.name] = [
          {
            hooks: [
              {
                type: "command",
                command: hook.path
              }
            ]
          }
        ];
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
  // v1.5.0: Default to global settings (hooks are global infrastructure)
  let settingsPath = params.settings_path;
  if (!settingsPath) {
    // Default to global settings
    const possiblePaths = [
      path.join(os.homedir(), '.claude', 'settings.json'),
      path.join(os.homedir(), '.config', 'claude', 'settings.json'),
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
        // Handle nested structure: "HookName": [{ "hooks": [{ "type": "command", "command": "..." }] }]
        let hookPath = null;
        const hookEntry = settings.hooks[hookName];
        if (Array.isArray(hookEntry) && hookEntry[0]?.hooks?.[0]?.command) {
          hookPath = hookEntry[0].hooks[0].command;
        } else if (hookEntry?.command) {
          // Legacy flat structure
          hookPath = hookEntry.command;
        }

        // Delete hook file if it exists
        if (hookPath && fs.existsSync(hookPath)) {
          try {
            fs.unlinkSync(hookPath);
            removedHooks.push({ name: hookName, path: hookPath });
          } catch (e) {
            errors.push({ hook: hookName, error: `Failed to delete file: ${e.message}` });
          }
        } else if (hookPath) {
          // File doesn't exist but we still remove from settings
          removedHooks.push({ name: hookName, path: hookPath, file_missing: true });
        }

        // Remove from settings regardless of file existence
        delete settings.hooks[hookName];
      }
      // Don't error if hook not found - makes it idempotent
    }

    // Write updated settings if any hooks were removed
    if (settingsPath && removedHooks.length > 0) {
      try {
        // Clean up empty hooks object
        if (Object.keys(settings.hooks).length === 0) {
          delete settings.hooks;
        }
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

  const db = getDatabase();

  // Get reasoning session
  const reasoningSession = db.prepare(`
    SELECT * FROM reasoning_sessions WHERE session_id = ?
  `).get(params.session_id);

  // Get reasoning thoughts
  const thoughts = db.prepare(`
    SELECT * FROM reasoning_thoughts WHERE session_id = ? ORDER BY thought_number
  `).all(params.session_id);

  // Get workflow session
  const workflowSession = db.prepare(`
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
 *
 * v1.7.2: Graceful degradation - always returns status even if DB unavailable
 * This tool NEVER throws - it reports issues in the response
 */
function healthCheck(params) {
  const issues = [];
  const warnings = [];
  let experienceCount = 0;
  let sessionCount = 0;
  let workflowCount = 0;
  let dbPath = null;
  let tokenDir = null;

  // Check database availability (graceful - don't throw)
  const dbError = getDatabaseError();
  const db = tryGetDatabase();

  if (dbError) {
    issues.push(`Database initialization failed: ${dbError.message}`);
  } else if (!db) {
    // Try to initialize
    if (!isDatabaseAvailable()) {
      issues.push('Database not available - may need to run in project directory or run --init');
    }
  }

  // Only run DB checks if we have a connection
  if (db) {
    // Check database connection
    try {
      db.prepare('SELECT 1').get();
    } catch (e) {
      issues.push('Database connection failed: ' + e.message);
    }

    // Check database tables
    const tables = ['experiences', 'reasoning_sessions', 'reasoning_thoughts', 'workflow_sessions', 'activity_log'];
    for (const table of tables) {
      try {
        db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
      } catch (e) {
        issues.push(`Table "${table}" missing or corrupted`);
      }
    }

    // Check FTS5
    try {
      db.prepare('SELECT COUNT(*) FROM experiences_fts').get();
    } catch (e) {
      issues.push('FTS5 index corrupted or missing');
    }

    // Count records (only if tables exist)
    try {
      experienceCount = db.prepare('SELECT COUNT(*) as count FROM experiences').get()?.count || 0;
      sessionCount = db.prepare('SELECT COUNT(*) as count FROM reasoning_sessions').get()?.count || 0;
      workflowCount = db.prepare('SELECT COUNT(*) as count FROM workflow_sessions').get()?.count || 0;
    } catch (e) {
      warnings.push('Could not count records: ' + e.message);
    }
  }

  // Check paths (graceful)
  try {
    dbPath = getDbPath();
  } catch (e) {
    warnings.push('Could not determine database path');
  }

  try {
    tokenDir = getTokenDir();
    if (tokenDir && !fs.existsSync(tokenDir)) {
      warnings.push('Token directory does not exist');
    }
  } catch (e) {
    warnings.push('Could not determine token directory');
  }

  // Check database backend (v1.7.2)
  const dbBackend = process.env.UNIFIED_MCP_DB_BACKEND || 'native';
  if (dbBackend === 'wasm') {
    warnings.push('Using WASM SQLite backend (slower than native)');
  }

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
    database_path: dbPath,
    token_dir: tokenDir,
    database_backend: dbBackend,
    node_version: process.version
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
        getRecordExperience()({
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

/**
 * Tool 26: update_project_context
 * Update project-specific context (data-only, no code execution)
 */
function updateProjectContext(params) {
  // Get project path
  const projectPath = params.project_path || process.env.PWD || process.cwd();

  // Validate required fields
  if (params.enabled === undefined || params.enabled === null) {
    throw new ValidationError(
      'Missing required field: enabled',
      'The enabled field is required (true or false)'
    );
  }

  if (typeof params.enabled !== 'boolean') {
    throw new ValidationError(
      'Invalid enabled field type',
      'The enabled field must be a boolean (true or false)'
    );
  }

  // Validate data
  if (params.summary && params.summary.length > 200) {
    throw new ValidationError(
      'Summary too long',
      'Summary must be 200 characters or less'
    );
  }

  if (params.highlights) {
    if (!Array.isArray(params.highlights)) {
      throw new ValidationError('Highlights must be an array');
    }
    if (params.highlights.length > 5) {
      throw new ValidationError('Maximum 5 highlights allowed');
    }
    for (const highlight of params.highlights) {
      if (highlight.length > 100) {
        throw new ValidationError('Each highlight must be 100 characters or less');
      }
    }
  }

  if (params.reminders) {
    if (!Array.isArray(params.reminders)) {
      throw new ValidationError('Reminders must be an array');
    }
    if (params.reminders.length > 3) {
      throw new ValidationError('Maximum 3 reminders allowed');
    }
    for (const reminder of params.reminders) {
      if (reminder.length > 100) {
        throw new ValidationError('Each reminder must be 100 characters or less');
      }
    }
  }

  // Validate preImplementation checklist (optional)
  if (params.preImplementation) {
    if (!Array.isArray(params.preImplementation)) {
      throw new ValidationError('preImplementation must be an array');
    }
    for (const item of params.preImplementation) {
      if (typeof item !== 'string') {
        throw new ValidationError('Each preImplementation item must be a string');
      }
      if (item.length > 200) {
        throw new ValidationError('Each preImplementation item must be 200 characters or less');
      }
    }
  }

  // Validate postImplementation checklist (optional)
  if (params.postImplementation) {
    if (!Array.isArray(params.postImplementation)) {
      throw new ValidationError('postImplementation must be an array');
    }
    for (const item of params.postImplementation) {
      if (typeof item !== 'string') {
        throw new ValidationError('Each postImplementation item must be a string');
      }
      if (item.length > 200) {
        throw new ValidationError('Each postImplementation item must be 200 characters or less');
      }
    }
  }

  // Create .claude directory in project root
  const claudeDir = path.join(projectPath, '.claude');
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }

  // Build context object
  const context = {
    enabled: params.enabled,
    summary: params.summary || null,
    highlights: params.highlights || [],
    reminders: params.reminders || [],
    preImplementation: params.preImplementation || [],
    postImplementation: params.postImplementation || [],
    project_path: projectPath,
    updated_at: new Date().toISOString()
  };

  // Write to .claude/project-context.json in project root
  const contextPath = path.join(claudeDir, 'project-context.json');
  fs.writeFileSync(contextPath, JSON.stringify(context, null, 2));

  return {
    success: true,
    project_path: projectPath,
    context_file: contextPath,
    enabled: context.enabled,
    message: context.enabled ? 'Project context enabled' : 'Project context disabled'
  };
}

/**
 * Tool 27: get_project_context
 * Get current project context configuration
 */
function getProjectContext(params) {
  // Get project path
  const projectPath = params.project_path || process.env.PWD || process.cwd();

  // Load context from .claude/project-context.json in project root
  const contextPath = path.join(projectPath, '.claude', 'project-context.json');

  if (!fs.existsSync(contextPath)) {
    return {
      exists: false,
      project_path: projectPath,
      message: 'No project context configured'
    };
  }

  const context = JSON.parse(fs.readFileSync(contextPath, 'utf8'));

  return {
    exists: true,
    project_path: projectPath,
    context_file: contextPath,
    enabled: context.enabled,
    summary: context.summary,
    highlights: context.highlights,
    reminders: context.reminders,
    preImplementation: context.preImplementation || [],
    postImplementation: context.postImplementation || [],
    updated_at: context.updated_at
  };
}

module.exports = {
  installHooks,
  uninstallHooks,
  getSessionState,
  healthCheck,
  importData,
  updateProjectContext,
  getProjectContext
};
