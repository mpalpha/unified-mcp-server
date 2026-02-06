# Unified MCP Server

> Protocol-enforced learning system combining memory-augmented reasoning with workflow automation for AI assistants

[![Tests](https://img.shields.io/badge/tests-183%2F183%20passing-brightgreen)](test/)
[![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)](package.json)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## Overview

Unified MCP Server is a Model Context Protocol server that enforces research-based workflows to improve AI assistant reliability. Based on recent agent failure research (AgentErrorTaxonomy, ChatDev studies), it ensures AI assistants learn from experience before making changes to code.

**Key Features:**
- 🧠 **Memory-augmented reasoning**: Search and learn from past experiences
- 🔒 **Protocol enforcement**: Hooks prevent file operations without learning
- 📚 **Knowledge libraries**: Organize experiences by project/domain
- 🔄 **Experience migration**: Import from old database formats
- ✅ **182 automated tests**: 100% test coverage

## Quick Start

### System Requirements

**Runtime:**
- **Node.js**: >=16.0.0 (check with `node --version`)
  - Recommended: 18.x, 20.x, or 22.x
  - Other versions work with `--build-from-source` flag
- **npm**: 8.x or higher
- **Disk Space**: ~50 MB for installation
- **Memory**: 100 MB minimum

**Operating Systems:**
- ✅ macOS (Intel & Apple Silicon)
- ✅ Linux (x64, arm64)
- ✅ Windows 10/11 (x64)

**Build Tools** (for native modules):
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Linux**: `build-essential` package (`sudo apt-get install build-essential`)
- **Windows**: Visual Studio Build Tools or `windows-build-tools`
- **All platforms**: Python 3.x (for node-gyp)

### Installation

```bash
# Via NPX (recommended)
npx mpalpha/unified-mcp-server --init

# Or clone and install
git clone https://github.com/mpalpha/unified-mcp-server.git
cd unified-mcp-server
npm install
node index.js --init
```

**Note**: If you encounter native module errors, use `--build-from-source` flag or see [Troubleshooting](#troubleshooting) below.

### Setup Wizard

The `--init` wizard guides you through:
1. Database initialization
2. Hook installation (optional)
3. Preset selection (strict/balanced/advisory)

```bash
npx unified-mcp-server --init
```

### Configuration

**v1.5.2+: Auto-configured!** The MCP server automatically configures `~/.claude/settings.json` on every run. No manual setup needed.

If you need to manually configure (e.g., custom args), add to your MCP settings:

```json
{
  "mcpServers": {
    "unified-mcp": {
      "command": "npx",
      "args": ["unified-mcp-server"]
    }
  }
}
```

After any manual changes, restart Claude Code for settings to take effect.

## v1.4.0: Project-Scoped Experiences

**Breaking Change**: v1.4.0 moves all data storage from global `~/.unified-mcp/` to project-local `.claude/` directories.

### Key Changes
- All experiences are now stored in `{project}/.claude/experiences.db`
- No global storage - each project has its own isolated database
- Use `export_experiences` and `import_experiences` for cross-project sharing
- Old `~/.unified-mcp/` directory is no longer used (see migration below)

### Benefits
- **Portability**: `.claude/` folder travels with your project
- **Isolation**: Zero cross-project pollution
- **Clarity**: One location to understand and manage

### Migration from v1.3.x

v1.4.0 is a clean slate. To preserve old experiences:

```bash
# 1. Export from old global database (while running v1.3.x)
# Use export_experiences tool to create a JSON file

# 2. Upgrade to v1.4.0
npm install unified-mcp-server@latest

# 3. Initialize in your project
npx unified-mcp-server --init

# 4. Import old experiences
# Use import_experiences({ filename: "exported-experiences.json" })
```

The `--init` wizard will detect old `~/.unified-mcp/` data and suggest removal.

## Tools

### Research Workflow (6 tools)

**Primary workflow** - Use before making code changes:

1. **`informed_reasoning`** - Multi-phase reasoning with context
2. **`search_experiences`** - Find related past experiences
3. **`record_experience`** - Save new learnings
4. **`export_experiences`** - Export experience library
5. **`import_experiences`** - Import experiences from another project (v1.4.0)
6. **`check_protocol_compliance`** - Verify workflow completion

### Protocol Enforcement (2 tools)

Hooks use these to validate workflows:

- **`verify_protocol_compliance`** - Check mandatory steps completed
- **`authorize_file_operation`** - Issue operation tokens

### Memory Management (5 tools)

Organize knowledge by project/context:

- **`create_memory_library`** - Create named libraries
- **`list_memory_libraries`** - List all libraries
- **`switch_memory_library`** - Change context
- **`get_current_library_info`** - Current library status
- **`query_reasoning_memory`** - Search memory graph

### Advanced Reasoning (1 tool)

- **`advanced_reasoning`** - Enhanced reasoning with meta-cognition and hypothesis testing

### System Configuration (8 tools)

Store structured data and configure protocols:

- `create_system_json`, `get_system_json`, `search_system_json`, `list_system_json`
- `initialize_protocol_config`, `get_protocol_config`, `get_compliance_status`

### Project Context (2 tools)

Customize workflow reminders with project-specific context:

- **`update_project_context`** - Store project context as JSON data (summary, highlights, reminders)
- **`get_project_context`** - Retrieve current project context configuration

**Total: 28 tools** (v1.4.0 adds `import_experiences`)

## Hooks

### Available Hooks

The system provides 3 integration points:

1. **`user_prompt_submit`** - Runs when user submits a prompt
   - Enforces research workflow for file operations
   - Cites research on agent failure modes

2. **`pre_tool_use`** - Runs before each tool call
   - Validates protocol compliance tokens
   - Blocks Write/Edit without authorization

3. **`stop`** - Runs when session ends
   - Cleanup and state management

### Hook Presets

Choose enforcement level during setup:

- **Strict** - Blocks all file operations without research
- **Balanced** - Blocks Write/Edit, warns on others
- **Advisory** - Warnings only, no blocking

### Installation

```bash
# Via --init wizard (recommended)
npx unified-mcp-server --init

# Manual installation
node index.js --install-hooks

# Uninstall
node index.js --uninstall-hooks
```

**See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for hook file organization.**

## Research Foundation

Based on 2024-2025 agent failure research:

- **AgentErrorTaxonomy** (arXiv:2509.25370) - 5 failure categories
- **ChatDev Analysis** (arXiv:2503.13657) - 25% correctness baseline
- **Multi-Agent Fragility** (Cognition.ai) - Decomposition failures
- **ALFWorld/WebShop/GAIA** - Real-world benchmark failures

Our enforcement approach addresses:
- Action failures (blocked Write/Edit without research)
- Memory failures (accumulated knowledge base)
- Reasoning failures (informed_reasoning workflow)
- Tool hallucination (validated tool descriptions)

## Testing

### Run All Tests

```bash
npm test
# Expected: 183/183 tests passing
```

### Test Suites

```bash
npm run test:tools           # 55 tool tests
npm run test:workflows       # 18 workflow tests
npm run test:compliance      # 10 compliance tests
npm run test:config          # 8 config tests
npm run test:integration     # 22 integration tests
npm run test:enforcement     # 10 enforcement tests
npm run test:agent-workflows # 7 agent workflow tests
npm run test:hook-execution  # 5 hook execution tests
npm run test:tool-guidance   # 4 tool guidance tests
npm run test:npx             # 1 npx test
```

### Additional Tests

```bash
# Research-based compliance scenarios (50 tests)
node test/test-agent-compliance.js

# Experience usage scenarios (6 tests)
node test/test-experience-usage.js

# Edge scenarios (7 tests)
node test/test-edge-scenarios.js

# Migration tests (10 tests)
node test/test-migration.js
```

**Total: 182 automated tests** ✅

## CLI Commands

```bash
# Show help
npx unified-mcp-server --help

# Show version
npx unified-mcp-server --version

# Interactive setup wizard
npx unified-mcp-server --init

# Apply preset (non-interactive)
npx unified-mcp-server --preset three-gate
npx unified-mcp-server --preset minimal
npx unified-mcp-server --preset strict
npx unified-mcp-server --preset custom

# Health check
npx unified-mcp-server --health

# Validate hooks configuration
npx unified-mcp-server --validate
```

### Available Presets

- **three-gate** (Recommended): Standard TEACH → LEARN → REASON workflow
- **minimal**: Lightweight with optional gates
- **strict**: Strict enforcement with all validations
- **custom**: Template for custom workflows

## Documentation

- **[MIGRATION_GUIDE.md](docs/MIGRATION_GUIDE.md)** - Migrate old databases
- **[IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)** - Development roadmap
- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** - System design and hook files
- **[TOOL_REFERENCE.md](docs/TOOL_REFERENCE.md)** - Tool documentation
- **[CHANGELOG.md](CHANGELOG.md)** - Release history

## Architecture

```
unified-mcp-server/
├── index.js                 # Main MCP server (2000+ lines)
├── scripts/
│   └── migrate-experiences.js  # Migration tool
├── test/
│   ├── test-tools.js        # Tool tests (55)
│   ├── test-workflows.js    # Workflow tests (18)
│   ├── test-compliance.js   # Compliance tests (10)
│   ├── test-migration.js    # Migration tests (10)
│   └── ...                  # Additional test suites
├── test/fixtures/
│   └── create-test-migration-db.js  # Test data generator
└── docs/
    ├── MIGRATION_GUIDE.md   # User migration guide
    └── IMPLEMENTATION_PLAN.md  # Development plan
```

## Configuration

### Database Location (v1.4.0+)

**Project-local**: `{project}/.claude/experiences.db`

All data is stored per-project in the `.claude/` directory:
```
your-project/
├── .claude/
│   ├── experiences.db       # Project experiences
│   ├── config.json          # Preset configuration
│   ├── project-context.json # Custom context
│   └── tokens/              # Session tokens
```

### Hook Files

Hooks are installed globally to `~/.claude/hooks/` (v1.5.0+):
- `user-prompt-submit.cjs` - Workflow guidance + universal search prompt
- `pre-tool-use.cjs` - Token validation (only for initialized projects)
- `post-tool-use.cjs` - Universal record prompt
- `stop.cjs` - Session cleanup + record reminder
- `session-start.cjs` - CHORES display

**Note:** Hooks are immutable infrastructure. Customize behavior via `update_project_context()`.

### Claude Code Settings

Hooks automatically update: `~/.claude/settings.json`

## Development

### Requirements

- Node.js >= 14.0.0
- npm or yarn
- better-sqlite3 (native module)

### Build & Test

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run specific test suite
npm run test:tools

# Test migration
node test/test-migration.js

# Lint/format (if configured)
npm run lint
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new features
4. Ensure all tests pass (`npm test`)
5. Update documentation
6. Submit a pull request

## Troubleshooting

### Installation / Native Module Issues

**Problem**: Error like "was compiled against a different Node.js version"

This occurs when `better-sqlite3` (native module) was compiled for a different Node.js version than you're currently using. This commonly happens when using `npx` after switching Node versions via nvm/fnm.

**Automatic Fallback (v1.7.2+)**:
Starting with v1.7.2, the server automatically falls back to a WebAssembly-based SQLite (`node-sqlite3-wasm`) when the native module fails to load. This means **most users won't encounter this error anymore** - the server will use WASM mode transparently.

If you see `[bootstrap] Using WASM SQLite backend (slower but compatible)` in stderr, the fallback is working. WASM mode is slightly slower but fully compatible with all features including FTS5 full-text search.

**Manual Solutions** (if automatic fallback fails):

#### Option 1: Build from Source (Recommended - Best Performance)
```bash
# This rebuilds better-sqlite3 for your specific Node version
npm install -g mpalpha/unified-mcp-server --build-from-source
unified-mcp-server --init
```

#### Option 2: Global Install with Rebuild
```bash
# Install globally
npm install -g mpalpha/unified-mcp-server

# Rebuild native module for your Node version
npm rebuild -g better-sqlite3

# Run
unified-mcp-server --init
```

#### Option 3: Local Install (Best for Existing Projects)
```bash
# Keeps your project's Node version unchanged
git clone https://github.com/mpalpha/unified-mcp-server.git
cd unified-mcp-server
npm install  # Automatically rebuilds for your Node version
node index.js --init
```

#### Option 4: Clear npx Cache (For npx Users)
```bash
# Clear the npx cache to force re-download
rm -rf ~/.npm/_npx/
npx mpalpha/unified-mcp-server --init
```

**Required Node Versions**: 18.x or higher (WASM requires Node 18+)

**Check Your Node Version**:
```bash
node --version
```

### Migration Issues

See [docs/MIGRATION_GUIDE.md](docs/MIGRATION_GUIDE.md#troubleshooting)

### Hook Installation Issues

```bash
# Check hook status
npx unified-mcp-server --validate

# Reinstall hooks
npx unified-mcp-server --init
# Select "Install hooks"

# Manual uninstall + reinstall
node index.js --uninstall-hooks
node index.js --install-hooks
```

### Database Issues

```bash
# v1.4.0+: Database is in project's .claude/ directory
# Check database exists
ls -lh .claude/experiences.db

# Verify schema
sqlite3 .claude/experiences.db ".schema experiences"

# Check experience count
sqlite3 .claude/experiences.db "SELECT COUNT(*) FROM experiences"
```

### Test Failures

```bash
# Clean test databases
rm -f test/fixtures/*.db

# Regenerate test data
node test/fixtures/create-test-migration-db.js

# Run tests again
npm test
```

## License

MIT © Jason Lusk

## Support

- Issues: https://github.com/mpalpha/unified-mcp-server/issues
- Documentation: [docs/](docs/)
- Migration Guide: [docs/MIGRATION_GUIDE.md](docs/MIGRATION_GUIDE.md)

## Acknowledgments

Built on research from:
- AgentErrorTaxonomy (arXiv:2509.25370)
- ChatDev Analysis (arXiv:2503.13657)
- Multi-Agent Systems Research (Cognition.ai)
- ALFWorld, WebShop, GAIA benchmarks

---

**Ready to enforce research-based workflows?**

```bash
npx mpalpha/unified-mcp-server --init
```
