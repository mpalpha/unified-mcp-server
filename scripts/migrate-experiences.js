#!/usr/bin/env node
/**
 * Experience Migration Tool
 * Migrates experiences from old memory-augmented-reasoning.db to unified-mcp-server
 *
 * Usage:
 *   node scripts/migrate-experiences.js --source /path/to/old.db
 *   node scripts/migrate-experiences.js --source /path/to/old.db --dry-run
 *   node scripts/migrate-experiences.js --source /path/to/old.db --skip-duplicates
 *   node scripts/migrate-experiences.js --source /path/to/old.db --verbose
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  source: null,
  target: null,
  dryRun: false,
  checkDuplicates: true,
  verbose: false,
  batchSize: 50
};

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--source':
      options.source = args[++i];
      break;
    case '--target':
      options.target = args[++i];
      break;
    case '--dry-run':
      options.dryRun = true;
      break;
    case '--skip-duplicates':
      options.checkDuplicates = false;
      break;
    case '--verbose':
      options.verbose = true;
      break;
    case '--help':
      console.log(`
Experience Migration Tool

Usage:
  node scripts/migrate-experiences.js --source <path> [options]

Required:
  --source <path>     Path to source database (old memory-augmented-reasoning.db)

Options:
  --target <path>     Path to target database (default: ~/.unified-mcp/data.db)
  --dry-run           Preview migration without making changes
  --skip-duplicates   Don't check for duplicates (faster but may create duplicates)
  --verbose           Show detailed output for each experience
  --help              Show this help message

Examples:
  # Dry run to preview
  node scripts/migrate-experiences.js --source ~/old.db --dry-run

  # Actual migration
  node scripts/migrate-experiences.js --source ~/old.db

  # Custom target
  node scripts/migrate-experiences.js --source ~/old.db --target /path/to/new.db
`);
      process.exit(0);
  }
}

// Validate required arguments
if (!options.source) {
  console.error('Error: --source is required\n');
  console.error('Usage: node scripts/migrate-experiences.js --source <path> [options]');
  console.error('Run with --help for more information');
  process.exit(1);
}

// Statistics
const stats = {
  total: 0,
  migrated: 0,
  duplicates: 0,
  errors: 0,
  revisionsMapped: 0
};

// ID mapping for revisions (old_id -> new_id)
const idMap = new Map();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert TEXT timestamp to unix timestamp
 */
function convertTimestamp(textTimestamp) {
  if (!textTimestamp) {
    return Math.floor(Date.now() / 1000);
  }

  try {
    const date = new Date(textTimestamp);
    return Math.floor(date.getTime() / 1000);
  } catch (e) {
    return Math.floor(Date.now() / 1000);
  }
}

/**
 * Merge additional fields into reasoning
 */
function mergeAdditionalFields(experience) {
  let reasoning = experience.reasoning;

  if (experience.alternative) {
    reasoning += `\n\nAlternative: ${experience.alternative}`;
  }

  if (experience.assumptions) {
    reasoning += `\n\nAssumptions: ${experience.assumptions}`;
  }

  if (experience.limitations) {
    reasoning += `\n\nLimitations: ${experience.limitations}`;
  }

  return reasoning;
}

/**
 * Create metadata tags from old fields
 */
function createMetadataTags(experience) {
  const tags = [];

  if (experience.contradicts) {
    tags.push(`contradicts:${experience.contradicts}`);
  }

  if (experience.supports) {
    tags.push(`supports:${experience.supports}`);
  }

  // Extract session info from context
  if (experience.context) {
    const sessionMatch = experience.context.match(/session:\s*([^\s,]+)/);
    if (sessionMatch) {
      tags.push(`migrated-from-session:${sessionMatch[1]}`);
    }
  }

  // Add migration marker
  tags.push('migrated');

  return tags;
}

/**
 * Calculate Dice coefficient for duplicate detection
 */
function calculateDice(text1, text2) {
  const bigrams1 = new Set();
  for (let i = 0; i < text1.length - 1; i++) {
    bigrams1.add(text1.substring(i, i + 2));
  }

  const bigrams2 = new Set();
  for (let i = 0; i < text2.length - 1; i++) {
    bigrams2.add(text2.substring(i, i + 2));
  }

  const intersection = new Set([...bigrams1].filter(x => bigrams2.has(x)));
  return (2 * intersection.size) / (bigrams1.size + bigrams2.size);
}

