#!/usr/bin/env node

/**
 * Unified MCP Server v1.4.0
 *
 * Combines memory-augmented reasoning and protocol enforcement with modern tool ergonomics.
 * - 26 atomic, composable tools (not monolithic)
 * - Project-scoped experiences (v1.4.0)
 * - Zero-config defaults
 * - Automated hook installation
 * - Comprehensive documentation
 *
 * Version: 1.4.0
 * License: MIT
 * Author: Jason Lusk <jason@jasonlusk.com>
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const crypto = require('crypto');

const VERSION = '1.5.1';

// v1.4.0: Project-local storage in .claude/ directory
// All data is stored per-project, no global storage

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
 * Get the config path for the current project
 * @returns {string} Path to config.json
 */
function getConfigPath() {
  return path.join(getProjectDir(), 'config.json');
}

/**
 * Ensure we're in a valid project context
 * Creates .claude directory if in a valid project but missing
 * @throws {ValidationError} If not in a valid project
 */
function ensureProjectContext() {
  const cwd = process.cwd();
  const claudeDir = path.join(cwd, '.claude');
  const gitDir = path.join(cwd, '.git');
  const packageJson = path.join(cwd, 'package.json');

  // Check for project indicators
  if (!fs.existsSync(claudeDir) && !fs.existsSync(gitDir) && !fs.existsSync(packageJson)) {
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

// Legacy constants for backward compatibility during transition
// DEPRECATED: Use getProjectDir(), getDbPath(), getTokenDir() instead
const MCP_DIR = getProjectDir();
const TOKEN_DIR = getTokenDir();
const DB_PATH = getDbPath();

// Custom error class for validation errors
class ValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ValidationError';
    this.code = -32602; // Invalid params (JSON-RPC)
    this.details = details || message;
  }
}

// Initialize database
// v1.4.0: Database is project-local, created in ensureProjectContext or --init
function initDatabase() {
  // Ensure project context exists before accessing database
  ensureProjectContext();

  const dbPath = getDbPath();
  const db = new Database(dbPath);

  // Use DELETE mode (default) for better compatibility with short-lived connections
  // WAL mode can cause corruption with rapid open/close cycles in tests
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
      confidence REAL CHECK(confidence BETWEEN 0 AND 1),
      tags TEXT,
      revision_of INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (revision_of) REFERENCES experiences(id)
    );

    CREATE INDEX IF NOT EXISTS idx_experiences_type ON experiences(type);
    CREATE INDEX IF NOT EXISTS idx_experiences_domain ON experiences(domain);
    CREATE INDEX IF NOT EXISTS idx_experiences_created ON experiences(created_at);

    -- FTS5 virtual table for full-text search with BM25 ranking
    CREATE VIRTUAL TABLE IF NOT EXISTS experiences_fts USING fts5(
      situation,
      approach,
      outcome,
      reasoning,
      tags,
      content=experiences,
      content_rowid=id,
      tokenize='porter unicode61'
    );

    -- Triggers to keep FTS5 in sync
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

  // Create reasoning_sessions table
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

  // Create reasoning_thoughts table
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

  // Create workflow_sessions table
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

  // Create activity_log table
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

// Initialize database
const db = initDatabase();

// ============================================================================
// KNOWLEDGE MANAGEMENT TOOLS (6 tools)
// ============================================================================

/**
 * Tool 1: record_experience
 * Record a working knowledge pattern (effective or ineffective approach)
 */
function recordExperience(params) {
  // Validate required parameters
  if (!params.type || !['effective', 'ineffective'].includes(params.type)) {
    throw new ValidationError(
      'Missing or invalid "type" parameter',
      'Required: type = "effective" | "ineffective"\\n\\n' +
      'Example:\\n' +
      JSON.stringify({
        type: 'effective',
        domain: 'Tools',
        situation: 'Need to search code for patterns',
        approach: 'Used Grep tool instead of bash grep',
        outcome: 'Search completed faster with better formatting',
        reasoning: 'Specialized tools provide better UX than raw commands'
      }, null, 2)
    );
  }

  const validDomains = ['Tools', 'Protocol', 'Communication', 'Process', 'Debugging', 'Decision'];
  if (!params.domain || !validDomains.includes(params.domain)) {
    throw new ValidationError(
      'Missing or invalid "domain" parameter',
      `Required: domain = ${validDomains.join(' | ')}\\n\\n` +
      'Example: domain: "Tools"'
    );
  }

  if (!params.situation || !params.approach || !params.outcome || !params.reasoning) {
    throw new ValidationError(
      'Missing required parameters',
      'Required: situation, approach, outcome, reasoning\\n\\n' +
      'All four fields must be provided to record an experience.'
    );
  }

  // v1.4.0: scope parameter removed - all experiences are project-scoped by location

  // Check for duplicates using Dice coefficient
  const duplicate = findDuplicate(params, 0.9);
  if (duplicate) {
    return {
      recorded: false,
      duplicate_id: duplicate.id,
      similarity: duplicate.similarity,
      message: `Similar experience already exists (ID: ${duplicate.id}, similarity: ${(duplicate.similarity * 100).toFixed(1)}%). Consider updating instead.`
    };
  }

  // Insert experience (v1.4.0: no scope field)
  const stmt = db.prepare(`
    INSERT INTO experiences (type, domain, situation, approach, outcome, reasoning, confidence, tags, revision_of)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    params.type,
    params.domain,
    params.situation,
    params.approach,
    params.outcome,
    params.reasoning,
    params.confidence || null,
    params.tags ? JSON.stringify(params.tags) : null,
    params.revision_of || null
  );

  // Log activity
  logActivity('experience_recorded', null, {
    experience_id: result.lastInsertRowid,
    type: params.type,
    domain: params.domain
  });

  return {
    recorded: true,
    experience_id: result.lastInsertRowid,
    message: `Experience recorded successfully (ID: ${result.lastInsertRowid})`
  };
}

// v1.4.0: detectScope() removed - all experiences are project-scoped by location

/**
 * Find duplicate experience using Dice coefficient similarity
 */
function findDuplicate(params, threshold) {
  const candidates = db.prepare(`
    SELECT id, situation, approach, outcome, reasoning
    FROM experiences
    WHERE domain = ? AND type = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).all(params.domain, params.type);

  const newText = `${params.situation} ${params.approach} ${params.outcome} ${params.reasoning}`;

  for (const candidate of candidates) {
    const existingText = `${candidate.situation} ${candidate.approach} ${candidate.outcome} ${candidate.reasoning}`;
    const similarity = diceCoefficient(newText, existingText);

    if (similarity >= threshold) {
      return { id: candidate.id, similarity };
    }
  }

  return null;
}

/**
 * Calculate Dice coefficient similarity between two strings
 */
function diceCoefficient(str1, str2) {
  const bigrams1 = getBigrams(str1);
  const bigrams2 = getBigrams(str2);

  const intersection = bigrams1.filter(b => bigrams2.includes(b)).length;
  return (2.0 * intersection) / (bigrams1.length + bigrams2.length);
}

function getBigrams(str) {
  const normalized = str.toLowerCase().replace(/\s+/g, ' ').trim();
  const bigrams = [];
  for (let i = 0; i < normalized.length - 1; i++) {
    bigrams.push(normalized.substring(i, i + 2));
  }
  return bigrams;
}

/**
 * Tool 2: search_experiences
 * Search for relevant working knowledge using natural language queries
 */
function searchExperiences(params) {
  if (!params.query || typeof params.query !== 'string') {
    throw new ValidationError(
      'Missing or invalid "query" parameter',
      'Required: query = string (your search terms)\\n\\n' +
      'Example: query: "authentication JWT tokens"'
    );
  }

  // Split query into terms, quote each individually, join with OR
  // This enables partial matching with BM25 relevance ranking
  const terms = params.query.trim().split(/\s+/)
    .map(term => `"${term.replace(/"/g, '""')}"`)
    .join(' OR ');

  let sql = `
    SELECT e.*, bm25(experiences_fts) as rank
    FROM experiences e
    JOIN experiences_fts ON e.id = experiences_fts.rowid
    WHERE experiences_fts MATCH ?
  `;

  const sqlParams = [terms];

  // Add filters
  if (params.domain) {
    sql += ' AND e.domain = ?';
    sqlParams.push(params.domain);
  }

  if (params.type) {
    sql += ' AND e.type = ?';
    sqlParams.push(params.type);
  }

  if (params.min_confidence) {
    sql += ' AND e.confidence >= ?';
    sqlParams.push(params.min_confidence);
  }

  sql += ' ORDER BY rank';

  const limit = Math.min(params.limit || 20, 100);
  const offset = params.offset || 0;
  sql += ` LIMIT ? OFFSET ?`;
  sqlParams.push(limit, offset);

  const results = db.prepare(sql).all(...sqlParams);

  // Parse tags from JSON
  results.forEach(r => {
    if (r.tags) {
      try {
        r.tags = JSON.parse(r.tags);
      } catch (e) {
        r.tags = [];
      }
    } else {
      r.tags = [];
    }
  });

  return {
    results: results,
    count: results.length,
    query: params.query,
    filters: {
      domain: params.domain || null,
      type: params.type || null,
      min_confidence: params.min_confidence || null
    }
  };
}

/**
 * Tool 3: get_experience
 * Retrieve a specific experience by ID with full details
 */
function getExperience(params) {
  if (!params.id || typeof params.id !== 'number') {
    throw new ValidationError(
      'Missing or invalid "id" parameter',
      'Required: id = number (experience ID from search results)\\n\\n' +
      'Example: id: 42'
    );
  }

  const experience = db.prepare(`
    SELECT * FROM experiences WHERE id = ?
  `).get(params.id);

  if (!experience) {
    throw new ValidationError(
      `Experience not found: ID ${params.id}`,
      `No experience exists with ID ${params.id}. Use search_experiences to find experiences.`
    );
  }

  // Parse tags
  if (experience.tags) {
    try {
      experience.tags = JSON.parse(experience.tags);
    } catch (e) {
      experience.tags = [];
    }
  }

  // Get revision history if applicable
  if (experience.revision_of) {
    experience.previous_version = db.prepare(`
      SELECT id, situation, approach, outcome, created_at
      FROM experiences WHERE id = ?
    `).get(experience.revision_of);
  }

  // Get revisions that supersede this one
  experience.newer_versions = db.prepare(`
    SELECT id, situation, approach, outcome, created_at
    FROM experiences WHERE revision_of = ?
    ORDER BY created_at DESC
  `).all(params.id);

  return experience;
}

/**
 * Tool 4: update_experience
 * Update an existing experience (creates revision, preserves history)
 */
