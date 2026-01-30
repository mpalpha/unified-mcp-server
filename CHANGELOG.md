# Changelog

All notable changes to unified-mcp-server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-01-30

### Deployment
- **Published to GitHub:** https://github.com/mpalpha/unified-mcp-server
- **Installation:** `npx mpalpha/unified-mcp-server --init`
- **Repository:** Full directory structure preserved (scripts/, test/, docs/, hooks/)
- **Breaking Change:** Changed from gist deployment to GitHub repository
  - Old: `npx gist:494c7c5acaad6a13ae5666244e6fbcd2`
  - New: `npx mpalpha/unified-mcp-server`

### Added - Migration Tool
- Migration tool for importing experiences from old memory-augmented-reasoning.db format
  - Standalone CLI script (`scripts/migrate-experiences.js`)
  - Command-line flags: --source, --target, --dry-run, --skip-duplicates, --verbose
  - Automatic schema creation if missing
  - Duplicate detection using Dice coefficient (90% similarity threshold)
  - Two-pass migration with revision ID remapping
  - Transaction safety with automatic rollback
  - Read-only source database access (never modifies original)
- Migration wizard integration into --init setup
  - Auto-discovers old databases in common locations
  - Provides copy-paste migration commands
  - Links to comprehensive migration guide
- Synthetic test data generator (`test/fixtures/create-test-migration-db.js`)
- Migration test suite (`test/test-migration.js`) - 10/10 tests passing
- Migration user guide (`docs/MIGRATION_GUIDE.md`) - 400+ lines

### Changed - Migration
- --init wizard now includes migration prompt as third question
- test() function in test-migration.js properly handles async functions
- Total automated tests: 223 (was 200)
  - Core tests: 150
  - Migration tests: 10
  - Compliance tests: 50
  - Experience usage: 6
  - Edge scenarios: 7

### Fixed - Migration
- Migration script handles missing target database schema
- Test race conditions resolved in migration tests

### Added - Core Features
- Initial release of unified-mcp-server
- 25 tools for protocol-enforced learning
- 3 integration hooks (user_prompt_submit, pre_tool_use, stop)
- Interactive --init wizard with preset selection and migration prompt
- Automated hook installation/uninstallation
- Research-based compliance tests (50 scenarios)
- Complete test suite (223 total tests - 100% passing)
  - Core tests: 150
  - Compliance tests: 50
  - Migration tests: 10
  - Experience usage: 6
  - Edge scenarios: 7
- Comprehensive documentation (README, MIGRATION_GUIDE, IMPLEMENTATION_PLAN, CONTRIBUTING)

### Core Tools
**Research Workflow (5 tools):**
- informed_reasoning - Multi-phase reasoning with context
- search_experiences - Find related experiences
- record_experience - Save new experiences
- export_experiences - Export experience library
- check_protocol_compliance - Verify workflow compliance

**Protocol Enforcement (2 tools):**
- verify_protocol_compliance - Check mandatory steps
- authorize_file_operation - Token-based authorization

**Memory Management (5 tools):**
- create_memory_library - Create named libraries
- list_memory_libraries - List all libraries
- switch_memory_library - Switch context
- get_current_library_info - Current library status
- query_reasoning_memory - Search memory

**System Configuration (4 tools):**
- create_system_json - Store structured data
- get_system_json - Retrieve system data
- search_system_json - Search system data
- list_system_json - List all system data

**Protocol Configuration (4 tools):**
- initialize_protocol_config - Create config
- get_protocol_config - View current config
- get_compliance_status - Check compliance stats
- authorize_file_operation - Authorize operations

**Advanced Reasoning (1 tool):**
- advanced_reasoning - Enhanced reasoning with meta-cognition

### Hooks
- user_prompt_submit: Enforces research workflow before file operations
- pre_tool_use: Validates protocol compliance and operation tokens
- stop: Cleanup and state management

### CLI Features
- --help: Show usage information
- --version: Display version
- --init: Interactive setup wizard
- --health: System health check
- --validate: Validate hooks configuration

### Documentation
- README.md: Quick start and overview with migration section
- docs/MIGRATION_GUIDE.md: Complete migration user guide (400+ lines)
- docs/IMPLEMENTATION_PLAN.md: Complete development plan with Phase 10
- docs/CONTRIBUTING.md: Contribution guidelines
- docs/GETTING_STARTED.md: Installation and setup guide
- docs/ARCHITECTURE.md: System architecture
- docs/WORKFLOWS.md: Workflow documentation
- docs/TROUBLESHOOTING.md: Common issues and solutions

### Testing
- 223 total automated tests (100% passing)
  - 150 core tests (tool tests, workflow tests, enforcement tests)
  - 50 research-based compliance scenarios
  - 10 migration tests (with synthetic test data)
  - 6 experience usage tests
  - 7 edge scenario tests
- Zero test failures
- Comprehensive test coverage across all features

### Safety & Research Foundation
- Read-only source database access
- Transaction safety (rollback on errors)
- Based on agent failure research (AgentErrorTaxonomy, ChatDev, multi-agent studies)
- Addresses real-world benchmark failures (ALFWorld, WebShop, GAIA)
