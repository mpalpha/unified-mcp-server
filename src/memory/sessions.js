/**
 * Memory Sessions
 *
 * Manages deterministic session lifecycle.
 */

const { getDatabase } = require('../database');
const { canonicalJson } = require('./canonical');

/**
 * Create a new memory session.
 *
 * @param {object} params
 * @param {string} [params.scope_mode='project'] - Scope mode
 * @param {object} [params.flags={}] - Session flags
 * @param {string} params.now - ISO timestamp
 * @returns {object} { session_id, created_at, scope_mode }
 */
function createSession({ scope_mode = 'project', flags = {}, now }) {
  const db = getDatabase();
  const flagsJson = canonicalJson(flags);
  const stmt = db.prepare(`
    INSERT INTO memory_sessions (created_at, scope_mode, flags_json)
    VALUES (?, ?, ?)
  `);
  const result = stmt.run(now, scope_mode, flagsJson);
  const sessionId = result.lastInsertRowid || result.changes;

  // Retrieve the actual session_id (AUTOINCREMENT)
  const row = db.prepare('SELECT session_id FROM memory_sessions WHERE rowid = ?').get(
    typeof sessionId === 'bigint' ? Number(sessionId) : sessionId
  );

  return {
    session_id: row ? row.session_id : (typeof sessionId === 'bigint' ? Number(sessionId) : sessionId),
    created_at: now,
    scope_mode
  };
}

/**
 * Get a session by ID.
 *
 * @param {number} sessionId
 * @returns {object|null}
 */
function getSession(sessionId) {
  const db = getDatabase();
  return db.prepare('SELECT * FROM memory_sessions WHERE session_id = ?').get(sessionId) || null;
}

/**
 * Update session's last_phase and/or last_context_hash.
 *
 * @param {number} sessionId
 * @param {object} updates - { last_phase?, last_context_hash? }
 */
function updateSession(sessionId, updates) {
  const db = getDatabase();
  const sets = [];
  const values = [];
  if (updates.last_phase !== undefined) {
    sets.push('last_phase = ?');
    values.push(updates.last_phase);
  }
  if (updates.last_context_hash !== undefined) {
    sets.push('last_context_hash = ?');
    values.push(updates.last_context_hash);
  }
  if (sets.length === 0) return;
  values.push(sessionId);
  db.prepare(`UPDATE memory_sessions SET ${sets.join(', ')} WHERE session_id = ?`).run(...values);
}

module.exports = {
  createSession,
  getSession,
  updateSession
};
