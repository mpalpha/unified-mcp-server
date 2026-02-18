# Architecture

## System Overview

The unified MCP server is a modular tool suite that combines:
- Memory-augmented reasoning (episodic + semantic)
- Deterministic governance enforcement
- Workflow automation with hook integration

### Lifecycle

```
TEACH → LEARN → GUARDED_REASON → ACT
```

**GUARDED_REASON** replaces the legacy REASON phase with a deterministic, governance-enforced reasoning engine. Legacy REASON tools (`analyze_problem`, `gather_context`, `reason_through`, `finalize_decision`) return `deprecated: true` with `replacement` field pointing to memory system equivalents. They do NOT delegate to the new tools — they remain independent for backward compatibility.

### Guarded Cycle Phases

The guarded cycle enforces a strict 7-phase state machine:

```
SNAPSHOT → ROUTER → CONTEXT_PACK → DRAFT → FINALIZE_RESPONSE → GOVERNANCE_VALIDATE → MEMORY_UPDATE
```

Each phase must complete before the next begins. Phase violations are logged and blocked.

## Design Principles

1. **Atomic Tools**: Each tool does one thing well
2. **Composable**: Tools work together seamlessly
3. **Stateless**: Each call is independent (state in DB)
4. **Validated**: All inputs validated before execution
5. **Deterministic**: Same inputs always produce same outputs (canonical JSON, stable ordering)
6. **Governance-Enforced**: All reasoning passes through hash chain verification and receipt signing

## Database Schema

### Migration 001: Core Tables

#### experiences
Core knowledge records with full-text search.

```sql
CREATE TABLE experiences (
  id INTEGER PRIMARY KEY,
  type TEXT CHECK(type IN ('effective', 'ineffective')),
  domain TEXT,
  situation TEXT,
  approach TEXT,
  outcome TEXT,
  reasoning TEXT,
  confidence REAL,
  tags TEXT,
  scope TEXT,
  created_at INTEGER,
  original_id INTEGER
);

CREATE VIRTUAL TABLE experiences_fts USING fts5(
  situation, approach, outcome, reasoning, tags,
  content=experiences
);
```

#### reasoning_sessions
Reasoning workflow tracking (legacy, retained for backward compatibility).

```sql
CREATE TABLE reasoning_sessions (
  session_id TEXT PRIMARY KEY,
  problem TEXT,
  user_intent TEXT,
  phase TEXT CHECK(phase IN ('analyze', 'gather', 'reason', 'finalized')),
  created_at INTEGER,
  updated_at INTEGER,
  finalized_at INTEGER,
  conclusion TEXT,
  experience_id INTEGER
);
```

#### reasoning_thoughts
Sequential thought history (legacy, retained for backward compatibility).

```sql
CREATE TABLE reasoning_thoughts (
  id INTEGER PRIMARY KEY,
  session_id TEXT,
  thought_number INTEGER,
  thought TEXT,
  confidence REAL,
  is_revision BOOLEAN,
  revises_thought INTEGER,
  created_at INTEGER
);
```

#### workflow_sessions
Workflow state and preset tracking.

```sql
CREATE TABLE workflow_sessions (
  session_id TEXT PRIMARY KEY,
  preset TEXT,
  gates_passed TEXT,
  steps_completed TEXT,
  created_at INTEGER,
  expires_at INTEGER,
  active BOOLEAN
);
```

#### activity_log
Audit trail for all operations.

```sql
CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY,
  timestamp INTEGER,
  event_type TEXT,
  session_id TEXT,
  details TEXT
);
```

### Migration 002: Memory System Tables

9 tables supporting the deterministic memory system. All use `INTEGER PRIMARY KEY AUTOINCREMENT` for consistency.

#### memory_sessions
Memory-aware session tracking with scope and phase state.

```sql
CREATE TABLE memory_sessions (
  session_id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  scope_mode TEXT NOT NULL DEFAULT 'project',
  flags_json TEXT NOT NULL DEFAULT '{}',
  last_phase TEXT,
  last_context_hash TEXT
);
```

#### invocations
Hash-chained invocation ledger for tamper detection.

