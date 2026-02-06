/**
 * WASM SQLite Adapter - better-sqlite3 Compatible API
 *
 * v1.7.2: Provides a better-sqlite3 compatible wrapper around node-sqlite3-wasm
 * for use as a fallback when native better-sqlite3 fails to load due to
 * Node.js ABI mismatch (common in npx scenarios with version switches).
 *
 * API Differences from better-sqlite3:
 * - pragma() method: Implemented via exec("PRAGMA ...")
 * - prepare() returns a Statement wrapper that auto-finalizes
 * - Manual close() required (memory leak risk in WASM)
 */

let WasmDatabase;

/**
 * Lazy-load node-sqlite3-wasm to avoid import errors if not installed
 */
function getWasmDatabase() {
  if (!WasmDatabase) {
    try {
      const wasm = require('node-sqlite3-wasm');
      WasmDatabase = wasm.Database;
    } catch (e) {
      throw new Error(
        'node-sqlite3-wasm not available. Install with: npm install node-sqlite3-wasm\n' +
        'Original error: ' + e.message
      );
    }
  }
  return WasmDatabase;
}

/**
 * Statement wrapper - provides better-sqlite3 compatible API
 * Wraps node-sqlite3-wasm Statement with auto-finalization tracking
 */
class StatementWrapper {
  constructor(wasmStatement, db) {
    this._stmt = wasmStatement;
    this._db = db;
    this._finalized = false;
  }

  /**
   * Run statement and return info object
   * @param {...any} params - Bind parameters
   * @returns {{ changes: number, lastInsertRowid: number|BigInt }}
   */
  run(...params) {
    if (this._finalized) {
      throw new Error('Statement has been finalized');
    }
    const bindParams = this._normalizeParams(params);
    const info = this._stmt.run(bindParams);
    return {
      changes: info.changes,
      lastInsertRowid: typeof info.lastInsertRowid === 'bigint'
        ? Number(info.lastInsertRowid)
        : info.lastInsertRowid
    };
  }

  /**
   * Get first row
   * @param {...any} params - Bind parameters
   * @returns {object|undefined}
   */
  get(...params) {
    if (this._finalized) {
      throw new Error('Statement has been finalized');
    }
    const bindParams = this._normalizeParams(params);
    return this._stmt.get(bindParams);
  }

  /**
   * Get all rows
   * @param {...any} params - Bind parameters
   * @returns {Array<object>}
   */
  all(...params) {
    if (this._finalized) {
      throw new Error('Statement has been finalized');
    }
    const bindParams = this._normalizeParams(params);
    return this._stmt.all(bindParams);
  }

  /**
   * Iterate over rows (generator)
   * @param {...any} params - Bind parameters
   * @yields {object}
   */
  *iterate(...params) {
    if (this._finalized) {
      throw new Error('Statement has been finalized');
    }
    const bindParams = this._normalizeParams(params);
    for (const row of this._stmt.iterate(bindParams)) {
      yield row;
    }
  }

  /**
   * Finalize statement (release resources)
   */
  finalize() {
    if (!this._finalized) {
      this._stmt.finalize();
      this._finalized = true;
    }
  }

  /**
   * Normalize parameters for node-sqlite3-wasm
   * better-sqlite3 accepts: stmt.run(a, b, c) or stmt.run([a, b, c]) or stmt.run({named: value})
   * node-sqlite3-wasm accepts: stmt.run([a, b, c]) or stmt.run({':named': value})
   */
  _normalizeParams(params) {
    if (params.length === 0) {
      return undefined;
    }
    if (params.length === 1) {
      const param = params[0];
      if (Array.isArray(param)) {
        return param;
      }
      if (param !== null && typeof param === 'object') {
        // Convert {named: value} to {':named': value} for node-sqlite3-wasm
        const converted = {};
        for (const [key, value] of Object.entries(param)) {
          const colonKey = key.startsWith(':') || key.startsWith('$') || key.startsWith('@')
            ? key
            : ':' + key;
          converted[colonKey] = value;
        }
        return converted;
      }
      return [param];
    }
    // Multiple positional params
    return params;
  }
}

/**
 * Database wrapper - provides better-sqlite3 compatible API
 */
class DatabaseWrapper {
  /**
   * @param {string} filename - Database file path
   * @param {object} [options] - Options
   * @param {boolean} [options.readonly] - Open in read-only mode
   * @param {boolean} [options.fileMustExist] - Throw if file doesn't exist
   */
  constructor(filename, options = {}) {
    const Database = getWasmDatabase();

    // Map better-sqlite3 options to node-sqlite3-wasm options
    const wasmOptions = {
      readOnly: options.readonly || false,
      fileMustExist: options.fileMustExist || false
    };

    this._db = new Database(filename, wasmOptions);
    this._filename = filename;
    this._open = true;
    this._statements = new Set(); // Track statements for cleanup
  }

