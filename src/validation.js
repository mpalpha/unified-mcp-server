/**
 * Validation Module - Custom errors and validation helpers
 *
 * v1.7.0: Synchronized with index.js
 */

/**
 * Custom error for validation failures
 * Matches JSON-RPC error code for Invalid params
 */
class ValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ValidationError';
    this.code = -32602; // Invalid params (JSON-RPC)
    this.details = details || message;
  }
}

/**
 * Valid domain values
 */
const VALID_DOMAINS = ['Tools', 'Protocol', 'Communication', 'Process', 'Debugging', 'Decision'];

/**
 * Valid workflow phases
 */
const VALID_PHASES = ['teach', 'learn', 'reason'];

/**
 * Valid experience types
 */
const VALID_TYPES = ['effective', 'ineffective'];

/**
 * Validate domain parameter
 */
function validateDomain(domain) {
  if (!domain || !VALID_DOMAINS.includes(domain)) {
    throw new ValidationError(
      'Missing or invalid "domain" parameter',
      `Required: domain = ${VALID_DOMAINS.join(' | ')}\n\nExample: domain: "Tools"`
    );
  }
}

/**
 * Validate type parameter
 */
function validateType(type) {
  if (!type || !VALID_TYPES.includes(type)) {
    throw new ValidationError(
      'Missing or invalid "type" parameter',
      'Required: type = "effective" | "ineffective"\n\nExample: type: "effective"'
    );
  }
}

/**
 * Validate workflow phase
 */
function validatePhase(phase) {
  if (!phase || !VALID_PHASES.includes(phase)) {
    throw new ValidationError(
      'Missing or invalid "current_phase" parameter',
      `Required: current_phase = ${VALID_PHASES.join(' | ')}\n\nExample: current_phase: "teach"`
    );
  }
}

/**
 * Calculate Dice coefficient similarity between two strings
 */
function diceCoefficient(str1, str2) {
  const bigrams1 = getBigrams(str1);
  const bigrams2 = getBigrams(str2);

  const intersection = bigrams1.filter(b => bigrams2.includes(b)).length;
  return (2.0 * intersection) / (bigrams1.length + bigrams2.length);
}

/**
 * Get bigrams from a string for similarity calculation
 */
function getBigrams(str) {
  const normalized = str.toLowerCase().replace(/\s+/g, ' ').trim();
  const bigrams = [];
  for (let i = 0; i < normalized.length - 1; i++) {
    bigrams.push(normalized.substring(i, i + 2));
  }
  return bigrams;
}

module.exports = {
  ValidationError,
  VALID_DOMAINS,
  VALID_PHASES,
  VALID_TYPES,
  validateDomain,
  validateType,
  validatePhase,
  diceCoefficient,
  getBigrams
};