```sql
CREATE TABLE invocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  ts TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  output_hash TEXT NOT NULL,
  meta_json TEXT DEFAULT '{}',
  prev_hash TEXT,
  hash TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES memory_sessions(session_id)
);
```

#### receipts
Signed governance receipts for audit trail.

```sql
CREATE TABLE receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  ts TEXT NOT NULL,
  receipt_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  signature TEXT NOT NULL,
  public_meta_json TEXT DEFAULT '{}',
  FOREIGN KEY (session_id) REFERENCES memory_sessions(session_id)
);
```

#### memory_tokens
Signed tokens stored in database (complements file-based `.claude/tokens/`).

```sql
CREATE TABLE memory_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  ts TEXT NOT NULL,
  token_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  signature TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES memory_sessions(session_id)
);
```

#### episodic_experiences
Episodic memory with trust, salience, and scope tracking. Distinct from `experiences` table to avoid collision.

```sql
CREATE TABLE episodic_experiences (
  experience_id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER,
  scope TEXT NOT NULL DEFAULT 'project' CHECK(scope IN ('project', 'global')),
  context_keys_json TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'unknown' CHECK(outcome IN ('success', 'partial', 'fail', 'unknown')),
  trust INTEGER NOT NULL DEFAULT 1 CHECK(trust BETWEEN 0 AND 3),
  salience INTEGER NOT NULL DEFAULT 0 CHECK(salience BETWEEN 0 AND 1000),
  created_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'system' CHECK(source IN ('user', 'system', 'agent', 'derived')),
  FOREIGN KEY (session_id) REFERENCES memory_sessions(session_id)
);
```

#### consolidation_meta
Tracks last consolidation timestamp per scope.

```sql
CREATE TABLE consolidation_meta (
  scope TEXT PRIMARY KEY CHECK(scope IN ('project', 'global')),
  last_consolidation_ts TEXT
);
```

#### scenes
Semantic memory containers grouping related cells.

