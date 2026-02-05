# Tool Reference

Complete reference for all 25 tools in the unified MCP server.

## Knowledge Management Tools (6)

### record_experience
Record a working pattern (effective or ineffective).

**Parameters:**
- `type` (required): "effective" | "ineffective"
- `domain` (required): Tools | Protocol | Communication | Process | Debugging | Decision
- `situation` (required): What was happening
- `approach` (required): What you did
- `outcome` (required): What happened
- `reasoning` (required): Why this approach worked/failed
- `confidence` (optional): 0.0-1.0
- `tags` (optional): Array of strings
- `scope` (optional): "user" | "project" | "auto"

**Returns:** `{ recorded: true, experience_id: number, scope: string }`

### search_experiences
Full-text search with FTS5 and BM25 ranking.

**Parameters:**
- `query` (required): Search query
- `domain` (optional): Filter by domain
- `type` (optional): "effective" | "ineffective"
- `output_mode` (optional): "files_with_matches" | "content"

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
- `file_path` (optional): Where to save
- `domain` (optional): Filter by domain
- `type` (optional): Filter by type

**Returns:** `{ exported: true, count: number, file_path: string }`

## Reasoning Tools (4)

### analyze_problem
Start reasoning session with problem analysis.

**Parameters:**
- `problem` (required): Problem description

**Returns:** `{ session_id: string, intent: object, suggested_queries: array }`

### gather_context
Gather context from multiple sources.

**Parameters:**
- `session_id` (required): Reasoning session ID
- `sources` (required): Object with context sources

**Returns:** `{ synthesized: true, context_summary: object }`

### reason_through
Record a reasoning thought.

**Parameters:**
- `session_id` (required): Reasoning session ID
- `thought` (required): Reasoning step
- `thought_number` (required): Sequential number
- `confidence` (optional): 0.0-1.0

**Returns:** `{ recorded: true, thought_id: number }`

### finalize_decision
Close reasoning session with conclusion.

**Parameters:**
- `session_id` (required): Reasoning session ID
- `conclusion` (required): Final decision
- `rationale` (optional): Why this decision
- `record_as_experience` (optional): Auto-record (default: true)

**Returns:** `{ finalized: true, experience_id: number }`

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

## Automation Tools (5)

### install_hooks
Install workflow hooks (MVP).

**Returns:** `{ installed: true, hooks: array, location: string }`

### uninstall_hooks
Remove installed hooks (MVP).

**Returns:** `{ uninstalled: true, removed_count: number }`

### get_session_state
Get complete session state.

**Parameters:**
- `session_id` (required): Session ID

**Returns:** `{ session_id: string, reasoning_session: object, thoughts: array }`

### health_check
Run system health diagnostics.

**Returns:** `{ healthy: boolean, issues: array, warnings: array, stats: object }`

### import_data
Import data from JSON file.

**Parameters:**
- `source_file` (required): Path to JSON file

**Returns:** `{ imported: number, skipped: number, errors: number }`
