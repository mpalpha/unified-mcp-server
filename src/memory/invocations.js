/**
 * Invocation Ledger with Deterministic Hash Chain
 *
 * Each invocation records tool_name, input_hash, output_hash,
 * and appends to a deterministic hash chain (prev_hash → hash).
 */

const { getDatabase } = require('../database');
const { canonicalJson, hash } = require('./canonical');

/**
 * Record an invocation in the hash chain.
 *
 * @param {object} params
 * @param {number} params.session_id - Session ID
 * @param {string} params.tool_name - Name of the tool called
 * @param {*} params.input_obj - Input object (will be hashed)
 * @param {*} params.output_obj - Output object (will be hashed)
 * @param {object} [params.meta={}] - Optional metadata
 * @param {string} params.now - ISO timestamp
 * @returns {object} { id, session_id, hash, prev_hash }
 */
function recordInvocation({ session_id, tool_name, input_obj, output_obj, meta = {}, now }) {
  const db = getDatabase();

  const inputHash = hash(input_obj);
  const outputHash = hash(output_obj);
  const metaJson = canonicalJson(meta);

  // Get previous hash in chain for this session
  const prev = db.prepare(
    'SELECT hash FROM invocations WHERE session_id = ? ORDER BY id DESC LIMIT 1'
  ).get(session_id);
  const prevHash = prev ? prev.hash : null;

  // Compute chain hash: hash of (prev_hash + tool_name + input_hash + output_hash + ts)
  const chainPayload = {
    prev_hash: prevHash,
    tool_name,
    input_hash: inputHash,
    output_hash: outputHash,
    ts: now
  };
  const chainHash = hash(chainPayload);

  const result = db.prepare(`
    INSERT INTO invocations (session_id, ts, tool_name, input_hash, output_hash, meta_json, prev_hash, hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(session_id, now, tool_name, inputHash, outputHash, metaJson, prevHash, chainHash);

  const id = typeof result.lastInsertRowid === 'bigint'
    ? Number(result.lastInsertRowid)
    : result.lastInsertRowid;

  return {
    id,
    session_id,
    hash: chainHash,
    prev_hash: prevHash
  };
}

/**
 * Get the latest invocation hash for a session (chain head).
 *
 * @param {number} sessionId
 * @returns {string|null} Hash of the latest invocation, or null
 */
function getChainHead(sessionId) {
  const db = getDatabase();
  const row = db.prepare(
    'SELECT hash FROM invocations WHERE session_id = ? ORDER BY id DESC LIMIT 1'
  ).get(sessionId);
  return row ? row.hash : null;
}

/**
 * Verify hash chain integrity for a session.
 *
 * @param {number} sessionId
 * @returns {object} { valid: boolean, errors: string[], count: number }
 */
function verifyChain(sessionId) {
  const db = getDatabase();
  const rows = db.prepare(
    'SELECT * FROM invocations WHERE session_id = ? ORDER BY id ASC'
  ).all(sessionId);

  const errors = [];
  let expectedPrevHash = null;

  for (const row of rows) {
    // Check prev_hash links correctly
    if (row.prev_hash !== expectedPrevHash) {
      errors.push(`Invocation ${row.id}: prev_hash mismatch (expected ${expectedPrevHash}, got ${row.prev_hash})`);
    }

    // Recompute and verify hash
    const chainPayload = {
      prev_hash: row.prev_hash,
      tool_name: row.tool_name,
      input_hash: row.input_hash,
      output_hash: row.output_hash,
      ts: row.ts
    };
    const expectedHash = hash(chainPayload);
    if (row.hash !== expectedHash) {
      errors.push(`Invocation ${row.id}: hash mismatch (expected ${expectedHash}, got ${row.hash})`);
    }

    expectedPrevHash = row.hash;
  }

  return {
    valid: errors.length === 0,
    errors,
    count: rows.length
  };
}

module.exports = {
  recordInvocation,
  getChainHead,
  verifyChain
};
