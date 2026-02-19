/**
 * Database Module - SQLite with FTS5 full-text search
 *
 * v1.8.7: Fix lock cleanup to handle directories (node-sqlite3-wasm uses mkdirSync)
 * v1.8.6: Stale lock file cleanup on startup
 * v1.8.5: WASM-only SQLite (removed native better-sqlite3)
 * v1.8.2: Migration runner for schema versioning (Flyway-style)
 * v1.7.2: Hybrid database loading - native better-sqlite3 or WASM fallback
 * v1.7.0: Synchronized with index.js schema
 * v1.4.0: Project-scoped storage in .claude/ directory
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Get the Database class (WASM-only in v1.8.5+)
 * @returns {typeof import('./database-wasm').Database}
 */
function getDatabaseClass() {
  // v1.8.5: Always use WASM for universal Node.js version compatibility
  const { Database } = require('./database-wasm');
  return Database;
}

// Singleton database instance
let db = null;

/**
 * Get the project's .claude directory path
 */
function getProjectDir() {
  return path.join(process.cwd(), '.claude');
}

/**
 * Get the database path for the current project
 */
function getDbPath() {
  return path.join(getProjectDir(), 'experiences.db');
}

/**
 * Get the token directory for the current project
 */
function getTokenDir() {
  return path.join(getProjectDir(), 'tokens');
}

/**
 * Get the config path for the current project
 */
function getConfigPath() {
  return path.join(getProjectDir(), 'config.json');
}

/**
 * Ensure we're in a valid project context
 * Creates .claude directory if in a valid project but missing
 */
function ensureProjectContext() {
  const cwd = process.cwd();
  const claudeDir = path.join(cwd, '.claude');
  const gitDir = path.join(cwd, '.git');
  const packageJson = path.join(cwd, 'package.json');

  // Check for project indicators
  if (!fs.existsSync(claudeDir) && !fs.existsSync(gitDir) && !fs.existsSync(packageJson)) {
    const { ValidationError } = require('./validation');
    throw new ValidationError(
      'No project context detected',
      'This tool requires a project directory.\n\n' +
      'Options:\n' +
      '1. Run from a directory with .claude/, .git/, or package.json\n' +
      '2. Initialize: npx unified-mcp-server --init\n\n' +
      'Current directory: ' + cwd
    );
  }

  // Create .claude directory if it doesn't exist but we're in a valid project
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.mkdirSync(path.join(claudeDir, 'tokens'), { recursive: true });
  }

  // Ensure tokens directory exists
  const tokenDir = path.join(claudeDir, 'tokens');
  if (!fs.existsSync(tokenDir)) {
    fs.mkdirSync(tokenDir, { recursive: true });
  }

  return claudeDir;
}

/**
 * Ensure global Claude Code configuration is set up
 */
function ensureGlobalConfig() {
  let configUpdated = false;
  const claudeDir = path.join(os.homedir(), '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');
  const hooksDir = path.join(claudeDir, 'hooks');

  // 1. Ensure ~/.claude/ directory exists
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
    configUpdated = true;
  }

  // 2. Load or create settings.json
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (e) {
      settings = {};
    }
  }

  // 3. Clean up stale mcpServers from settings.json (v1.9.1)
  // mcpServers in settings.json is silently ignored by Claude Code.
  // MCP servers must be registered via ~/.claude.json (user scope) or .mcp.json (project scope).
  // See: https://github.com/anthropics/claude-code/issues/24477
  if (settings.mcpServers) {
    delete settings.mcpServers;
    configUpdated = true;
  }

  // 4. Ensure hooks config exists
  if (!settings.hooks) {
    settings.hooks = {};
  }

  const hookFiles = {
    'SessionStart': 'session-start.cjs',
    'UserPromptSubmit': 'user-prompt-submit.cjs',
    'PreToolUse': 'pre-tool-use.cjs',
    'PostToolUse': 'post-tool-use.cjs',
    'PreCompact': 'pre-compact.cjs',
    'Stop': 'stop.cjs'
  };

  for (const [hookType, fileName] of Object.entries(hookFiles)) {
    const hookPath = path.join(hooksDir, fileName);
    if (!settings.hooks[hookType]) {
      settings.hooks[hookType] = [{ hooks: [{ type: 'command', command: hookPath }] }];
      configUpdated = true;
    }
  }

  // 5. Write settings if changed
  if (configUpdated) {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  }

  // 6. Ensure hooks directory exists
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
    configUpdated = true;
  }

  // 7. Install hook files if missing
  const sourceDir = path.join(__dirname, '..', 'hooks');
  for (const [hookType, fileName] of Object.entries(hookFiles)) {
    const destPath = path.join(hooksDir, fileName);
    const sourcePath = path.join(sourceDir, fileName);
    if (!fs.existsSync(destPath) && fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, destPath);
      configUpdated = true;
    }
  }

  return configUpdated;
}

