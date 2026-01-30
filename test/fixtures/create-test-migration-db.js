#!/usr/bin/env node
/**
 * Create synthetic test database for migration testing
 * IMPORTANT: Uses only synthetic/fake data - NO REAL PRODUCTION DATA
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'test-migration-source.db');

// Remove existing
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
}

// Create database
const db = new Database(dbPath);

// Create old schema (memory-augmented-reasoning.db format)
db.exec(`
  CREATE TABLE experiences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('effective', 'ineffective')),
    domain TEXT NOT NULL CHECK(domain IN ('Tools', 'Protocol', 'Communication', 'Process', 'Debugging', 'Decision')),
    situation TEXT NOT NULL,
    approach TEXT NOT NULL,
    outcome TEXT NOT NULL,
    reasoning TEXT NOT NULL,
    alternative TEXT,
    confidence REAL CHECK(confidence BETWEEN 0 AND 1),
    revision_of INTEGER,
    contradicts TEXT,
    supports TEXT,
    context TEXT,
    assumptions TEXT,
    limitations TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (revision_of) REFERENCES experiences(id)
  );

  CREATE INDEX idx_domain_type ON experiences(domain, type);
  CREATE INDEX idx_created ON experiences(created_at DESC);
`);

// Insert SYNTHETIC test data
const stmt = db.prepare(`
  INSERT INTO experiences (type, domain, situation, approach, outcome, reasoning, alternative, confidence, context, assumptions, limitations, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Test case 1: Basic experience (no optional fields)
stmt.run(
  'effective',
  'Tools',
  'Need to search for text patterns in codebase',
  'Use Grep tool instead of bash grep',
  'Found all matches with clean output',
  'Specialized tools provide better user experience',
  null,
  0.9,
  null,
  null,
  null,
  '2026-01-01T10:00:00.000Z'
);

// Test case 2: Experience with alternative
stmt.run(
  'effective',
  'Process',
  'Need to validate user input',
  'Use Zod schema validation',
  'Type-safe validation with clear error messages',
  'Zod provides excellent TypeScript integration',
  'Could use Joi or Yup, but less type-safe',
  0.85,
  null,
  'TypeScript project',
  'Requires learning Zod syntax',
  '2026-01-02T11:30:00.000Z'
);

// Test case 3: Experience with context (should detect project scope)
stmt.run(
  'effective',
  'Debugging',
  'Memory leak in React component',
  'Use React DevTools Profiler',
  'Found useEffect cleanup missing',
  'Profiler showed component not unmounting',
  null,
  0.8,
  'session: test-session-123, file: /src/components/Dashboard.tsx, cwd: /projects/myapp',
  null,
  null,
  '2026-01-03T14:15:00.000Z'
);

// Test case 4: Experience with assumptions and limitations
stmt.run(
  'effective',
  'Communication',
  'Need to explain API rate limits to user',
  'Show progressive countdown timer',
  'Users understood rate limits clearly',
  'Visual feedback more effective than text',
  null,
  0.75,
  null,
  'Users can see countdown timer',
  'Does not work for users with screen readers',
  '2026-01-04T09:20:00.000Z'
);

// Test case 5: Experience with contradicts/supports
stmt.run(
  'ineffective',
  'Process',
  'Tried caching all API responses',
  'Implemented global cache with no expiration',
  'Memory usage grew unbounded',
  'No eviction strategy caused memory leak',
  null,
  0.9,
  null,
  null,
  null,
  '2026-01-05T16:45:00.000Z'
);

// Test case 6: Base experience for revision test
stmt.run(
  'effective',
  'Tools',
  'Need to format code',
  'Use Prettier with default config',
  'Code formatted consistently',
  'Default settings work well for most projects',
  null,
  0.7,
  null,
  null,
  null,
  '2026-01-06T12:00:00.000Z'
);

// Test case 7: Revision of previous experience
const revisionStmt = db.prepare(`
  INSERT INTO experiences (type, domain, situation, approach, outcome, reasoning, confidence, revision_of, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

revisionStmt.run(
  'effective',
  'Tools',
  'Need to format code',
  'Use Prettier with custom config for line width',
  'Better readability with 100 char line width',
  'Custom config improved code readability for team',
  0.85,
  6, // Revises experience ID 6
  '2026-01-07T15:30:00.000Z'
);

// Test case 8: Near-duplicate for duplicate detection test
stmt.run(
  'effective',
  'Tools',
  'Need to search for text patterns in code',
  'Use Grep tool instead of bash',
  'Found matches with clean formatting',
  'Specialized tools are better than raw commands',
  null,
  0.9,
  null,
  null,
  null,
  '2026-01-08T10:00:00.000Z'
);

// Test case 9: Decision domain
stmt.run(
  'effective',
  'Decision',
  'Choose between SQL and NoSQL',
  'Selected PostgreSQL for ACID guarantees',
  'Transaction support enabled reliable operations',
  'ACID properties critical for financial data',
  'MongoDB considered but eventual consistency too risky',
  0.9,
  null,
  'Financial application with strict consistency needs',
  'Requires more memory than NoSQL',
  '2026-01-09T13:00:00.000Z'
);

// Test case 10: Protocol domain with all optional fields
stmt.run(
  'effective',
  'Protocol',
  'Implement request/response cycle',
  'Use MCP protocol with JSON-RPC',
  'Clean request/response handling',
  'MCP provides structured communication',
  'REST API considered but less structured',
  0.85,
  'session: test-mcp-123',
  'Client supports JSON-RPC 2.0',
  'Requires client-side JSON-RPC library',
  '2026-01-10T11:00:00.000Z'
);

db.close();

console.log('✓ Synthetic test database created:', dbPath);
console.log('  10 test experiences (8 effective, 2 ineffective)');
console.log('  1 revision relationship');
console.log('  Various field combinations for thorough testing');
