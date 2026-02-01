/**
 * Database Module - SQLite with FTS5 full-text search
 *
 * v1.4.0: Project-scoped storage in .claude/ directory
 * No global storage - all data is per-project
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

let db = null;

/**
 * Get the project's .claude directory path
 * @returns {string} Path to .claude directory in current working directory
 */
function getProjectDir() {
  return path.join(process.cwd(), '.claude');
}

/**
 * Get the database path for the current project
 * @returns {string} Path to experiences.db
 */
function getDbPath() {
  return path.join(getProjectDir(), 'experiences.db');
}

/**
 * Get the token directory for the current project
 * @returns {string} Path to tokens directory
 */
function getTokenDir() {
  return path.join(getProjectDir(), 'tokens');
}

/**
 * Ensure we're in a valid project context
 * Creates .claude directory if in a valid project but missing
 * @throws {Error} If not in a valid project
 */
function ensureProjectContext() {
  const cwd = process.cwd();
  const claudeDir = path.join(cwd, '.claude');
  const gitDir = path.join(cwd, '.git');
  const packageJson = path.join(cwd, 'package.json');

  // Check for project indicators
  if (!fs.existsSync(claudeDir) && !fs.existsSync(gitDir) && !fs.existsSync(packageJson)) {
    throw new Error(
      'No project context detected. ' +
      'Run from a directory with .claude/, .git/, or package.json, ' +
      'or run: npx unified-mcp-server --init'
    );
  }

  // Create .claude directory if it doesn't exist but we're in a valid project
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }

  // Ensure tokens directory exists
  const tokenDir = path.join(claudeDir, 'tokens');
  if (!fs.existsSync(tokenDir)) {
    fs.mkdirSync(tokenDir, { recursive: true });
  }

  return claudeDir;
}

/**
 * Initialize database connection and schema
 * v1.4.0: Database is project-local in .claude/experiences.db
 */
function initDatabase() {
  // Ensure project context exists before accessing database
  ensureProjectContext();

  // Connect to project-local database
  const dbPath = getDbPath();
  db = new Database(dbPath);

  // Use DELETE mode for better compatibility with short-lived connections
  db.pragma('journal_mode = DELETE');

  // v1.4.0: Create schema_info table for version tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_info (
      version INTEGER PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Check and set schema version
  const versionRow = db.prepare('SELECT MAX(version) as v FROM schema_info').get();
  if (!versionRow || !versionRow.v) {
    db.prepare('INSERT INTO schema_info (version) VALUES (?)').run(1);
  }

  // v1.4.0: Create experiences table WITHOUT scope field
  // All experiences are project-scoped by their location in .claude/
  db.exec(`
    CREATE TABLE IF NOT EXISTS experiences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('effective', 'ineffective')),
      domain TEXT NOT NULL CHECK(domain IN ('Tools', 'Protocol', 'Communication', 'Process', 'Debugging', 'Decision')),
      situation TEXT NOT NULL,
      approach TEXT NOT NULL,
      outcome TEXT NOT NULL,
      reasoning TEXT NOT NULL,
      confidence REAL CHECK(confidence >= 0 AND confidence <= 1),
      tags TEXT,
      revision_of INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (revision_of) REFERENCES experiences(id)
    );

    CREATE INDEX IF NOT EXISTS idx_experiences_type ON experiences(type);
    CREATE INDEX IF NOT EXISTS idx_experiences_domain ON experiences(domain);
    CREATE INDEX IF NOT EXISTS idx_experiences_created ON experiences(created_at);

    CREATE VIRTUAL TABLE IF NOT EXISTS experiences_fts USING fts5(
      situation, approach, outcome, reasoning, tags,
      content='experiences',
      content_rowid='id',
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

    CREATE TABLE IF NOT EXISTS reasoning_sessions (
      session_id TEXT PRIMARY KEY,
      problem TEXT,
      intent TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      concluded BOOLEAN DEFAULT 0,
      conclusion TEXT,
      confidence REAL
    );

    CREATE TABLE IF NOT EXISTS reasoning_thoughts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      thought_number INTEGER NOT NULL,
      thought TEXT NOT NULL,
      confidence REAL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (session_id) REFERENCES reasoning_sessions(session_id)
    );

    CREATE TABLE IF NOT EXISTS reasoning_context (
      session_id TEXT PRIMARY KEY,
      gathered_context TEXT,
      sources TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (session_id) REFERENCES reasoning_sessions(session_id)
    );

    CREATE TABLE IF NOT EXISTS workflow_sessions (
      session_id TEXT PRIMARY KEY,
      preset_name TEXT,
      current_phase TEXT,
      phases_completed TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER DEFAULT (strftime('%s', 'now')),
      event_type TEXT NOT NULL,
      session_id TEXT,
      details TEXT
    );
  `);

  return db;
}

/**
 * Get database connection
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
  const database = getDatabase();
  database.prepare(`
    INSERT INTO activity_log (event_type, session_id, details)
    VALUES (?, ?, ?)
  `).run(eventType, sessionId, JSON.stringify(details));
}

module.exports = {
  // v1.4.0: Project-scoped path functions
  getProjectDir,
  getDbPath,
  getTokenDir,
  ensureProjectContext,
  initDatabase,
  getDatabase,
  logActivity
};