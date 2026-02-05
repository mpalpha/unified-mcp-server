# src/ Directory - Active Modules (v1.7.0)

This directory contains active, imported modules used by `index.js`.

## Module Structure

### Core Modules

| File | Purpose | Lines |
|------|---------|-------|
| `validation.js` | ValidationError class, validators, diceCoefficient | ~105 |
| `database.js` | Database init, schema, path helpers, logActivity | ~340 |

### Tool Modules (Future)

The following modules exist but are NOT yet wired up (planned for future extraction):

| File | Purpose | Status |
|------|---------|--------|
| `tools/knowledge.js` | 7 knowledge management tools | Not wired |
| `tools/reasoning.js` | 4 reasoning tools | Not wired |
| `tools/workflow.js` | 5 workflow enforcement tools | Not wired |
| `tools/config.js` | 5 configuration tools | Not wired |
| `tools/automation.js` | 4 automation tools | Not wired |

## What's Imported

`index.js` imports the following from modules:

```javascript
// From ./src/validation.js
const { ValidationError, diceCoefficient, getBigrams } = require('./src/validation');

// From ./src/database.js
const {
  getProjectDir, getDbPath, getTokenDir, getConfigPath,
  ensureProjectContext, ensureGlobalConfig,
  initDatabase, getDatabase, logActivity
} = require('./src/database');
```

## Progress

- v1.7.0: Extracted validation and database modules (~345 lines)
- index.js reduced from 4017 → 3672 lines (9% reduction)
- All 140+ tests pass

## Next Steps

1. Extract knowledge tools to `tools/knowledge.js`
2. Extract reasoning tools to `tools/reasoning.js`
3. Continue with remaining tool modules
4. Target: index.js < 800 lines (~80% reduction)
