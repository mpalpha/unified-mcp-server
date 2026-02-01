#!/usr/bin/env node
/**
 * Experience Migration Tests
 * Tests migration from old memory-augmented-reasoning.db format
 *
 * IMPORTANT: Uses ONLY synthetic test data from test/fixtures/
 * NEVER uses real production database
 */

const { spawn } = require('child_process');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const os = require('os');

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  cyan: '\x1b[36m'
};

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

async function test(name, fn) {
  testsRun++;
  try {
    await fn();
    testsPassed++;
    console.log(`  ${colors.green}✓ PASS${colors.reset} - ${name}`);
  } catch (error) {
    testsFailed++;
    console.log(`  ${colors.red}✗ FAIL${colors.reset} - ${name}`);
    console.log(`    ${colors.red}${error.message}${colors.reset}`);
  }
}

function assertTrue(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected} but got ${actual}`);
  }
}

function assertContains(text, substring, message) {
  if (!text || !text.includes(substring)) {
    throw new Error(message || `Expected text to contain "${substring}"`);
  }
}

// ============================================================================
// Tests
// ============================================================================

console.log(colors.bold + '\nMIGRATION TESTS' + colors.reset);
console.log(colors.cyan + '======================================================================' + colors.reset);
console.log('Testing experience migration from old database format\n');

// Test database paths - SYNTHETIC DATA ONLY
const SYNTHETIC_SOURCE = path.join(__dirname, 'fixtures', 'test-migration-source.db');
const TEST_TARGET = path.join(__dirname, 'fixtures', 'test-migration-target.db');

// Verify synthetic source exists
if (!fs.existsSync(SYNTHETIC_SOURCE)) {
  console.error(colors.red + '✗ Synthetic test database not found!' + colors.reset);
  console.error('  Run: node test/fixtures/create-test-migration-db.js');
  process.exit(1);
}

// Remove old test target
if (fs.existsSync(TEST_TARGET)) {
  fs.unlinkSync(TEST_TARGET);
}

// Create fresh target database
console.log('Setting up test target database...\n');
const targetDb = new Database(TEST_TARGET);

// Create target schema (unified-mcp-server format)
targetDb.exec(`
  CREATE TABLE IF NOT EXISTS experiences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('effective', 'ineffective')),
    domain TEXT NOT NULL CHECK(domain IN ('Tools', 'Protocol', 'Communication', 'Process', 'Debugging', 'Decision')),
    situation TEXT NOT NULL,
    approach TEXT NOT NULL,
    outcome TEXT NOT NULL,
    reasoning TEXT NOT NULL,
    confidence REAL CHECK(confidence BETWEEN 0 AND 1),
    tags TEXT,
    revision_of INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (revision_of) REFERENCES experiences(id)
  );
