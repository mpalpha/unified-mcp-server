# Changelog

All notable changes to unified-mcp-server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.3] - 2026-01-30

### Changed - Post-Installation Guidance
- **Critical**: Improved --init output with actionable next steps for agents
  - Added specific file paths for settings.json with platform detection
    - VSCode: `~/.config/claude-code/settings.json`
    - Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json`
  - Added commands to edit configuration files
    - VSCode command: `code "<path>"`
    - Text editor alternatives provided
  - Added detailed restart instructions by platform
    - VSCode: "Developer: Reload Window" command (Cmd+Shift+P / Ctrl+Shift+P)
    - Claude Desktop: Quit and relaunch application
    - CLI: Exit and restart terminal session
  - Added verification steps with expected output
    - Ask Claude: "List all available MCP tools"
    - Expected: 25 tools from unified-mcp-server
    - Verification command: Test informed_reasoning tool
  - Added workflow example showing TEACH → LEARN → REASON → ACT
    - record_experience → search_experiences → informed_reasoning → verify_protocol_compliance
  - Added troubleshooting links and documentation references
    - README.md for full documentation
    - GitHub issues for support
- Enhanced output formatting with clear step numbers and sections
  - STEP 1: Configure Claude Code MCP Settings
  - STEP 2: Restart Claude Code
  - STEP 3: Verify Installation
  - STEP 4: Start Using the System
  - TROUBLESHOOTING section with links
- Provided both manual and automated configuration methods
  - Automatic: `code "<path>"` command
  - Manual: Copy-paste JSON configuration

### Context
- User feedback: After successful installation, agent didn't receive clear guidance on:
  - How to update project configuration automatically
  - How to reload Claude Code
  - How to verify tools are working
  - How to use the system effectively
- Previous output showed generic instructions:
  - "Add this server to your Claude Code MCP settings"
  - "Restart Claude Code to apply changes"
  - No file paths, no commands, no verification steps
- Agents need executable instructions, not just descriptions
- User quote: "the installation doesn't tell the agent what to do next to automatically configure or update the existing project configuration, as well as steps to reload claude after configuration"
- User had to manually instruct agent to follow README after installation
- This update provides all necessary context directly in --init output

## [1.0.2] - 2026-01-30

### Added - User Feedback
- **System Requirements**: Comprehensive system requirements section in README
  - Operating systems (macOS, Linux, Windows)
  - Build tools for native modules (Xcode, build-essential, VS Build Tools)
  - Python requirement for node-gyp
  - Disk space and memory requirements
- **CLI Flag**: `--preset <name>` for non-interactive preset application
  - Allows direct preset application without wizard
  - Validates preset names with helpful error messages
  - Shows preset details after application
  - Four presets: three-gate, minimal, strict, custom

### Changed - User Feedback
- Updated --help output to include --preset flag with examples
- Reformatted USAGE section for better readability
- Added PRESETS section showing available options

## [1.0.1] - 2026-01-30

### Fixed - Native Module Compatibility
- **Critical**: Fixed better-sqlite3 native module compatibility issues across Node.js versions
  - Added bootstrap wrapper (`bootstrap.js`) with graceful error handling
  - Detects ERR_DLOPEN_FAILED and provides actionable error messages with solutions
  - Attempts automatic rebuild for non-npx installations
  - Postinstall script (`scripts/check-native-modules.js`) validates native modules
  - Added prebuild-install as optional dependency for better prebuilt binary support

### Changed - Installation
- Updated Node.js version requirement from `>=14.0.0` to `>=16.0.0`
  - Supports wider Node.js version range via build-from-source
  - Recommended versions: 18.x, 20.x, or 22.x (but any Node >=16 should work)
- Changed bin entry point from `index.js` to `bootstrap.js`
  - Provides better error messages for native module issues
  - Attempts auto-repair before failing
- Enhanced README with troubleshooting section
  - Node.js version requirements prominently displayed
  - Four installation methods documented (npx, global, build-from-source, local)
  - Clear error resolution steps
- Updated Node.js badge to show supported versions (18 | 20 | 22)

### Technical Details
- Addresses NODE_MODULE_VERSION mismatches (e.g., 127 vs 115)
- Handles npx cache limitations (no automatic rebuild)
- Provides installation path detection (npx, global, local)
- Non-blocking postinstall (won't fail package installation)

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
