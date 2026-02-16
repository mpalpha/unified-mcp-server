/**
 * Context Pack (Phase 4)
 *
 * Assembles bounded context from cells and experiences for LLM consumption.
 * Produces reproducible context_hash via canonical JSON.
 */

const { getDatabase } = require('../database');
const { canonicalJson, hash } = require('./canonical');
const { computeOverlap, queryCellsForContext } = require('./scenes');
const { queryExperiences } = require('./experiences');
const { updateSession } = require('./sessions');

/**
 * Pack context from memory for a session.
 *
 * @param {object} params
 * @param {number} params.session_id
 * @param {string} [params.scope='project']
 * @param {string[]} [params.context_keys=[]]
 * @param {number} [params.max_cells=20]
 * @param {number} [params.max_experiences=10]
 * @param {number} [params.byte_budget=8000]
 * @param {string} params.now - ISO timestamp
 * @returns {object} { packed_cells, packed_experiences, context_hash, byte_size }
 */
function contextPack({
  session_id,
  scope = 'project',
  context_keys = [],
  max_cells = 20,
  max_experiences = 10,
  byte_budget = 8000,
  now
}) {
  // Get candidate cells (stable ordered, non-archived)
  const cells = queryCellsForContext({ scope, context_keys, limit: max_cells, now });

  // Get recent experiences
  const experiences = queryExperiences({ scope, limit: max_experiences });

  // Build packed items
  const packedCells = [];
  const packedExperiences = [];
  let currentBytes = 0;

  // Pack cells first (higher priority)
  for (const cell of cells) {
    const packed = {
      id: cell.cell_id,
      type: cell.cell_type,
      title: cell.title,
      trust: cell.trust,
      salience: cell.salience,
      state: cell.state,
      updated_at: cell.updated_at,
      why_included: `scene:${cell.scene_id},trust:${cell.trust},sal:${cell.salience}`
    };
    const itemBytes = Buffer.byteLength(canonicalJson(packed), 'utf8');
    if (currentBytes + itemBytes > byte_budget) break;
    packedCells.push(packed);
    currentBytes += itemBytes;
  }

  // Pack experiences (remaining budget)
  for (const exp of experiences) {
    const summaryBounded = exp.summary.length > 200 ? exp.summary.slice(0, 200) : exp.summary;
    const packed = {
      id: exp.experience_id,
      created_at: exp.created_at,
      trust: exp.trust,
      salience: exp.salience,
      context_keys: exp.context_keys || JSON.parse(exp.context_keys_json || '[]'),
      summary: summaryBounded,
      why_included: `trust:${exp.trust},sal:${exp.salience}`
    };
    const itemBytes = Buffer.byteLength(canonicalJson(packed), 'utf8');
    if (currentBytes + itemBytes > byte_budget) break;
    packedExperiences.push(packed);
    currentBytes += itemBytes;
  }

  // Compute context hash
  const packedContent = {
    cells: packedCells,
    experiences: packedExperiences
  };
  const contextHash = hash(packedContent);

  // Store context hash on session
  if (session_id) {
    updateSession(session_id, { last_context_hash: contextHash });
  }

  return {
    packed_cells: packedCells,
    packed_experiences: packedExperiences,
    context_hash: contextHash,
    byte_size: currentBytes
  };
}

module.exports = {
  contextPack
};