function updateExperience(params) {
  if (!params.id || typeof params.id !== 'number') {
    throw new ValidationError(
      'Missing or invalid "id" parameter',
      'Required: id = number (experience ID to update)'
    );
  }

  if (!params.changes || typeof params.changes !== 'object') {
    throw new ValidationError(
      'Missing or invalid "changes" parameter',
      'Required: changes = object (fields to update)\\n\\n' +
      'Example:\\n' +
      JSON.stringify({
        id: 42,
        changes: { outcome: 'Updated outcome', reasoning: 'Refined reasoning' },
        reason: 'Clarified based on new evidence'
      }, null, 2)
    );
  }

  if (!params.reason) {
    throw new ValidationError(
      'Missing "reason" parameter',
      'Required: reason = string (why updating)\\n\\n' +
      'Always provide a reason for updating experiences to maintain audit trail.'
    );
  }

  // Get original experience
  const original = db.prepare(`SELECT * FROM experiences WHERE id = ?`).get(params.id);
  if (!original) {
    throw new ValidationError(
      `Experience not found: ID ${params.id}`,
      `No experience exists with ID ${params.id}.`
    );
  }

  // Create new revision (v1.4.0: scope field removed)
  const fields = ['type', 'domain', 'situation', 'approach', 'outcome', 'reasoning', 'confidence', 'tags'];
  const newData = { ...original };

  for (const field of fields) {
    if (params.changes[field] !== undefined) {
      newData[field] = params.changes[field];
    }
  }

  const stmt = db.prepare(`
    INSERT INTO experiences (type, domain, situation, approach, outcome, reasoning, confidence, tags, revision_of)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    newData.type,
    newData.domain,
    newData.situation,
    newData.approach,
    newData.outcome,
    newData.reasoning,
    newData.confidence,
    newData.tags,
    params.id
  );

  logActivity('experience_updated', null, {
    original_id: params.id,
    new_id: result.lastInsertRowid,
    reason: params.reason
  });

  return {
    updated: true,
    original_id: params.id,
    new_id: result.lastInsertRowid,
    message: `Experience updated (new revision ID: ${result.lastInsertRowid}). Original preserved for history.`
  };
}

/**
 * Tool 5: tag_experience
 * Add searchable tags to experiences for better organization
 */
function tagExperience(params) {
  if (!params.id || typeof params.id !== 'number') {
    throw new ValidationError(
      'Missing or invalid "id" parameter',
      'Required: id = number (experience ID)'
    );
  }

  if (!params.tags || !Array.isArray(params.tags)) {
    throw new ValidationError(
      'Missing or invalid "tags" parameter',
      'Required: tags = array of strings\\n\\n' +
      'Example: tags: ["authentication", "jwt", "security"]'
    );
  }

  // Get existing tags
  const experience = db.prepare(`SELECT tags FROM experiences WHERE id = ?`).get(params.id);
  if (!experience) {
    throw new ValidationError(
      `Experience not found: ID ${params.id}`,
      `No experience exists with ID ${params.id}.`
    );
  }

  let existingTags = [];
  if (experience.tags) {
    try {
      existingTags = JSON.parse(experience.tags);
    } catch (e) {
      existingTags = [];
    }
  }

  // Merge tags (deduplicate)
  const allTags = [...new Set([...existingTags, ...params.tags])];

  // Update
  db.prepare(`UPDATE experiences SET tags = ?, updated_at = strftime('%s', 'now') WHERE id = ?`)
    .run(JSON.stringify(allTags), params.id);

  return {
    updated: true,
    experience_id: params.id,
    tags: allTags,
    message: `Tags updated for experience ${params.id}`
  };
}

/**
 * Tool 6: export_experiences
 * Export experiences to JSON or Markdown for sharing/backup
 */
function exportExperiences(params) {
  if (!params.format || !['json', 'markdown'].includes(params.format)) {
    throw new ValidationError(
      'Missing or invalid "format" parameter',
      'Required: format = "json" | "markdown"\\n\\n' +
      'Example: format: "json"'
    );
  }

  // Build query with filters
  let sql = 'SELECT * FROM experiences WHERE 1=1';
  const sqlParams = [];

  if (params.filter) {
    if (params.filter.domain) {
      sql += ' AND domain = ?';
      sqlParams.push(params.filter.domain);
    }
    if (params.filter.type) {
      sql += ' AND type = ?';
      sqlParams.push(params.filter.type);
    }
    // v1.4.0: scope filter removed - all experiences are project-scoped by location
  }

  sql += ' ORDER BY created_at DESC';

  const experiences = db.prepare(sql).all(...sqlParams);

  // Parse tags
  experiences.forEach(e => {
    if (e.tags) {
      try {
        e.tags = JSON.parse(e.tags);
      } catch (err) {
        e.tags = [];
      }
    }
  });

  let output;
  if (params.format === 'json') {
    output = JSON.stringify(experiences, null, 2);
  } else {
    // Markdown format
    output = '# Experiences Export\\n\\n';
    output += `Exported: ${new Date().toISOString()}\\n`;
    output += `Total: ${experiences.length} experiences\\n\\n`;
    output += '---\\n\\n';

    for (const exp of experiences) {
      output += `## Experience ${exp.id}: ${exp.domain}\\n\\n`;
      output += `**Type:** ${exp.type}\\n`;
      output += `**Confidence:** ${exp.confidence || 'N/A'}\\n`;
      // v1.4.0: scope field removed - all experiences are project-scoped by location
      output += `**Tags:** ${exp.tags && exp.tags.length ? exp.tags.join(', ') : 'None'}\\n\\n`;
      output += `### Situation\\n${exp.situation}\\n\\n`;
      output += `### Approach\\n${exp.approach}\\n\\n`;
      output += `### Outcome\\n${exp.outcome}\\n\\n`;
      output += `### Reasoning\\n${exp.reasoning}\\n\\n`;
      output += '---\\n\\n';
    }
  }

  // Write to file if path provided
  if (params.output_path) {
    fs.writeFileSync(params.output_path, output);
    return {
      exported: true,
      count: experiences.length,
      format: params.format,
      output_path: params.output_path,
      message: `Exported ${experiences.length} experiences to ${params.output_path}`
    };
  }

  // Return inline
  return {
    exported: true,
    count: experiences.length,
    format: params.format,
    output: output,
    message: `Exported ${experiences.length} experiences`
  };
}

/**
 * Tool 7: import_experiences (v1.4.0)
 * Import experiences from a JSON file into the current project
 * Enables cross-project knowledge sharing via export/import workflow
 */
