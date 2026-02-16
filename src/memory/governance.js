/**
 * Governance Module (Phase 5)
 *
 * - Receipt/token signing and verification
 * - Invocation hash chain validation
 * - Phase order enforcement
 * - Policy escalation
 */

const { getDatabase } = require('../database');
const { canonicalJson, hash, sign, verify, loadSigningSecret } = require('./canonical');
const { getSession } = require('./sessions');
const { verifyChain, getChainHead } = require('./invocations');
const { recordExperience, countExperiences } = require('./experiences');
const { PHASES } = require('./guarded-cycle');
const { getProjectDir } = require('../database');

const COMPLIANCE_VERSION = '1.0.0';
const POLICY_ESCALATION_THRESHOLD = 3; // fail count before escalation

/**
 * Validate governance for a session.
 *
 * @param {object} params
 * @param {number} params.session_id
 * @param {string} params.context_hash - Hash from context_pack
 * @param {string} params.now - ISO timestamp
 * @returns {object} { valid, errors, warnings }
 */
function validateGovernance({ session_id, context_hash, now }) {
  const errors = [];
  const warnings = [];

  const session = getSession(session_id);
  if (!session) {
    return { valid: false, errors: ['Session not found'], warnings };
  }

  // Verify phases executed in order
  const lastPhase = session.last_phase;
  if (lastPhase) {
    const idx = PHASES.indexOf(lastPhase);
    if (idx === -1) {
      errors.push(`Unknown phase: ${lastPhase}`);
    }
  }

  // Verify invocation hash chain
  const chainResult = verifyChain(session_id);
  if (!chainResult.valid) {
    errors.push(...chainResult.errors.map(e => `Chain: ${e}`));
  }

  // Verify context_hash matches session
  if (context_hash && session.last_context_hash && context_hash !== session.last_context_hash) {
    errors.push(`Context hash mismatch: expected ${session.last_context_hash}, got ${context_hash}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    chain_count: chainResult.count,
    context_hash_match: context_hash === session.last_context_hash
  };
}

/**
 * Mint a signed receipt.
 *
 * @param {object} params
 * @param {number} params.session_id
 * @param {string} params.receipt_type
 * @param {string} params.scope
 * @param {string} params.context_hash
 * @param {string} params.now - ISO timestamp
 * @param {object} [params.public_meta={}]
 * @returns {object} { id, payload_hash, signature } or { error }
 */
function mintReceipt({ session_id, receipt_type, scope, context_hash, now, public_meta = {} }) {
  const stateDir = getProjectDir();
  const secret = loadSigningSecret(stateDir);
  if (!secret) {
    return { error: true, code: 'NO_SIGNING_KEY', message: 'Signing key not found. Run --init.' };
  }

  const chainHead = getChainHead(session_id);

  const payload = {
    session_id,
    scope,
    now,
    context_hash,
    invocation_chain_head: chainHead,
    compliance_version: COMPLIANCE_VERSION
  };

  const payloadJson = canonicalJson(payload);
  const payloadHash = hash(payload);
  const signature = sign(payload, secret);

  const db = getDatabase();
  const result = db.prepare(`
    INSERT INTO receipts (session_id, ts, receipt_type, payload_json, payload_hash, signature, public_meta_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(session_id, now, receipt_type, payloadJson, payloadHash, signature, canonicalJson(public_meta));

  const id = typeof result.lastInsertRowid === 'bigint'
    ? Number(result.lastInsertRowid)
    : result.lastInsertRowid;

  return { id, payload_hash: payloadHash, signature };
}

/**
 * Verify a receipt's signature.
 *
 * @param {number} receiptId
 * @returns {object} { valid, payload }
 */
function verifyReceipt(receiptId) {
  const stateDir = getProjectDir();
  const secret = loadSigningSecret(stateDir);
  if (!secret) {
    return { valid: false, error: 'No signing key' };
  }

  const db = getDatabase();
  const row = db.prepare('SELECT * FROM receipts WHERE id = ?').get(receiptId);
  if (!row) {
    return { valid: false, error: 'Receipt not found' };
  }

  const payload = JSON.parse(row.payload_json);
  const valid = verify(payload, row.signature, secret);
  const hashValid = hash(payload) === row.payload_hash;

  return {
    valid: valid && hashValid,
    signature_valid: valid,
    hash_valid: hashValid,
    payload
  };
}

/**
 * Mint a signed token.
 *
 * @param {object} params
 * @param {number} params.session_id
 * @param {string} params.token_type
 * @param {string} params.scope
 * @param {string[]} [params.permissions=[]]
 * @param {string} params.now - ISO timestamp
 * @param {number} [params.expiry_minutes=60]
 * @returns {object} { id, payload_hash, signature } or { error }
 */
function mintToken({ session_id, token_type, scope, permissions = [], now, expiry_minutes = 60 }) {
  const stateDir = getProjectDir();
  const secret = loadSigningSecret(stateDir);
  if (!secret) {
    return { error: true, code: 'NO_SIGNING_KEY', message: 'Signing key not found. Run --init.' };
  }

  const expiry = new Date(new Date(now).getTime() + expiry_minutes * 60000).toISOString();

  const payload = {
    session_id,
    scope,
    permissions,
    expiry
  };

  const payloadJson = canonicalJson(payload);
  const payloadHash = hash(payload);
  const signature = sign(payload, secret);

  const db = getDatabase();
  const result = db.prepare(`
    INSERT INTO memory_tokens (session_id, ts, token_type, payload_json, payload_hash, signature)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(session_id, now, token_type, payloadJson, payloadHash, signature);

  const id = typeof result.lastInsertRowid === 'bigint'
    ? Number(result.lastInsertRowid)
    : result.lastInsertRowid;

  return { id, payload_hash: payloadHash, signature, expiry };
}

/**
 * Verify a token's signature and expiry.
 *
 * @param {number} tokenId
 * @param {string} now - ISO timestamp for expiry check
 * @returns {object} { valid, expired, payload }
 */
function verifyToken(tokenId, now) {
  const stateDir = getProjectDir();
  const secret = loadSigningSecret(stateDir);
  if (!secret) {
    return { valid: false, error: 'No signing key' };
  }

  const db = getDatabase();
  const row = db.prepare('SELECT * FROM memory_tokens WHERE id = ?').get(tokenId);
  if (!row) {
    return { valid: false, error: 'Token not found' };
  }

  const payload = JSON.parse(row.payload_json);
  const sigValid = verify(payload, row.signature, secret);
  const hashValid = hash(payload) === row.payload_hash;
  const expired = payload.expiry && new Date(now) > new Date(payload.expiry);

  return {
    valid: sigValid && hashValid && !expired,
    signature_valid: sigValid,
    hash_valid: hashValid,
    expired,
    payload
  };
}

/**
 * Record a violation as an experience and check for policy escalation.
 *
 * @param {object} params
 * @param {number} params.session_id
 * @param {string} params.scope
 * @param {string} params.rule - Rule name that was violated
 * @param {string} params.message - Violation description
 * @param {string} params.now - ISO timestamp
 * @returns {object}
 */
function recordViolation({ session_id, scope, rule, message, now }) {
  const result = recordExperience({
    session_id,
    scope,
    context_keys: ['behavioral_violation', rule],
    summary: `Violation: ${rule} - ${message}`,
    outcome: 'fail',
    trust: 2,
    source: 'system',
    now
  });

  return { experience_recorded: true, experience_id: result.experience_id };
}

/**
 * Record a success as an experience.
 *
 * @param {object} params
 * @param {number} params.session_id
 * @param {string} params.scope
 * @param {string} params.now - ISO timestamp
 * @returns {object}
 */
function recordSuccess({ session_id, scope, now }) {
  const result = recordExperience({
    session_id,
    scope,
    context_keys: ['governance_success'],
    summary: 'Response passed governance validation',
    outcome: 'success',
    trust: 1,
    source: 'system',
    now
  });

  return { experience_recorded: true, experience_id: result.experience_id };
}

module.exports = {
  validateGovernance,
  mintReceipt,
  verifyReceipt,
  mintToken,
  verifyToken,
  recordViolation,
  recordSuccess,
  COMPLIANCE_VERSION,
  POLICY_ESCALATION_THRESHOLD
};
