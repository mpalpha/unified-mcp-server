# Unified MCP Server v1.0

A comprehensive MCP (Model Context Protocol) server combining memory-augmented reasoning, protocol enforcement, and workflow automation in a single, atomic tool suite.

## Features

- **25 Atomic Tools** organized in 5 categories
- **150/150 Automated Tests + 50+ Research-Based Scenarios**
- **Research-Founded** - Based on 2024-2025 agent failure studies
- **Zero Installation** - Run directly via npx
- **SQLite + FTS5** for full-text search with BM25 ranking
- **Token-Based Authorization** with session management
- **Configuration Presets** for workflow customization
- **Health Diagnostics** and data import/export

## Quick Start

### Run via NPX (Recommended)

```bash
# Run directly from GitHub Gist - no installation needed!
npx mpalpha/unified-mcp-server

# Show help
npx mpalpha/unified-mcp-server --help

# Show version
npx mpalpha/unified-mcp-server --version

# Interactive setup
npx mpalpha/unified-mcp-server --init
```

### Claude Code Integration

Add to your MCP settings:

```json
{
  "mcpServers": {
    "unified-mcp": {
      "command": "npx",
      "args": ["mpalpha/unified-mcp-server"]
    }
  }
}
```

### Local Development

```bash
# Clone repository
npx mpalpha/unified-mcp-server
cd unified-mcp-server

# Install dependencies
npm install

# Run tests
npm test

# Start server
npx .
```

## Tool Categories

### 1. Knowledge Management (6 tools)
- `record_experience` - Record working patterns (effective/ineffective)
- `search_experiences` - FTS5 search with BM25 ranking
- `get_experience` - Retrieve by ID with revision history
- `update_experience` - Create revisions, preserve history
- `tag_experience` - Add searchable tags
- `export_experiences` - JSON/Markdown export

### 2. Reasoning Tools (4 tools)
- `analyze_problem` - Extract intent, suggest queries
- `gather_context` - Multi-source context synthesis
- `reason_through` - Sequential thought tracking
- `finalize_decision` - Close session, auto-record

### 3. Workflow Enforcement (5 tools)
- `check_compliance` - Dry-run compliance check
- `verify_compliance` - Create operation tokens
- `authorize_operation` - Validate tokens, create session tokens
- `get_workflow_status` - Session introspection
- `reset_workflow` - Reset sessions, cleanup tokens

### 4. Configuration (5 tools)
- `list_presets` - List available presets
- `apply_preset` - Apply preset to session
- `validate_config` - Validate configuration
- `get_config` - Get active configuration
- `export_config` - Export preset to file

### 5. Automation (5 tools)
- `install_hooks` - Install workflow hooks (MVP)
- `uninstall_hooks` - Remove hooks (MVP)
- `get_session_state` - Complete session introspection
- `health_check` - System diagnostics
- `import_data` - Import from JSON files

## Configuration Presets

### three-gate (Default)
Standard TEACH → LEARN → REASON workflow with moderate enforcement.

### minimal
Lightweight workflow with optional gates and lenient enforcement.

### strict
Strict enforcement requiring all validations and complete documentation.

### custom
Template for custom workflows - modify as needed.

## Database Schema

- `experiences` - Core knowledge records with FTS5 index
- `reasoning_sessions` - Reasoning workflow tracking
- `reasoning_thoughts` - Sequential thought history
- `workflow_sessions` - Workflow state and preset tracking
- `activity_log` - Audit trail

## File Locations

**Global (v1.5.0+):**
```
~/.claude/
├── hooks/               # Global hooks (DO NOT MODIFY)
└── settings.json        # Hook configuration
```

**Project-Local:**
```
.claude/
├── experiences.db       # SQLite database (project-scoped)
├── config.json          # Workflow configuration
├── project-context.json # Checklists, reminders
└── tokens/              # Operation & session tokens
```

## Token System

- **Operation Tokens**: 5-minute TTL for single operations
- **Session Tokens**: 60-minute TTL for multi-operation workflows
- Tokens stored as JSON in `.claude/tokens/` (project-local)

## Health Check

Run diagnostics to verify system health:

```javascript
{
  "name": "health_check",
  "arguments": {}
}
```

Returns:
- Database connectivity status
- Table integrity checks
- FTS5 index verification
- Record counts and statistics

## Testing

```bash
npm test
```

Expected output: `150/150 automated tests passing`

### Automated Test Coverage (150 tests)
- Tool Tests (55 tests) - All 25 tools functional
- Workflow Tests (10 tests) - End-to-end flows
- Compliance Tests (20 tests) - Token system enforced
- Configuration Tests (15 tests) - Presets & validation
- Integration Tests (10 tests) - Cross-category operations
- Enforcement Tests (10 tests) - Token validation & hooks
- Agent Workflows (5 tests) - Simulated scenarios
- Hook Execution (5 tests) - Real hook blocking
- Tool Guidance (10 tests) - Metadata validation
- NPX Tests (10 tests) - Deployment ready

### Research-Based Compliance Scenarios (50+ scenarios)
- Bug Fixes (10 scenarios) - Simple to complex debugging
- New Features (10 scenarios) - Single to multi-step implementations
- Refactoring (10 scenarios) - Code quality improvements
- Documentation (10 scenarios) - Knowledge capture
- Edge Cases (10 scenarios) - Vague and ambiguous requests

**Research Foundation**: Tests based on real-world agent failure studies:
- AgentErrorTaxonomy (arXiv:2509.25370)
- ChatDev 25% correctness study (arXiv:2503.13657)
- Multi-agent decomposition failures (Cognition.ai 2025)
- Tool hallucination research (arXiv:2510.22977, 2412.04141)
- Microsoft AI Agent Security whitepaper (April 2025)

## Documentation

- [Getting Started](docs/GETTING_STARTED.md) - Quick start guide
- [Tool Reference](docs/TOOL_REFERENCE.md) - Complete tool documentation
- [Configuration](docs/CONFIGURATION.md) - Presets and customization
- [Workflows](docs/WORKFLOWS.md) - Reasoning workflows
- [Troubleshooting](docs/TROUBLESHOOTING.md) - Common issues
- [Architecture](docs/ARCHITECTURE.md) - System design

## API Example

```javascript
// Record an experience
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "record_experience",
    "arguments": {
      "type": "effective",
      "domain": "Tools",
      "situation": "Need to search codebase",
      "approach": "Used Grep tool instead of bash",
      "outcome": "Faster with better formatting",
      "reasoning": "Specialized tools provide better UX"
    }
  }
}
```

## Requirements

- Node.js >= 14
- better-sqlite3 ^11.0.0

## License

MIT

## Version

1.0.0 - Production release with all 25 tools, 150 automated tests + 50+ research-based compliance scenarios, complete documentation, hooks framework, and research-founded design addressing real-world agent failures from 2024-2025 studies.
