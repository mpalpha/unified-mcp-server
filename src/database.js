/**
 * Database Module - SQLite with FTS5 full-text search
 *
 * v1.7.0: Synchronized with index.js schema
 * v1.4.0: Project-scoped storage in .claude/ directory
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const os = require('os');

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

  // 3. Ensure mcpServers entry exists
  if (!settings.mcpServers) {
    settings.mcpServers = {};
  }
  if (!settings.mcpServers['unified-mcp']) {
    settings.mcpServers['unified-mcp'] = {
      command: 'npx',
      args: ['mpalpha/unified-mcp-server']
    };
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
 * Initialize database connection and schema
 */
function initDatabase() {
  ensureProjectContext();

  const dbPath = getDbPath();
  db = new Database(dbPath);
  db.pragma('journal_mode = DELETE');

  // Schema version tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_info (
      version INTEGER PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const versionRow = db.prepare('SELECT MAX(version) as v FROM schema_info').get();
  if (!versionRow || !versionRow.v) {
    db.prepare('INSERT INTO schema_info (version) VALUES (?)').run(1);
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

  return db;
}

/**
 * Get database connection (singleton)
 */
function getDatabase() {
  if (!db) {
    initDatabase();
  }
  return db;
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
  ensureProjectContext,
  ensureGlobalConfig,
  initDatabase,
  getDatabase,
  logActivity
};
