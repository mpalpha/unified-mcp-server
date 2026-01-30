/**
 * Validation Module - Custom errors and validation helpers
 */

/**
 * Custom error for validation failures
 */
class ValidationError extends Error {
  constructor(message, hint) {
    super(message);
    this.name = 'ValidationError';
    this.hint = hint;
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
  if (!type || !['effective', 'ineffective'].includes(type)) {
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
 * Calculate text similarity (simple approach)
 */
function calculateSimilarity(text1, text2) {
  const normalize = (text) => text.toLowerCase().replace(/\s+/g, ' ').trim();
  const t1 = normalize(text1);
  const t2 = normalize(text2);

  if (t1 === t2) return 1.0;

  const words1 = new Set(t1.split(' '));
  const words2 = new Set(t2.split(' '));
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

module.exports = {
  ValidationError,
  VALID_DOMAINS,
  VALID_PHASES,
  validateDomain,
  validateType,
  validatePhase,
  calculateSimilarity
};
