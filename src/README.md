# src/ Directory - Active Modules (v1.7.0)

This directory contains active, imported modules used by `index.js`.

## Module Structure

### Core Modules

| File | Purpose | Lines |
|------|---------|-------|
| `validation.js` | ValidationError class, validators, diceCoefficient | ~105 |
| `database.js` | Database init, schema, path helpers, logActivity | ~340 |
| `cli.js` | CLI commands (--help, --version, --init, --preset, --health, --validate) | ~560 |

### Tool Modules

| File | Purpose | Status |
|------|---------|--------|
| `tools/knowledge.js` | 7 knowledge management tools | ✅ Wired |
| `tools/reasoning.js` | 4 reasoning tools | ✅ Wired |
| `tools/workflow.js` | 5 workflow enforcement tools | ✅ Wired |
| `tools/config.js` | 5 configuration tools + BUILT_IN_PRESETS | ✅ Wired |
| `tools/automation.js` | 7 automation tools | ✅ Wired |

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

// From ./src/tools/knowledge.js
const {
  findDuplicate, recordExperience, searchExperiences, getExperience,
  updateExperience, tagExperience, exportExperiences, importExperiences
} = require('./src/tools/knowledge');

// From ./src/tools/reasoning.js
const {
  detectGoal, detectPriority, detectFormat, detectContext, suggestLocalFiles,
  analyzeProblem, gatherContext, reasonThrough, finalizeDecision
} = require('./src/tools/reasoning');

// From ./src/tools/workflow.js
const {
  checkCompliance, verifyCompliance, authorizeOperation,
  getWorkflowStatus, resetWorkflow
} = require('./src/tools/workflow');

// From ./src/tools/config.js
const {
  BUILT_IN_PRESETS, listPresets, applyPreset, validateConfig,
  getConfig, exportConfig
} = require('./src/tools/config');

// From ./src/tools/automation.js
const {
  installHooks, uninstallHooks, getSessionState, healthCheck,
  importData, updateProjectContext, getProjectContext
} = require('./src/tools/automation');

// From ./src/cli.js
const { runCLI } = require('./src/cli');
```

## Progress

- v1.7.0 Phase 1: Extracted validation and database modules (~445 lines)
- v1.7.0 Phase 2: Extracted knowledge tools (~500 lines)
- v1.7.0 Phase 3: Extracted reasoning tools (~450 lines)
- v1.7.0 Phase 4: Extracted workflow tools (~340 lines)
- v1.7.0 Phase 5: Extracted config tools (~380 lines)
- v1.7.0 Phase 6: Extracted automation tools (~630 lines)
- v1.7.0 Phase 7: Extracted CLI to cli.js (~560 lines)
- **index.js reduced from 3676 → 716 lines (80.5% reduction)**
- All 140+ tests pass

## Completed

1. ~~Extract knowledge tools to `tools/knowledge.js`~~ ✅
2. ~~Extract reasoning tools to `tools/reasoning.js`~~ ✅
3. ~~Extract workflow tools to `tools/workflow.js`~~ ✅
4. ~~Extract config tools to `tools/config.js`~~ ✅
5. ~~Extract automation tools to `tools/automation.js`~~ ✅
6. ~~Extract CLI to `cli.js`~~ ✅
7. ~~Target: index.js < 800 lines (~78% reduction)~~ ✅ **Achieved: 716 lines (80.5% reduction)**
