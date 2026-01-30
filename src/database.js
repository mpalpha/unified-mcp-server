/**
 * Database Module - SQLite with FTS5 full-text search
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const os = require('os');

const MCP_DIR = path.join(os.homedir(), '.unified-mcp');
const TOKEN_DIR = path.join(MCP_DIR, 'tokens');
const DB_FILE = path.join(MCP_DIR, 'data.db');

let db = null;

/**
 * Initialize database connection and schema
 */
function initDatabase() {
  // Ensure directories exist
  if (!fs.existsSync(MCP_DIR)) {
    fs.mkdirSync(MCP_DIR, { recursive: true });
  }

  const tokenDir = path.join(MCP_DIR, 'tokens');
  if (!fs.existsSync(tokenDir)) {
    fs.mkdirSync(tokenDir, { recursive: true });
  }

  const hooksDir = path.join(MCP_DIR, 'hooks');
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  // Connect to database
  db = new Database(DB_FILE);
  db.pragma('journal_mode = WAL');

  // Create schema
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
      scope TEXT DEFAULT 'user' CHECK(scope IN ('user', 'project')),
      tags TEXT,
      revision_of INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (revision_of) REFERENCES experiences(id)
    );

    CREATE TABLE IF NOT EXISTS experiences_fts (
      situation TEXT,
      approach TEXT,
      outcome TEXT,
      reasoning TEXT
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS experiences_fts USING fts5(
      situation, approach, outcome, reasoning,
      content='experiences',
      content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS experiences_ai AFTER INSERT ON experiences BEGIN
      INSERT INTO experiences_fts(rowid, situation, approach, outcome, reasoning)
      VALUES (new.id, new.situation, new.approach, new.outcome, new.reasoning);
    END;

    CREATE TRIGGER IF NOT EXISTS experiences_ad AFTER DELETE ON experiences BEGIN
      DELETE FROM experiences_fts WHERE rowid = old.id;
    END;

    CREATE TRIGGER IF NOT EXISTS experiences_au AFTER UPDATE ON experiences BEGIN
      DELETE FROM experiences_fts WHERE rowid = old.id;
      INSERT INTO experiences_fts(rowid, situation, approach, outcome, reasoning)
      VALUES (new.id, new.situation, new.approach, new.outcome, new.reasoning);
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
  MCP_DIR,
  TOKEN_DIR,
  DB_FILE,
  initDatabase,
  getDatabase,
  logActivity
};