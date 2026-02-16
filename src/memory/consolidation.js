/**
 * Deterministic Consolidation Engine (Phase 3)
 *
 * Processes experiences into scenes/cells via conservative templates.
 * Fully deterministic: no randomness, stable ordering, reproducible outputs.
 */

const { getDatabase } = require('../database');
const { canonicalJson } = require('./canonical');
const { computeSalience } = require('./salience');
const { getExperiencesSince } = require('./experiences');
const {
  createScene, getScenes, computeCanonicalKey, createCell,
  getCellByCanonicalKey, linkCellEvidence, recomputeCellSalience,
  computeOverlap, updateCellState, archiveCell, countCells,
  countCellsInScene, getCellsInScene
} = require('./scenes');

// Configuration constants
const MAX_CELLS_PER_SCENE = 100;
const MAX_CELLS_TOTAL = 500;
const MAX_EXPERIENCES = 10000;
const OVERLAP_THRESHOLD = 0.5;
const ARCHIVE_SALIENCE_THRESHOLD = 20;
const STALE_DAYS = 90;

/**
 * Extract candidate cells from experience summary via conservative templates.
 *
 * @param {object} experience
 * @returns {object[]} Array of { cell_type, title, body }
 */
function extractCandidates(experience) {
  const candidates = [];
  const summary = experience.summary || '';
  const source = experience.source || 'system';

  // Split into sentences (simple boundary detection)
  const sentences = summary.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length < 5) continue;

    // Rule/Constraint: contains always/never/must/should
    if (/\b(always|never|must|should)\b/i.test(trimmed)) {
      candidates.push({
        cell_type: 'rule',
        title: trimmed.slice(0, 80).trim(),
        body: trimmed
      });
      continue;
    }

    // Preference: user-sourced, contains prefer/want/need
    if (source === 'user' && /\b(prefer|i want|i need|i like)\b/i.test(trimmed)) {
      candidates.push({
        cell_type: 'preference',
        title: trimmed.slice(0, 80).trim(),
        body: trimmed
      });
      continue;
    }

    // Policy: experiences with behavioral/governance violation keys
    if (experience.context_keys &&
        experience.context_keys.some(k => k.includes('behavioral_violation') || k.includes('governance') || k.includes('policy'))) {
      candidates.push({
        cell_type: 'policy',
        title: trimmed.slice(0, 80).trim(),
        body: trimmed
      });
      continue;
    }

    // Fact: "X is Y" pattern (simple)
    if (/\b\w+\s+is\s+\w+/i.test(trimmed) && trimmed.length < 200) {
      candidates.push({
        cell_type: 'fact',
        title: trimmed.slice(0, 80).trim(),
        body: trimmed
      });
    }
  }

  return candidates;
}

/**
 * Conservative contradiction detection.
 * Only within same scene_id, same cell_type, same normalized title key.
 * One contains "not" while the other does not.
 *
 * @param {object} candidateCell - { cell_type, title, body }
 * @param {object} existingCell - DB cell row
 * @returns {boolean}
 */
function isContradiction(candidateCell, existingCell) {
  if (candidateCell.cell_type !== existingCell.cell_type) return false;

  const normCandidate = candidateCell.title.trim().toLowerCase();
  const normExisting = existingCell.title.trim().toLowerCase();

  // Must have overlapping title roots
  const candidateWords = new Set(normCandidate.split(/\s+/));
  const existingWords = new Set(normExisting.split(/\s+/));
  const overlap = [...candidateWords].filter(w => existingWords.has(w)).length;
  if (overlap < 2) return false;

  // One contains "not" and the other doesn't
  const candidateHasNot = /\bnot\b/.test(candidateCell.body.toLowerCase());
  const existingHasNot = /\bnot\b/.test(existingCell.body.toLowerCase());
  return candidateHasNot !== existingHasNot;
}

/**
 * Apply deterministic state transitions.
 *
 * @param {object} cell - Cell row from DB
 * @returns {string|null} New state, or null if no transition
 */