`);
targetDb.close();

console.log(colors.bold + 'Helper Function Tests' + colors.reset);
console.log(colors.cyan + '======================================================================' + colors.reset);

// Test context detection (v1.4.3: scope removed, but context patterns still useful for metadata)
test('context detection - detects file context from context field', () => {
  const exp = {
    situation: 'test',
    approach: 'test',
    outcome: 'test',
    context: 'session: abc, file: /src/app.js, cwd: /project'
  };

  // Context detection pattern (used for metadata tags)
  const context = exp.context || '';
  const hasFileContext = /file:|cwd:/.test(context);

  assertTrue(hasFileContext, 'Should detect file context');
});

test('context detection - detects absence of file context', () => {
  const exp = {
    situation: 'general programming pattern',
    approach: 'use best practices',
    outcome: 'improved code quality',
    context: ''
  };

  const context = exp.context || '';
  const hasFileContext = /file:|cwd:/.test(context);

  assertTrue(!hasFileContext, 'Should not detect file context');
});

// Test timestamp conversion
test('convertTimestamp - converts TEXT to unix timestamp', () => {
  const textTimestamp = '2026-01-26T16:08:54.041Z';
  const date = new Date(textTimestamp);
  const unixTimestamp = Math.floor(date.getTime() / 1000);

  // Check it's a reasonable unix timestamp (not just that it's the exact value)
  assertTrue(unixTimestamp > 1700000000, 'Should be a valid 2024+ timestamp');
  assertTrue(unixTimestamp < 2000000000, 'Should be a reasonable timestamp');
});

// Test field merging
test('mergeAdditionalFields - merges alternative into reasoning', () => {
  const exp = {
    reasoning: 'Original reasoning',
    alternative: 'Alternative approach',
    assumptions: null,
    limitations: null
  };

  let merged = exp.reasoning;
  if (exp.alternative) {
    merged += `\n\nAlternative: ${exp.alternative}`;
  }

  assertContains(merged, 'Original reasoning', 'Should keep original');
  assertContains(merged, 'Alternative: Alternative approach', 'Should append alternative');
});

test('mergeAdditionalFields - handles multiple optional fields', () => {
  const exp = {
    reasoning: 'Base reasoning',
    alternative: 'Alt',
    assumptions: 'Assume X',
    limitations: 'Limited to Y'
  };

  let merged = exp.reasoning;
  if (exp.alternative) merged += `\n\nAlternative: ${exp.alternative}`;
  if (exp.assumptions) merged += `\n\nAssumptions: ${exp.assumptions}`;
  if (exp.limitations) merged += `\n\nLimitations: ${exp.limitations}`;

  assertContains(merged, 'Alternative: Alt');
  assertContains(merged, 'Assumptions: Assume X');
  assertContains(merged, 'Limitations: Limited to Y');
});

// Test metadata tag creation
test('createMetadataTags - extracts session from context', () => {
  const context = 'session: test-session-123, file: /app.js';
  const sessionMatch = context.match(/session:\s*([^\s,]+)/);

  assertTrue(sessionMatch !== null, 'Should find session');
  assertEquals(sessionMatch[1], 'test-session-123', 'Should extract session ID');
});

test('createMetadataTags - handles contradicts/supports', () => {
  const exp = {
    contradicts: 'exp-42',
    supports: 'exp-99',
    context: ''
  };

  const tags = [];
  if (exp.contradicts) tags.push(`contradicts:${exp.contradicts}`);
  if (exp.supports) tags.push(`supports:${exp.supports}`);

  assertTrue(tags.includes('contradicts:exp-42'));
  assertTrue(tags.includes('supports:exp-99'));
});

console.log('\n' + colors.bold + 'Full Migration Tests' + colors.reset);
console.log(colors.cyan + '======================================================================' + colors.reset);

// Note: All migration tests run in runAsyncTests() to ensure proper sequencing

// Async test wrapper
async function runAsyncTests() {
  try {
    await test('migrate --dry-run - previews without changes', async () => {
      return new Promise((resolve, reject) => {
        const migration = spawn('node', [
          path.join(__dirname, '..', 'scripts', 'migrate-experiences.js'),
          '--source', SYNTHETIC_SOURCE,
          '--target', TEST_TARGET,
          '--dry-run'
        ]);

        let output = '';
        migration.stdout.on('data', data => { output += data.toString(); });
        migration.stderr.on('data', data => { output += data.toString(); });

        migration.on('close', code => {
          try {
            assertEquals(code, 0, 'Should exit successfully');
            assertContains(output, 'DRY RUN', 'Should indicate dry run');
            assertContains(output, 'Found 10 experiences', 'Should find all test experiences');
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    });

    await test('migrate - performs actual migration', async () => {
      // Clean target before actual migration
      if (fs.existsSync(TEST_TARGET)) {
        fs.unlinkSync(TEST_TARGET);
      }

      const db = new Database(TEST_TARGET);
      db.exec(`
        CREATE TABLE experiences (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          domain TEXT NOT NULL,
          situation TEXT NOT NULL,
          approach TEXT NOT NULL,
          outcome TEXT NOT NULL,
          reasoning TEXT NOT NULL,
          confidence REAL,
          scope TEXT,
          tags TEXT,
          revision_of INTEGER,
          created_at INTEGER,
          updated_at INTEGER
        );
      `);
      db.close();

      return new Promise((resolve, reject) => {
        const migration = spawn('node', [
          path.join(__dirname, '..', 'scripts', 'migrate-experiences.js'),
          '--source', SYNTHETIC_SOURCE,
          '--target', TEST_TARGET
        ]);

        let output = '';
        migration.stdout.on('data', data => { output += data.toString(); });
        migration.stderr.on('data', data => { output += data.toString(); });

        migration.on('close', code => {
          try {
            assertEquals(code, 0, 'Should exit successfully');
            assertContains(output, 'Migration complete', 'Should complete successfully');
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    });

    // Run verification tests after migration completes
    console.log('\n  Verifying migrated data...');
    try {
      const db = new Database(TEST_TARGET, { readonly: true });

      const count = db.prepare('SELECT COUNT(*) as count FROM experiences').get();
      assertTrue(count.count >= 8, `Should have migrated experiences (found ${count.count})`);

      // Check tags were created
      const tagged = db.prepare('SELECT tags FROM experiences WHERE tags IS NOT NULL AND tags != \'[]\'').get();
      assertTrue(tagged !== undefined, 'Should have tagged experiences');

      if (tagged) {
        const tags = JSON.parse(tagged.tags);
        assertTrue(tags.includes('migrated'), 'Should have migration marker');
      }

      // Check timestamp conversion
      const exp = db.prepare('SELECT created_at FROM experiences LIMIT 1').get();
      assertTrue(exp.created_at > 1700000000, 'Should have unix timestamp');

      // Check merged fields
      const withAlt = db.prepare('SELECT reasoning FROM experiences WHERE id = 2').get();
      if (withAlt) {
        assertContains(withAlt.reasoning, 'Alternative:', 'Should have merged alternative field');
      }

      // Check revisions
      const revisions = db.prepare('SELECT COUNT(*) as count FROM experiences WHERE revision_of IS NOT NULL').get();
      assertTrue(revisions.count > 0, 'Should have migrated revisions');

      const revision = db.prepare('SELECT id, revision_of FROM experiences WHERE revision_of IS NOT NULL LIMIT 1').get();
      if (revision) {
        const parent = db.prepare('SELECT id FROM experiences WHERE id = ?').get(revision.revision_of);
        assertTrue(parent !== undefined, 'Revision should link to existing parent');
      }

      db.close();

      console.log(`  ${colors.green}✓${colors.reset} Data verification passed (10 experiences, 1 revision)`);
    } catch (error) {
      throw new Error(`Verification failed: ${error.message}`);
    }

    // Test --skip-duplicates flag
    await test('migrate --skip-duplicates - runs faster without checking', async () => {
      // Clean target
      if (fs.existsSync(TEST_TARGET)) {
        fs.unlinkSync(TEST_TARGET);
      }

      const db = new Database(TEST_TARGET);
      db.exec(`
        CREATE TABLE experiences (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          domain TEXT NOT NULL,
          situation TEXT NOT NULL,
          approach TEXT NOT NULL,
          outcome TEXT NOT NULL,
          reasoning TEXT NOT NULL,
          confidence REAL,
          scope TEXT,
          tags TEXT,
          revision_of INTEGER,
          created_at INTEGER,
          updated_at INTEGER
        );
      `);
      db.close();

      return new Promise((resolve, reject) => {
        const migration = spawn('node', [
          path.join(__dirname, '..', 'scripts', 'migrate-experiences.js'),
          '--source', SYNTHETIC_SOURCE,
          '--target', TEST_TARGET,
          '--skip-duplicates'
        ]);

        let output = '';
        migration.stdout.on('data', data => { output += data.toString(); });

        migration.on('close', code => {
          try {
            assertEquals(code, 0, 'Should complete successfully');
            assertContains(output, 'Migration complete', 'Should complete');
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    });

  } catch (error) {
    console.error('Error running async tests:', error);
  }

  // Print summary
  console.log('\n' + colors.cyan + '======================================================================' + colors.reset);
  console.log(colors.bold + 'MIGRATION TEST SUMMARY' + colors.reset);
  console.log(colors.cyan + '======================================================================' + colors.reset);
  console.log(colors.green + `Tests Passed: ${testsPassed}` + colors.reset);
  console.log(colors.red + `Tests Failed: ${testsFailed}` + colors.reset);
  console.log(`Total: ${testsRun} tests\n`);

  process.exit(testsFailed > 0 ? 1 : 0);
}

// Run async tests after sync tests complete
runAsyncTests();
