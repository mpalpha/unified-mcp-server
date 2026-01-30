# Migration Guide

This guide explains how to migrate experiences from an old `memory-augmented-reasoning.db` database into the unified-mcp-server format.

## Overview

If you have an existing database from a previous version (stored at `~/.cursor/memory-augmented-reasoning.db` or similar), you can migrate all your experiences into the new unified-mcp-server database.

The migration tool:
- ✅ Preserves all your existing experiences
- ✅ Automatically detects and converts field formats
- ✅ Detects and skips duplicates
- ✅ Maps revision relationships
- ✅ Never modifies your source database (read-only access)

## Quick Start

### 1. Locate Your Old Database

Common locations:
```bash
# Cursor/Claude Code
~/.cursor/memory-augmented-reasoning.db

# Project-specific
<project-dir>/.cursor/memory-augmented-reasoning.db

# Find all databases
find ~ -name "memory-augmented-reasoning.db" 2>/dev/null
```

### 2. Preview Migration (Dry Run)

Always run a dry run first to see what will happen:

```bash
node scripts/migrate-experiences.js \
  --source ~/.cursor/memory-augmented-reasoning.db \
  --dry-run
```

This shows:
- Number of experiences found
- Which experiences would be migrated
- Which would be skipped as duplicates
- No changes are made to any database

### 3. Run Actual Migration

Once you're satisfied with the dry run:

```bash
node scripts/migrate-experiences.js \
  --source ~/.cursor/memory-augmented-reasoning.db
```

The tool will:
- Create the target database schema if needed (default: `~/.unified-mcp/data.db`)
- Migrate all experiences
- Map revision relationships
- Show detailed progress and summary

## Command-Line Options

### Required

**`--source <path>`**
Path to your old database file.

```bash
--source ~/.cursor/memory-augmented-reasoning.db
```

### Optional

**`--target <path>`**
Specify a custom target database. Default: `~/.unified-mcp/data.db`

```bash
--target /path/to/custom/data.db
```

**`--dry-run`**
Preview migration without making any changes. Always use this first!

```bash
--dry-run
```

**`--skip-duplicates`**
Skip duplicate detection for faster migration. Use only if you're sure there are no duplicates.

```bash
--skip-duplicates
```

**`--verbose`**
Show detailed output for each experience migrated.

```bash
--verbose
```

## Field Transformations

The migration tool automatically converts old database fields to the new format:

### Merged Fields

Old optional fields are merged into the `reasoning` field:

```
Old Database:
  reasoning: "Original reasoning"
  alternative: "Alternative approach"
  assumptions: "Assumed X"
  limitations: "Limited to Y"

New Database:
  reasoning: "Original reasoning

             Alternative: Alternative approach

             Assumptions: Assumed X

             Limitations: Limited to Y"
```

### Scope Detection

The old `context` field is analyzed to determine scope:

```
Old: context: "session: abc, file: /src/app.js, cwd: /project"
New: scope: "project"

Old: context: "" (or general content)
New: scope: "user"
```

**Project scope indicators:**
- `file:` or `cwd:` in context
- Keywords: project, codebase, repository, repo
- File extensions: .js, .ts, .tsx, .jsx
- Paths: src/, components/, package.json, tsconfig, webpack, vite

### Metadata Tags

Old relationship and context fields become searchable tags:

```
Old:
  contradicts: "exp-42"
  supports: "exp-99"
  context: "session: test-session-123"

New:
  tags: [
    "contradicts:exp-42",
    "supports:exp-99",
    "migrated-from-session:test-session-123",
    "migrated"
  ]
```

### Timestamp Conversion

```
Old: created_at: "2026-01-26T16:08:54.041Z" (TEXT)
New: created_at: 1738000134 (INTEGER unix timestamp)
```

## Duplicate Detection

By default, the migration tool checks for duplicates using the Dice coefficient algorithm:

- Compares: situation + approach + outcome + reasoning
- Threshold: 90% similarity
- Skips experiences that are too similar to existing ones

**To skip duplicate checking (faster):**
```bash
--skip-duplicates
```

## Revision Handling

The migration preserves revision relationships:

1. **Pass 1:** Migrates all base experiences
2. **Pass 2:** Migrates revisions and updates `revision_of` IDs

Example:
```
Old Database:
  ID 6: Base experience
  ID 7: Revision (revision_of: 6)

New Database:
  ID 123: Migrated base experience
  ID 124: Migrated revision (revision_of: 123)
```

## Common Scenarios

### Migrate from Cursor

```bash
# Preview
node scripts/migrate-experiences.js \
  --source ~/.cursor/memory-augmented-reasoning.db \
  --dry-run

# Migrate
node scripts/migrate-experiences.js \
  --source ~/.cursor/memory-augmented-reasoning.db
```

### Migrate Project-Specific Database

