#!/usr/bin/env node

/**
 * Bootstrap Script for Unified MCP Server
 *
 * v1.8.5: WASM-only - simplified bootstrap (no native/fallback logic)
 * v1.7.2: Hybrid loading - try native better-sqlite3 first, fallback to WASM
 *
 * With WASM-only SQLite, we no longer need complex fallback logic.
 * The server works on any Node.js 18+ without build tools or ABI concerns.
 */

// Track database backend for diagnostics
const databaseBackend = 'wasm';

/**
 * Get current database backend
 * @returns {'wasm'}
 */
function getDatabaseBackend() {
  return databaseBackend;
}

/**
 * Set database backend (for compatibility - always 'wasm' in v1.8.5+)
 */
function setDatabaseBackend(backend) {
  // No-op in WASM-only mode, kept for API compatibility
  process.env.UNIFIED_MCP_DB_BACKEND = 'wasm';
}

// Set environment variable for database module
process.env.UNIFIED_MCP_DB_BACKEND = 'wasm';

// Export for testing
module.exports = { getDatabaseBackend, setDatabaseBackend };

// Run main script if executed directly
if (require.main === module) {
  require('./index.js');
}
