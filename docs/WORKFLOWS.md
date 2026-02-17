# Workflows

## Guarded Cycle Workflow (v1.9.0+)

The guarded cycle replaces the legacy reasoning workflow with a deterministic, governance-enforced reasoning engine.

### 1. Compliance Snapshot (Entry Point)

Start with a compliance snapshot. `session_id` is **optional** — if omitted, a memory session is auto-created.

```json
{
  "name": "compliance_snapshot",
  "arguments": {
    "context": "How should I implement user authentication?"
  }
}
```

Returns: `session_id` (auto-created integer), `snapshot_hash`, `phase: "SNAPSHOT"`

### 2. Compliance Router

Route the compliance check using the snapshot hash.

```json
{
  "name": "compliance_router",
  "arguments": {
    "session_id": "<from compliance_snapshot>",
    "snapshot_hash": "<from compliance_snapshot>"
  }
}
```

Returns: `route`, `phase: "ROUTER"`

### 3. Context Pack

Pack relevant context within a byte budget.

```json
{
  "name": "context_pack",
  "arguments": {
    "session_id": "<from compliance_snapshot>",
    "scope": "project",
    "byte_budget": 8000,
    "context_keys": ["authentication", "security"]
  }
}
```

Returns: `packed_context`, `context_hash`, `byte_count`, `phase: "CONTEXT_PACK"`

### 4. Guarded Cycle (Remaining Phases)

Execute remaining phases in order: DRAFT → FINALIZE_RESPONSE → GOVERNANCE_VALIDATE → MEMORY_UPDATE.

```json
{
  "name": "guarded_cycle",
  "arguments": {
    "session_id": "<from compliance_snapshot>",
    "phase": "DRAFT",
    "input": {
      "draft": "Use JWT with refresh tokens for stateless auth"
    }
  }
}
```

### 5. Finalize Response

Finalize with trust-aware labeling and integrity markers.

```json
{
  "name": "finalize_response",
  "arguments": {
    "session_id": "<from compliance_snapshot>",
    "draft": "Use JWT with refresh tokens",
    "context_hash": "<from context_pack>"
  }
}
```

Returns: `response`, `integrity` ("OK" | "NEEDS_VERIFICATION" | "BLOCKED"), `violations`

---

## DEPRECATED: Legacy Reasoning Workflow

> **Deprecated in v1.9.0.** Use the Guarded Cycle Workflow above.
> Legacy tools remain functional but return `deprecated: true` in responses.

## Complete Reasoning Workflow

### 1. Analyze Problem
Start with problem analysis to extract intent and get query suggestions.

```json
{
  "name": "analyze_problem",
  "arguments": {
    "problem": "How should I implement user authentication?"
  }
}
```

Returns: `session_id`, intent detection, suggested queries

### 2. Gather Context
Collect relevant experiences and context.

```json
{
  "name": "gather_context",
  "arguments": {
    "session_id": "<from_analyze>",
    "sources": {
      "related_experiences": ["auth", "security"]
    }
  }
}
```

### 3. Reason Through Options
Record sequential thoughts with confidence tracking.

```json
{
  "name": "reason_through",
  "arguments": {
    "session_id": "<session_id>",
    "thought": "JWT tokens are stateless and scale well",
    "thought_number": 1,
    "confidence": 0.8
  }
}
```

Add more thoughts as needed (thought_number: 2, 3, etc.)

### 4. Finalize Decision
Close session and optionally record as experience.

```json
{
  "name": "finalize_decision",
  "arguments": {
    "session_id": "<session_id>",
    "conclusion": "Use JWT with refresh tokens",
    "rationale": "Balance of security and scalability",
    "record_as_experience": true
  }
}
```

## Token-Based Workflow

### 1. Check Compliance (Dry-Run)
Verify what would happen without creating tokens.

```json
{
  "name": "check_compliance",
  "arguments": {
    "current_phase": "teach",
    "action": "record_experience"
  }
}
```

### 2. Verify Compliance (Get Token)
Get an operation token for authorized action.

```json
{
  "name": "verify_compliance",
  "arguments": {
    "session_id": "my-session",
    "current_phase": "teach",
    "action": "record_experience"
  }
}
```

Returns: `operation_token` (5min TTL)

### 3. Authorize Operation
Use token to authorize operation, optionally get session token.

```json
{
  "name": "authorize_operation",
  "arguments": {
    "operation_token": "<from_verify>",
    "create_session_token": true
  }
}
```

Returns: `session_token` (60min TTL) for multiple operations

## Experience Lifecycle

### Record → Search → Update → Export

```json
// 1. Record
{
  "name": "record_experience",
  "arguments": {
    "type": "effective",
    "domain": "Tools",
    "situation": "Need to parse JSON",
    "approach": "Used JSON.parse with try-catch",
    "outcome": "Handled errors gracefully",
    "reasoning": "Better than letting app crash"
  }
}

// 2. Search
{
  "name": "search_experiences",
  "arguments": {
    "query": "JSON parse"
  }
}

// 3. Update (create revision)
{
  "name": "update_experience",
  "arguments": {
    "id": 123,
    "changes": {
      "outcome": "Also added validation"
    },
    "reason": "Clarification after review"
  }
}

// 4. Export
{
  "name": "export_experiences",
  "arguments": {
    "format": "json",
    "domain": "Tools"
  }
}
```

## Session State Tracking

Get complete session state for debugging:

```json
{
  "name": "get_session_state",
  "arguments": {
    "session_id": "my-session"
  }
}
```

Returns:
- Reasoning session details
- All thoughts in order
- Workflow session info
- Active status

## Health Monitoring

Regular health checks:

```json
{
  "name": "health_check",
  "arguments": {}
}
```

Returns:
- Database connectivity
- Table integrity
- FTS5 index status
- Record counts
