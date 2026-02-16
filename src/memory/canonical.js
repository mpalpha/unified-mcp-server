/**
 * Canonical JSON, Deterministic Hashing, and HMAC Signing
 *
 * Provides:
 * - canonicalJson(): recursive key-sorted JSON stringify
 * - hash(): SHA-256 over canonical JSON
 * - sign(): HMAC-SHA256 with local signing secret
 * - verify(): verify HMAC signature
 * - ensureSigningSecret(): create or load signing key
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Canonical JSON stringify.
 * - Objects: keys sorted recursively
 * - Arrays: preserved order, elements canonicalized
 * - Strings: newlines normalized to \n
 * - null, boolean, number: standard JSON
 *
 * @param {*} value - Value to stringify
 * @returns {string} Canonical JSON string
 */
function canonicalJson(value) {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    if (!isFinite(value)) {
      return 'null';
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    // Normalize newlines to \n before encoding
    const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return JSON.stringify(normalized);
  }
  if (Array.isArray(value)) {
    const items = value.map(item => canonicalJson(item));
    return '[' + items.join(',') + ']';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const pairs = keys.map(key => {
      const v = value[key];
      if (v === undefined) return null;
      return JSON.stringify(key) + ':' + canonicalJson(v);
    }).filter(p => p !== null);
    return '{' + pairs.join(',') + '}';
  }
  return 'null';
}

/**
 * SHA-256 hash of canonical JSON representation.
 *
 * @param {*} value - Value to hash (will be canonicalized)
 * @returns {string} Hex-encoded SHA-256 hash
 */
function hash(value) {
  const canonical = canonicalJson(value);
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * HMAC-SHA256 signature of canonical JSON representation.
 *
 * @param {*} value - Value to sign (will be canonicalized)
 * @param {string} secret - Hex-encoded signing secret
 * @returns {string} Hex-encoded HMAC-SHA256 signature
 */
function sign(value, secret) {
  const canonical = canonicalJson(value);
  return crypto.createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(canonical, 'utf8')
    .digest('hex');
}

/**
 * Verify HMAC-SHA256 signature.
 *
 * @param {*} value - Value that was signed
 * @param {string} signature - Hex-encoded signature to verify
 * @param {string} secret - Hex-encoded signing secret
 * @returns {boolean} True if signature is valid
 */
function verify(value, signature, secret) {
  const expected = sign(value, secret);
  // Constant-time comparison
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(signature, 'hex')
  );
}

/**
 * Ensure signing secret exists in state directory.
 * Generates a 32-byte random hex secret if missing.
 *
 * @param {string} stateDir - Path to .claude/ directory
 * @returns {string} Hex-encoded signing secret
 */
function ensureSigningSecret(stateDir) {
  const secretPath = path.join(stateDir, 'signing.key');
  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath, 'utf8').trim();
  }
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(secretPath, secret, { mode: 0o600 });
  return secret;
}

/**
 * Load signing secret from state directory.
 *
 * @param {string} stateDir - Path to .claude/ directory
 * @returns {string|null} Hex-encoded signing secret, or null if not found
 */
function loadSigningSecret(stateDir) {
  const secretPath = path.join(stateDir, 'signing.key');
  if (!fs.existsSync(secretPath)) return null;
  return fs.readFileSync(secretPath, 'utf8').trim();
}

module.exports = {
  canonicalJson,
  hash,
  sign,
  verify,
  ensureSigningSecret,
  loadSigningSecret
};
