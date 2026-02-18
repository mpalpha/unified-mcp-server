# src/ Directory - Active Modules

This directory contains active, imported modules used by `index.js`.

## Module Structure

### Core Modules

| File | Purpose | Lines |
|------|---------|-------|
| `validation.js` | ValidationError class, validators, diceCoefficient | ~125 |
| `database.js` | Database init, schema, path helpers, logActivity | ~580 |
| `database-wasm.js` | WASM SQLite wrapper (node-sqlite3-wasm) | ~380 |
| `errors.js` | Structured error classes for all 34 tools | ~315 |
| `cli.js` | CLI commands (--help, --version, --init, --install, --doctor, --demo) | ~1870 |

### Tool Modules

| File | Purpose | Status |
|------|---------|--------|
| `tools/knowledge.js` | 7 knowledge management tools | ✅ Wired |
| `tools/reasoning.js` | 4 reasoning tools (legacy, shimmed) | ✅ Wired (deprecated) |
| `tools/memory.js` | 6 memory system MCP tools | ✅ Wired |
| `tools/workflow.js` | 5 workflow enforcement tools | ✅ Wired |
| `tools/config.js` | 5 configuration tools + BUILT_IN_PRESETS | ✅ Wired |
| `tools/automation.js` | 7 automation tools | ✅ Wired |

### Memory System Modules

| File | Purpose |
|------|---------|
| `memory/index.js` | Barrel export for all memory modules |
| `memory/canonical.js` | Canonical JSON, SHA-256 hashing, HMAC-SHA256 signing |
| `memory/schema.js` | Memory schema application (migration 002) |
| `memory/salience.js` | Salience computation formula |
| `memory/sessions.js` | Memory session management |
| `memory/invocations.js` | Hash-chained invocation ledger |
| `memory/experiences.js` | Episodic experience recording |
| `memory/scenes.js` | Scenes, cells, evidence linking |
| `memory/consolidation.js` | Deterministic consolidation engine |
| `memory/context-pack.js` | Byte-budgeted context packing |
| `memory/guarded-cycle.js` | 7-phase state machine |
| `memory/finalize.js` | Response finalization with trust labeling |
| `memory/governance.js` | Receipts, tokens, validation, violations |

## What's Imported

`index.js` imports the following from modules:

```javascript
// From ./src/validation.js
const { ValidationError, diceCoefficient, getBigrams } = require('./src/validation');

// From ./src/database.js
const {
  getProjectDir, getDbPath, getTokenDir, getConfigPath,
  ensureProjectContext, ensureGlobalConfig,
  initDatabase, getDatabase, tryGetDatabase, isDatabaseAvailable, getDatabaseError, logActivity
} = require('./src/database');

// From ./src/tools/knowledge.js
const {
  findDuplicate, recordExperience, searchExperiences, getExperience,
  updateExperience, tagExperience, exportExperiences, importExperiences
} = require('./src/tools/knowledge');

// From ./src/tools/reasoning.js (legacy, shimmed)
const {
  detectGoal, detectPriority, detectFormat, detectContext, suggestLocalFiles,
  analyzeProblem, gatherContext, reasonThrough, finalizeDecision
} = require('./src/tools/reasoning');

// From ./src/tools/memory.js
const {
  complianceSnapshot, complianceRouter, contextPack,
  guardedCycle, finalizeResponse, runConsolidation
} = require('./src/tools/memory');

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
const { runCLI, checkVersionAndPrompt } = require('./src/cli');
```

## CLI Flags

| Flag | Purpose |
|------|---------|
| `--help` | Show usage |
| `--version` | Show version |
| `--init` | Interactive setup wizard |
| `--install` | Non-interactive install |
| `--preset <name>` | Set workflow preset |
| `--health` | Run health check |
| `--doctor` | System diagnostics (DB, schema, integrity) |
| `--demo` | Exercise all memory system phases |
| `hooks install` | Install hooks |
| `hooks uninstall` | Remove hooks |