  /**
   * Execute PRAGMA statement
   * better-sqlite3: db.pragma('journal_mode = WAL')
   * node-sqlite3-wasm: db.exec('PRAGMA journal_mode = WAL')
   *
   * @param {string} pragma - PRAGMA statement (without PRAGMA keyword)
   * @param {object} [options] - Options
   * @param {boolean} [options.simple] - Return scalar value instead of row
   * @returns {any}
   */
  pragma(pragma, options = {}) {
    this._ensureOpen();

    const sql = `PRAGMA ${pragma}`;

    // Check if this is a write pragma (contains '=')
    if (pragma.includes('=')) {
      this._db.exec(sql);
      return undefined;
    }

    // Read pragma - return value
    const result = this._db.get(sql);
    if (!result) {
      return undefined;
    }

    if (options.simple) {
      // Return first column value
      const keys = Object.keys(result);
      return keys.length > 0 ? result[keys[0]] : undefined;
    }

    return result;
  }

  /**
   * Execute SQL string (may contain multiple statements)
   * @param {string} sql - SQL to execute
   * @returns {this}
   */
  exec(sql) {
    this._ensureOpen();
    this._db.exec(sql);
    return this;
  }

  /**
   * Prepare a statement
   * @param {string} sql - SQL statement
   * @returns {StatementWrapper}
   */
  prepare(sql) {
    this._ensureOpen();
    const stmt = this._db.prepare(sql);
    const wrapper = new StatementWrapper(stmt, this);
    this._statements.add(wrapper);
    return wrapper;
  }

  /**
   * Execute statement and return run info
   * Convenience method that auto-finalizes
   * @param {string} sql - SQL statement
   * @param {...any} params - Bind parameters
   * @returns {{ changes: number, lastInsertRowid: number }}
   */
  run(sql, ...params) {
    this._ensureOpen();
    const bindParams = params.length === 1 && typeof params[0] === 'object' && !Array.isArray(params[0])
      ? this._convertNamedParams(params[0])
      : params.length > 0 ? params : undefined;
    const info = this._db.run(sql, bindParams);
    return {
      changes: info.changes,
      lastInsertRowid: typeof info.lastInsertRowid === 'bigint'
        ? Number(info.lastInsertRowid)
        : info.lastInsertRowid
    };
  }

  /**
   * Get first row
   * @param {string} sql - SQL statement
   * @param {...any} params - Bind parameters
   * @returns {object|undefined}
   */
  get(sql, ...params) {
    this._ensureOpen();
    const bindParams = params.length === 1 && typeof params[0] === 'object' && !Array.isArray(params[0])
      ? this._convertNamedParams(params[0])
      : params.length > 0 ? params : undefined;
    return this._db.get(sql, bindParams);
  }

  /**
   * Get all rows
   * @param {string} sql - SQL statement
   * @param {...any} params - Bind parameters
   * @returns {Array<object>}
   */
  all(sql, ...params) {
    this._ensureOpen();
    const bindParams = params.length === 1 && typeof params[0] === 'object' && !Array.isArray(params[0])
      ? this._convertNamedParams(params[0])
      : params.length > 0 ? params : undefined;
    return this._db.all(sql, bindParams);
  }

  /**
   * Close database connection
   */
  close() {
    if (this._open) {
      // Finalize all tracked statements
      for (const stmt of this._statements) {
        try {
          stmt.finalize();
        } catch (e) {
          // Ignore finalization errors during close
        }
      }
      this._statements.clear();
      this._db.close();
      this._open = false;
    }
  }

  /**
   * Check if database is open
   * @returns {boolean}
   */
  get open() {
    return this._open;
  }

  /**
   * Get database filename
   * @returns {string}
   */
  get name() {
    return this._filename;
  }

  /**
   * Check if database is in-memory
   * @returns {boolean}
   */
  get memory() {
    return this._filename === ':memory:';
  }

  /**
   * Check if database is read-only
   * @returns {boolean}
   */
  get readonly() {
    return this._db.readonly || false;
  }

  /**
   * Convert better-sqlite3 named params to node-sqlite3-wasm format
   * {name: value} -> {':name': value}
   */
  _convertNamedParams(params) {
    if (!params || typeof params !== 'object') {
      return params;
    }
    const converted = {};
    for (const [key, value] of Object.entries(params)) {
      const colonKey = key.startsWith(':') || key.startsWith('$') || key.startsWith('@')
        ? key
        : ':' + key;
      converted[colonKey] = value;
    }
    return converted;
  }

  /**
   * Ensure database is open
   */
  _ensureOpen() {
    if (!this._open) {
      throw new Error('Database is closed');
    }
  }
}

/**
 * Check if WASM fallback is available
 * @returns {boolean}
 */
function isWasmAvailable() {
  try {
    require.resolve('node-sqlite3-wasm');
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  Database: DatabaseWrapper,
  isWasmAvailable
};
