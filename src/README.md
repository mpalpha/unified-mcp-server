# ⚠️ DEAD CODE - DO NOT USE

This entire `src/` directory contains **orphaned code** that is NOT used in the application.

The actual implementations live in `index.js` (main file).

## Why does this exist?

This was part of an earlier refactoring attempt to modularize the codebase that was never completed. The code here may be outdated and does not match the actual behavior of the server.

## Files

- `database.js` - Unused database module
- `validation.js` - Unused validation module
- `tools/` - Unused tool implementations (automation, config, knowledge, reasoning, workflow)

## What to do

- **DO NOT import** from this directory
- **DO NOT modify** these files expecting changes to take effect
- These files may be removed in a future version

## Actual code location

All working code is in:
- `index.js` - Main server with all tool implementations
- `hooks/` - Claude Code hook files
- `bootstrap.js` - NPX entry point
