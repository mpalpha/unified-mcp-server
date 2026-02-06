/**
 * Validation Module - Custom errors and validation helpers
 *
 * v1.8.2: Integrated with structured errors from src/errors.js
 * v1.7.0: Synchronized with index.js
 */

const {
  ValidationError: StructuredValidationError,
  ErrorCodes,
  invalidDomainError,
  invalidTypeError,
  invalidPhaseError,
  missingRequiredError
} = require('./errors');

/**
 * Legacy ValidationError class for backward compatibility
 * Extends StructuredValidationError to maintain existing API
 */
class ValidationError extends StructuredValidationError {
  constructor(message, details) {
    // Convert legacy format to structured format
    super({
      message,
      code: ErrorCodes.VALIDATION_ERROR,
      suggestion: details || message
    });
    // Preserve legacy details field
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
 * @throws {ValidationError} if invalid
 */
function validateDomain(domain) {
  if (!domain || !VALID_DOMAINS.includes(domain)) {
    throw invalidDomainError(domain);
  }
}

/**
 * Validate type parameter
 * @throws {ValidationError} if invalid
 */
function validateType(type) {
  if (!type || !VALID_TYPES.includes(type)) {
    throw invalidTypeError(type);
  }
}

/**
 * Validate workflow phase
 * @throws {ValidationError} if invalid
 */
function validatePhase(phase) {
  if (!phase || !VALID_PHASES.includes(phase)) {
    throw invalidPhaseError(phase);
  }
}

/**
 * Validate required parameter exists
 * @throws {ValidationError} if missing
 */
function validateRequired(value, paramName, example) {
  if (value === undefined || value === null || value === '') {
    throw missingRequiredError(paramName, example);
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
  validateRequired,
  diceCoefficient,
  getBigrams
};