```sql
CREATE TABLE scenes (
  scene_id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL DEFAULT 'project' CHECK(scope IN ('project', 'global')),
  label TEXT NOT NULL,
  context_keys_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

#### cells
Semantic memory units with trust, salience, state tracking, and canonical keys.

```sql
CREATE TABLE cells (
  cell_id INTEGER PRIMARY KEY AUTOINCREMENT,
  scene_id INTEGER NOT NULL,
  scope TEXT NOT NULL DEFAULT 'project' CHECK(scope IN ('project', 'global')),
  cell_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  trust INTEGER NOT NULL DEFAULT 1 CHECK(trust BETWEEN 0 AND 3),
  salience INTEGER NOT NULL DEFAULT 0 CHECK(salience BETWEEN 0 AND 1000),
  state TEXT NOT NULL DEFAULT 'unverified',
  evidence_count INTEGER NOT NULL DEFAULT 0,
  contradiction_count INTEGER NOT NULL DEFAULT 0,
  conflict_group TEXT,
  supersedes_cell_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  canonical_key TEXT UNIQUE NOT NULL,
  FOREIGN KEY (scene_id) REFERENCES scenes(scene_id),
  FOREIGN KEY (supersedes_cell_id) REFERENCES cells(cell_id)
);
```

#### cell_evidence
Links cells to supporting/contradicting episodic experiences.

```sql
CREATE TABLE cell_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cell_id INTEGER NOT NULL,
  experience_id INTEGER NOT NULL,
  relation TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (cell_id) REFERENCES cells(cell_id),
  FOREIGN KEY (experience_id) REFERENCES episodic_experiences(experience_id)
);
```

### Primary Key Strategy

All tables use `INTEGER PRIMARY KEY AUTOINCREMENT`. No TEXT primary keys. If stable external identifiers are needed, add a separate `UNIQUE TEXT` column (e.g., `canonical_key` on cells).

### Naming Collision Decisions

| Concept | Table Name | Rationale |
|---------|-----------|-----------|
| Knowledge records | `experiences` | Original, unchanged |
| Episodic memory | `episodic_experiences` | Avoids collision with `experiences` |
| DB tokens | `memory_tokens` | Avoids collision with `.claude/tokens/` directory |
| Memory sessions | `memory_sessions` | Avoids collision with `reasoning_sessions` |

## Token System

### v1 Tokens (File-Based)
- Single-use operation tokens: 5-minute TTL
- Multi-use session tokens: 60-minute TTL
- Stored as JSON in `.claude/tokens/` (project-local)
- Created by `verify_compliance` / `authorize_operation`

### v2 Tokens (Database + File)
- Extends v1 with additional fields:
  - `token_version: 2`
  - `context_hash`: SHA-256 of context at token creation
  - `invocation_chain_head`: Latest hash chain entry
  - `compliance_version`: Schema version for validation
- HMAC-SHA256 signed with project signing secret
- Backward compatible: v1 tokens remain valid

### Token Structure (v2)
```json
{
  "token_id": "op-1234567890-abc123",
  "token_version": 2,
  "created_at": 1234567890000,
  "expires_at": 1234567890300,
  "type": "operation",
  "session_id": "my-session",
  "phase": "teach",
  "action": "record_experience",
  "context_hash": "sha256-...",
  "invocation_chain_head": "sha256-...",
  "compliance_version": "1.9.0"
}
```

### Signing
- Secret: 32-byte random hex stored at `.claude/signing.key`
- Generated automatically by `--init` or `runNonInteractiveInstall()`
- Algorithm: HMAC-SHA256

## Deterministic Operations

### Canonical JSON
Recursive key sort ensures identical serialization regardless of insertion order.

### Hashing
SHA-256 for all content hashing (invocations, context, receipts).

### Signing
HMAC-SHA256 with per-project signing secret for receipts and tokens.

### Stable Ordering
All queries use deterministic ordering:
```
trust DESC, salience DESC, updated_at DESC, id ASC
```

### Salience Formula
```
salience = state_weight + evidence_count*60 + recency_bucket*20 + trust*40 - contradiction_count*120
```

Trust levels: 0 (untrusted) through 3 (verified).

## Compatibility Shim Matrix

Legacy REASON tools return deprecation notices pointing to memory system equivalents. They do NOT delegate — they remain independent:

| Legacy Tool | New Tool(s) | Wrapper Behavior |
|------------|------------|-----------------|
| `analyze_problem` | `compliance_snapshot` + `compliance_router` | Returns `deprecated: true`, `replacement` field |
| `gather_context` | `context_pack` | Returns `deprecated: true`, `replacement` field |
| `reason_through` | `guarded_cycle` | Returns `deprecated: true`, `replacement` field |
| `finalize_decision` | `finalize_response` + `governance_validate` | Returns `deprecated: true`, `replacement` field |

Wrappers include error code `LEGACY_TOOL_DEPRECATED` and remediation guidance.

## Search Implementation

### FTS5 with BM25
- Full-text search using SQLite FTS5
- BM25 ranking for relevance
- OR logic for multi-term queries
- Each term individually quoted for accuracy

### Dice Coefficient Deduplication
- 90% similarity threshold
- Prevents duplicate experiences
- Compares bigrams of normalized text
- Returns duplicate_id if found

## Configuration System

### Preset Structure
Built-in presets: three-gate, minimal, strict, custom

Each preset defines:
- Gates (teach, learn, reason)
- Required tools per gate
- Token TTL values
- Enforcement level

### Memory Defaults
```json
{
  "memory_enabled": true,
  "consolidation_threshold": 5,
  "max_cells_total": 1000,
  "max_cells_per_scene": 50,
  "max_experiences_total": 5000,
  "byte_budget_default": 8000
}
```

### Validation
- Checks required fields (name, gates)
- Validates gate structure
- Warns about missing recommendations
- Returns errors and warnings arrays

## Hook Integration

### session-start.cjs
- Displays CHORES framework
- Detects and injects post-install prompts

### user-prompt-submit.cjs
- Invokes guarded cycle enforcement
- Loads project context and workflow gates

### post-tool-use.cjs
- Records invocations to hash chain (`record_invocation`)
- Displays post-implementation checklist

### stop.cjs
- Runs governance validation (`governance_validate`)
- Mints receipt and token
- Closes memory session
- Cleans up expired file-based tokens

## Protocol Flow

### MCP JSON-RPC
1. Client sends initialize request
2. Server responds with capabilities
3. Client calls tools via tools/call
4. Server validates and executes
5. Returns result or error

### Error Handling
- Validation errors: -32602
- Unknown tools: -32601
- Internal errors: -32603
- Legacy tool deprecation: LEGACY_TOOL_DEPRECATED
- Custom ValidationError class

## File Organization

**Server Source:**
```
src/
├── database.js              # DB init, schema, path helpers
├── database-wasm.js         # WASM SQLite wrapper
├── validation.js            # ValidationError, validators
├── cli.js                   # CLI commands (--init, --doctor, --demo)
├── tools/
│   ├── knowledge.js         # 7 knowledge management tools
│   ├── reasoning.js         # 4 legacy reasoning tools (shimmed)
│   ├── memory.js            # 8 memory system MCP tools
│   ├── workflow.js          # 5 workflow enforcement tools
│   ├── config.js            # 5 configuration tools
│   └── automation.js        # 7 automation tools
└── memory/
    ├── index.js             # Barrel export
    ├── canonical.js          # Canonical JSON, SHA-256, HMAC-SHA256
    ├── schema.js             # Memory schema application
    ├── salience.js           # Salience computation
    ├── sessions.js           # Memory session management
    ├── invocations.js        # Hash-chained invocation ledger
    ├── experiences.js        # Episodic experience recording
    ├── scenes.js             # Scenes, cells, evidence
    ├── consolidation.js      # Deterministic consolidation engine
    ├── context-pack.js       # Byte-budgeted context packing
    ├── guarded-cycle.js      # 7-phase state machine
    ├── finalize.js           # Response finalization
    └── governance.js         # Receipts, tokens, validation
