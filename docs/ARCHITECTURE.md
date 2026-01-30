# Architecture

## System Overview

The unified MCP server is a single-file, atomic tool suite that combines:
- Memory-augmented reasoning
- Protocol enforcement
- Workflow automation

## Design Principles

1. **Atomic Tools**: Each tool does one thing well
2. **Composable**: Tools work together seamlessly
3. **Stateless**: Each call is independent (state in DB)
4. **Validated**: All inputs validated before execution

## Database Schema

### experiences
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

### reasoning_sessions
Reasoning workflow tracking.

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

### reasoning_thoughts
Sequential thought history.

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

### workflow_sessions
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

### activity_log
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

## Token System

### Operation Tokens
- Single-use, 5-minute TTL
- Created by `verify_compliance`
- Consumed by `authorize_operation`
- Stored as JSON in `~/.unified-mcp/tokens/`

### Session Tokens
- Multi-use, 60-minute TTL
- Optional creation during authorization
- Enables fast-track for multiple operations
- Same storage location

### Token Structure
```json
{
  "token_id": "op-1234567890-abc123",
  "created_at": 1234567890000,
  "expires_at": 1234567890300,
  "type": "operation",
  "session_id": "my-session",
  "phase": "teach",
  "action": "record_experience"
}
```

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

### Validation
- Checks required fields (name, gates)
- Validates gate structure
- Warns about missing recommendations
- Returns errors and warnings arrays

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
- Custom ValidationError class

## File Organization

```
~/.unified-mcp/
├── data.db              # SQLite database
├── tokens/              # Operation & session tokens
│   ├── op-*.json       # Operation tokens
│   └── session-*.json  # Session tokens
└── presets/            # Custom presets
    └── *.json          # User-defined configs
```

## Performance Characteristics

- **Database**: SQLite with DELETE journal mode
- **Search**: FTS5 index for O(log n) lookups
- **Tokens**: File-based for simplicity
- **Memory**: Minimal (stateless design)

## Extension Points

1. **Custom Presets**: Add JSON files to presets/
2. **Import Format**: Support any JSON structure
3. **Hook System**: MVP placeholder for future expansion
4. **Token Storage**: Can swap to Redis/etc.

## Testing Strategy

- **Unit Tests**: Each tool tested independently
- **Integration Tests**: End-to-end workflows
- **100% Coverage**: All 25 tools, all paths
- **Automatic Cleanup**: Tests clean DB before run
