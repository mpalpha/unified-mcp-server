/**
 * Episodic Experiences (Spec Version)
 *
 * Distinct from the existing experiences table.
 * Uses episodic_experiences table with trust/salience/context_keys.
 */

const { getDatabase } = require('../database');
const { canonicalJson } = require('./canonical');
const { computeSalience } = require('./salience');

const MAX_SUMMARY_LENGTH = 4000;

/**
 * Record an episodic experience.
 *
 * @param {object} params
 * @param {number} [params.session_id] - Session ID (nullable)
 * @param {string} [params.scope='project'] - 'project' or 'global'
 * @param {string[]} [params.context_keys=[]] - Context keys (will be sorted+deduped)
 * @param {string} params.summary - Experience summary
 * @param {string} [params.outcome='unknown'] - success/partial/fail/unknown
 * @param {number} [params.trust=1] - Trust level 0-3
 * @param {number} [params.salience] - Salience (auto-computed if omitted)
 * @param {string} [params.source='system'] - user/system/agent/derived
 * @param {string} params.now - ISO timestamp
 * @returns {object} { experience_id, ... }
 */
function recordExperience({
  session_id = null,
  scope = 'project',
  context_keys = [],
  summary,
  outcome = 'unknown',
  trust = 1,
  salience,
  source = 'system',
  now
}) {
  if (!summary || typeof summary !== 'string') {
    return { error: true, code: 'MISSING_REQUIRED', message: 'summary is required' };
  }
  if (summary.length > MAX_SUMMARY_LENGTH) {
    return { error: true, code: 'PAYLOAD_TOO_LARGE', message: `summary exceeds ${MAX_SUMMARY_LENGTH} chars` };
  }
  if (trust < 0 || trust > 3) {
    return { error: true, code: 'INVALID_TRUST', message: 'trust must be 0-3' };
  }

  // Canonicalize context_keys: sort + dedupe
  const canonicalKeys = [...new Set(context_keys.map(k => String(k).trim().toLowerCase()))].sort();
  const contextKeysJson = canonicalJson(canonicalKeys);

  // Auto-compute salience if not provided
  if (salience === undefined || salience === null) {
    salience = computeSalience({
      state: trust >= 2 ? 'reinforced' : (trust >= 1 ? 'observed' : 'unverified'),
      evidence_count: 0,
      contradiction_count: 0,
      trust,
      updated_at: now,
      now
    });
  }
  salience = Math.max(0, Math.min(1000, salience));

  const db = getDatabase();
  const result = db.prepare(`
    INSERT INTO episodic_experiences (session_id, scope, context_keys_json, summary, outcome, trust, salience, created_at, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(session_id, scope, contextKeysJson, summary, outcome, trust, salience, now, source);

  const experienceId = typeof result.lastInsertRowid === 'bigint'
    ? Number(result.lastInsertRowid)
    : result.lastInsertRowid;

  return {
    experience_id: experienceId,
    session_id,
    scope,
    context_keys: canonicalKeys,
    summary,
    outcome,
    trust,
    salience,
    created_at: now,
    source
  };
}

/**
 * Get an episodic experience by ID.
 *
 * @param {number} experienceId
 * @returns {object|null}
 */
function getExperience(experienceId) {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM episodic_experiences WHERE experience_id = ?').get(experienceId);
  if (!row) return null;
  return {
    ...row,
    context_keys: JSON.parse(row.context_keys_json)
  };
}

/**
 * Query episodic experiences with stable ordering.
 *
 * @param {object} params
 * @param {string} [params.scope] - Filter by scope
 * @param {number} [params.session_id] - Filter by session
 * @param {number} [params.limit=50] - Max results
 * @returns {object[]}
 */
function queryExperiences({ scope, session_id, limit = 50 } = {}) {
  const db = getDatabase();
  const conditions = [];
  const values = [];

  if (scope) {
    conditions.push('scope = ?');
    values.push(scope);
  }
  if (session_id !== undefined && session_id !== null) {
    conditions.push('session_id = ?');
    values.push(session_id);
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  values.push(limit);

  const rows = db.prepare(`
    SELECT * FROM episodic_experiences
    ${where}
    ORDER BY trust DESC, salience DESC, created_at DESC, experience_id ASC
    LIMIT ?
  `).all(...values);

  return rows.map(row => ({
    ...row,
    context_keys: JSON.parse(row.context_keys_json)
  }));
}

/**
 * Count experiences matching criteria.
 *
 * @param {object} params
 * @param {string} [params.scope] - Filter by scope
 * @param {string[]} [params.context_keys] - Filter by context keys (any overlap)
 * @returns {number}
 */
function countExperiences({ scope, context_keys } = {}) {
  const db = getDatabase();
  const conditions = [];
  const values = [];

  if (scope) {
    conditions.push('scope = ?');
    values.push(scope);
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const row = db.prepare(`SELECT COUNT(*) as cnt FROM episodic_experiences ${where}`).get(...values);
  return row ? row.cnt : 0;
}

/**
 * Get experiences since a given timestamp.
 *
 * @param {string} scope
 * @param {string|null} sinceTs - ISO timestamp (null = all)
 * @returns {object[]}
 */
function getExperiencesSince(scope, sinceTs) {
  const db = getDatabase();
  if (sinceTs) {
    return db.prepare(`
      SELECT * FROM episodic_experiences
      WHERE scope = ? AND created_at > ?
      ORDER BY experience_id ASC
    `).all(scope, sinceTs).map(row => ({
      ...row,
      context_keys: JSON.parse(row.context_keys_json)
    }));
  }
  return db.prepare(`
    SELECT * FROM episodic_experiences
    WHERE scope = ?
    ORDER BY experience_id ASC
  `).all(scope).map(row => ({
    ...row,
    context_keys: JSON.parse(row.context_keys_json)
  }));
}

module.exports = {
  recordExperience,
  getExperience,
  queryExperiences,
  countExperiences,
  getExperiencesSince,
  MAX_SUMMARY_LENGTH
};
