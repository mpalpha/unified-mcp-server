/**
 * Structured Error Classes (v1.8.2)
 *
 * Provides consistent error responses across all 28 tools with:
 * - message: Human-readable error description
 * - code: Machine-readable error code (e.g., 'INVALID_DOMAIN')
 * - recoverable: Boolean indicating if the error can be recovered from
 * - suggestion: Actionable guidance for fixing the error
 *
 * All errors include JSON-RPC error codes for protocol compliance.
 */

/**
 * Base class for all structured errors
 * Matches JSON-RPC error format while adding structured fields
 */
class StructuredError extends Error {
  /**
   * @param {Object} options
   * @param {string} options.message - Human-readable error description
   * @param {string} options.code - Machine-readable error code
   * @param {boolean} [options.recoverable=true] - Can the error be recovered from?
   * @param {string} [options.suggestion] - Actionable guidance for fixing
   * @param {Object} [options.details] - Additional context
   * @param {number} [options.jsonRpcCode=-32602] - JSON-RPC error code
   */
  constructor({ message, code, recoverable = true, suggestion, details, jsonRpcCode = -32602 }) {
    super(message);
    this.name = 'StructuredError';
    this.code = code;
    this.recoverable = recoverable;
    this.suggestion = suggestion;
    this.details = details;
    this.jsonRpcCode = jsonRpcCode; // JSON-RPC error code
  }

  /**
   * Convert to JSON-RPC error format
   */
  toJSONRPC() {
    return {
      code: this.jsonRpcCode,
      message: this.message,
      data: {
        code: this.code,
        recoverable: this.recoverable,
        suggestion: this.suggestion,
        details: this.details
      }
    };
  }

  /**
   * Convert to user-friendly string
   */
  toUserMessage() {
    let msg = `Error: ${this.message}`;
    if (this.suggestion) {
      msg += `\n\nSuggestion: ${this.suggestion}`;
    }
    return msg;
  }
}

/**
 * Validation error - invalid parameters or input
 * JSON-RPC code: -32602 (Invalid params)
 */
class ValidationError extends StructuredError {
  constructor({ message, code = 'VALIDATION_ERROR', suggestion, details }) {
    super({
      message,
      code,
      recoverable: true,
      suggestion,
      details,
      jsonRpcCode: -32602
    });
    this.name = 'ValidationError';
  }
}

/**
 * Not found error - resource doesn't exist
 * JSON-RPC code: -32602 (Invalid params - treating as param error since ID is invalid)
 */
class NotFoundError extends StructuredError {
  constructor({ message, code = 'NOT_FOUND', suggestion, details }) {
    super({
      message,
      code,
      recoverable: true,
      suggestion: suggestion || 'Verify the resource ID and try again',
      details,
      jsonRpcCode: -32602
    });
    this.name = 'NotFoundError';
  }
}

/**
 * Database error - storage/query failures
 * JSON-RPC code: -32603 (Internal error)
 */
class DatabaseError extends StructuredError {
  constructor({ message, code = 'DATABASE_ERROR', suggestion, details }) {
    super({
      message,
      code,
      recoverable: false,
      suggestion: suggestion || 'Run health_check tool for diagnostics, or try: npx mpalpha/unified-mcp-server --init',
      details,
      jsonRpcCode: -32603
    });
    this.name = 'DatabaseError';
  }
}

/**
 * Configuration error - invalid settings or missing config
 * JSON-RPC code: -32602 (Invalid params)
 */
class ConfigurationError extends StructuredError {
  constructor({ message, code = 'CONFIG_ERROR', suggestion, details }) {
    super({
      message,
      code,
      recoverable: true,
      suggestion: suggestion || 'Check your config.json in .claude/ directory',
      details,
      jsonRpcCode: -32602
    });
    this.name = 'ConfigurationError';
  }
}

/**
 * Workflow error - protocol/workflow violations
 * JSON-RPC code: -32602 (Invalid params)
 */
class WorkflowError extends StructuredError {
  constructor({ message, code = 'WORKFLOW_ERROR', suggestion, details }) {
    super({
      message,
      code,
      recoverable: true,
      suggestion,
      details,
      jsonRpcCode: -32602
    });
    this.name = 'WorkflowError';
  }
}

/**
 * File system error - file read/write failures
 * JSON-RPC code: -32603 (Internal error)
 */
