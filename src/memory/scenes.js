/**
 * Scenes, Cells, and Cell Evidence
 *
 * Phase 2: Semantic memory with deterministic salience and stable ordering.
 */

const { getDatabase } = require('../database');
const { canonicalJson, hash } = require('./canonical');
const { computeSalience } = require('./salience');

/**
 * Create a scene.
 *
 * @param {object} params
 * @param {string} [params.scope='project']
 * @param {string} params.label
 * @param {string[]} [params.context_keys=[]]
 * @param {string} params.now - ISO timestamp
 * @returns {object} { scene_id, ... }
 */
function createScene({ scope = 'project', label, context_keys = [], now }) {
  const db = getDatabase();
  const canonicalKeys = [...new Set(context_keys.map(k => String(k).trim().toLowerCase()))].sort();
  const contextKeysJson = canonicalJson(canonicalKeys);

  const result = db.prepare(`
    INSERT INTO scenes (scope, label, context_keys_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(scope, label, contextKeysJson, now, now);

  const sceneId = typeof result.lastInsertRowid === 'bigint'
    ? Number(result.lastInsertRowid)
    : result.lastInsertRowid;

  return {
    scene_id: sceneId,
    scope,
    label,
    context_keys: canonicalKeys,
    created_at: now,
    updated_at: now
  };
}

/**
 * Get a scene by ID.
 *
 * @param {number} sceneId
 * @returns {object|null}
 */
function getScene(sceneId) {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM scenes WHERE scene_id = ?').get(sceneId);
  if (!row) return null;
  return { ...row, context_keys: JSON.parse(row.context_keys_json) };
}

/**
 * Get all scenes for a scope.
 *
 * @param {string} scope
 * @returns {object[]}
 */
function getScenes(scope) {
  const db = getDatabase();
  return db.prepare('SELECT * FROM scenes WHERE scope = ? ORDER BY scene_id ASC')
    .all(scope)
    .map(row => ({ ...row, context_keys: JSON.parse(row.context_keys_json) }));
}

/**
 * Compute canonical key for a cell.
 *
 * @param {number} sceneId
 * @param {string} cellType
 * @param {string} title
 * @returns {string}
 */
function computeCanonicalKey(sceneId, cellType, title) {
  const normalized = title.trim().toLowerCase().replace(/\s+/g, ' ');
  return hash({ scene_id: sceneId, cell_type: cellType, title: normalized });
}

/**
 * Create a cell within a scene.
 *
 * @param {object} params
 * @param {number} params.scene_id
 * @param {string} [params.scope='project']
 * @param {string} params.cell_type - fact/rule/preference/policy
 * @param {string} params.title
 * @param {string} params.body
 * @param {number} [params.trust=1]
 * @param {string} [params.state='unverified']
 * @param {string} params.now - ISO timestamp
 * @returns {object} { cell_id, canonical_key, salience, ... }
 */
function createCell({ scene_id, scope = 'project', cell_type, title, body, trust = 1, state = 'unverified', now }) {
  const db = getDatabase();
  const canonicalKey = computeCanonicalKey(scene_id, cell_type, title);

  const salience = computeSalience({
    state,
    evidence_count: 0,
    contradiction_count: 0,
    trust,
    updated_at: now,
    now
  });

  const result = db.prepare(`
    INSERT INTO cells (scene_id, scope, cell_type, title, body, trust, salience, state,
      evidence_count, contradiction_count, created_at, updated_at, canonical_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)
  `).run(scene_id, scope, cell_type, title, body, trust, salience, state, now, now, canonicalKey);

  const cellId = typeof result.lastInsertRowid === 'bigint'
    ? Number(result.lastInsertRowid)
    : result.lastInsertRowid;

  return {
    cell_id: cellId,
    scene_id,
    scope,
    cell_type,
    title,
    body,
    trust,
    salience,
    state,
    evidence_count: 0,
    contradiction_count: 0,
    canonical_key: canonicalKey,
    created_at: now,
    updated_at: now
  };
}

/**
 * Get a cell by ID.
 *
 * @param {number} cellId
 * @returns {object|null}
 */
function getCell(cellId) {
  const db = getDatabase();
  return db.prepare('SELECT * FROM cells WHERE cell_id = ?').get(cellId) || null;
}

/**
 * Get a cell by canonical key.
 *
 * @param {string} canonicalKey
 * @returns {object|null}
 */
function getCellByCanonicalKey(canonicalKey) {
  const db = getDatabase();
  return db.prepare('SELECT * FROM cells WHERE canonical_key = ?').get(canonicalKey) || null;
}

/**
 * Link evidence to a cell.
 *
 * @param {object} params
 * @param {number} params.cell_id
 * @param {number} params.experience_id
 * @param {string} params.relation - 'supports' or 'contradicts'
 * @param {string} params.now - ISO timestamp
 * @returns {object}
 */
function linkCellEvidence({ cell_id, experience_id, relation, now }) {
  const db = getDatabase();

  db.prepare(`
    INSERT INTO cell_evidence (cell_id, experience_id, relation, created_at)
    VALUES (?, ?, ?, ?)
  `).run(cell_id, experience_id, relation, now);

  // Update counts on cell
  if (relation === 'supports') {
    db.prepare(`
      UPDATE cells SET evidence_count = evidence_count + 1, updated_at = ?
      WHERE cell_id = ?
    `).run(now, cell_id);
  } else if (relation === 'contradicts') {
    db.prepare(`
      UPDATE cells SET contradiction_count = contradiction_count + 1, updated_at = ?
      WHERE cell_id = ?
    `).run(now, cell_id);
  }

  return { cell_id, experience_id, relation, linked_at: now };
}

/**
 * Recompute salience for a cell and persist.
 *
 * @param {number} cellId
 * @param {string} now - ISO timestamp
 * @returns {number} New salience value
 */
function recomputeCellSalience(cellId, now) {
  const db = getDatabase();
  const cell = db.prepare('SELECT * FROM cells WHERE cell_id = ?').get(cellId);
  if (!cell) return 0;

  const newSalience = computeSalience({
    state: cell.state,
    evidence_count: cell.evidence_count,
    contradiction_count: cell.contradiction_count,
    trust: cell.trust,
    updated_at: cell.updated_at,
    now
  });

  db.prepare('UPDATE cells SET salience = ? WHERE cell_id = ?').run(newSalience, cellId);
  return newSalience;
}

/**
 * Query cells for context with stable ordering.
 * Excludes archived cells.
 *
 * @param {object} params
 * @param {string} [params.scope='project']
 * @param {string[]} [params.context_keys=[]]
 * @param {number} [params.limit=20]
 * @param {string} params.now - ISO timestamp
 * @returns {object[]}
 */
function queryCellsForContext({ scope = 'project', context_keys = [], limit = 20, now }) {
  const db = getDatabase();

  // If context_keys provided, find matching scenes first
  let sceneIds = null;
  if (context_keys.length > 0) {
    const canonicalKeys = [...new Set(context_keys.map(k => String(k).trim().toLowerCase()))].sort();
    const scenes = db.prepare('SELECT * FROM scenes WHERE scope = ?').all(scope);
    sceneIds = scenes
      .filter(scene => {
        const sceneKeys = JSON.parse(scene.context_keys_json);
        return computeOverlap(canonicalKeys, sceneKeys) >= 0.5;
      })
      .map(s => s.scene_id);

    if (sceneIds.length === 0) {
      // Fallback: return top cells in scope
      sceneIds = null;
    }
  }

  let query;
  let params;
  if (sceneIds && sceneIds.length > 0) {
    const placeholders = sceneIds.map(() => '?').join(',');
    query = `
      SELECT * FROM cells
      WHERE scope = ? AND state != 'archived' AND scene_id IN (${placeholders})
      ORDER BY trust DESC, salience DESC, updated_at DESC, cell_id ASC
      LIMIT ?
    `;
    params = [scope, ...sceneIds, limit];
  } else {
    query = `
      SELECT * FROM cells
      WHERE scope = ? AND state != 'archived'
      ORDER BY trust DESC, salience DESC, updated_at DESC, cell_id ASC
      LIMIT ?
    `;
    params = [scope, limit];
  }

  return db.prepare(query).all(...params);
}

/**
 * Compute overlap ratio between two sorted key arrays.
 * overlap(A,B) = |A∩B| / max(|A|,|B|)
 *
 * @param {string[]} a - Sorted array
 * @param {string[]} b - Sorted array
 * @returns {number} Overlap ratio (0-1)
 */
function computeOverlap(a, b) {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const intersection = b.filter(k => setA.has(k));
  return intersection.length / Math.max(a.length, b.length);
}

/**
 * Update a cell's state.
 *
 * @param {number} cellId
 * @param {string} newState
 * @param {string} now
 */
function updateCellState(cellId, newState, now) {
  const db = getDatabase();
  db.prepare('UPDATE cells SET state = ?, updated_at = ? WHERE cell_id = ?').run(newState, now, cellId);
}

/**
 * Update a cell's trust level.
 *
 * @param {number} cellId
 * @param {number} trust
 * @param {string} now
 */
function updateCellTrust(cellId, trust, now) {
  const db = getDatabase();
  db.prepare('UPDATE cells SET trust = ?, updated_at = ? WHERE cell_id = ?').run(trust, now, cellId);
}

/**
 * Archive a cell.
 *
 * @param {number} cellId
 * @param {string} now
 */
function archiveCell(cellId, now) {
  const db = getDatabase();
  db.prepare("UPDATE cells SET state = 'archived', salience = 0, updated_at = ? WHERE cell_id = ?").run(now, cellId);
}

/**
 * Count cells for a scope, optionally excluding archived.
 *
 * @param {string} scope
 * @param {boolean} [excludeArchived=true]
 * @returns {number}
 */
function countCells(scope, excludeArchived = true) {
  const db = getDatabase();
  const where = excludeArchived ? "WHERE scope = ? AND state != 'archived'" : 'WHERE scope = ?';
  const row = db.prepare(`SELECT COUNT(*) as cnt FROM cells ${where}`).get(scope);
  return row ? row.cnt : 0;
}

/**
 * Count cells in a specific scene.
 *
 * @param {number} sceneId
 * @param {boolean} [excludeArchived=true]
 * @returns {number}
 */
function countCellsInScene(sceneId, excludeArchived = true) {
  const db = getDatabase();
  const where = excludeArchived
    ? "WHERE scene_id = ? AND state != 'archived'"
    : 'WHERE scene_id = ?';
  const row = db.prepare(`SELECT COUNT(*) as cnt FROM cells ${where}`).get(sceneId);
  return row ? row.cnt : 0;
}

/**
 * Get cells in a scene with stable ordering.
 *
 * @param {number} sceneId
 * @returns {object[]}
 */
function getCellsInScene(sceneId) {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM cells WHERE scene_id = ?
    ORDER BY trust DESC, salience DESC, updated_at DESC, cell_id ASC
  `).all(sceneId);
}

module.exports = {
  createScene,
  getScene,
  getScenes,
  computeCanonicalKey,
  createCell,
  getCell,
  getCellByCanonicalKey,
  linkCellEvidence,
  recomputeCellSalience,
  queryCellsForContext,
  computeOverlap,
  updateCellState,
  updateCellTrust,
  archiveCell,
  countCells,
  countCellsInScene,
  getCellsInScene
};