```

**Global (installed):**
```
~/.claude/
├── hooks/                    # Global hooks (DO NOT MODIFY)
│   ├── session-start.cjs
│   ├── user-prompt-submit.cjs
│   ├── pre-tool-use.cjs
│   ├── post-tool-use.cjs
│   ├── pre-compact.cjs
│   └── stop.cjs
└── settings.json             # Hook + permissions configuration
~/.claude.json                  # MCP server registration (user scope)
```

**Project-Local (per project):**
```
.claude/
├── experiences.db            # SQLite database (all tables)
├── config.json               # Workflow configuration
├── project-context.json      # Checklists, reminders
├── signing.key               # HMAC signing secret (mode 0600)
└── tokens/                   # File-based tokens (v1 + v2)
    ├── op-*.json            # Operation tokens
    └── session-*.json       # Session tokens
```

**Migrations:**
```
migrations/
├── 001_initial_schema.sql    # Core tables (experiences, reasoning, workflow)
└── 002_memory_system.sql     # Memory system tables (9 tables)
```

## User-Facing Behavior

After the memory system upgrade, responses may include:
- `[Inference]` labeling when trust < 2
- Conflict notices when contradiction_count >= 1
- Integrity marker appended to responses:
  - `[INTEGRITY: OK]`
  - `[INTEGRITY: NEEDS_VERIFICATION]`
  - `[INTEGRITY: BLOCKED]`

The system prefers clarifying questions over guessing. Memory persists across sessions (episodic + semantic). Repeated violations escalate to policy cells deterministically.

## Performance Characteristics

- **Database**: SQLite WASM with DELETE journal mode
- **Search**: FTS5 index for O(log n) lookups
- **Tokens**: File-based (v1) + DB-based (v2)
- **Memory**: Minimal (stateless design per request)
- **Hashing**: SHA-256 (crypto module, no external deps)

## Testing Strategy

Tests cover unit, integration, memory system, hooks, CLI (`--demo`, `--doctor`), and more. Each test file cleans the DB before its run.

For the complete test targeting guide — including the module-to-test-file mapping and when to run targeted vs full suite — see [CONTRIBUTING.md § Test Targeting Guide](CONTRIBUTING.md#test-targeting-guide).