/**
 * Get the migrations directory path
 */
function getMigrationsDir() {
  return path.join(__dirname, '..', 'migrations');
}

/**
 * Run database migrations (Flyway-style numbered SQL files)
 * Migrations are idempotent - safe to re-run
 * @param {Database} database - Database instance
 * @returns {Object} - Migration results {applied: [], skipped: [], errors: []}
 */
function runMigrations(database) {
  const migrationsDir = getMigrationsDir();
  const results = { applied: [], skipped: [], errors: [] };

  // Ensure migrations directory exists
  if (!fs.existsSync(migrationsDir)) {
    return results;
  }

  // Get list of SQL migration files, sorted by number
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.match(/^\d{3}_.*\.sql$/))
    .sort();

  if (files.length === 0) {
    return results;
  }

  // Get currently applied migrations
  const appliedRow = database.prepare('SELECT MAX(version) as v FROM schema_info').get();
  const currentVersion = appliedRow?.v || 0;

  for (const file of files) {
    // Extract migration number from filename (e.g., 001_add_tracking.sql -> 1)
    const match = file.match(/^(\d{3})_/);
    if (!match) continue;

    const migrationNumber = parseInt(match[1], 10);

    // Skip if already applied
    if (migrationNumber <= currentVersion) {
      results.skipped.push({ file, version: migrationNumber, reason: 'already applied' });
      continue;
    }

    // Read and execute migration
    const migrationPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(migrationPath, 'utf8');

    try {
      // Split into individual statements and execute each
      // This handles ALTER TABLE which can't be in transactions in SQLite
      // Remove comment lines first, then split on semicolons
      const cleanedSql = sql
        .split('\n')
        .filter(line => !line.trim().startsWith('--'))
        .join('\n');

      const statements = cleanedSql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const stmt of statements) {
        try {
          database.exec(stmt);
        } catch (e) {
          // Ignore "duplicate column" errors for idempotent ALTER TABLE
          if (!e.message.includes('duplicate column')) {
            throw e;
          }
        }
      }

      // Record migration as applied
      database.prepare('INSERT OR REPLACE INTO schema_info (version) VALUES (?)').run(migrationNumber);
      results.applied.push({ file, version: migrationNumber });
    } catch (e) {
      results.errors.push({ file, version: migrationNumber, error: e.message });
    }
  }

  return results;
}

/**
 * Check if a database lock is currently held
 * @param {string} dbPath - Path to the database file
 * @returns {boolean} true if .lock exists
 */
function isLockHeld(dbPath) {
  return fs.existsSync(dbPath + '.lock');
}

/**
 * Clean up stale SQLite artifacts before database initialization
 * v1.10.1: coldStart parameter — only remove .lock on MCP server cold start
 * v1.9.5: Remove .lock unconditionally — at startup, no valid process holds it
 * v1.8.7: Handle both files AND directories (node-sqlite3-wasm uses fs.mkdirSync for .lock)
 * v1.8.6: Initial implementation
 *
 * @param {string} dbPath - Path to the database file
 * @param {Object} [options]
 * @param {boolean} [options.coldStart=false] - true for MCP server startup (safe to remove locks)
 */
function cleanupStaleArtifacts(dbPath, { coldStart = false } = {}) {
  // v1.10.1: Only remove .lock on cold start (MCP server mode).
  // CLI commands (--install, --init) use coldStart=false to avoid removing
  // a lock held by a running server, which causes database corruption.
  const lockPath = dbPath + '.lock';
  if (coldStart && fs.existsSync(lockPath)) {
    try {
      const stat = fs.statSync(lockPath);
      if (stat.isDirectory()) {
        fs.rmdirSync(lockPath);
      } else {
        fs.unlinkSync(lockPath);
      }
      console.error(`[unified-mcp] Removed stale lock: ${path.basename(lockPath)}`);
    } catch (e) {
      // Ignore cleanup errors - best effort
    }
  }

  // SQLite artifacts use age threshold — may indicate incomplete writes
  const staleExtensions = ['-journal', '-wal', '-shm'];
  const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

  for (const ext of staleExtensions) {
    const artifactPath = dbPath + ext;
    if (fs.existsSync(artifactPath)) {
      try {
        const stat = fs.statSync(artifactPath);
        const ageMs = Date.now() - stat.mtimeMs;
        if (ageMs > STALE_THRESHOLD_MS) {
          if (stat.isDirectory()) {
            fs.rmdirSync(artifactPath);
          } else {
            fs.unlinkSync(artifactPath);
          }
          console.error(`[unified-mcp] Cleaned stale artifact: ${path.basename(artifactPath)} (age: ${Math.round(ageMs / 60000)}min)`);
        }
      } catch (e) {
        // Ignore cleanup errors - best effort
      }
    }
  }
}