function importExperiences(params) {
  if (!params.filename || typeof params.filename !== 'string') {
    throw new ValidationError(
      'Missing or invalid "filename" parameter',
      'Required: filename = string (path to JSON file from export_experiences)\\n\\n' +
      'Example:\\n' +
      JSON.stringify({
        filename: 'exported-experiences.json'
      }, null, 2)
    );
  }

  // Ensure project context
  ensureProjectContext();

  // Check file exists
  if (!fs.existsSync(params.filename)) {
    throw new ValidationError(
      `File not found: ${params.filename}`,
      'Provide the path to a JSON file created by export_experiences.'
    );
  }

  // Read and parse file
  let data;
  try {
    const content = fs.readFileSync(params.filename, 'utf8');
    data = JSON.parse(content);
  } catch (e) {
    throw new ValidationError(
      `Failed to parse JSON file: ${e.message}`,
      'The file must be valid JSON from export_experiences with format: json'
    );
  }

  // Validate structure
  if (!Array.isArray(data)) {
    throw new ValidationError(
      'Invalid export format',
      'Expected an array of experiences from export_experiences'
    );
  }

  // Import each experience
  let imported = 0;
  let skipped = 0;
  const errors = [];

  for (const exp of data) {
    try {
      // Validate required fields
      if (!exp.type || !exp.domain || !exp.situation || !exp.approach || !exp.outcome || !exp.reasoning) {
        skipped++;
        continue;
      }

      // Insert without preserving original ID (let SQLite assign new one)
      const stmt = db.prepare(`
        INSERT INTO experiences (type, domain, situation, approach, outcome, reasoning, confidence, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        exp.type,
        exp.domain,
        exp.situation,
        exp.approach,
        exp.outcome,
        exp.reasoning,
        exp.confidence || null,
        exp.tags ? (typeof exp.tags === 'string' ? exp.tags : JSON.stringify(exp.tags)) : null
      );

      imported++;
    } catch (e) {
      errors.push(`Experience ${exp.id || '?'}: ${e.message}`);
      skipped++;
    }
  }

  logActivity('experiences_imported', null, {
    filename: params.filename,
    imported,
    skipped,
    total: data.length
  });

  return {
    imported,
    skipped,
    total: data.length,
    errors: errors.length > 0 ? errors.slice(0, 5) : undefined, // Show first 5 errors
    message: `Imported ${imported} experiences (${skipped} skipped)`
  };
}

// ============================================================================
// REASONING TOOLS (4 tools - atomic, not monolithic)
// ============================================================================

/**
 * Tool 7: analyze_problem
 * Extract intent, concepts, and priorities from a user request
 */
function analyzeProblem(params) {
  if (!params.problem || typeof params.problem !== 'string') {
    throw new ValidationError(
      'Missing or invalid "problem" parameter',
      'Required: problem = string (user request or question)\\n\\n' +
      'Example:\\n' +
      JSON.stringify({
        problem: 'How to implement user authentication in my React app',
        available_tools: ['search_experiences', 'web_search', 'read_file']
      }, null, 2)
    );
  }

  // Generate session ID
  const sessionId = `reasoning-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Extract key concepts (simple word extraction)
  const words = params.problem.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3);

  const keyConcepts = [...new Set(words)].slice(0, 10);

  // Detect intent patterns
  const userIntent = {
    goal: detectGoal(params.problem),
    priority: detectPriority(params.problem),
    format: detectFormat(params.problem),
    context: detectContext(params.problem)
  };

  // Suggest queries based on problem
  const suggestedQueries = {
    search: {
      query: keyConcepts.slice(0, 5).join(' '),
      patterns: keyConcepts
    },
    localFiles: suggestLocalFiles(params.problem),
    webSearch: {
      query: `${params.problem} best practices 2026`
    }
  };

  // Check available tools
  const availableTools = params.available_tools || [];
  if (availableTools.includes('search_experiences') || availableTools.length === 0) {
    suggestedQueries.search.recommended = true;
  }

  // Create reasoning session
  db.prepare(`
    INSERT INTO reasoning_sessions (session_id, problem, user_intent, phase)
    VALUES (?, ?, ?, ?)
  `).run(sessionId, params.problem, JSON.stringify(userIntent), 'analyze');

  logActivity('problem_analyzed', sessionId, { problem: params.problem });

  return {
    session_id: sessionId,
    user_intent: userIntent,
    suggested_queries: suggestedQueries,
    key_concepts: keyConcepts,
    next_step: 'Call gather_context with sources collected from suggested queries'
  };
}

function detectGoal(problem) {
  const p = problem.toLowerCase();
  if (p.includes('how') || p.includes('implement') || p.includes('build')) return 'implementation';
  if (p.includes('why') || p.includes('explain')) return 'understanding';
  if (p.includes('fix') || p.includes('debug') || p.includes('error')) return 'debugging';
  if (p.includes('choose') || p.includes('select') || p.includes('which')) return 'decision';
  return 'general';
}

function detectPriority(problem) {
  const p = problem.toLowerCase();
  if (p.includes('urgent') || p.includes('asap') || p.includes('critical')) return 'high';
  if (p.includes('when you can') || p.includes('eventually')) return 'low';
  return 'medium';
}

function detectFormat(problem) {
  const p = problem.toLowerCase();
  if (p.includes('step by step') || p.includes('guide') || p.includes('tutorial')) return 'tutorial';
  if (p.includes('example') || p.includes('show me')) return 'example';
  if (p.includes('list') || p.includes('options')) return 'list';
  return 'explanation';
}

function detectContext(problem) {
  const p = problem.toLowerCase();
  const contexts = [];
  if (p.includes('react') || p.includes('vue') || p.includes('angular')) contexts.push('frontend');
  if (p.includes('node') || p.includes('express') || p.includes('api')) contexts.push('backend');
  if (p.includes('database') || p.includes('sql') || p.includes('mongodb')) contexts.push('database');
  if (p.includes('test') || p.includes('testing')) contexts.push('testing');
  return contexts.join(', ') || 'general';
}

function suggestLocalFiles(problem) {
  const suggestions = [];
  const p = problem.toLowerCase();

  if (p.includes('auth') || p.includes('login') || p.includes('user')) {
    suggestions.push('src/auth/', 'src/components/Auth', 'README.md');
  }
  if (p.includes('config') || p.includes('setup')) {
    suggestions.push('package.json', 'tsconfig.json', '.env.example');
  }
  if (p.includes('test')) {
    suggestions.push('test/', '__tests__/', '*.test.*');
  }

  return suggestions.length > 0 ? suggestions : ['README.md', 'docs/', 'src/'];
}

/**
 * Tool 8: gather_context
 * Collect and synthesize context from multiple sources
 */
function gatherContext(params) {
  if (!params.session_id) {
    throw new ValidationError(
      'Missing "session_id" parameter',
      'Required: session_id from analyze_problem\\n\\n' +
      'Example:\\n' +
      JSON.stringify({
        session_id: 'reasoning-123-abc',
        problem: 'Same problem from analyze step',
        sources: {
          experiences: [],
          local_docs: [],
          mcp_data: {},
          web_results: []
        }
      }, null, 2)
    );
  }

  if (!params.sources || typeof params.sources !== 'object') {
    throw new ValidationError(
      'Missing or invalid "sources" parameter',
      'Required: sources = object with experiences, local_docs, mcp_data, web_results\\n\\n' +
      'At least one source should have data.'
    );
  }

  // Get session
  const session = db.prepare(`
    SELECT * FROM reasoning_sessions WHERE session_id = ?
  `).get(params.session_id);

  if (!session) {
    throw new ValidationError(
      `Session not found: ${params.session_id}`,
      'Create a session first with analyze_problem'
    );
  }

  // Count sources
  const experiences = params.sources.experiences || [];
  const localDocs = params.sources.local_docs || [];
  const mcpData = params.sources.mcp_data || {};
  const webResults = params.sources.web_results || [];

  const totalItems = experiences.length + localDocs.length +
                     Object.keys(mcpData).length + webResults.length;

  if (totalItems === 0) {
    return {
      session_id: params.session_id,
      synthesized_context: 'No context sources provided. Consider searching experiences or reading relevant files.',
      token_count: 50,
      priority_breakdown: { critical: 0, high: 0, medium: 0, low: 0 },
      warning: 'Empty context - reasoning will be based on general knowledge only'
    };
  }

  // Synthesize context with 4-tier priority system
  let synthesis = '';
  let tokenCount = 0;
  const MAX_TOKENS = 20000;
  const priority = { critical: 0, high: 0, medium: 0, low: 0 };

  // TIER 1: Critical - Effective experiences
  const effective = experiences.filter(e => e.type === 'effective').slice(0, 5);
  if (effective.length > 0) {
    synthesis += '## Effective Approaches\\n\\n';
    for (const exp of effective) {
      synthesis += `- **${exp.domain}**: ${exp.approach} → ${exp.outcome}\\n`;
      tokenCount += 50;
      priority.critical++;
    }
    synthesis += '\\n';
  }

  // TIER 2: High - Local documentation
  if (localDocs.length > 0 && tokenCount < MAX_TOKENS * 0.6) {
    synthesis += '## Project Documentation\\n\\n';
    for (const doc of localDocs.slice(0, 3)) {
      synthesis += `**${doc.path}**: ${(doc.content || '').substring(0, 200)}...\\n\\n`;
      tokenCount += 100;
      priority.high++;
    }
  }

  // TIER 3: Medium - MCP data and web results
  if (Object.keys(mcpData).length > 0 && tokenCount < MAX_TOKENS * 0.8) {
    synthesis += '## Additional Context\\n\\n';
    for (const [key, value] of Object.entries(mcpData)) {
      synthesis += `${key}: ${JSON.stringify(value).substring(0, 100)}...\\n`;
      tokenCount += 50;
      priority.medium++;
    }
  }

  // TIER 4: Low - Ineffective experiences (what NOT to do)
  const ineffective = experiences.filter(e => e.type === 'ineffective').slice(0, 2);
  if (ineffective.length > 0 && tokenCount < MAX_TOKENS * 0.9) {
    synthesis += '\\n## Approaches to Avoid\\n\\n';
    for (const exp of ineffective) {
      synthesis += `- **Don't**: ${exp.approach} (${exp.outcome})\\n`;
      tokenCount += 40;
      priority.low++;
    }
  }

  // Update session
  db.prepare(`
    UPDATE reasoning_sessions
    SET phase = ?, updated_at = strftime('%s', 'now')
    WHERE session_id = ?
  `).run('gather', params.session_id);

  logActivity('context_gathered', params.session_id, {
    total_items: totalItems,
    token_count: tokenCount
  });

  return {
    session_id: params.session_id,
    synthesized_context: synthesis,
    token_count: tokenCount,
    priority_breakdown: priority,
    next_step: 'Call reason_through to evaluate approaches'
  };
}

/**
 * Tool 9: reason_through
 * Evaluate an approach or thought with confidence tracking
 */
function reasonThrough(params) {
  if (!params.session_id) {
    throw new ValidationError(
      'Missing "session_id" parameter',
      'Required: session_id from analyze_problem'
    );
  }

  if (!params.thought || typeof params.thought !== 'string') {
    throw new ValidationError(
      'Missing or invalid "thought" parameter',
      'Required: thought = string (reasoning step)\\n\\n' +
      'Example:\\n' +
      JSON.stringify({
        session_id: 'reasoning-123-abc',
        thought: 'Use JWT tokens for stateless authentication',
        thought_number: 1,
        confidence: 0.8
      }, null, 2)
    );
  }

  if (typeof params.thought_number !== 'number' || params.thought_number < 1) {
    throw new ValidationError(
      'Missing or invalid "thought_number" parameter',
      'Required: thought_number = positive integer (1, 2, 3...)\\n\\n' +
      'Use sequential numbering for your reasoning chain.'
    );
  }

  // Get session
  const session = db.prepare(`
    SELECT * FROM reasoning_sessions WHERE session_id = ?
  `).get(params.session_id);

  if (!session) {
    throw new ValidationError(
      `Session not found: ${params.session_id}`,
      'Create a session first with analyze_problem'
    );
  }

  // Detect scope creep (thought doesn't match original problem)
  const problemWords = new Set(session.problem.toLowerCase().split(/\s+/));
  const thoughtWords = new Set(params.thought.toLowerCase().split(/\s+/));
  const overlap = [...problemWords].filter(w => thoughtWords.has(w)).length;
  const scopeCreep = overlap < 2;

  // Insert thought
  const result = db.prepare(`
    INSERT INTO reasoning_thoughts (session_id, thought_number, thought, confidence, is_revision, revises_thought)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    params.session_id,
    params.thought_number,
    params.thought,
    params.confidence || null,
    params.is_revision ? 1 : 0,
    params.revises_thought || null
  );

  // Update session phase
  db.prepare(`
    UPDATE reasoning_sessions
    SET phase = ?, updated_at = strftime('%s', 'now')
    WHERE session_id = ?
  `).run('reason', params.session_id);

  logActivity('thought_recorded', params.session_id, {
    thought_number: params.thought_number,
    confidence: params.confidence
  });

  return {
    session_id: params.session_id,
    thought_id: result.lastInsertRowid,
    thought_number: params.thought_number,
    scope_creep_detected: scopeCreep,
    scope_creep_warning: scopeCreep ?
      'This thought may be diverging from the original problem. Consider refocusing.' : null,
    next_step: params.thought_number === 1 ?
      'Continue with more thoughts or call finalize_decision' :
      'Call finalize_decision when reasoning is complete'
  };
}

/**
 * Tool 10: finalize_decision
 * Record final decision/conclusion and close reasoning session
 */
function finalizeDecision(params) {
  if (!params.session_id) {
    throw new ValidationError(
      'Missing "session_id" parameter',
      'Required: session_id from analyze_problem'
    );
  }

  if (!params.conclusion || typeof params.conclusion !== 'string') {
    throw new ValidationError(
      'Missing or invalid "conclusion" parameter',
      'Required: conclusion = string (final decision)\\n\\n' +
      'Example:\\n' +
      JSON.stringify({
        session_id: 'reasoning-123-abc',
        conclusion: 'Implement JWT-based authentication with refresh tokens',
        rationale: 'Stateless, scalable, and well-supported by libraries',
        record_as_experience: true
      }, null, 2)
    );
  }

  // Get session
  const session = db.prepare(`
    SELECT * FROM reasoning_sessions WHERE session_id = ?
  `).get(params.session_id);

  if (!session) {
    throw new ValidationError(
      `Session not found: ${params.session_id}`,
      'Create a session first with analyze_problem'
    );
  }

  // Get all thoughts
  const thoughts = db.prepare(`
    SELECT * FROM reasoning_thoughts
    WHERE session_id = ?
    ORDER BY thought_number
  `).all(params.session_id);

  let experienceId = null;

  // Auto-capture as experience if requested (default: true)
  if (params.record_as_experience !== false) {
    const userIntent = JSON.parse(session.user_intent || '{}');

    try {
      const expResult = recordExperience({
        type: 'effective',
        domain: userIntent.goal === 'debugging' ? 'Debugging' : 'Decision',
        situation: session.problem,
        approach: thoughts.map(t => t.thought).join('; '),
        outcome: params.conclusion,
        reasoning: params.rationale || 'Systematic reasoning process',
        confidence: thoughts.length > 0 ?
          (thoughts.reduce((sum, t) => sum + (t.confidence || 0.5), 0) / thoughts.length) : 0.7
        // v1.4.0: scope parameter removed
      });

      if (expResult.recorded) {
        experienceId = expResult.experience_id;
      }
    } catch (e) {
      // Don't fail if experience recording fails
      console.error('[unified-mcp] Warning: Could not record experience:', e.message);
    }
  }

  // Finalize session
  db.prepare(`
    UPDATE reasoning_sessions
    SET phase = ?, conclusion = ?, finalized_at = strftime('%s', 'now'),
        updated_at = strftime('%s', 'now'), experience_id = ?
    WHERE session_id = ?
  `).run('finalized', params.conclusion, experienceId, params.session_id);

  logActivity('decision_finalized', params.session_id, {
    conclusion: params.conclusion,
    experience_id: experienceId
  });

  return {
    session_id: params.session_id,
    conclusion: params.conclusion,
    experience_id: experienceId,
    session_summary: {
      problem: session.problem,
      thoughts_count: thoughts.length,
      avg_confidence: thoughts.length > 0 ?
        (thoughts.reduce((sum, t) => sum + (t.confidence || 0.5), 0) / thoughts.length) : null
    },
    message: experienceId ?
      `Decision finalized and recorded as experience ${experienceId}` :
      'Decision finalized'
  };
}

// ============================================================================
// WORKFLOW ENFORCEMENT TOOLS (5 tools)
// ============================================================================

/**
 * Tool 11: check_compliance
 * Check if current state satisfies workflow requirements (dry-run, doesn't enforce)
 */
function checkCompliance(params) {
  // Validate required parameters
  if (!params.current_phase) {
    throw new ValidationError(
      'Missing "current_phase" parameter',
      'Required: current_phase = "teach" | "learn" | "reason"'
    );
  }

  if (!params.action) {
    throw new ValidationError(
      'Missing "action" parameter',
      'Required: action = string (the action being attempted)'
    );
  }

  if (!['teach', 'learn', 'reason'].includes(params.current_phase)) {
    throw new ValidationError(
      'Invalid "current_phase" parameter',
      'Must be one of: "teach", "learn", "reason"'
    );
  }

  // For MVP, return compliant=true with empty requirements
  // Full implementation would check workflow gates
  return {
    compliant: true,
    missing_requirements: [],
    next_steps: ['Workflow checking not yet configured'],
    would_block: false,
    mode: 'dry-run',
    current_phase: params.current_phase,
    action: params.action
  };
}

/**
 * Tool 12: verify_compliance
 * Verify compliance and create operation token if passed (enforcement mode)
 */
function verifyCompliance(params) {
  // Validate required parameters
  if (!params.current_phase) {
    throw new ValidationError(
      'Missing "current_phase" parameter',
      'Required: current_phase = "teach" | "learn" | "reason"'
    );
  }

  if (!params.action) {
    throw new ValidationError(
      'Missing "action" parameter',
      'Required: action = string (the action being attempted)'
    );
  }

  if (!['teach', 'learn', 'reason'].includes(params.current_phase)) {
    throw new ValidationError(
      'Invalid "current_phase" parameter',
      'Must be one of: "teach", "learn", "reason"'
    );
  }

  // Track session in database if session_id provided
  if (params.session_id) {
    const existing = db.prepare('SELECT session_id FROM workflow_sessions WHERE session_id = ?').get(params.session_id);

    if (!existing) {
      db.prepare(`
        INSERT INTO workflow_sessions (session_id, preset, gates_passed, steps_completed, expires_at, active)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(
        params.session_id,
        params.current_phase,
        JSON.stringify([]),
        JSON.stringify([params.action]),
        Date.now() + (60 * 60 * 1000) // 1 hour
      );
    } else {
      // Update existing session
      const session = db.prepare('SELECT steps_completed FROM workflow_sessions WHERE session_id = ?').get(params.session_id);
      const steps = JSON.parse(session.steps_completed || '[]');
      steps.push(params.action);

      db.prepare(`
        UPDATE workflow_sessions
        SET steps_completed = ?, preset = ?
        WHERE session_id = ?
      `).run(JSON.stringify(steps), params.current_phase, params.session_id);
    }
  }

  // Create operation token
  const tokenId = `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const tokenPath = path.join(TOKEN_DIR, `${tokenId}.json`);

  const token = {
    token_id: tokenId,
    created_at: Date.now(),
    expires_at: Date.now() + (5 * 60 * 1000), // 5min
    type: 'operation',
    session_id: params.session_id || null,
    phase: params.current_phase,
    action: params.action
  };

  fs.writeFileSync(tokenPath, JSON.stringify(token, null, 2));

  return {
    compliant: true,
    operation_token: tokenId,
    session_id: params.session_id || null,
    current_phase: params.current_phase,
    message: 'Compliance verified, operation authorized'
  };
}

/**
 * Tool 13: authorize_operation
 * Authorize a file operation using operation token, optionally create session token
 */
function authorizeOperation(params) {
  if (!params.operation_token) {
    throw new ValidationError(
      'Missing "operation_token" parameter',
      'Required: operation_token from verify_compliance'
    );
  }

  const tokenPath = path.join(TOKEN_DIR, `${params.operation_token}.json`);

  if (!fs.existsSync(tokenPath)) {
    throw new ValidationError(
      'Invalid operation token',
      'Token not found or expired'
    );
  }

  const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));

  if (token.expires_at < Date.now()) {
    fs.unlinkSync(tokenPath);
    throw new ValidationError(
      'Token expired',
      'Operation token has expired, please verify compliance again'
    );
  }

  // Create session token if requested
  let sessionToken = null;
  if (params.create_session_token === true) {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const sessionTokenPath = path.join(TOKEN_DIR, `${sessionId}.json`);

    const sessionTokenData = {
      token_id: sessionId,
      created_at: Date.now(),
      expires_at: Date.now() + (60 * 60 * 1000), // 60min
      type: 'session'
    };

    fs.writeFileSync(sessionTokenPath, JSON.stringify(sessionTokenData, null, 2));
    sessionToken = sessionId;
  }

  // Delete the one-time operation token after use
  fs.unlinkSync(tokenPath);

  return {
    authorized: true,
    session_token: sessionToken,
    token_path: sessionToken ? path.join(TOKEN_DIR, `${sessionToken}.json`) : null,
    message: 'Operation authorized'
  };
}

/**
 * Tool 14: get_workflow_status
 * Get current workflow state (gates, steps, tokens)
 */
function getWorkflowStatus(params) {
  let session = null;
  let currentPhase = null;
  let stepsCompleted = [];

  // Get session from database if session_id provided
  if (params.session_id) {
    const row = db.prepare(`
      SELECT session_id, preset, steps_completed, created_at, expires_at, active
      FROM workflow_sessions
      WHERE session_id = ?
    `).get(params.session_id);

    if (row) {
      session = row.session_id;
      currentPhase = row.preset;
      stepsCompleted = JSON.parse(row.steps_completed || '[]');
    } else {
      // Return info for non-existent session
      session = params.session_id;
      currentPhase = 'teach'; // Default starting phase
      stepsCompleted = [];
    }
  }

  // List active tokens
  const tokens = [];
  try {
    const files = fs.readdirSync(TOKEN_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const tokenData = JSON.parse(fs.readFileSync(path.join(TOKEN_DIR, file), 'utf8'));
          if (tokenData.expires_at > Date.now()) {
            tokens.push({
              token_id: tokenData.token_id,
              type: tokenData.type,
              expires_in_seconds: Math.floor((tokenData.expires_at - Date.now()) / 1000)
            });
          }
        } catch (e) {
          // Skip invalid token files
        }
      }
    }
  } catch (e) {
    // Token directory might not exist yet
  }

  return {
    session_id: session,
    current_phase: currentPhase,
    active_session: session,
    gates_status: {
      teach: 'not_configured',
      learn: 'not_configured',
      reason: 'not_configured'
    },
    steps_completed: stepsCompleted,
    active_tokens: tokens,
    fast_track_active: false
  };
}

/**
 * Tool 15: reset_workflow
 * Reset workflow state (clear tokens, session)
 */
function resetWorkflow(params) {
  // If cleanup_only mode, just clean expired tokens
  if (params.cleanup_only) {
    let cleaned = 0;
    try {
      const files = fs.readdirSync(TOKEN_DIR);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const tokenPath = path.join(TOKEN_DIR, file);
            const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
            if (tokenData.expires_at < Date.now()) {
              fs.unlinkSync(tokenPath);
              cleaned++;
            }
          } catch (e) {
            // Skip invalid files
          }
        }
      }
    } catch (e) {
      // Token directory might not exist
    }

    logActivity('workflow_cleanup', null, { tokens_cleaned: cleaned });

    return {
      cleanup_only: true,
      cleaned_up: cleaned,
      message: `Cleaned up ${cleaned} expired tokens`
    };
  }

  // Reset specific session if session_id provided
  if (params.session_id) {
    db.prepare('DELETE FROM workflow_sessions WHERE session_id = ?').run(params.session_id);

    logActivity('workflow_reset', params.session_id, { session_id: params.session_id });

    return {
      reset: true,
      session_id: params.session_id,
      message: `Session ${params.session_id} reset`
    };
  }

  // General reset (clean up expired tokens)
  let cleaned = 0;
  try {
    const files = fs.readdirSync(TOKEN_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const tokenPath = path.join(TOKEN_DIR, file);
          const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
          if (tokenData.expires_at < Date.now()) {
            fs.unlinkSync(tokenPath);
            cleaned++;
          }
        } catch (e) {
          // Skip invalid files
        }
      }
    }
  } catch (e) {
    // Token directory might not exist
  }

  logActivity('workflow_reset', null, { tokens_cleaned: cleaned });

  return {
    reset: true,
    cleaned_up: cleaned,
    message: `Workflow reset complete (${cleaned} expired tokens cleaned)`
  };
}

// ============================================================================
// CONFIGURATION TOOLS (5 tools)
// ============================================================================

// Define built-in presets
const BUILT_IN_PRESETS = {
  'three-gate': {
    name: 'three-gate',
    description: 'Standard TEACH → LEARN → REASON workflow',
    gates: {
      teach: {
        required_tools: ['record_experience', 'tag_experience'],
        description: 'Record working patterns and knowledge'
      },
      learn: {
        required_tools: ['search_experiences', 'gather_context'],
        description: 'Gather context from past experiences'
      },
      reason: {
        required_tools: ['reason_through', 'finalize_decision'],
        description: 'Think through problem and make decision'
      }
    },
    token_ttl: {
      operation: 300000,  // 5 min
      session: 3600000    // 60 min
    },
    enforcement: 'moderate'
  },
  'minimal': {
    name: 'minimal',
    description: 'Lightweight workflow with minimal gates',
    gates: {
      teach: {
        required_tools: [],
        description: 'Optional knowledge recording'
      },
      learn: {
        required_tools: [],
        description: 'Optional context gathering'
      },
      reason: {
        required_tools: [],
        description: 'Optional reasoning'
      }
    },
    token_ttl: {
      operation: 600000,  // 10 min
      session: 7200000    // 120 min
    },
    enforcement: 'lenient'
  },
  'strict': {
    name: 'strict',
    description: 'Strict enforcement with all validations',
    gates: {
      teach: {
        required_tools: ['record_experience', 'tag_experience', 'export_experiences'],
        description: 'Must record and document knowledge'
      },
      learn: {
        required_tools: ['search_experiences', 'get_experience', 'gather_context'],
        description: 'Must search and gather full context'
      },
      reason: {
        required_tools: ['analyze_problem', 'reason_through', 'finalize_decision'],
        description: 'Must analyze, reason, and conclude'
      }
    },
    token_ttl: {
      operation: 180000,  // 3 min
      session: 1800000    // 30 min
    },
    enforcement: 'strict'
  },
  'custom': {
    name: 'custom',
    description: 'Template for custom workflows',
    gates: {
      teach: {
        required_tools: [],
        description: 'Customize as needed'
      },
      learn: {
        required_tools: [],
        description: 'Customize as needed'
      },
      reason: {
        required_tools: [],
        description: 'Customize as needed'
      }
    },
    token_ttl: {
      operation: 300000,
      session: 3600000
    },
    enforcement: 'custom'
  }
};

/**
 * Tool 16: list_presets
 * List available configuration presets
 */
function listPresets(params) {
  const presets = [];

  // Add built-in presets
  for (const [key, preset] of Object.entries(BUILT_IN_PRESETS)) {
    presets.push({
      name: preset.name,
      description: preset.description,
      enforcement: preset.enforcement,
      type: 'built-in'
    });
  }

  // v1.4.0: Add custom presets from project-local .claude/presets/
  const PRESETS_DIR = path.join(getProjectDir(), 'presets');
  try {
    if (fs.existsSync(PRESETS_DIR)) {
      const files = fs.readdirSync(PRESETS_DIR);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const presetPath = path.join(PRESETS_DIR, file);
            const customPreset = JSON.parse(fs.readFileSync(presetPath, 'utf8'));
            presets.push({
              name: customPreset.name,
              description: customPreset.description,
              enforcement: customPreset.enforcement || 'custom',
              type: 'custom',
              path: presetPath
            });
          } catch (e) {
            // Skip invalid preset files
          }
        }
      }
    }
  } catch (e) {
    // Presets directory might not exist
  }

  return {
    presets,
    count: presets.length,
    built_in_count: Object.keys(BUILT_IN_PRESETS).length,
    custom_count: presets.length - Object.keys(BUILT_IN_PRESETS).length
  };
}

/**
 * Tool 17: apply_preset
 * Apply a preset to current session
 */
function applyPreset(params) {
  if (!params.preset_name) {
    throw new ValidationError(
      'Missing "preset_name" parameter',
      'Required: preset_name = name of preset to apply'
    );
  }

  // Check built-in presets first
  let preset = BUILT_IN_PRESETS[params.preset_name];

  // If not built-in, check custom presets in project-local .claude/presets/
  if (!preset) {
    const PRESETS_DIR = path.join(getProjectDir(), 'presets');
    const presetPath = path.join(PRESETS_DIR, `${params.preset_name}.json`);

    if (fs.existsSync(presetPath)) {
      preset = JSON.parse(fs.readFileSync(presetPath, 'utf8'));
    } else {
      throw new ValidationError(
        'Preset not found',
        `No preset named "${params.preset_name}" found. Use list_presets to see available presets.`
      );
    }
  }

  // Apply to session if session_id provided
  if (params.session_id) {
    const existing = db.prepare('SELECT session_id FROM workflow_sessions WHERE session_id = ?').get(params.session_id);

    if (!existing) {
      db.prepare(`
        INSERT INTO workflow_sessions (session_id, preset, gates_passed, steps_completed, expires_at, active)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(
        params.session_id,
        params.preset_name,
        JSON.stringify([]),
        JSON.stringify([]),
        Date.now() + (preset.token_ttl?.session || 3600000)
      );
    } else {
      db.prepare(`
        UPDATE workflow_sessions
        SET preset = ?, expires_at = ?
        WHERE session_id = ?
      `).run(
        params.preset_name,
        Date.now() + (preset.token_ttl?.session || 3600000),
        params.session_id
      );
    }

    logActivity('preset_applied', params.session_id, { preset: params.preset_name });
  }

  return {
    applied: true,
    preset_name: params.preset_name,
    session_id: params.session_id || null,
    gates: preset.gates,
    enforcement: preset.enforcement,
    message: `Preset "${params.preset_name}" applied successfully`
  };
}