/**
 * Find duplicate in target database
 */
function findDuplicate(targetDb, experience, threshold = 0.9) {
  const existing = targetDb.prepare(`
    SELECT id, situation, approach, outcome, reasoning
    FROM experiences
    WHERE domain = ? AND type = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).all(experience.domain, experience.type);

  const combined = `${experience.situation} ${experience.approach} ${experience.outcome} ${experience.reasoning}`;

  for (const exp of existing) {
    const expCombined = `${exp.situation} ${exp.approach} ${exp.outcome} ${exp.reasoning}`;
    const similarity = calculateDice(combined, expCombined);

    if (similarity >= threshold) {
      return { id: exp.id, similarity };
    }
  }

  return null;
}

/**
 * Transform old experience to new format
 */
function transformExperience(oldExp) {
  return {
    type: oldExp.type,
    domain: oldExp.domain,
    situation: oldExp.situation,
    approach: oldExp.approach,
    outcome: oldExp.outcome,
    reasoning: mergeAdditionalFields(oldExp),
    confidence: oldExp.confidence,
    tags: JSON.stringify(createMetadataTags(oldExp)),
    revision_of: oldExp.revision_of || null,
    created_at: convertTimestamp(oldExp.created_at),
    updated_at: convertTimestamp(oldExp.created_at)
  };
}

/**
 * Insert experience into target database
 */
function insertExperience(targetDb, experience) {
  const stmt = targetDb.prepare(`
    INSERT INTO experiences (type, domain, situation, approach, outcome, reasoning, confidence, tags, revision_of, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    experience.type,
    experience.domain,
    experience.situation,
    experience.approach,
    experience.outcome,
    experience.reasoning,
    experience.confidence,
    experience.tags,
    experience.revision_of,
    experience.created_at,
    experience.updated_at
  );

  return result.lastInsertRowid;
}

// ============================================================================
// Main Migration Logic
// ============================================================================

async function migrate() {
  console.log('\n' + '='.repeat(70));
  console.log('  Experience Migration Tool');
  console.log('='.repeat(70) + '\n');

  // Validate source
  if (!fs.existsSync(options.source)) {
    console.error(`✗ Source database not found: ${options.source}`);
    process.exit(1);
  }

  // Get target path
  const targetPath = options.target || path.join(os.homedir(), '.unified-mcp', 'data.db');

  // Validate target directory exists
  const targetDir = path.dirname(targetPath);
  if (!fs.existsSync(targetDir)) {
    console.error(`✗ Target directory not found: ${targetDir}`);
    console.error('  Run "unified-mcp-server --init" first to create the database');
    process.exit(1);
  }

  console.log(`Source:  ${options.source}`);
  console.log(`Target:  ${targetPath}`);
  if (options.dryRun) {
    console.log(`Mode:    DRY RUN (no changes will be made)`);
  }
  console.log();

  // Open databases
  let sourceDb, targetDb;
  try {
    sourceDb = new Database(options.source, { readonly: true, fileMustExist: true });
    targetDb = new Database(targetPath);
  } catch (error) {
    console.error(`✗ Failed to open databases: ${error.message}`);
    process.exit(1);
  }

  // Ensure target schema exists
  try {
    targetDb.prepare('SELECT 1 FROM experiences LIMIT 1').get();
  } catch (error) {
    // Table doesn't exist, create it
    console.log('Creating target database schema...');
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

      CREATE INDEX IF NOT EXISTS idx_domain_type ON experiences(domain, type);
      CREATE INDEX IF NOT EXISTS idx_created ON experiences(created_at DESC);
    `);
    console.log('✓ Schema created\n');
  }

  // Read source experiences
  console.log('Reading source database...');
  let experiences;
  try {
    experiences = sourceDb.prepare('SELECT * FROM experiences ORDER BY id').all();
    stats.total = experiences.length;
    console.log(`Found ${stats.total} experiences\n`);
  } catch (error) {
    console.error(`✗ Failed to read source database: ${error.message}`);
    sourceDb.close();
    targetDb.close();
    process.exit(1);
  }

  if (stats.total === 0) {
    console.log('No experiences to migrate.');
    sourceDb.close();
    targetDb.close();
    return;
  }

  // Start migration
  console.log('Migrating experiences...\n');

  if (!options.dryRun) {
    targetDb.exec('BEGIN TRANSACTION');
  }

  try {
    // First pass: Non-revision experiences
    const nonRevisions = experiences.filter(e => !e.revision_of);
    console.log(`Pass 1: Migrating ${nonRevisions.length} base experiences...`);

    for (const oldExp of nonRevisions) {
      const transformed = transformExperience(oldExp);

      // Check for duplicates
      if (options.checkDuplicates) {
        const duplicate = findDuplicate(targetDb, transformed);
        if (duplicate) {
          if (options.verbose) {
            console.log(`  ⊘ ID ${oldExp.id}: Skipped (${(duplicate.similarity * 100).toFixed(1)}% similar to existing ID ${duplicate.id})`);
          }
          stats.duplicates++;
          continue;
        }
      }

      // Insert
      if (!options.dryRun) {
        try {
          const newId = insertExperience(targetDb, transformed);
          idMap.set(oldExp.id, newId);
          stats.migrated++;

          if (options.verbose) {
            console.log(`  ✓ ID ${oldExp.id} → ${newId}: ${transformed.domain} - ${transformed.situation.substring(0, 50)}...`);
          }
        } catch (error) {
          console.error(`  ✗ ID ${oldExp.id}: ${error.message}`);
          stats.errors++;
        }
      } else {
        console.log(`  [DRY RUN] Would migrate ID ${oldExp.id}: ${transformed.domain}`);
        stats.migrated++;
      }
    }

    // Second pass: Revision experiences
    const revisions = experiences.filter(e => e.revision_of);
    if (revisions.length > 0) {
      console.log(`\nPass 2: Migrating ${revisions.length} revision experiences...`);

      for (const oldExp of revisions) {
        const newRevisionOf = idMap.get(oldExp.revision_of);

        if (!newRevisionOf && !options.dryRun) {
          console.log(`  ⚠️  ID ${oldExp.id}: Skipped (parent ${oldExp.revision_of} not found or was duplicate)`);
          continue;
        }

        const transformed = transformExperience(oldExp);
        if (newRevisionOf) {
          transformed.revision_of = newRevisionOf;
        }

        // Check for duplicates
        if (options.checkDuplicates) {
          const duplicate = findDuplicate(targetDb, transformed);
          if (duplicate) {
            if (options.verbose) {
              console.log(`  ⊘ ID ${oldExp.id}: Skipped (${(duplicate.similarity * 100).toFixed(1)}% similar to existing ID ${duplicate.id})`);
            }
            stats.duplicates++;
            continue;
          }
        }

        // Insert
        if (!options.dryRun) {
          try {
            const newId = insertExperience(targetDb, transformed);
            idMap.set(oldExp.id, newId);
            stats.migrated++;
            stats.revisionsMapped++;

            if (options.verbose) {
              console.log(`  ✓ ID ${oldExp.id} → ${newId}: Revision of ${newRevisionOf}`);
            }
          } catch (error) {
            console.error(`  ✗ ID ${oldExp.id}: ${error.message}`);
            stats.errors++;
          }
        } else {
          console.log(`  [DRY RUN] Would migrate revision ID ${oldExp.id} (parent: ${oldExp.revision_of})`);
          stats.migrated++;
          stats.revisionsMapped++;
        }
      }
    }

    // Commit
    if (!options.dryRun) {
      targetDb.exec('COMMIT');
    }

  } catch (error) {
    if (!options.dryRun) {
      targetDb.exec('ROLLBACK');
    }
    console.error(`\n✗ Migration failed: ${error.message}`);
    sourceDb.close();
    targetDb.close();
    process.exit(1);
  }

  // Close databases
  sourceDb.close();
  targetDb.close();

  // Report
  console.log('\n' + '='.repeat(70));
  console.log('  Migration Summary');
  console.log('='.repeat(70));
  console.log(`Total experiences:      ${stats.total}`);
  console.log(`Migrated:               ${stats.migrated} ✓`);
  console.log(`Duplicates skipped:     ${stats.duplicates}`);
  console.log(`Revisions mapped:       ${stats.revisionsMapped}`);
  console.log(`Errors:                 ${stats.errors}`);
  console.log('='.repeat(70) + '\n');

  if (options.dryRun) {
    console.log('DRY RUN complete - no changes were made');
    console.log('Run without --dry-run to perform actual migration\n');
  } else {
    console.log('✓ Migration complete!\n');
  }
}

// Run migration
migrate().catch(error => {
  console.error('\n✗ Unexpected error:', error);
  process.exit(1);
});
