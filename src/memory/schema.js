/**
 * Memory System Schema - Phase 1 + Phase 2 tables
 *
 * Creates all tables for the deterministic memory system.
 * Called from migration 002 or directly during --init.
 */

/**
 * Phase 1 tables: sessions, invocations, receipts, tokens, episodic_experiences
 */
const PHASE1_SCHEMA = `
  -- Memory sessions (spec: sessions)
  CREATE TABLE IF NOT EXISTS memory_sessions (
    session_id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    scope_mode TEXT NOT NULL DEFAULT 'project',
    flags_json TEXT NOT NULL DEFAULT '{}',
    last_phase TEXT,
    last_context_hash TEXT
  );

  -- Invocation ledger with hash chain
  CREATE TABLE IF NOT EXISTS invocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    ts TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    output_hash TEXT NOT NULL,
    meta_json TEXT DEFAULT '{}',
    prev_hash TEXT,
    hash TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES memory_sessions(session_id)
  );
  CREATE INDEX IF NOT EXISTS idx_invocations_session_ts ON invocations(session_id, ts);

  -- Signed receipts
  CREATE TABLE IF NOT EXISTS receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    ts TEXT NOT NULL,
    receipt_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    signature TEXT NOT NULL,
    public_meta_json TEXT DEFAULT '{}',
    FOREIGN KEY (session_id) REFERENCES memory_sessions(session_id)
  );

  -- Signed tokens
  CREATE TABLE IF NOT EXISTS memory_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    ts TEXT NOT NULL,
    token_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    signature TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES memory_sessions(session_id)
  );

  -- Episodic experiences (spec version, distinct from existing experiences table)
  CREATE TABLE IF NOT EXISTS episodic_experiences (
    experience_id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    scope TEXT NOT NULL DEFAULT 'project' CHECK(scope IN ('project', 'global')),
    context_keys_json TEXT NOT NULL DEFAULT '[]',
    summary TEXT NOT NULL,
    outcome TEXT NOT NULL DEFAULT 'unknown' CHECK(outcome IN ('success', 'partial', 'fail', 'unknown')),
    trust INTEGER NOT NULL DEFAULT 1 CHECK(trust BETWEEN 0 AND 3),
    salience INTEGER NOT NULL DEFAULT 0 CHECK(salience BETWEEN 0 AND 1000),
    created_at TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'system' CHECK(source IN ('user', 'system', 'agent', 'derived')),
    FOREIGN KEY (session_id) REFERENCES memory_sessions(session_id)
  );
  CREATE INDEX IF NOT EXISTS idx_episodic_session ON episodic_experiences(session_id);
  CREATE INDEX IF NOT EXISTS idx_episodic_scope ON episodic_experiences(scope);
  CREATE INDEX IF NOT EXISTS idx_episodic_created ON episodic_experiences(created_at);

  -- Consolidation metadata
  CREATE TABLE IF NOT EXISTS consolidation_meta (
    scope TEXT PRIMARY KEY CHECK(scope IN ('project', 'global')),
    last_consolidation_ts TEXT
  );
`;

/**
 * Phase 2 tables: scenes, cells, cell_evidence
 */
const PHASE2_SCHEMA = `
  -- Scenes (semantic grouping)
  CREATE TABLE IF NOT EXISTS scenes (
    scene_id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL DEFAULT 'project' CHECK(scope IN ('project', 'global')),
    label TEXT NOT NULL,
    context_keys_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_scenes_scope ON scenes(scope);

  -- Cells (knowledge units within scenes)
  CREATE TABLE IF NOT EXISTS cells (
    cell_id INTEGER PRIMARY KEY AUTOINCREMENT,
    scene_id INTEGER NOT NULL,
    scope TEXT NOT NULL DEFAULT 'project' CHECK(scope IN ('project', 'global')),
    cell_type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    trust INTEGER NOT NULL DEFAULT 1 CHECK(trust BETWEEN 0 AND 3),
    salience INTEGER NOT NULL DEFAULT 0 CHECK(salience BETWEEN 0 AND 1000),
    state TEXT NOT NULL DEFAULT 'unverified',
    evidence_count INTEGER NOT NULL DEFAULT 0,
    contradiction_count INTEGER NOT NULL DEFAULT 0,
    conflict_group TEXT,
    supersedes_cell_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    canonical_key TEXT UNIQUE NOT NULL,
    FOREIGN KEY (scene_id) REFERENCES scenes(scene_id),
    FOREIGN KEY (supersedes_cell_id) REFERENCES cells(cell_id)
  );
  CREATE INDEX IF NOT EXISTS idx_cells_scene ON cells(scene_id);
  CREATE INDEX IF NOT EXISTS idx_cells_scope ON cells(scope);
  CREATE INDEX IF NOT EXISTS idx_cells_state ON cells(state);
  CREATE INDEX IF NOT EXISTS idx_cells_canonical ON cells(canonical_key);

  -- Cell evidence links
  CREATE TABLE IF NOT EXISTS cell_evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cell_id INTEGER NOT NULL,
    experience_id INTEGER NOT NULL,
    relation TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (cell_id) REFERENCES cells(cell_id),
    FOREIGN KEY (experience_id) REFERENCES episodic_experiences(experience_id)
  );
  CREATE INDEX IF NOT EXISTS idx_evidence_cell ON cell_evidence(cell_id);
  CREATE INDEX IF NOT EXISTS idx_evidence_exp ON cell_evidence(experience_id);
`;

/**
 * Apply all memory system schema to a database instance.
 *
 * @param {object} database - SQLite database instance
 */
function applyMemorySchema(database) {
  database.exec(PHASE1_SCHEMA);
  database.exec(PHASE2_SCHEMA);
}

module.exports = {
  PHASE1_SCHEMA,
  PHASE2_SCHEMA,
  applyMemorySchema
};