/**
 * Tool 18: validate_config
 * Validate a configuration structure
 */
function validateConfig(params) {
  if (!params.config) {
    throw new ValidationError(
      'Missing "config" parameter',
      'Required: config = object to validate'
    );
  }

  const errors = [];
  const warnings = [];
  const config = params.config;

  // Check required fields
  if (!config.name) errors.push('Missing required field: name');
  if (!config.description) warnings.push('Missing recommended field: description');
  if (!config.gates) errors.push('Missing required field: gates');

  if (config.gates) {
    // Validate gates structure
    const requiredGates = ['teach', 'learn', 'reason'];
    for (const gate of requiredGates) {
      if (!config.gates[gate]) {
        errors.push(`Missing required gate: ${gate}`);
      } else {
        if (!config.gates[gate].required_tools) {
          warnings.push(`Gate "${gate}" missing required_tools array`);
        }
        if (!config.gates[gate].description) {
          warnings.push(`Gate "${gate}" missing description`);
        }
      }
    }
  }

  if (config.token_ttl) {
    if (typeof config.token_ttl.operation !== 'number') {
      warnings.push('token_ttl.operation should be a number (milliseconds)');
    }
    if (typeof config.token_ttl.session !== 'number') {
      warnings.push('token_ttl.session should be a number (milliseconds)');
    }
  }

  const valid = errors.length === 0;

  return {
    valid,
    errors,
    warnings,
    message: valid
      ? 'Configuration is valid'
      : `Configuration has ${errors.length} error(s) and ${warnings.length} warning(s)`
  };
}