```bash
# Find project databases
find ~/projects -name "memory-augmented-reasoning.db"

# Migrate specific project
node scripts/migrate-experiences.js \
  --source ~/projects/myapp/.cursor/memory-augmented-reasoning.db
```

### Migrate Multiple Databases

If you have multiple old databases (from different projects), migrate them one at a time:

```bash
# Database 1
node scripts/migrate-experiences.js --source ~/project1/.cursor/memory-augmented-reasoning.db

# Database 2
node scripts/migrate-experiences.js --source ~/project2/.cursor/memory-augmented-reasoning.db
```

The duplicate detection will prevent duplicates across migrations.

### Custom Target Location

```bash
node scripts/migrate-experiences.js \
  --source ~/.cursor/memory-augmented-reasoning.db \
  --target /custom/path/data.db
```

## Verification

After migration, verify the results:

```bash
# Count migrated experiences
sqlite3 ~/.unified-mcp/data.db "SELECT COUNT(*) FROM experiences"

# Check scopes
sqlite3 ~/.unified-mcp/data.db "SELECT scope, COUNT(*) FROM experiences GROUP BY scope"

# Check tags
sqlite3 ~/.unified-mcp/data.db "SELECT tags FROM experiences WHERE tags LIKE '%migrated%' LIMIT 5"

# Check revisions
sqlite3 ~/.unified-mcp/data.db "SELECT COUNT(*) FROM experiences WHERE revision_of IS NOT NULL"
```

## Troubleshooting

### "Source database not found"

Check the path to your old database:
```bash
ls -lh ~/.cursor/memory-augmented-reasoning.db
```

### "Target directory not found"

The unified-mcp-server database directory doesn't exist. Create it:
```bash
mkdir -p ~/.unified-mcp
```

Or run the --init wizard first:
```bash
npx unified-mcp-server --init
```

### "Migration failed: no such table"

The target database exists but doesn't have the schema. The migration tool should create it automatically. If it doesn't:

```bash
# Remove the incomplete database
rm ~/.unified-mcp/data.db

# Try migration again
node scripts/migrate-experiences.js --source <your-source>
```

### All Experiences Skipped as Duplicates

You may have already migrated this database. Check the target:

```bash
sqlite3 ~/.unified-mcp/data.db "SELECT COUNT(*) FROM experiences WHERE tags LIKE '%migrated%'"
```

To re-migrate (will create duplicates), use a fresh target:
```bash
node scripts/migrate-experiences.js \
  --source <your-source> \
  --target /tmp/test-migration.db
```

### Migration is Slow

For large databases (1000+ experiences), skip duplicate checking:

```bash
node scripts/migrate-experiences.js \
  --source <your-source> \
  --skip-duplicates
```

## Safety Notes

### Your Source Database is Safe

The migration tool opens the source database in **read-only mode**. It cannot modify or delete your original data.

### Idempotent Migration

You can run the migration multiple times. The duplicate detection will skip experiences that already exist in the target.

### Transaction Safety

The migration uses database transactions. If anything fails, all changes are rolled back automatically.

### Backup Recommendation

Although the source database is never modified, it's always good practice to back up your data:

```bash
cp ~/.cursor/memory-augmented-reasoning.db ~/.cursor/memory-augmented-reasoning.db.backup
```

## Example Output

### Successful Migration

```
======================================================================
  Experience Migration Tool
======================================================================

Source:  /Users/you/.cursor/memory-augmented-reasoning.db
Target:  /Users/you/.unified-mcp/data.db

Creating target database schema...
✓ Schema created

Reading source database...
Found 90 experiences

Migrating experiences...

Pass 1: Migrating 85 base experiences...

Pass 2: Migrating 5 revision experiences...

======================================================================
  Migration Summary
======================================================================
Total experiences:      90
Migrated:               90 ✓
Duplicates skipped:     0
Revisions mapped:       5
Errors:                 0
======================================================================

✓ Migration complete!
```

### Dry Run

```
======================================================================
  Experience Migration Tool
======================================================================

Source:  /Users/you/.cursor/memory-augmented-reasoning.db
Target:  /Users/you/.unified-mcp/data.db

Mode:    DRY RUN (no changes will be made)

Reading source database...
Found 90 experiences

[DRY RUN] Would migrate 90 experiences
[DRY RUN] Would map 5 revisions

DRY RUN complete - no changes were made
Run without --dry-run to perform actual migration
```

## After Migration

Once migration is complete:

1. **Verify the data** using the sqlite3 commands above
2. **Test the unified-mcp-server** to ensure experiences are accessible
3. **Keep your old database** as a backup (migration never modifies it)
4. **Update your workflow** to use the new unified-mcp-server tools

## Getting Help

If you encounter issues:

1. Run with `--dry-run --verbose` to see detailed output
2. Check this guide's Troubleshooting section
3. File an issue at: https://github.com/mpalpha/unified-mcp-server/issues

Include:
- The exact command you ran
- The complete error message
- Output from `--dry-run --verbose`
