# Changelog

All notable changes to the Unified MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-29

### Added

#### NPX Compatibility (Primary Feature)
- **Zero-installation deployment** via `npx gist:494c7c5acaad6a13ae5666244e6fbcd2`
- Shebang line (`#!/usr/bin/env node`) for direct execution
- Executable permissions configured
- Package.json bin field for NPX compatibility
- CLI argument parsing:
  - `--help` / `-h`: Display comprehensive usage information
  - `--version` / `-v`: Show version number
  - `--init`: Interactive setup wizard with configuration guidance
- Mode detection system:
  - CLI mode when flags are present
  - MCP protocol mode (JSON-RPC over stdio) by default
- NPX test suite with 10 comprehensive tests
- Zero-config initialization (automatic namespace creation)

#### Knowledge Management Tools (6 tools)
- `record_experience`: Store working patterns (effective/ineffective)
- `search_experiences`: FTS5 full-text search with BM25 ranking
- `get_experience`: Retrieve experiences by ID with full history
- `update_experience`: Create revisions while preserving history
- `tag_experience`: Add searchable tags for organization
- `export_experiences`: Export to JSON or Markdown formats

#### Reasoning Tools (4 tools)
- `analyze_problem`: Extract user intent and suggest queries
- `gather_context`: Multi-source context synthesis (20K token budget)
- `reason_through`: Sequential thought tracking with confidence scores
- `finalize_decision`: Close reasoning sessions and auto-record conclusions

#### Workflow Enforcement Tools (5 tools)
- `check_compliance`: Dry-run compliance verification
- `verify_compliance`: Create operation tokens (5min TTL)
- `authorize_operation`: Validate tokens and create session tokens (60min TTL)
- `get_workflow_status`: Session state introspection
- `reset_workflow`: Reset sessions and cleanup tokens

#### Configuration Tools (5 tools)
- `list_presets`: Discover available workflow presets
- `apply_preset`: Apply configuration presets (three-gate, minimal, strict, custom)
- `validate_config`: Validate configurations with detailed error messages
- `get_config`: Retrieve current configuration
- `export_config`: Share configurations as JSON/YAML

#### Automation & Introspection Tools (5 tools)
- `install_hooks`: Automated hook installation for Claude Code
- `uninstall_hooks`: Clean hook removal
- `get_session_state`: Complete session state inspection
- `health_check`: System health diagnostics (database, tokens, FTS5)
- `import_data`: Import experiences from JSON files

#### Core Infrastructure
- SQLite database with FTS5 full-text search
- BM25 ranking for search relevance
- Dice coefficient deduplication (90% threshold)
- Token-based authorization system
- Activity logging and audit trail
- Consolidated namespace (`~/.unified-mcp/`)
- DELETE journal mode for reliability

#### Documentation
- README.md (176 lines)
- GETTING_STARTED.md - Installation and first steps
- TOOL_REFERENCE.md - Complete catalog of all 25 tools
- CONFIGURATION.md - Presets and customization guide
- WORKFLOWS.md - Common patterns and examples
- TROUBLESHOOTING.md - FAQ and error fixes
- ARCHITECTURE.md - System internals and design

#### Testing
- Comprehensive test suite: 110/110 tests passing
  - 100 core tests (tools, workflows, integration)
  - 10 NPX compatibility tests
- 100% test coverage across all tools
- Automated test cleanup and isolation

### Changed
- Installation method: NPX is now primary (was: npm install + node)
- Documentation structure: NPX-first approach throughout
- Test count: Increased from 100 to 110 (added NPX tests)

### Technical Details
- **Version**: 1.0.0
- **Node.js**: >= 14.0.0
- **Dependencies**: better-sqlite3 ^11.0.0
- **License**: MIT
- **Database**: SQLite with FTS5
- **Protocol**: MCP JSON-RPC 2.0
- **Deployment**: GitHub Gist (gist:494c7c5acaad6a13ae5666244e6fbcd2)

### Performance
- Database operations: < 10ms per query
- FTS5 search: < 100ms for 1000+ experiences
- CLI response time: < 10ms for --help and --version
- First run initialization: < 100ms
- Subsequent runs: < 50ms

### Breaking Changes
None (initial release)

### Security
- No credentials stored in home directory
- Token-based authorization with expiration
- Consolidated namespace to prevent pollution
- Activity logging for audit trails

### Known Issues
None

---

## Release Notes

### v1.0.0 - "Zero to MCP in Seconds"

This is the initial public release of the Unified MCP Server, featuring a completely greenfield implementation that combines the best capabilities of memory-augmented reasoning and protocol enforcement into a single, well-designed server.

**Key Highlights:**
- 🚀 **Instant deployment**: Run via `npx` without installation
- 🛠️ **25 atomic tools**: Each tool does one thing well
- ✅ **100% tested**: All 110 tests passing
- 📚 **Complete docs**: 6 documentation files covering every aspect
- 🎯 **Zero-config**: Works immediately out of the box
- 🔍 **Smart search**: FTS5 with BM25 ranking
- 🔒 **Token authorization**: Secure workflow enforcement

**Getting Started:**
```bash
npx gist:494c7c5acaad6a13ae5666244e6fbcd2 --help
```

**Integration with Claude Code:**
```json
{
  "mcpServers": {
    "unified-mcp": {
      "command": "npx",
      "args": ["gist:494c7c5acaad6a13ae5666244e6fbcd2"]
    }
  }
}
```

---

[1.0.0]: https://gist.github.com/mpalpha/494c7c5acaad6a13ae5666244e6fbcd2