/**
 * Tool 19: get_config
 * Get current active configuration
 */
function getConfig(params) {
  let activePreset = 'three-gate'; // default

  // Get active preset from session if provided
  if (params.session_id) {
    const session = db.prepare('SELECT preset FROM workflow_sessions WHERE session_id = ?').get(params.session_id);
    if (session && session.preset) {
      activePreset = session.preset;
    }
  }

  // Get preset config
  let config = BUILT_IN_PRESETS[activePreset];

  if (!config) {
    // Try custom preset in project-local .claude/presets/
    const PRESETS_DIR = path.join(getProjectDir(), 'presets');
    const presetPath = path.join(PRESETS_DIR, `${activePreset}.json`);

    if (fs.existsSync(presetPath)) {
      config = JSON.parse(fs.readFileSync(presetPath, 'utf8'));
    } else {
      config = BUILT_IN_PRESETS['three-gate']; // fallback
      activePreset = 'three-gate';
    }
  }

  return {
    active_preset: activePreset,
    config,
    session_id: params.session_id || null
  };
}

/**
 * Tool 20: export_config
 * Export configuration to file
 */
function exportConfig(params) {
  if (!params.preset_name) {
    throw new ValidationError(
      'Missing "preset_name" parameter',
      'Required: preset_name = name of preset to export'
    );
  }

  // Get preset
  let preset = BUILT_IN_PRESETS[params.preset_name];

  if (!preset) {
    // Try custom preset in project-local .claude/presets/
    const PRESETS_DIR = path.join(getProjectDir(), 'presets');
    const presetPath = path.join(PRESETS_DIR, `${params.preset_name}.json`);

    if (fs.existsSync(presetPath)) {
      preset = JSON.parse(fs.readFileSync(presetPath, 'utf8'));
    } else {
      throw new ValidationError(
        'Preset not found',
        `No preset named "${params.preset_name}" found`
      );
    }
  }

  // Determine export path - v1.4.0: project-local .claude/presets/
  let exportPath;
  if (params.file_path) {
    exportPath = params.file_path;
  } else {
    const PRESETS_DIR = path.join(getProjectDir(), 'presets');
    if (!fs.existsSync(PRESETS_DIR)) {
      fs.mkdirSync(PRESETS_DIR, { recursive: true });
    }
    exportPath = path.join(PRESETS_DIR, `${params.preset_name}.json`);
  }

  // Write to file
  fs.writeFileSync(exportPath, JSON.stringify(preset, null, 2));

  return {
    exported: true,
    preset_name: params.preset_name,
    file_path: exportPath,
    size_bytes: fs.statSync(exportPath).size,
    message: `Preset "${params.preset_name}" exported to ${exportPath}`
  };
}

// ============================================================================
// AUTOMATION TOOLS (5 tools)
// ============================================================================

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
 */