function computeStateTransition(cell) {
  const { state, evidence_count, contradiction_count } = cell;

  // Decaying check first (applies to any state)
  if (contradiction_count >= 2 && state !== 'archived' && state !== 'decaying') {
    return 'decaying';
  }

  switch (state) {
    case 'unverified':
      if (evidence_count >= 1) return 'observed';
      break;
    case 'observed':
      if (evidence_count >= 2 && contradiction_count === 0) return 'reinforced';
      break;
    case 'reinforced':
      if (evidence_count >= 3) return 'stable';
      break;
    case 'decaying':
      // archived handled in caps enforcement
      break;
  }
  return null;
}

/**
 * Run consolidation for a scope.
 *
 * @param {object} params
 * @param {string} [params.scope='project']
 * @param {string} params.now - ISO timestamp
 * @param {string} [params.mode='normal'] - Reserved for future use
 * @returns {object} Consolidation results
 */
function runConsolidation({ scope = 'project', now, mode = 'normal' }) {
  const db = getDatabase();

  // Get last consolidation timestamp
  const metaRow = db.prepare('SELECT last_consolidation_ts FROM consolidation_meta WHERE scope = ?').get(scope);
  const lastTs = metaRow ? metaRow.last_consolidation_ts : null;

  // Get experiences since last consolidation
  const experiences = getExperiencesSince(scope, lastTs);
  if (experiences.length === 0) {
    return { processed: 0, scenes_created: 0, cells_created: 0, cells_updated: 0, contradictions: 0 };
  }

  const existingScenes = getScenes(scope);
  let scenesCreated = 0;
  let cellsCreated = 0;
  let cellsUpdated = 0;
  let contradictions = 0;

  // Group experiences by context_keys overlap
  const groups = groupExperiencesByKeys(experiences);

  for (const group of groups) {
    // Find matching scene or create new one
    let sceneId = null;
    const groupKeys = group.context_keys;

    for (const scene of existingScenes) {
      if (computeOverlap(groupKeys, scene.context_keys) >= OVERLAP_THRESHOLD) {
        sceneId = scene.scene_id;
        break;
      }
    }

    if (sceneId === null) {
      // Create new scene
      const label = groupKeys.slice(0, 3).join(', ') || 'general';
      const scene = createScene({ scope, label, context_keys: groupKeys, now });
      sceneId = scene.scene_id;
      existingScenes.push({ ...scene, context_keys: groupKeys, context_keys_json: canonicalJson(groupKeys) });
      scenesCreated++;
    }

    // Process each experience in the group
    for (const exp of group.experiences) {
      const candidates = extractCandidates(exp);

      for (const candidate of candidates) {
        const canonicalKey = computeCanonicalKey(sceneId, candidate.cell_type, candidate.title);
        const existing = getCellByCanonicalKey(canonicalKey);

        if (existing) {
          // Deduplicate: add evidence to existing cell
          linkCellEvidence({
            cell_id: existing.cell_id,
            experience_id: exp.experience_id,
            relation: 'supports',
            now
          });
          cellsUpdated++;

          // Check for contradictions in same scene
          const sceneCells = getCellsInScene(sceneId);
          for (const sceneCell of sceneCells) {
            if (sceneCell.cell_id === existing.cell_id) continue;
            if (isContradiction(candidate, sceneCell)) {
              linkCellEvidence({
                cell_id: sceneCell.cell_id,
                experience_id: exp.experience_id,
                relation: 'contradicts',
                now
              });
              contradictions++;
            }
          }
        } else {
          // Create new cell
          const trust = (candidate.cell_type === 'preference' && exp.source === 'user') ? 2 : 1;
          const cell = createCell({
            scene_id: sceneId,
            scope,
            cell_type: candidate.cell_type,
            title: candidate.title,
            body: candidate.body,
            trust,
            state: 'observed',
            now
          });
          cellsCreated++;

          // Link experience as evidence
          linkCellEvidence({
            cell_id: cell.cell_id,
            experience_id: exp.experience_id,
            relation: 'supports',
            now
          });

          // Check for contradictions
          const sceneCells = getCellsInScene(sceneId);
          for (const sceneCell of sceneCells) {
            if (sceneCell.cell_id === cell.cell_id) continue;
            if (isContradiction(candidate, sceneCell)) {
              linkCellEvidence({
                cell_id: sceneCell.cell_id,
                experience_id: exp.experience_id,
                relation: 'contradicts',
                now
              });
              contradictions++;
            }
          }
        }
      }
    }
  }

  // Apply state transitions for all non-archived cells in scope
  const allCells = db.prepare("SELECT * FROM cells WHERE scope = ? AND state != 'archived'").all(scope);
  for (const cell of allCells) {
    const newState = computeStateTransition(cell);
    if (newState) {
      updateCellState(cell.cell_id, newState, now);
    }
    recomputeCellSalience(cell.cell_id, now);
  }

  // Enforce caps
  enforceCaps(scope, now);

  // Update consolidation timestamp
  db.prepare(`
    INSERT OR REPLACE INTO consolidation_meta (scope, last_consolidation_ts) VALUES (?, ?)
  `).run(scope, now);

  return {
    processed: experiences.length,
    scenes_created: scenesCreated,
    cells_created: cellsCreated,
    cells_updated: cellsUpdated,
    contradictions
  };
}

