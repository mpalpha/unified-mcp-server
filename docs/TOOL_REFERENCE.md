# Tool Reference

Complete reference for all tools in the unified MCP server.

## Knowledge Management Tools (7)

### record_experience
Record a working pattern (effective or ineffective). Also use for "remember X" requests - stores user-directed memories for later recall.

**Parameters:**
- `type` (required): "effective" | "ineffective"
- `domain` (required): Tools | Protocol | Communication | Process | Debugging | Decision
- `situation` (required): What was happening
- `approach` (required): What you did
- `outcome` (required): What happened
- `reasoning` (required): Why this approach worked/failed
- `confidence` (optional): 0.0-1.0
- `tags` (optional): Array of strings

**Returns:** `{ recorded: true, experience_id: number }`

### search_experiences
Full-text search with FTS5 and BM25 ranking. Also use for "what did I tell you?" or "recall X" - retrieves stored memories and past experiences.

**Parameters:**
- `query` (required): Search query
- `domain` (optional): Filter by domain
- `type` (optional): "effective" | "ineffective"
- `min_confidence` (optional): 0.0-1.0
- `limit` (optional): 1-100 (default: 20)
- `offset` (optional): 0+ (default: 0)

**Returns:** `{ results: array, count: number }`

### get_experience
Retrieve experience by ID.

**Parameters:**
- `id` (required): Experience ID

**Returns:** Experience object with all fields

### update_experience
Create a revision of an experience.

**Parameters:**
- `id` (required): Experience ID
- `changes` (required): Object with fields to update
- `reason` (required): Why updating

**Returns:** `{ updated: true, new_id: number, original_id: number }`

#### When to UPDATE vs RECORD NEW

**UPDATE existing experience when:**
- Same situation, refined approach (learned better technique)
- Correcting an error in original recording
- Validating/invalidating with new evidence (confidence change)
- Outcome different than originally expected