/**
 * Initialize database connection and schema
 * @param {Object} [options]
 * @param {boolean} [options.coldStart=false] - true for MCP server startup (safe to remove stale locks)
 */
function initDatabase({ coldStart = false } = {}) {
  ensureProjectContext();

  const dbPath = getDbPath();

  // v1.8.6: Clean up stale artifacts before opening database
  // v1.10.1: Pass coldStart to control lock removal behavior
  cleanupStaleArtifacts(dbPath, { coldStart });
  const Database = getDatabaseClass();
  db = new Database(dbPath);
  db.pragma('journal_mode = DELETE');

  // Schema version tracking (used by migration runner)
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_info (
      version INTEGER PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const versionRow = db.prepare('SELECT MAX(version) as v FROM schema_info').get();
  if (!versionRow || !versionRow.v) {
    db.prepare('INSERT INTO schema_info (version) VALUES (?)').run(0);
  }

  // v1.5.3: experiences table with archived_at and archive_reason
  db.exec(`
    CREATE TABLE IF NOT EXISTS experiences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('effective', 'ineffective')),
      domain TEXT NOT NULL CHECK(domain IN ('Tools', 'Protocol', 'Communication', 'Process', 'Debugging', 'Decision')),
      situation TEXT NOT NULL,
      approach TEXT NOT NULL,
      outcome TEXT NOT NULL,
      reasoning TEXT NOT NULL,
      confidence REAL CHECK(confidence BETWEEN 0 AND 1),
      tags TEXT,
      revision_of INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      archived_at INTEGER DEFAULT NULL,
      archive_reason TEXT DEFAULT NULL,
      FOREIGN KEY (revision_of) REFERENCES experiences(id)
    );

    CREATE INDEX IF NOT EXISTS idx_experiences_type ON experiences(type);
    CREATE INDEX IF NOT EXISTS idx_experiences_domain ON experiences(domain);
    CREATE INDEX IF NOT EXISTS idx_experiences_created ON experiences(created_at);

    CREATE VIRTUAL TABLE IF NOT EXISTS experiences_fts USING fts5(
      situation, approach, outcome, reasoning, tags,
      content=experiences, content_rowid=id,
      tokenize='porter unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS experiences_ai AFTER INSERT ON experiences BEGIN
      INSERT INTO experiences_fts(rowid, situation, approach, outcome, reasoning, tags)
      VALUES (new.id, new.situation, new.approach, new.outcome, new.reasoning, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS experiences_ad AFTER DELETE ON experiences BEGIN
      DELETE FROM experiences_fts WHERE rowid = old.id;
    END;

    CREATE TRIGGER IF NOT EXISTS experiences_au AFTER UPDATE ON experiences BEGIN
      DELETE FROM experiences_fts WHERE rowid = old.id;
      INSERT INTO experiences_fts(rowid, situation, approach, outcome, reasoning, tags)
      VALUES (new.id, new.situation, new.approach, new.outcome, new.reasoning, new.tags);
    END;
  `);

  // Reasoning sessions
  db.exec(`
    CREATE TABLE IF NOT EXISTS reasoning_sessions (
      session_id TEXT PRIMARY KEY,
      problem TEXT NOT NULL,
      user_intent TEXT,
      phase TEXT CHECK(phase IN ('analyze', 'gather', 'reason', 'finalized')),
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      finalized_at INTEGER,
      conclusion TEXT,
      experience_id INTEGER,
      FOREIGN KEY (experience_id) REFERENCES experiences(id)
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_phase ON reasoning_sessions(phase);
    CREATE INDEX IF NOT EXISTS idx_sessions_created ON reasoning_sessions(created_at);
  `);

  // Reasoning thoughts
  db.exec(`
    CREATE TABLE IF NOT EXISTS reasoning_thoughts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      thought_number INTEGER NOT NULL,
      thought TEXT NOT NULL,
      confidence REAL CHECK(confidence BETWEEN 0 AND 1),
      is_revision BOOLEAN DEFAULT 0,
      revises_thought INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (session_id) REFERENCES reasoning_sessions(session_id),
      FOREIGN KEY (revises_thought) REFERENCES reasoning_thoughts(id)
    );

    CREATE INDEX IF NOT EXISTS idx_thoughts_session ON reasoning_thoughts(session_id);
  `);

  // Workflow sessions
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_sessions (
      session_id TEXT PRIMARY KEY,
      preset TEXT,
      gates_passed TEXT,
      steps_completed TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      expires_at INTEGER,
      active BOOLEAN DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_workflow_active ON workflow_sessions(active);
  `);

  // Activity log
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER DEFAULT (strftime('%s', 'now')),
      event_type TEXT NOT NULL,
      session_id TEXT,
      details TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_log_timestamp ON activity_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_log_type ON activity_log(event_type);
  `);

  // Run migrations (Flyway-style numbered SQL files)
  const migrationResults = runMigrations(db);
  if (migrationResults.applied.length > 0) {
    console.error(`[unified-mcp] Applied ${migrationResults.applied.length} migration(s):`,
      migrationResults.applied.map(m => m.file).join(', '));
  }
  if (migrationResults.errors.length > 0) {
    console.error('[unified-mcp] Migration errors:', migrationResults.errors);
  }

  return db;
}

// Track database initialization error for graceful degradation
let dbInitError = null;

/**
 * Get database connection (singleton)
 * Throws ValidationError if initialization failed (tools return meaningful errors)
 */
function getDatabase() {
  if (dbInitError) {
    const { ValidationError } = require('./validation');
    throw new ValidationError(
      'Database unavailable',
      `Database initialization failed: ${dbInitError.message}\n\n` +
      'Possible causes:\n' +
      '1. Not in a valid project directory (no .git, package.json, or .claude/)\n' +
      '2. Database file is corrupted or inaccessible\n' +
      '3. SQLite module failed to load\n\n' +
      'Run health_check tool for diagnostics, or try:\n' +
      '  npx mpalpha/unified-mcp-server --init'
    );
  }
  if (!db) {
    try {
      initDatabase();
    } catch (e) {
      dbInitError = e;
      console.error('[unified-mcp] Database initialization failed:', e.message);
      console.error('[unified-mcp] Server will continue - tools requiring DB will return errors');
      const { ValidationError } = require('./validation');
      throw new ValidationError(
        'Database unavailable',
        `Database initialization failed: ${e.message}\n\n` +
        'Possible causes:\n' +
        '1. Not in a valid project directory (no .git, package.json, or .claude/)\n' +
        '2. Database file is corrupted or inaccessible\n' +
        '3. SQLite module failed to load\n\n' +
        'Run health_check tool for diagnostics, or try:\n' +
        '  npx mpalpha/unified-mcp-server --init'
      );
    }
  }
  return db;
}

/**
 * Try to get database without throwing (for health checks)
 * Attempts initialization if not yet done, but catches errors
 * @returns {Database|null}
 */
function tryGetDatabase() {
  if (dbInitError) {
    return null;
  }
  if (!db) {
    try {
      initDatabase();
    } catch (e) {
      dbInitError = e;
      return null;
    }
  }
  return db;
}

/**
 * Check if database is available
 * @returns {boolean}
 */
function isDatabaseAvailable() {
  if (dbInitError) return false;
  if (db) return true;
  // Try to initialize
  try {
    initDatabase();
    return true;
  } catch (e) {
    dbInitError = e;
    return false;
  }
}

/**
 * Get database initialization error (if any)
 * @returns {Error|null}
 */
function getDatabaseError() {
  return dbInitError;
}

/**
 * Log activity to database
 */
function logActivity(eventType, sessionId, details) {
  try {
    const database = getDatabase();
    database.prepare(`
      INSERT INTO activity_log (event_type, session_id, details)
      VALUES (?, ?, ?)
    `).run(eventType, sessionId, JSON.stringify(details));
  } catch (e) {
    // Don't fail if logging fails
    console.error('[unified-mcp] Warning: Failed to log activity:', e.message);
  }
}

module.exports = {
  getProjectDir,
  getDbPath,
  getTokenDir,
  getConfigPath,
  getMigrationsDir,
  ensureProjectContext,
  ensureGlobalConfig,
  isLockHeld,
  cleanupStaleArtifacts,
  initDatabase,
  runMigrations,
  getDatabase,
  tryGetDatabase,
  isDatabaseAvailable,
  getDatabaseError,
  logActivity
};