/**
 * Group experiences by context_keys overlap.
 *
 * @param {object[]} experiences
 * @returns {object[]} Array of { context_keys, experiences }
 */
function groupExperiencesByKeys(experiences) {
  const groups = [];

  for (const exp of experiences) {
    const expKeys = exp.context_keys || [];
    let assigned = false;

    for (const group of groups) {
      const overlap = computeOverlap(expKeys, group.context_keys);
      if (overlap >= OVERLAP_THRESHOLD) {
        group.experiences.push(exp);
        // Merge keys (union, sorted)
        const merged = [...new Set([...group.context_keys, ...expKeys])].sort();
        group.context_keys = merged;
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      groups.push({
        context_keys: [...expKeys],
        experiences: [exp]
      });
    }
  }

  return groups;
}

/**
 * Enforce caps: MAX_CELLS_PER_SCENE, MAX_CELLS_TOTAL.
 * Archives lowest-salience cells first (tie-break by cell_id ASC).
 *
 * @param {string} scope
 * @param {string} now
 */
function enforceCaps(scope, now) {
  const db = getDatabase();

  // Per-scene cap
  const scenes = db.prepare('SELECT scene_id FROM scenes WHERE scope = ?').all(scope);
  for (const scene of scenes) {
    const count = countCellsInScene(scene.scene_id);
    if (count > MAX_CELLS_PER_SCENE) {
      const excess = count - MAX_CELLS_PER_SCENE;
      const toArchive = db.prepare(`
        SELECT cell_id FROM cells
        WHERE scene_id = ? AND state != 'archived'
        ORDER BY salience ASC, cell_id ASC
        LIMIT ?
      `).all(scene.scene_id, excess);
      for (const c of toArchive) {
        archiveCell(c.cell_id, now);
      }
    }
  }

  // Total cap
  const totalCount = countCells(scope);
  if (totalCount > MAX_CELLS_TOTAL) {
    const excess = totalCount - MAX_CELLS_TOTAL;
    const toArchive = db.prepare(`
      SELECT cell_id FROM cells
      WHERE scope = ? AND state != 'archived'
      ORDER BY salience ASC, cell_id ASC
      LIMIT ?
    `).all(scope, excess);
    for (const c of toArchive) {
      archiveCell(c.cell_id, now);
    }
  }

  // Archive decaying cells below threshold
  const decaying = db.prepare(`
    SELECT cell_id, salience FROM cells
    WHERE scope = ? AND state = 'decaying' AND salience <= ?
  `).all(scope, ARCHIVE_SALIENCE_THRESHOLD);
  for (const c of decaying) {
    archiveCell(c.cell_id, now);
  }
}

module.exports = {
  extractCandidates,
  isContradiction,
  computeStateTransition,
  runConsolidation,
  groupExperiencesByKeys,
  enforceCaps,
  MAX_CELLS_PER_SCENE,
  MAX_CELLS_TOTAL,
  MAX_EXPERIENCES,
  OVERLAP_THRESHOLD
};