**RECORD NEW experience when:**
- Different situation (even if similar domain)
- Fundamentally different approach to same problem
- Building on previous learning (reference via tags, don't overwrite)
- Different project/context

**Rule of thumb:** Could someone find both useful? → Record new.
Is the old one now wrong/incomplete? → Update.

#### Experiences as Memory

Experiences are the agent's memory. Record when user implies information should persist beyond the current conversation.

**When recalling:** Cite the cause directly, not the source.
- "Experience #2 said X" / "The database shows" ← Avoid
- "Because X" (the agent remembers, not "the database told me") ← Preferred

### tag_experience
Add tags to an experience.

**Parameters:**
- `id` (required): Experience ID
- `tags` (required): Array of tag strings

**Returns:** `{ tagged: true, tags: array }`

### export_experiences
Export experiences to file.

**Parameters:**
- `format` (required): "json" | "markdown"
- `filter` (optional): Object with domain/type filters
- `output_path` (optional): Where to save

**Returns:** `{ exported: true, count: number, file_path: string }`

### import_experiences
Import experiences from a JSON file exported from another project.

**Parameters:**
- `filename` (required): Path to JSON file to import
- `filter` (optional): Object with domain/type filters

**Returns:** `{ imported: number, skipped: number, errors: number }`

## Memory System Tools (6)

### compliance_snapshot
Take a compliance snapshot of the current context. Replaces `analyze_problem` in the new GUARDED_REASON lifecycle. This is the **entry point** for the guarded cycle.

**Parameters:**
- `session_id` (optional): Memory session ID (integer). If omitted, a new memory session is **auto-created** and its `session_id` returned. Use the returned `session_id` for all downstream tools (`compliance_router`, `context_pack`, `guarded_cycle`, `finalize_response`).
- `context` (optional): Additional context to include in snapshot
- `scope` (optional): "project" | "global" (default: "project")
- `context_keys` (optional): Array of context key strings

**Returns:** `{ snapshot_hash: string, session_id: number, phase: "SNAPSHOT" }`

**Session Auto-Creation:** When called without `session_id`, creates a new `memory_sessions` row via `createSession()` internally. No separate session creation tool is needed — the entry-point tool handles it, matching the pattern used by `analyze_problem` for `reasoning_sessions`.

### compliance_router
Route the compliance check based on snapshot results. Determines which reasoning path to follow.

**Parameters:**
- `session_id` (required): Memory session ID
- `snapshot_hash` (required): Hash from compliance_snapshot

**Returns:** `{ route: string, session_id: number, phase: "ROUTER" }`

### context_pack
Pack relevant context within a byte budget. Replaces `gather_context` in the new lifecycle.

**Parameters:**
- `session_id` (required): Memory session ID
- `scope` (optional): "project" | "global" (default: "project")
- `byte_budget` (optional): Maximum bytes for context (default: 8000)
- `context_keys` (optional): Array of context key strings to prioritize

**Returns:** `{ packed_context: object, context_hash: string, byte_count: number, phase: "CONTEXT_PACK" }`

### guarded_cycle
Execute a phase of the guarded reasoning cycle. Replaces `reason_through` in the new lifecycle. Must be called in phase order: SNAPSHOT → ROUTER → CONTEXT_PACK → DRAFT → FINALIZE_RESPONSE → GOVERNANCE_VALIDATE → MEMORY_UPDATE.

**Parameters:**
- `session_id` (required): Memory session ID
- `phase` (required): Phase to execute
- `input` (required): Phase-specific input data

**Returns:** `{ phase: string, output: object, next_phase: string, session_id: number }`

### finalize_response
Finalize a response with trust-aware labeling and integrity markers. Replaces `finalize_decision` in the new lifecycle.

**Parameters:**
- `session_id` (required): Memory session ID
- `draft` (required): Draft response text
- `context_hash` (required): Hash from context_pack
- `cells` (optional): Array of cells used in reasoning

**Returns:** `{ response: string, integrity: string, violations: array }`

### run_consolidation
Run the deterministic consolidation engine. Processes episodic experiences into semantic cells via conservative templates.

**Parameters:**
- `scope` (optional): "project" | "global" (default: "project")
- `threshold` (optional): Minimum experiences before consolidation (default: 5)

**Returns:** `{ processed: number, cells_created: number, cells_updated: number, idempotent: boolean }`

## Reasoning Tools (4) — DEPRECATED

> **Breaking Change**: These tools are deprecated in favor of Memory System Tools.
> They remain functional via compatibility shims but return `deprecated: true` in responses.
> See Compatibility Shim Matrix in ARCHITECTURE.md.

### analyze_problem
**DEPRECATED** → Use `compliance_snapshot` + `compliance_router`

Start reasoning session with problem analysis.

**Parameters:**
- `problem` (required): Problem description
- `available_tools` (optional): Array of MCP tool names

**Returns:** `{ session_id: string, user_intent: object, suggested_queries: object, deprecated: true, replacement: "compliance_snapshot + compliance_router" }`

### gather_context
**DEPRECATED** → Use `context_pack`

Gather context from multiple sources.

**Parameters:**
- `session_id` (required): Reasoning session ID
- `sources` (required): Object with context sources

**Returns:** `{ synthesized_context: string, token_count: number, deprecated: true, replacement: "context_pack" }`

### reason_through
**DEPRECATED** → Use `guarded_cycle`

Record a reasoning thought.

**Parameters:**
- `session_id` (required): Reasoning session ID
- `thought` (required): Reasoning step
- `thought_number` (required): Sequential number
- `confidence` (optional): 0.0-1.0

**Returns:** `{ thought_id: number, thought_number: number, deprecated: true, replacement: "guarded_cycle" }`

### finalize_decision
**DEPRECATED** → Use `finalize_response` + governance validation

Close reasoning session with conclusion.

**Parameters:**
- `session_id` (required): Reasoning session ID
- `conclusion` (required): Final decision
- `rationale` (optional): Why this decision
- `record_as_experience` (optional): Auto-record (default: true)

**Returns:** `{ conclusion: string, experience_id: number, deprecated: true, replacement: "finalize_response" }`

## Workflow Enforcement Tools (5)

### check_compliance
Check compliance without enforcement (dry-run).

**Parameters:**
- `current_phase` (required): "teach" | "learn" | "reason"
- `action` (required): Action being attempted

**Returns:** `{ compliant: boolean, would_block: boolean }`

### verify_compliance
Verify compliance and create operation token.

**Parameters:**
- `session_id` (optional): Session ID
- `current_phase` (required): "teach" | "learn" | "reason"
- `action` (required): Action being attempted

**Returns:** `{ compliant: true, operation_token: string }`

### authorize_operation
Authorize operation with token.

**Parameters:**
- `operation_token` (required): Token from verify_compliance
- `create_session_token` (optional): Create 60min session token

**Returns:** `{ authorized: true, session_token: string }`

### get_workflow_status
Get workflow session status.

**Parameters:**
- `session_id` (optional): Session ID

**Returns:** `{ session_id: string, current_phase: string, active_tokens: array }`

### reset_workflow
Reset workflow session and cleanup tokens.

**Parameters:**
- `session_id` (optional): Session to reset
- `cleanup_only` (optional): Only cleanup expired tokens

**Returns:** `{ reset: true, cleaned_up: number }`

## Configuration Tools (5)

### list_presets
List available configuration presets.

**Returns:** `{ presets: array, count: number }`

### apply_preset
Apply preset to session.

**Parameters:**
- `preset_name` (required): Preset to apply
- `session_id` (optional): Session to apply to

**Returns:** `{ applied: true, preset_name: string }`

### validate_config
Validate configuration structure.

**Parameters:**
- `config` (required): Configuration object

**Returns:** `{ valid: boolean, errors: array, warnings: array }`

### get_config
Get active configuration.

**Parameters:**
- `session_id` (optional): Session ID

**Returns:** `{ active_preset: string, config: object }`

### export_config
Export configuration to file.

**Parameters:**
- `preset_name` (required): Preset to export
- `file_path` (optional): Where to save

**Returns:** `{ exported: true, file_path: string }`

## Automation Tools (7)

### install_hooks
Install workflow hooks to `~/.claude/hooks/`.

**Returns:** `{ installed: true, hooks: array, location: string }`

### uninstall_hooks
Remove installed hooks from `~/.claude/hooks/`.

**Returns:** `{ uninstalled: true, removed_count: number }`

### get_session_state
Get complete session state.

**Parameters:**
- `session_id` (required): Session ID

**Returns:** `{ session_id: string, reasoning_session: object, thoughts: array }`

### health_check
Run system health diagnostics including memory system status.

**Returns:** `{ healthy: boolean, issues: array, warnings: array, stats: object, memory_system: object }`

### import_data
Import data from JSON file.

**Parameters:**
- `source_file` (required): Path to JSON file

**Returns:** `{ imported: number, skipped: number, errors: number }`

### update_project_context
Update project-specific context (data-only, no code execution).

**Parameters:**
- `enabled` (required): Enable/disable project context display
- `summary` (optional): One-line project summary (max 200 chars)
- `highlights` (optional): Key project highlights (max 5 items)
- `reminders` (optional): Important reminders (max 3 items)
- `preImplementation` (optional): Pre-coding checklist items
- `postImplementation` (optional): Post-coding checklist items
- `project_path` (optional): Project directory path

**Returns:** `{ updated: true, path: string }`

### get_project_context
Get current project context configuration.

**Parameters:**
- `project_path` (optional): Project directory path

**Returns:** Project context object