function healthCheck(params) {
  const issues = [];
  const warnings = [];

  // Check database
  try {
    db.prepare('SELECT 1').get();
  } catch (e) {
    issues.push('Database connection failed');
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

  // Check token directory
  if (!fs.existsSync(TOKEN_DIR)) {
    warnings.push('Token directory does not exist');
  }

  // Check FTS5
  try {
    db.prepare('SELECT COUNT(*) FROM experiences_fts').get();
  } catch (e) {
    issues.push('FTS5 index corrupted or missing');
  }

  // Count records
  const experienceCount = db.prepare('SELECT COUNT(*) as count FROM experiences').get().count;
  const sessionCount = db.prepare('SELECT COUNT(*) as count FROM reasoning_sessions').get().count;
  const workflowCount = db.prepare('SELECT COUNT(*) as count FROM workflow_sessions').get().count;

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
    database_path: DB_PATH,
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

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Log activity to database
 */
function logActivity(eventType, sessionId, details) {
  try {
    db.prepare(`
      INSERT INTO activity_log (event_type, session_id, details)
      VALUES (?, ?, ?)
    `).run(eventType, sessionId, JSON.stringify(details));
  } catch (e) {
    // Don't fail if logging fails
    console.error('[unified-mcp] Warning: Failed to log activity:', e.message);
  }
}

// ============================================================================
// CLI MODE (if flags provided)
// ============================================================================

const args = process.argv.slice(2);

// --help flag
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Unified MCP Server v${VERSION}
Combines memory-augmented reasoning and protocol enforcement

USAGE:
  npx unified-mcp-server                      Start MCP server (JSON-RPC over stdio)
  npx unified-mcp-server --help               Show this help message
  npx unified-mcp-server --version            Show version number
  npx unified-mcp-server --init               Run interactive setup wizard
  npx unified-mcp-server --preset <name>      Apply preset (non-interactive)
  npx unified-mcp-server --health             Run health check
  npx unified-mcp-server --validate           Validate configuration

PRESETS:
  three-gate      Standard TEACH → LEARN → REASON workflow (recommended)
  minimal         Lightweight with optional gates
  strict          Strict enforcement with all validations
  custom          Template for custom workflows

  Example: npx unified-mcp-server --preset three-gate

INSTALLATION:
  # From gist (recommended)
  npx mpalpha/unified-mcp-server

  # Or install globally
  npm install -g unified-mcp-server

CONFIGURATION:
  Database:      ${DB_PATH}
  Token Dir:     ${TOKEN_DIR}

DOCUMENTATION:
  https://github.com/mpalpha/unified-mcp-server

28 TOOLS AVAILABLE:
  Knowledge Management (7 tools):
    - record_experience, search_experiences, get_experience
    - update_experience, tag_experience, export_experiences, import_experiences

  Reasoning (4 tools):
    - analyze_problem, gather_context, reason_through, finalize_decision

  Workflow Enforcement (5 tools):
    - check_compliance, verify_compliance, authorize_operation
    - get_workflow_status, reset_workflow

  Configuration (5 tools):
    - list_presets, apply_preset, validate_config, get_config, export_config

  Automation (5 tools):
    - install_hooks, uninstall_hooks, get_session_state, health_check, import_data

  Project Context (2 tools):
    - update_project_context, get_project_context
`);
  process.exit(0);
}

// --version flag
if (args.includes('--version') || args.includes('-v')) {
  console.log(VERSION);
  process.exit(0);
}

// --preset flag (non-interactive preset application)
const presetIndex = args.findIndex(arg => arg === '--preset');
if (presetIndex !== -1 && args[presetIndex + 1]) {
  const presetName = args[presetIndex + 1];
  const validPresets = ['three-gate', 'minimal', 'strict', 'custom'];

  if (!validPresets.includes(presetName)) {
    console.error(`Error: Invalid preset "${presetName}"`);
    console.error(`Valid presets: ${validPresets.join(', ')}`);
    process.exit(1);
  }

  const presetConfig = BUILT_IN_PRESETS[presetName];
  if (!presetConfig) {
    console.error(`Error: Preset "${presetName}" not found`);
    process.exit(1);
  }

  try {
    const configPath = path.join(MCP_DIR, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(presetConfig, null, 2));
    console.log(`✓ Applied ${presetName} preset`);
    console.log(`  Config saved to: ${configPath}`);
    console.log(`\nPreset details:`);
    console.log(`  Enforcement level: ${presetConfig.enforcement_level || 'custom'}`);
    console.log(`  Tools: ${Object.keys(presetConfig.tools || {}).length} configured`);
    process.exit(0);
  } catch (error) {
    console.error(`Error applying preset: ${error.message}`);
    process.exit(1);
  }
}

// --init flag (interactive setup wizard)
if (args.includes('--init')) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(`
╔═══════════════════════════════════════════════════════════╗
║   Unified MCP Server v${VERSION} - Interactive Setup      ║
╚═══════════════════════════════════════════════════════════╝

DATABASE LOCATION: ${DB_PATH}
TOKEN DIRECTORY:   ${TOKEN_DIR}

SETUP STATUS:
  ✓ Database directory created
  ✓ Token directory created
  ✓ Namespace: .claude/ (project-local, v1.4.0)
`);

  // v1.4.0: Check for and cleanup old global storage
  const oldGlobalDir = path.join(os.homedir(), '.unified-mcp');
  if (fs.existsSync(oldGlobalDir)) {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║   v1.4.0 MIGRATION: Old Global Storage Detected           ║
╚═══════════════════════════════════════════════════════════╝

Found old global storage at: ${oldGlobalDir}

v1.4.0 uses project-local storage (.claude/) instead.
The old global storage is no longer used and can be safely removed.

To remove: rm -rf ${oldGlobalDir}
`);
  }

  const setupState = {
    preset: null,
    installHooks: false,
    hooksInstalled: false,
    hooksLocation: null  // v1.5.0: Track actual install location (global vs project-local)
  };

  // Display analysis checklist before configuration
  console.log(`
${'═'.repeat(60)}
CONFIGURATION OPTIMIZATION
${'═'.repeat(60)}

You are expected to perform a CURRENT and COMPLETE analysis of the
actual project state before selecting configuration.

Do not rely on assumptions or prior knowledge - analyze the actual
current state:

ANALYSIS CHECKLIST (complete all steps):

□ List currently available MCP tools (check actual installed tools)

  → Use these available tools for ALL remaining analysis steps where
    they provide benefit.

□ Explore actual codebase structure and organization
  (use filesystem/code analysis tools if available)

□ Assess actual project complexity (file counts, patterns, architecture)
  (use code analysis/search tools if available)

□ Review current Claude Code configuration (read actual settings.json)
  (use filesystem tools if available)

□ Identify actual development patterns from current git history
  (use git/github tools if available)

□ Examine actual project documentation and architecture
  (use documentation/search tools if available)

After completing this checklist with available tools, select the
configuration that best fits the actual project characteristics.

${'═'.repeat(60)}
`);

  // Question 1: Preset selection
  rl.question(`
Which workflow preset would you like to use?

  1. three-gate (RECOMMENDED) - Standard TEACH → LEARN → REASON workflow
                                Optimal for consistent learning and knowledge retention
  2. minimal                  - Lightweight with optional gates
  3. strict                   - Strict enforcement with all validations
  4. custom                   - Template for custom workflows
  5. skip                     - Don't apply a preset now

Based on your analysis, enter choice [1-5] (default: 1 - three-gate): `, (answer) => {
    const choice = answer.trim() || '1'; // Default to 1 if empty
    const presets = { '1': 'three-gate', '2': 'minimal', '3': 'strict', '4': 'custom', '5': null };
    setupState.preset = presets[choice] || null;

    if (setupState.preset) {
      console.log(`\n✓ Selected preset: ${setupState.preset}`);
    } else {
      console.log('\n✓ Skipping preset configuration');
    }

    // Question 2: Hook installation
    rl.question(`
Install workflow enforcement hooks? (RECOMMENDED)

Hooks enforce TEACH → LEARN → REASON workflow for optimal operation:
  • WITHOUT hooks: Agents may skip workflow, reducing effectiveness
  • WITH hooks:    Every file operation builds on accumulated knowledge

Benefits:
  ✓ Consistent workflow enforcement across all requests
  ✓ Maximum knowledge retention and learning
  ✓ Prevents failure patterns documented in AgentErrorTaxonomy research
  ✓ Blocks file operations until workflow complete (optimal behavior)

Install hooks? [Y/n] (default: Yes - recommended for agents): `, (answer) => {
      const response = answer.trim().toLowerCase();
      setupState.installHooks = response === '' || response === 'y' || response === 'yes';

      if (setupState.installHooks) {
        console.log('\n✓ Hooks will be installed');
      } else {
        console.log('\n✓ Skipping hook installation');
      }

      // Question 3: Migration from old database
      rl.question(`
Do you have an old memory-augmented-reasoning.db to migrate?

If you previously used memory-augmented-reasoning, you can import all
your experiences into this unified server. The migration tool will:
  • Find and convert all your existing experiences
  • Preserve revision relationships
  • Never modify your source database (read-only)

Common locations:
  • ~/.cursor/memory-augmented-reasoning.db
  • <project>/.cursor/memory-augmented-reasoning.db

Migrate old database? [Y/n] (default: Yes - preserve your knowledge): `, (answer) => {
        const response = answer.trim().toLowerCase();
        setupState.migrate = response === '' || response === 'y' || response === 'yes';

        if (setupState.migrate) {
          console.log('\n✓ Will help you migrate old database');
        } else {
          console.log('\n✓ Skipping migration');
        }

        // Execute setup
        console.log('\n' + '─'.repeat(60));
        console.log('EXECUTING SETUP...\n');

      try {
        // Apply preset if selected
        if (setupState.preset) {
          const presetConfig = BUILT_IN_PRESETS[setupState.preset];
          if (presetConfig) {
            // Save preset to .claude/config.json (v1.4.0: project-local)
            const configPath = path.join(MCP_DIR, 'config.json');
            fs.writeFileSync(configPath, JSON.stringify(presetConfig, null, 2));
            console.log(`✓ Applied ${setupState.preset} preset to ${configPath}`);
          }
        }

        // Install hooks if requested
        if (setupState.installHooks) {
          try {
            const result = installHooks({ hooks: ['all'], update_settings: false });
            if (result.installed) {
              console.log(`✓ Installed ${result.hooks.length} hooks to ${result.location}`);
              console.log('  Note: You need to manually add hooks to Claude Code settings.json');
              setupState.hooksInstalled = true;
              setupState.hooksLocation = result.location;  // v1.5.0: Track where hooks were installed
            }
          } catch (e) {
            console.log(`✗ Hook installation failed: ${e.message}`);
          }
        }

        // Run migration if requested
        if (setupState.migrate) {
          console.log('\n' + '─'.repeat(60));
          console.log('MIGRATION SETUP\n');

          // Find common database locations
          const { execSync } = require('child_process');
          const homeDir = os.homedir();
          const commonPaths = [
            path.join(homeDir, '.cursor', 'memory-augmented-reasoning.db'),
            path.join(process.cwd(), '.cursor', 'memory-augmented-reasoning.db')
          ];

          let foundDatabases = [];
          for (const dbPath of commonPaths) {
            if (fs.existsSync(dbPath)) {
              foundDatabases.push(dbPath);
            }
          }

          if (foundDatabases.length > 0) {
            console.log('Found old database(s):\n');
            foundDatabases.forEach((db, i) => {
              console.log(`  ${i + 1}. ${db}`);
            });
            console.log('\nTo migrate, run:\n');
            console.log(`  node scripts/migrate-experiences.js --source ${foundDatabases[0]} --dry-run`);
            console.log('  (Preview migration without changes)\n');
            console.log(`  node scripts/migrate-experiences.js --source ${foundDatabases[0]}`);
            console.log('  (Perform actual migration)\n');
            console.log('See docs/MIGRATION_GUIDE.md for complete instructions.');
          } else {
            console.log('No old database found in common locations.\n');
            console.log('To migrate from a custom location, run:\n');
            console.log('  node scripts/migrate-experiences.js --source /path/to/old.db --dry-run\n');
            console.log('See docs/MIGRATION_GUIDE.md for complete instructions.');
          }
        }

        // Display next steps
        console.log('\n' + '='.repeat(60));
        console.log('✅ SETUP COMPLETE!\n');
        console.log('='.repeat(60));
        console.log('\n📋 NEXT STEPS FOR AUTOMATIC CONFIGURATION:\n');

        // Step 1: Configure MCP Settings
        const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
        console.log('STEP 1: Configure Claude Code MCP Settings\n');
        console.log(`  File Location: ${settingsPath}\n`);
        console.log('  Action: Add the following to your settings.json:\n');
        console.log('  {');
        console.log('    "mcpServers": {');
        console.log('      "unified-mcp": {');
        console.log('        "command": "npx",');
        console.log('        "args": ["mpalpha/unified-mcp-server"]');
        console.log('      }');
        console.log('    }');
        console.log('  }\n');
        console.log('  💡 TIP: If mcpServers already exists, add unified-mcp to it.\n');
        console.log('  To edit automatically, run:');
        console.log(`    code "${settingsPath}"`);
        console.log('    # OR');
        console.log(`    open "${settingsPath}"\n`);

        // Step 2: Configure hooks if installed
        if (setupState.hooksInstalled && setupState.hooksLocation) {
          console.log('STEP 2: Configure Workflow Hooks\n');
          console.log(`  File Location: ${settingsPath}\n`);
          console.log('  Action: Add the following to your settings.json:\n');
          console.log('  {');
          console.log('    "hooks": {');
          console.log('      "SessionStart": [{ "hooks": [{ "type": "command",');
          console.log(`        "command": "${path.join(setupState.hooksLocation, 'session-start.cjs')}" }] }],`);
          console.log('      "UserPromptSubmit": [{ "hooks": [{ "type": "command",');
          console.log(`        "command": "${path.join(setupState.hooksLocation, 'user-prompt-submit.cjs')}" }] }],`);
          console.log('      "PreToolUse": [{ "hooks": [{ "type": "command",');
          console.log(`        "command": "${path.join(setupState.hooksLocation, 'pre-tool-use.cjs')}" }] }]`);
          console.log('    }');
          console.log('  }\n');
        }

        // Write post-install prompt file for hook to inject after restart
        const promptsDir = path.join(MCP_DIR, 'post-install-prompts');
        const projectHash = crypto.createHash('md5').update(process.cwd()).digest('hex');
        const promptFilePath = path.join(promptsDir, `${projectHash}.md`);

        const promptContent = `🔍 POST-INSTALLATION: PROJECT CONTEXT CONFIGURATION

The MCP server is now connected. Configure project context to guide
future sessions toward reading the FULL documentation - not summaries.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  CRITICAL: Context is a POINTER, not a REPLACEMENT.
    DO NOT summarize rules. Create pointers that enforce reading full docs.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1: BROAD DISCOVERY

Search for files that might contain rules, guidelines, or checklists:

  □ Bash: find . -type f \\( -name "*.md" -o -name "*.txt" -o -name ".*rules*" \\) 2>/dev/null | head -100
  □ Exclude: Filter out paths containing dependency caches, build outputs,
      vendored code, or version control (determine what these are based on
      the project's ecosystem)
  □ Bash: ls -la (root dotfiles)
  □ Read: package.json, pyproject.toml, or equivalent (scripts, config references)
  □ Read: README.md

STEP 2: READ DISCOVERED FILES

For each potentially relevant file from Step 1:
  □ Read the file contents
  □ Note what type of guidance it contains (code style, testing, accessibility, etc.)
  □ Note sections relevant to pre-implementation planning
  □ Note sections relevant to post-implementation verification
  □ Note any lint/test/build commands referenced

STEP 3: PRESENT FINDINGS

Present discovered files with content summaries:

  "I found these files containing project rules or guidelines:

   [list each file with description of what it contains]

   Are there other locations where rules, checklists, or guidelines
   are documented? (other files, wiki, external docs?)"

If user identifies additional sources:
  - For files: discover and read them
  - For external docs the agent cannot access: ask user to summarize
    key points or provide links to include in reminders

STEP 4: HANDLE NO FORMAL DOCUMENTATION

If no rule files are found:

  "I didn't find formal documentation for project rules or checklists.

   Would you like to:
   A) Describe key rules - I'll help structure them into context
   B) Skip project context for now"

If user chooses A, capture their rules and help identify which are
critical violations vs general guidelines.

STEP 5: ANALYZE FOR CONFLICTS

Compare rules across all discovered files. Look for:
  □ Contradictory statements
  □ Overlapping guidance with different specifics
  □ Ambiguous precedence

Present conflicts to user for resolution:

  "I found potential conflicts between your rule files:

   CONFLICT: [topic]
   - [File A] says: '...'
   - [File B] says: '...'

   Which takes precedence?"

STEP 6: IDENTIFY CRITICAL VIOLATIONS

Ask the user - do not guess:

  "Which rules are MOST COMMONLY VIOLATED - the specific items you
   frequently have to correct? (3-5 items)

   These become critical reminders shown every session."

STEP 7: MAP FILES TO SCENARIOS

Determine which files apply to which types of changes:

  □ Which files should ALWAYS be read before/after coding?
  □ Which files apply only to specific scenarios (UI, tests, API, etc.)?
  □ What verification commands should run after changes?

STEP 8: CONSTRUCT PROJECT CONTEXT

Build context following these principles:

  ✓ HONEST - Summary admits full rules are elsewhere
  ✓ ACTIONABLE - Points to exact files discovered
  ✓ CRITICAL ONLY - Highlights are user-identified violations
  ✓ ENFORCES READING - Pre/post say "READ [file]"
  ✓ CONFLICT-AWARE - Notes resolved conflicts
  ✓ CONDITIONAL - Notes which files apply when

Note: Each item has a 200 character limit. Keep pointers concise.

  update_project_context({
    enabled: true,

    summary: "[Project] - [Stack]. ALWAYS read full docs before/after coding.",

    highlights: [
      // User-identified most-violated rules from Step 6
      // These are specific gotchas, not general documentation
    ],

    reminders: [
      // Point to primary rule sources discovered
      "READ [file] BEFORE coding",
      "READ [file] AFTER coding to verify"
    ],

    preImplementation: [
      // "READ [file]" items first, then action items
      "READ [file1] - [section] (applies: always)",
      "READ [file2] - [section] (applies: if [scenario])",
      // Critical actions not covered in files
    ],

    postImplementation: [
      // "READ [file]" items first, then verification commands
      "READ [file1] - [section] (applies: always)",
      "READ [file2] - [section] (applies: if [scenario])",
      // Verification commands
      "[lint/test command] - must pass"
    ]
  })

STEP 9: PRESENT FOR APPROVAL

Show the user:
  □ The constructed project context
  □ Summary of files referenced
  □ Conflict resolutions applied

Ask for approval before saving.
If user requests changes, revise and present again.

STEP 10: CLEANUP

After approval: rm .claude/post-install-prompts/${projectHash}.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRINCIPLES:

  ✓ Context POINTS to docs, doesn't replace them
  ✓ Discover broadly, don't assume project structure
  ✓ User identifies critical violations - don't guess
  ✓ Handle missing documentation gracefully
  ✓ Resolve conflicts explicitly with user input
  ✓ Support multiple files with conditional applicability

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
        try {
          // Ensure prompts directory exists
          if (!fs.existsSync(promptsDir)) {
            fs.mkdirSync(promptsDir, { recursive: true });
          }
          fs.writeFileSync(promptFilePath, promptContent, 'utf8');
        } catch (err) {
          console.log(`  ⚠️  Warning: Could not write post-install prompt file: ${err.message}\n`);
        }

        // Step 3: Restart Claude Code
        const nextStep = setupState.hooksInstalled ? 3 : 2;
        console.log(`STEP ${nextStep}: Restart Claude Code\n`);
        console.log('  ⚠️  AGENT: Instruct the user to restart Claude Code now.\n');
        console.log('  WHY: Claude Code must be restarted to load the new MCP server.\n');
        console.log('  HOW TO RESTART:\n');
        console.log('    • VSCode: Run "Developer: Reload Window" command (Cmd/Ctrl+Shift+P)');
        console.log('    • Claude Desktop: Restart the application');
        console.log('    • CLI: Exit and restart claude-code\n');

        // Step 4: Post-Reload Customization (AUTOMATIC)
        console.log(`STEP ${nextStep + 1}: Customize Project Context (Automatic)\n`);
        console.log('  🤖 WHAT HAPPENS AFTER RESTART:\n');
        console.log('  The session_start hook will automatically present a customization prompt.\n');
        console.log('  This prompt asks you to:\n');
        console.log('    1. Review project analysis from installation');
        console.log('    2. Propose customization options (record to database, add to hooks, or search)');
        console.log('    3. Wait for user approval before executing\n');
        console.log('  💡 HOW IT WORKS:');
        console.log(`    ✓ Prompt saved to .claude/post-install-prompts/${projectHash}.md`);
        console.log('    ✓ Hook injects prompt automatically after restart');
        console.log('    ✓ Agent/user deletes file after completing customization');
        console.log('    ✓ If not deleted, prompt re-appears on next session (retry safety)\n');
        console.log('  ⚠️  AGENT: After restart, you will receive this prompt automatically.');
        console.log('      Execute it, then delete the prompt file as instructed.\n');
        console.log('  💡 SAFETY: Data-driven approach (no code generation)');
        console.log('    ✓ Context stored as JSON data');
        console.log('    ✓ Hooks read data safely (no code execution)');
        console.log('    ✓ Can be enabled/disabled anytime');
        console.log('    ✓ Generic hooks remain active (context supplements)\n');

        // Step 5: Verify installation
        console.log(`STEP ${nextStep + 2}: Verify Installation\n`);
        console.log('  ⚠️  AGENT/USER ACTION REQUIRED:\n');
        console.log('  SUBMIT this prompt to verify the system is working:\n');

        if (setupState.hooksInstalled) {
          // With hooks: demonstrate full workflow enforcement
          console.log('  ┌─────────────────────────────────────────────────────────────┐');
          console.log('  │ Create a file called installation-verified.txt with the    │');
          console.log('  │ content "Installation complete and enforcement working".   │');
          console.log('  └─────────────────────────────────────────────────────────────┘\n');
          console.log('  EXPECTED BEHAVIOR:');
          console.log('    1. Hooks will BLOCK the Write operation initially');
          console.log('    2. System guides you through workflow:');
          console.log('       • Record an experience (TEACH phase)');
          console.log('       • Search past experiences (LEARN phase)');
          console.log('       • Reason through the task (REASON phase)');
          console.log('    3. After completing workflow, Write is authorized');
          console.log('    4. File is created successfully');
          console.log('    5. This experience is saved for future use\n');
          console.log('  This verifies:');
          console.log('    ✓ MCP server is connected');
          console.log('    ✓ All 25 tools are accessible');
          console.log('    ✓ Database is working');
          console.log('    ✓ Workflow enforcement is ACTIVE');
          console.log('    ✓ Hooks are blocking/authorizing correctly');
          console.log('    ✓ Complete TEACH → LEARN → REASON → ACT cycle\n');
        } else {
          // Without hooks: basic tool verification
          console.log('  ┌─────────────────────────────────────────────────────────────┐');
          console.log('  │ Record this installation as a successful experience, then   │');
          console.log('  │ search for "installation" to verify the database works.    │');
          console.log('  └─────────────────────────────────────────────────────────────┘\n');
          console.log('  EXPECTED OUTPUT:');
          console.log('    • Experience recorded with an ID');
          console.log('    • Search returns the installation experience');
          console.log('    • Database path: .claude/experiences.db\n');
          console.log('  This verifies:');
          console.log('    ✓ MCP server is connected');
          console.log('    ✓ Basic tools are accessible (record_experience, search_experiences)');
          console.log('    ✓ Database is working');
          console.log('    ⚠️  Workflow enforcement is NOT active (hooks not installed)\n');
        }

        console.log('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('  ⏭️  AFTER VERIFICATION SUCCEEDS:\n');
        console.log('  Installation is complete! System is ready for normal use.\n');
        console.log(`  See STEP ${nextStep + 3} below for workflow examples.\n`);

        // Step 6: Start using
        console.log(`STEP ${nextStep + 3}: Start Using the System\n`);
        console.log('  WORKFLOW: TEACH → LEARN → REASON → ACT\n');
        console.log('  Example task: "Add a login button to my React app"\n');
        console.log('    1. Claude searches past experiences: search_experiences("login button")\n');
        console.log('    2. Claude analyzes problem: analyze_problem("Add login button")\n');
        console.log('    3. Claude gathers context: gather_context(...)\n');
        console.log('    4. Claude reasons through solution: reason_through(...)\n');
        console.log('    5. Claude makes changes: Write/Edit files\n');
        console.log('    6. Claude records experience: record_experience(...)\n');
        console.log('\n💡 TIP: The workflow is enforced automatically if hooks are installed.\n');

        // Documentation
        console.log('📚 DOCUMENTATION:\n');
        console.log('  Full Documentation:');
        console.log('    https://github.com/mpalpha/unified-mcp-server\n');
        console.log('  Quick Reference:');
        console.log('    https://github.com/mpalpha/unified-mcp-server/tree/main/docs\n');
        console.log('  Troubleshooting:');
        console.log('    https://github.com/mpalpha/unified-mcp-server#troubleshooting\n');

        console.log('='.repeat(60));
        console.log('🚀 Ready to use! Restart Claude Code to begin.');

        } catch (e) {
          console.error(`\n✗ Setup failed: ${e.message}`);
        }

        rl.close();
        process.exit(0);
      });
    });
  });

  return; // Don't continue to MCP server
}

// --health flag
if (args.includes('--health')) {
  console.log('Running health check...\n');
  try {
    const result = healthCheck({});
    console.log(`Status: ${result.status}`);
    console.log(`Database: ${result.database_path}`);
    console.log(`Token Directory: ${result.token_directory}`);
    console.log(`\nExperiences: ${result.experience_count}`);
    console.log(`Reasoning Sessions: ${result.reasoning_session_count}`);
    console.log(`Workflow Sessions: ${result.workflow_session_count}`);

    if (result.issues && result.issues.length > 0) {
      console.log(`\nIssues Found (${result.issues.length}):`);
      result.issues.forEach(issue => console.log(`  ❌ ${issue}`));
      process.exit(1);
    } else {
      console.log('\n✅ All checks passed');
      process.exit(0);
    }
  } catch (e) {
    console.error(`❌ Health check failed: ${e.message}`);
    process.exit(1);
  }
}

// --validate flag
if (args.includes('--validate')) {
  console.log('Validating configuration...\n');
  try {
    // v1.4.0: Load config from project-local .claude/config.json
    const claudeDir = path.join(process.cwd(), '.claude');
    const configPath = path.join(claudeDir, 'config.json');

    if (!fs.existsSync(configPath)) {
      console.log('No configuration file found at:', configPath);
      console.log('\nUsing default configuration (valid)');
      console.log('✅ Configuration is valid');
      process.exit(0);
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const result = validateConfig({ config });

    console.log(`Configuration: ${configPath}`);
    console.log(`\nValidation Result:`);

    if (result.errors && result.errors.length > 0) {
      console.log(`\n❌ Errors (${result.errors.length}):`);
      result.errors.forEach(err => console.log(`  - ${err}`));
    }

    if (result.warnings && result.warnings.length > 0) {
      console.log(`\n⚠️  Warnings (${result.warnings.length}):`);
      result.warnings.forEach(warn => console.log(`  - ${warn}`));
    }

    if (result.valid) {
      console.log('\n✅ Configuration is valid');
      process.exit(0);
    } else {
      console.log('\n❌ Configuration is invalid');
      process.exit(1);
    }
  } catch (e) {
    console.error(`❌ Validation failed: ${e.message}`);
    process.exit(1);
  }
}

// No flags provided - start MCP server
// ============================================================================
// MCP PROTOCOL IMPLEMENTATION
// ============================================================================

// State management
const state = {
  sessions: new Map()
};

// Read stdin
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Send JSON-RPC response
function sendResponse(id, result) {
  const response = {
    jsonrpc: '2.0',
    id: id,
    result: result
  };
  console.log(JSON.stringify(response));
}

// Send JSON-RPC error
function sendError(id, code, message, data) {
  const error = {
    jsonrpc: '2.0',
    id: id,
    error: {
      code: code,
      message: message
    }
  };
  if (data) error.error.data = data;
  console.log(JSON.stringify(error));
}

// Handle JSON-RPC requests
rl.on('line', (line) => {
  try {
    const request = JSON.parse(line);
    const { method, params, id } = request;

    switch (method) {
      case 'initialize':
        sendResponse(id, {
          protocolVersion: '2024-11-05',
          serverInfo: {
            name: 'unified-mcp-server',
            version: VERSION
          },
          capabilities: {
            tools: {}
          }
        });
        break;

      case 'tools/list':
        sendResponse(id, {
          tools: [
            {
              name: 'record_experience',
              description: 'Record a working knowledge pattern (effective or ineffective approach)',
              inputSchema: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['effective', 'ineffective'] },
                  domain: { type: 'string', enum: ['Tools', 'Protocol', 'Communication', 'Process', 'Debugging', 'Decision'] },
                  situation: { type: 'string' },
                  approach: { type: 'string' },
                  outcome: { type: 'string' },
                  reasoning: { type: 'string' },
                  confidence: { type: 'number', minimum: 0, maximum: 1 },
                  // v1.4.0: scope removed - all experiences are project-scoped by location
                  tags: { type: 'array', items: { type: 'string' } },
                  revision_of: { type: 'number' }
                },
                required: ['type', 'domain', 'situation', 'approach', 'outcome', 'reasoning']
              }
            },
            {
              name: 'search_experiences',
              description: 'Search for relevant working knowledge using natural language queries with FTS5 + BM25 ranking',
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Multi-term search query (uses OR logic)' },
                  domain: { type: 'string', enum: ['Tools', 'Protocol', 'Communication', 'Process', 'Debugging', 'Decision'] },
                  type: { type: 'string', enum: ['effective', 'ineffective'] },
                  min_confidence: { type: 'number', minimum: 0, maximum: 1 },
                  limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
                  offset: { type: 'number', minimum: 0, default: 0 }
                },
                required: ['query']
              }
            },
            {
              name: 'get_experience',
              description: 'Retrieve a specific experience by ID with full details including revision history',
              inputSchema: {
                type: 'object',
                properties: {
                  id: { type: 'number', description: 'Experience ID from search results' }
                },
                required: ['id']
              }
            },
            {
              name: 'update_experience',
              description: 'Update an existing experience (creates revision, preserves history)',
              inputSchema: {
                type: 'object',
                properties: {
                  id: { type: 'number' },
                  changes: { type: 'object', description: 'Fields to update' },
                  reason: { type: 'string', description: 'Why updating (audit trail)' }
                },
                required: ['id', 'changes', 'reason']
              }
            },
            {
              name: 'tag_experience',
              description: 'Add searchable tags to experiences for better organization',
              inputSchema: {
                type: 'object',
                properties: {
                  id: { type: 'number' },
                  tags: { type: 'array', items: { type: 'string' } }
                },
                required: ['id', 'tags']
              }
            },
            {
              name: 'export_experiences',
              description: 'Export experiences to JSON or Markdown for sharing/backup',
              inputSchema: {
                type: 'object',
                properties: {
                  format: { type: 'string', enum: ['json', 'markdown'] },
                  filter: { type: 'object', description: 'Optional filters (domain, type, tags)' },
                  output_path: { type: 'string', description: 'Optional file path (defaults to stdout)' }
                },
                required: ['format']
              }
            },
            {
              name: 'import_experiences',
              description: 'Import experiences from a JSON file exported from another project',
              inputSchema: {
                type: 'object',
                properties: {
                  filename: { type: 'string', description: 'Path to JSON file to import' },
                  filter: { type: 'object', description: 'Optional filters (domain, type)' }
                },
                required: ['filename']
              }
            },
            {
              name: 'analyze_problem',
              description: 'Extract intent, concepts, and priorities from a user request. First step in reasoning workflow.',
              inputSchema: {
                type: 'object',
                properties: {
                  problem: { type: 'string', description: 'User request or question' },
                  available_tools: { type: 'array', items: { type: 'string' }, description: 'MCP tool names available' }
                },
                required: ['problem']
              }
            },
            {
              name: 'gather_context',
              description: 'Collect and synthesize context from multiple sources (experiences, docs, MCP tools)',
              inputSchema: {
                type: 'object',
                properties: {
                  session_id: { type: 'string', description: 'Session ID from analyze_problem' },
                  problem: { type: 'string', description: 'Original problem statement' },
                  sources: {
                    type: 'object',
                    description: 'Context sources',
                    properties: {
                      experiences: { type: 'array', description: 'From search_experiences' },
                      local_docs: { type: 'array', description: 'From Read tool' },
                      mcp_data: { type: 'object', description: 'From other MCP servers' },
                      web_results: { type: 'array', description: 'From WebSearch' }
                    }
                  }
                },
                required: ['session_id', 'sources']
              }
            },
            {
              name: 'reason_through',
              description: 'Evaluate an approach or thought with confidence tracking. Can be called multiple times for sequential reasoning.',
              inputSchema: {
                type: 'object',
                properties: {
                  session_id: { type: 'string' },
                  thought: { type: 'string', description: 'Reasoning step' },
                  thought_number: { type: 'number', description: 'Sequential number (1, 2, 3...)' },
                  confidence: { type: 'number', minimum: 0, maximum: 1 },
                  is_revision: { type: 'boolean', description: 'Revising previous thought?' },
                  revises_thought: { type: 'number', description: 'Which thought to revise' }
                },
                required: ['session_id', 'thought', 'thought_number']
              }
            },
            {
              name: 'finalize_decision',
              description: 'Record final decision/conclusion and close reasoning session',
              inputSchema: {
                type: 'object',
                properties: {
                  session_id: { type: 'string' },
                  conclusion: { type: 'string', description: 'Final decision' },
                  rationale: { type: 'string', description: 'Why this decision' },
                  record_as_experience: { type: 'boolean', description: 'Auto-capture as experience? (default: true)' }
                },
                required: ['session_id', 'conclusion']
              }
            },
            {
              name: 'check_compliance',
              description: 'Check workflow compliance without enforcement (dry-run mode)',
              inputSchema: {
                type: 'object',
                properties: {
                  session_id: { type: 'string' },
                  current_phase: { type: 'string', enum: ['teach', 'learn', 'reason'], description: 'Current workflow phase' },
                  action: { type: 'string', description: 'Action being attempted' }
                },
                required: ['current_phase', 'action']
              }
            },
            {
              name: 'verify_compliance',
              description: 'Verify workflow compliance and create operation token',
              inputSchema: {
                type: 'object',
                properties: {
                  session_id: { type: 'string' },
                  current_phase: { type: 'string', enum: ['teach', 'learn', 'reason'], description: 'Current workflow phase' },
                  action: { type: 'string', description: 'Action being attempted' }
                },
                required: ['current_phase', 'action']
              }
            },
            {
              name: 'authorize_operation',
              description: 'Authorize operation with token and optionally create session token',
              inputSchema: {
                type: 'object',
                properties: {
                  operation_token: { type: 'string', description: 'Token from verify_compliance' },
                  create_session_token: { type: 'boolean', description: 'Create 60min session token?' }
                },
                required: ['operation_token']
              }
            },
            {
              name: 'get_workflow_status',
              description: 'Get current workflow session status and phase',
              inputSchema: {
                type: 'object',
                properties: {
                  session_id: { type: 'string' }
                }
              }
            },
            {
              name: 'reset_workflow',
              description: 'Reset workflow session and cleanup expired tokens',
              inputSchema: {
                type: 'object',
                properties: {
                  session_id: { type: 'string' },
                  cleanup_only: { type: 'boolean', description: 'Only cleanup expired tokens?' }
                }
              }
            },
            {
              name: 'list_presets',
              description: 'List available configuration presets',
              inputSchema: {
                type: 'object',
                properties: {}
              }
            },
            {
              name: 'apply_preset',
              description: 'Apply a configuration preset to session',
              inputSchema: {
                type: 'object',
                properties: {
                  preset_name: { type: 'string', description: 'Name of preset to apply' },
                  session_id: { type: 'string', description: 'Session to apply preset to' }
                },
                required: ['preset_name']
              }
            },
            {
              name: 'validate_config',
              description: 'Validate a configuration structure',
              inputSchema: {
                type: 'object',
                properties: {
                  config: { type: 'object', description: 'Configuration object to validate' }
                },
                required: ['config']
              }
            },
            {
              name: 'get_config',
              description: 'Get current active configuration',
              inputSchema: {
                type: 'object',
                properties: {
                  session_id: { type: 'string', description: 'Session ID (optional)' }
                }
              }
            },
            {
              name: 'export_config',
              description: 'Export configuration preset to file',
              inputSchema: {
                type: 'object',
                properties: {
                  preset_name: { type: 'string', description: 'Preset name to export' },
                  file_path: { type: 'string', description: 'Export file path (optional)' }
                },
                required: ['preset_name']
              }
            },
            {
              name: 'install_hooks',
              description: 'Install workflow automation hooks to ~/.claude/hooks/ (global by default, use project_hooks:true for project-local)',
              inputSchema: {
                type: 'object',
                properties: {}
              }
            },
            {
              name: 'uninstall_hooks',
              description: 'Remove installed workflow hooks from ~/.claude/hooks/',
              inputSchema: {
                type: 'object',
                properties: {}
              }
            },
            {
              name: 'get_session_state',
              description: 'Get complete session state',
              inputSchema: {
                type: 'object',
                properties: {
                  session_id: { type: 'string', description: 'Session ID to get state for' }
                },
                required: ['session_id']
              }
            },
            {
              name: 'health_check',
              description: 'Run system health diagnostics',
              inputSchema: {
                type: 'object',
                properties: {}
              }
            },
            {
              name: 'import_data',
              description: 'Import data from legacy servers',
              inputSchema: {
                type: 'object',
                properties: {
                  source_file: { type: 'string', description: 'Path to JSON file with experiences' }
                },
                required: ['source_file']
              }
            },
            {
              name: 'update_project_context',
              description: 'Update project-specific context (data-only, no code execution)',
              inputSchema: {
                type: 'object',
                properties: {
                  enabled: { type: 'boolean', description: 'Enable/disable project context display' },
                  summary: { type: 'string', description: 'One-line project summary (max 200 chars)' },
                  highlights: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Key project highlights (max 5 items, 100 chars each)'
                  },
                  reminders: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Important reminders (max 3 items, 100 chars each)'
                  },
                  preImplementation: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Checklist items to address BEFORE writing code (200 chars each)'
                  },
                  postImplementation: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Checklist items to verify AFTER writing code (200 chars each)'
                  },
                  project_path: { type: 'string', description: 'Project directory path (optional, defaults to cwd)' }
                },
                required: ['enabled']
              }
            },
            {
              name: 'get_project_context',
              description: 'Get current project context configuration',
              inputSchema: {
                type: 'object',
                properties: {
                  project_path: { type: 'string', description: 'Project directory path (optional, defaults to cwd)' }
                }
              }
            }
          ]
        });
        break;

      case 'tools/call':
        const toolName = params.name;
        const toolParams = params.arguments || {};

        let result;
        try {
          switch (toolName) {
            case 'record_experience':
              result = recordExperience(toolParams);
              break;
            case 'search_experiences':
              result = searchExperiences(toolParams);
              break;
            case 'get_experience':
              result = getExperience(toolParams);
              break;
            case 'update_experience':
              result = updateExperience(toolParams);
              break;
            case 'tag_experience':
              result = tagExperience(toolParams);
              break;
            case 'export_experiences':
              result = exportExperiences(toolParams);
              break;
            case 'import_experiences':
              result = importExperiences(toolParams);
              break;
            case 'analyze_problem':
              result = analyzeProblem(toolParams);
              break;
            case 'gather_context':
              result = gatherContext(toolParams);
              break;
            case 'reason_through':
              result = reasonThrough(toolParams);
              break;
            case 'finalize_decision':
              result = finalizeDecision(toolParams);
              break;
            case 'check_compliance':
              result = checkCompliance(toolParams);
              break;
            case 'verify_compliance':
              result = verifyCompliance(toolParams);
              break;
            case 'authorize_operation':
              result = authorizeOperation(toolParams);
              break;
            case 'get_workflow_status':
              result = getWorkflowStatus(toolParams);
              break;
            case 'reset_workflow':
              result = resetWorkflow(toolParams);
              break;
            case 'list_presets':
              result = listPresets(toolParams);
              break;
            case 'apply_preset':
              result = applyPreset(toolParams);
              break;
            case 'validate_config':
              result = validateConfig(toolParams);
              break;
            case 'get_config':
              result = getConfig(toolParams);
              break;
            case 'export_config':
              result = exportConfig(toolParams);
              break;
            case 'install_hooks':
              result = installHooks(toolParams);
              break;
            case 'uninstall_hooks':
              result = uninstallHooks(toolParams);
              break;
            case 'get_session_state':
              result = getSessionState(toolParams);
              break;
            case 'health_check':
              result = healthCheck(toolParams);
              break;
            case 'import_data':
              result = importData(toolParams);
              break;
            case 'update_project_context':
              result = updateProjectContext(toolParams);
              break;
            case 'get_project_context':
              result = getProjectContext(toolParams);
              break;
            default:
              sendError(id, -32601, `Unknown tool: ${toolName}`);
              return;
          }

          sendResponse(id, {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          });
        } catch (error) {
          if (error instanceof ValidationError) {
            sendError(id, error.code, error.message, error.details);
          } else {
            console.error('[unified-mcp] Error:', error);
            sendError(id, -32603, 'Internal error: ' + error.message);
          }
        }
        break;

      case 'notifications/initialized':
        // No response needed for notifications
        break;

      default:
        sendError(id, -32601, `Unknown method: ${method}`);
    }
  } catch (error) {
    console.error('[unified-mcp] Error parsing request:', error);
    sendError(null, -32700, 'Parse error');
  }
});

// Handle STDIN close
rl.on('close', () => {
  console.error('[unified-mcp] STDIN closed, shutting down gracefully');
  setImmediate(() => {
    process.stdout.write('', () => {
      // Give a moment for any pending database operations to complete
      // This prevents FTS5 corruption when processes close rapidly
      setTimeout(() => {
        db.close();
        process.exit(0);
      }, 50);
    });
  });
});

// Handle errors
process.on('uncaughtException', (error) => {
  console.error('[unified-mcp] Uncaught exception:', error);
  process.exit(1);
});

console.error(`[unified-mcp] Server started (v${VERSION})`);
console.error(`[unified-mcp] Database: ${DB_PATH}`);
console.error(`[unified-mcp] Token directory: ${TOKEN_DIR}`);
