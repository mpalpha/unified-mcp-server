/**
 * Salience Computation
 *
 * Integer-only salience formula per spec:
 * salience = clamp(0, 1000,
 *   state_weight + evidence_count*60 + recency_bucket*20 + trust*40 - contradiction_count*120
 * )
 */

const STATE_WEIGHTS = {
  unverified: 0,
  observed: 50,
  reinforced: 100,
  stable: 150,
  decaying: 25,
  archived: 0
};

/**
 * Compute recency bucket from updated_at vs now.
 *
 * @param {string} updatedAt - ISO timestamp of last update
 * @param {string} now - ISO timestamp of current time
 * @returns {number} Recency bucket (1-5)
 */
function recencyBucket(updatedAt, now) {
  const updatedMs = new Date(updatedAt).getTime();
  const nowMs = new Date(now).getTime();
  const dayMs = 86400000;
  const diffDays = (nowMs - updatedMs) / dayMs;

  if (diffDays <= 1) return 5;
  if (diffDays <= 7) return 4;
  if (diffDays <= 30) return 3;
  if (diffDays <= 90) return 2;
  return 1;
}

/**
 * Compute salience for a cell.
 *
 * @param {object} params
 * @param {string} params.state - Cell state
 * @param {number} params.evidence_count - Number of supporting evidence links
 * @param {number} params.contradiction_count - Number of contradicting evidence links
 * @param {number} params.trust - Trust level (0-3)
 * @param {string} params.updated_at - ISO timestamp of last update
 * @param {string} params.now - ISO timestamp of current time
 * @returns {number} Salience value (0-1000)
 */
function computeSalience({ state, evidence_count, contradiction_count, trust, updated_at, now }) {
  const stateWeight = STATE_WEIGHTS[state] || 0;
  const bucket = recencyBucket(updated_at, now);
  const raw = stateWeight + evidence_count * 60 + bucket * 20 + trust * 40 - contradiction_count * 120;
  return Math.max(0, Math.min(1000, raw));
}

module.exports = {
  STATE_WEIGHTS,
  recencyBucket,
  computeSalience
};