class FileSystemError extends StructuredError {
  constructor({ message, code = 'FILESYSTEM_ERROR', suggestion, details }) {
    super({
      message,
      code,
      recoverable: false,
      suggestion: suggestion || 'Check file permissions and path',
      details,
      jsonRpcCode: -32603
    });
    this.name = 'FileSystemError';
  }
}

// ============================================================================
// Error Code Constants
// ============================================================================

/**
 * Standard error codes for consistent machine-readable errors
 */
const ErrorCodes = {
  // Validation errors
  INVALID_DOMAIN: 'INVALID_DOMAIN',
  INVALID_TYPE: 'INVALID_TYPE',
  INVALID_PHASE: 'INVALID_PHASE',
  MISSING_REQUIRED: 'MISSING_REQUIRED',
  INVALID_FORMAT: 'INVALID_FORMAT',
  OUT_OF_RANGE: 'OUT_OF_RANGE',

  // Not found errors
  EXPERIENCE_NOT_FOUND: 'EXPERIENCE_NOT_FOUND',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  PRESET_NOT_FOUND: 'PRESET_NOT_FOUND',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',

  // Database errors
  DATABASE_UNAVAILABLE: 'DATABASE_UNAVAILABLE',
  QUERY_FAILED: 'QUERY_FAILED',
  MIGRATION_FAILED: 'MIGRATION_FAILED',

  // Configuration errors
  CONFIG_INVALID: 'CONFIG_INVALID',
  CONFIG_MISSING: 'CONFIG_MISSING',

  // Workflow errors
  WORKFLOW_VIOLATION: 'WORKFLOW_VIOLATION',
  COMPLIANCE_FAILED: 'COMPLIANCE_FAILED',

  // File system errors
  FILE_READ_FAILED: 'FILE_READ_FAILED',
  FILE_WRITE_FAILED: 'FILE_WRITE_FAILED',
  PERMISSION_DENIED: 'PERMISSION_DENIED'
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a validation error for invalid domain parameter
 */
function invalidDomainError(value) {
  const validDomains = ['Tools', 'Protocol', 'Communication', 'Process', 'Debugging', 'Decision'];
  return new ValidationError({
    message: `Invalid domain: ${value}`,
    code: ErrorCodes.INVALID_DOMAIN,
    suggestion: `Use one of: ${validDomains.join(', ')}`,
    details: { provided: value, valid: validDomains }
  });
}

/**
 * Create a validation error for invalid type parameter
 */
function invalidTypeError(value) {
  const validTypes = ['effective', 'ineffective'];
  return new ValidationError({
    message: `Invalid type: ${value}`,
    code: ErrorCodes.INVALID_TYPE,
    suggestion: `Use one of: ${validTypes.join(', ')}`,
    details: { provided: value, valid: validTypes }
  });
}

/**
 * Create a validation error for invalid phase parameter
 */
function invalidPhaseError(value) {
  const validPhases = ['teach', 'learn', 'reason'];
  return new ValidationError({
    message: `Invalid phase: ${value}`,
    code: ErrorCodes.INVALID_PHASE,
    suggestion: `Use one of: ${validPhases.join(', ')}`,
    details: { provided: value, valid: validPhases }
  });
}

/**
 * Create a validation error for missing required parameter
 */
function missingRequiredError(paramName, example) {
  return new ValidationError({
    message: `Missing required parameter: ${paramName}`,
    code: ErrorCodes.MISSING_REQUIRED,
    suggestion: example ? `Example: ${paramName}: ${example}` : `Provide a value for ${paramName}`,
    details: { parameter: paramName }
  });
}

/**
 * Create a not found error for experience
 */
function experienceNotFoundError(id) {
  return new NotFoundError({
    message: `Experience not found: ID ${id}`,
    code: ErrorCodes.EXPERIENCE_NOT_FOUND,
    suggestion: 'Use search_experiences to find valid experience IDs',
    details: { id }
  });
}

/**
 * Create a not found error for session
 */
function sessionNotFoundError(sessionId) {
  return new NotFoundError({
    message: `Session not found: ${sessionId}`,
    code: ErrorCodes.SESSION_NOT_FOUND,
    suggestion: 'Start a new session with analyze_problem',
    details: { sessionId }
  });
}

module.exports = {
  // Error classes
  StructuredError,
  ValidationError,
  NotFoundError,
  DatabaseError,
  ConfigurationError,
  WorkflowError,
  FileSystemError,

  // Error codes
  ErrorCodes,

  // Helper functions
  invalidDomainError,
  invalidTypeError,
  invalidPhaseError,
  missingRequiredError,
  experienceNotFoundError,
  sessionNotFoundError
};
