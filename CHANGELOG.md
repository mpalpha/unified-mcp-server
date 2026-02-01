# Changelog

All notable changes to unified-mcp-server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.4.0] - 2026-02-01

### Changed - Project-Scoped Experiences (Major Architecture Change)
- **Breaking**: All data storage moved from global `~/.unified-mcp/` to project-local `.claude/` directory
- **Rationale**: Project-specific experiences prevent cross-project pollution and align with Claude Code's project-centric model
- **Database**: Renamed from `data.db` to `experiences.db` in `.claude/` directory
- **Schema**: Removed `scope` field from experiences table (all experiences are project-scoped by location)
- **Schema**: Added `schema_info` table for version tracking
- **Clean Slate**: Old `~/.unified-mcp/` directory is no longer used; users prompted to delete it

### Added - New Tool: import_experiences
- **Purpose**: Import experiences from JSON file exported from another project
- **Use Case**: Share learnings across projects by exporting from one and importing to another
- **Parameters**: `filename` (required), `filter` (optional: domain, type)
- **Behavior**: Assigns new IDs on import (doesn't preserve original IDs)

### Changed - Tool Updates
- Removed `scope` parameter from `record_experience` and `search_experiences` tools
- Updated `export_experiences` to not include scope in output

### Changed - Hook Updates
- Updated 4 hook files to use project-local `.claude/` paths instead of `~/.unified-mcp/`:
  - `user-prompt-submit.cjs` - config path
  - `pre-tool-use.cjs` - token path
  - `stop.cjs` - token path
  - `session-start.cjs` - prompts path

### Added - Project Context Detection
- New `ensureProjectContext()` function validates project environment
- Recognizes projects by: `.claude/`, `.git/`, or `package.json`
- Auto-creates `.claude/` directory structure in valid projects
- Provides clear error message with options if not in a project

### Changed - Test Infrastructure
- Added project-scoped test helpers in `test-utils.js`:
  - `createTestProject()` - creates isolated test directory with `.claude/` structure
  - `cleanupTestProject()` - removes test directory
  - `getTestClaudeDir()` - gets `.claude/` path for test project
  - `getTestDbPath()` - gets database path for test project
- Updated all 15+ test files to use isolated test projects
- Updated `callMCP()` to accept `cwd` option for project context

### Changed - --init Wizard Updates
- Now shows `.claude/ (project-local)` as namespace
- Detects and alerts users about old `~/.unified-mcp/` directory
- Updated prompt file deletion instructions

## [1.3.0] - 2026-01-31

### Added - Checklist Enforcement Feature
- **New Fields**: `preImplementation` and `postImplementation` arrays in project context
- **Purpose**: Store development checklists discovered from project rules (CONTRIBUTING.md, .cursor/rules/*, etc.)
- **Validation**:
  - Maximum 10 items per array
  - Maximum 200 characters per item
  - Both fields optional (backward compatible)
- **Hook Integration**:
  - `user-prompt-submit.cjs`: Displays `preImplementation` items when planning code changes
  - `post-tool-use.cjs`: Displays `postImplementation` items after file modifications (Write/Edit/NotebookEdit)
- **Data-Driven**: Hooks only display if arrays exist and have items (no hardcoded defaults)
- **Files Modified**:
  - `index.js` - `updateProjectContext` validation, `getProjectContext` return fields, tool inputSchema
  - `hooks/user-prompt-submit.cjs` - preImplementation display
  - `hooks/post-tool-use.cjs` - postImplementation display with project context reading
  - `test/test-project-context.js` - 4 new tests (14 total)

## [1.2.9] - 2026-01-31

### Changed - Configuration: Align with Claude Code standard paths
- **Research**: Claude Code uses hierarchical settings (user → project shared → project local)
- **Settings Search Order**: Now prioritizes `~/.claude/settings.json` over `.config/claude`
- **Project Context**: Moved from `~/.unified-mcp/project-contexts/{hash}.json` to `.claude/project-context.json` in project root
- **Benefits**:
  - Project context is now visible, editable, version-controllable
  - Aligns with Claude Code's standard `.claude/` directory structure
  - No more hash-based lookups
- **Files Modified**:
  - `index.js` - settings paths, project context tools
  - `hooks/user-prompt-submit.cjs` - read project context from new location
  - `src/tools/automation.js` - settings search order
  - `README.md`, `docs/GETTING_STARTED.md` - documentation
  - Test files updated accordingly

### Fixed - --init wizard: Incorrect settings.json path
- **Issue**: --init told users to edit `~/.config/claude-code/settings.json`
- **Actual Path**: Claude Code reads from `~/.claude/settings.json`
- **Fix**: Updated path to `~/.claude/settings.json`

## [1.2.8] - 2026-01-31

### Changed - CHORES Framework: Strengthened with actionable guidance
- **Issue**: Agents were relying on prior knowledge instead of fresh analysis
- **Research**: Grounding techniques, verification checks, self-questioning (arXiv, CloudBabble, Moveworks)
- **Solution**: Made all CHORES items actionable with explicit tool usage and verification
- **Key Changes**:
  - CONSTRAINTS: Intelligent discovery of project rules (not hardcoded patterns)
  - HALLUCINATION: Verify facts via tools, cite output, no prior knowledge reliance
  - OVERREACH: Understand scope, ask before expanding
  - REASONING: Explain why with evidence, state confidence
  - ETHICS: Security review appropriate to project type
  - SYCOPHANCY: Evaluate assumptions critically, disagree with evidence
- **Enforcement**: All hooks now require stating which items apply and how addressed
- **Files Modified**: `hooks/session-start.cjs`, `hooks/user-prompt-submit.cjs`, `hooks/pre-tool-use.cjs`

## [1.2.7] - 2026-01-31

### Fixed - Post-install prompt: Agent-controlled deletion instead of auto-delete
- **Issue**: Post-install prompt file was auto-deleted by hook, but content sometimes not shown
- **Root Cause**: Hook deleted file immediately after reading, before confirming output was displayed
- **Solution**:
  - Hook no longer auto-deletes the prompt file
  - Prompt content includes deletion instructions with actual file path
  - Agent/user deletes file after completing customization
  - If prompt not processed, it re-triggers on next session
- **Benefits**:
  - Resilient to output truncation
  - Explicit confirmation of processing
  - Works for both agent-driven and user-driven installs
- **Files Modified**:
  - `hooks/session-start.cjs` (remove auto-delete)
  - `index.js` (add deletion instructions to prompt content)

### Changed - Cascading Updates: Improved testing approach
- **Issue**: Full test suite ran for every small change (inefficient)
- **Solution**: Change-aware testing during development, full suite before push
- **New Flow**: Doc FIRST → Implement → Targeted tests → Version → Commit → [repeat] → Full suite → Push
- **File Modified**: `docs/IMPLEMENTATION_PLAN.md`

## [1.2.6] - 2026-01-31

### Fixed - --init STEP 4: Correct Post-Install Prompt File Path in Message
- **Issue**: STEP 4 message showed incorrect path `.mcp-post-install-prompt.md`
- **Actual Path**: `~/.unified-mcp/post-install-prompts/{projectHash}.md`
- **Root Cause**: Path changed in commit d594776 but user-facing message wasn't updated
- **Fix**: Updated message to show correct path with actual project hash
- **File Modified**: `index.js` (line 2832)

## [1.2.5] - 2026-01-31

### Fixed - --init Example: Added SessionStart Hook to Example Output
- **Issue**: --init wizard example only showed UserPromptSubmit and PreToolUse hooks
- **Missing**: SessionStart hook (which displays full CHORES checklist) was not in example
- **Impact**: Users following --init instructions wouldn't configure SessionStart hook
- **Fix**: Added SessionStart hook to the example hooks configuration in --init wizard
- **File Modified**: `index.js` (lines 2757-2763)

## [1.2.4] - 2026-01-31

### Fixed - Hook Settings Format: Use Correct Nested Array Structure
- **Issue**: Claude Code rejected simple hook format with "Expected array, but received object"
- **Root Cause**: `install_hooks` wrote `{ command: "..." }` but Claude Code expects nested array structure
- **Correct Format**:
  ```json
  "HookName": [{ "hooks": [{ "type": "command", "command": "/path/to/hook.cjs" }] }]
  ```
- **Fix**: Updated `install_hooks` function to generate correct nested structure
- **File Modified**: `index.js` (lines 1970-1972)

## [1.2.3] - 2026-01-31

### Added - CHORES Behavioral Compliance Framework
- **Feature**: Added Anti-CHORES protocol reminders to prevent common AI behavioral quirks
- **Problem**: Agents were taking shortcuts (e.g., relying on prior knowledge instead of fresh analysis)
- **Solution**: Three-layer verification system with CHORES checklist
- **CHORES Categories**:
  - **C**onstraints: Following all stated rules/limitations?
  - **H**allucination: Facts verified, not assumed?
  - **O**verreach: Only what was asked, no extras?
  - **R**easoning: Logic shown with evidence?
  - **E**thics: Security/safety checked?
  - **S**ycophancy: Accurate, not just agreeable?
- **Implementation**:
  - `SessionStart`: Full CHORES checklist (establishes rules)
  - `UserPromptSubmit`: "Apply CHORES before responding" (reference back)
  - `PreToolUse`: "Verify CHORES before tool use" (reference back)
- **Files Modified**: `hooks/session-start.cjs`, `hooks/user-prompt-submit.cjs`, `hooks/pre-tool-use.cjs`
- **Research**: Based on Anti-CHORES Protocol (behavioral quirks directives for AI models)

## [1.2.2] - 2026-01-31

### Fixed - Hook Event Names: Changed from snake_case to PascalCase
- **CRITICAL**: Hooks were never being called - Claude Code didn't recognize snake_case event names
- **Root Cause**: `availableHooks` object used snake_case (e.g., `user_prompt_submit`) but Claude Code expects PascalCase (e.g., `UserPromptSubmit`)
- **Impact**: All hooks (user_prompt_submit, pre_tool_use, post_tool_use, session_start, stop) were silently ignored
- **Fix**: Changed all hook event names to PascalCase in:
  - `availableHooks` object (line 1877-1883)
  - Example output in --init wizard (lines 2749-2754)
- **Files Modified**: `index.js`
- **User Action Required**: Users must reinstall hooks or manually update their `~/.claude/settings.json` to use PascalCase event names

## [1.2.1] - 2026-01-31

### Fixed - Hook Output Format: Removed Incorrect Prompt Re-output
- **Issue**: `user-prompt-submit.cjs` hook output wasn't being shown to Claude agent
- **Root Cause**: Hook incorrectly re-output the original prompt after guidance text
- **Documentation**: Claude Code hooks can only ADD context, not modify/re-output the original prompt
- **Wrong Code** (lines 140-141):
  ```javascript
  console.log('---\n');
  console.log(data.userPrompt || data.prompt || '');  // ❌ Should not output prompt
  ```
- **Fix**: Removed lines 140-141; hook now only outputs guidance context
- **Impact**: Hook guidance now correctly appears in Claude's context
- **File Modified**: `hooks/user-prompt-submit.cjs`

### Fixed - update_project_context: Undefined Constant
- **CRITICAL**: Fixed `update_project_context` and `get_project_context` tools failing with "UNIFIED_MCP_DIR is not defined"
- **Error**: `ReferenceError: UNIFIED_MCP_DIR is not defined`
- **Root Cause**: Used wrong constant name `UNIFIED_MCP_DIR` instead of `MCP_DIR`
- **Fix**: Changed to `MCP_DIR` (lines 2303, 2344)
- **Impact**: Option B in post-install prompt now works (add project context to hooks)
- **Files Modified**: `index.js` lines 2303, 2344

### Fixed - Installation Crash: Missing crypto Import
- **CRITICAL**: Fixed crash at end of `--init` when writing post-install prompt
- **Error**: `crypto.createHash is not a function`
- **Root Cause**: Missing `const crypto = require('crypto');` import at top of index.js
- **Fix**: Added crypto import to index.js line 21
- **Impact**: Installation now completes without errors at prompt file creation step
- **File Modified**: `index.js` line 21

### Fixed - Installation Crash: setupState.cwd Undefined
- **CRITICAL**: Fixed crash during `--init` that broke installation
- **Error**: `TypeError: The "path" argument must be of type string. Received undefined`
- **Root Cause**: Used `setupState.cwd` which doesn't exist (setupState only has preset, installHooks, hooksInstalled)
- **Fix**: Changed to `process.cwd()` directly (consistent with rest of codebase)
- **Impact**: Installation now completes successfully
- **File Modified**: `index.js` line 2775

### Changed - Installation Flow: Automatic Prompt Injection
- **CRITICAL**: Post-install prompts now automatically injected via hook after restart
- **Issue**: Agents saw customization prompts during installation but couldn't execute them
- **Root Cause**: Prompts displayed as console output before restart; lost after restart when tools become available
- **User Feedback**: "this prompt wasn't actually passed to the user when the agent ran the init steps, the agent saw it and then did nothing"
- **Solution**: Persistent prompt file + hook auto-injection mechanism
- **Implementation**:
  1. During installation: Write `~/.unified-mcp/post-install-prompts/{project-hash}.md`
  2. STEP 3: Agent instructed to tell user to restart ("⚠️ AGENT: Instruct user to restart Claude Code now")
  3. After restart: `session-start.cjs` hook detects prompt file, reads and injects content
  4. Agent receives prompt automatically (tools now available)
  5. Hook deletes file after injection (self-cleaning)
- **Files Modified**:
  - `index.js`: Write prompt file during installation, update STEP 3/4 guidance
  - `hooks/session-start.cjs`: Add prompt file detection, injection, and cleanup logic
- **Benefits**:
  - No reliance on agent memory across restart
  - Prompts aren't lost console output
  - Automatic via hook mechanism
  - Self-cleaning (file deleted after use)
  - No permission prompts (uses existing ~/.unified-mcp namespace)
  - Project-specific via hash (supports multiple projects)
- **Impact**: Agents now automatically receive and execute post-install customization prompts

### Added - Version Synchronization Validation
- **New Test**: `test/test-version-sync.js` - Automated version synchronization validation
  - Validates package.json version matches index.js VERSION constant
  - Validates version format is valid semver (X.Y.Z)
  - Validates CHANGELOG.md has entry for current version
  - Prevents deployment bugs where versions don't match
  - Added to npm test suite (runs first, before all other tests)
- **New Documentation**: "Version Release Checklist" section in IMPLEMENTATION_PLAN.md
  - Comprehensive checklist for version releases
  - Pre-release validation steps
  - Automated validation commands
  - Prevention strategies for version mismatch bugs
  - Documents the v1.2.0 VERSION constant bug that motivated this addition

### Added - Project Context Tool Tests
- **New Test Suite**: `test/test-project-context.js` - Comprehensive tests for project context tools
  - **Coverage**: 10 tests covering update_project_context and get_project_context tools
  - **Test Cases**:
    - Create new context, disabled context, update existing context
    - Field validations: enabled (required), summary (max 200 chars), highlights (max 5), reminders (max 3)
    - Retrieve existing context, handle non-existent context
    - Verify file location: ~/.unified-mcp/project-contexts/{hash}.json
    - All tests use MCP protocol via callMCP() and parseJSONRPC()
  - **Bugs Found and Fixed During Testing**:
    - Added missing validation: `enabled` field is now required
    - Fixed test framework stats display (testsPassed vs passed)
    - Fixed test field name mismatches (context_file vs context_path)
    - Fixed test expectations (flat response vs nested context object)
  - **Status**: All 10 tests passing ✅
  - **Integration**: Added to package.json test suite as `npm run test:project-context`
  - **End-to-End Verification**: Completed manual testing of Option B workflow
    - update_project_context creates context file successfully
    - user-prompt-submit.cjs hook reads and displays context
    - Format displays correctly: summary, highlights (•), reminders (⚠️)
    - Type validation working, graceful fallback for malformed data
- **Motivation**: Bug fix (UNIFIED_MCP_DIR) lacked test coverage, causing repeated issues
- **Impact**: Prevents regressions in project context functionality

### Fixed - Version Constant Mismatch
- **CRITICAL**: Fixed VERSION constant in index.js (was '1.1.0', should be '1.2.0')
- **Impact**: Users running `npx mpalpha/unified-mcp-server --version` were seeing 1.1.0 instead of 1.2.0
- **Root Cause**: Updated package.json but forgot to update VERSION constant in index.js
- **Prevention**: Added automated test to catch this before future deployments
- **Total Tests**: 238 (was 228) - includes 10 new version sync tests

## [1.2.0] - 2026-01-30

### Changed - Safety-First Redesign
- **BREAKING**: Post-reload customization now uses data-driven architecture instead of code generation
- **CRITICAL**: Fixed all safety issues found in v1.1.0 real testing:
  - Deadlock rate: 5.00% → 0.00% ✅
  - Fallback success: 50.0% → 100% ✅
  - Recovery success: 50.0% → 100% ✅

### Added - Project Context Tools
- **New Tool 26**: `update_project_context` - Store project-specific context as JSON data
  - Accepts: enabled (boolean), summary (string, max 200 chars), highlights (array, max 5 items), reminders (array, max 3 items)
  - Validates all input data with schema enforcement
  - Stores data in `~/.unified-mcp/project-contexts/{project-hash}.json`
- **New Tool 27**: `get_project_context` - Retrieve current project context configuration
  - Returns context data, status, and file location
- Total tools: 25 → 27

### Changed - Hook Architecture
- Updated `hooks/user-prompt-submit.cjs` to read project context from JSON files
- Added type validation for all context data (highlights, reminders must be arrays)
- Graceful fallback: malformed/missing context silently skipped
- No code execution: hooks only read and display validated JSON data

### Changed - Installation Flow
- Updated STEP 4 "Customize Project Context" prompt in `--init` wizard
- New approach: Agent proposes OPTIONS (A, B, C) with benefits, user approves
- Shows example usage of `update_project_context` tool
- Emphasizes safety: "Data-driven approach (no code generation)"

### Testing - Comprehensive Safety Validation
- Created `test/test-post-reload-safe.js` framework (20 scenarios)
- Test coverage:
  - Baseline (no context)
  - Valid contexts (simple, complex, max lengths, disabled)
  - Invalid data (too long, too many items)
  - Malformed data (not JSON, wrong types, missing fields)
  - Filesystem issues (missing files, corrupted JSON, empty files)
- Results: 20/20 tests passed, 0.00% deadlock rate, 100% fallback success
- Real-world testing replaces simulated framework from v1.1.0

### Testing - Protocol Enforcement Verification
- Created `test/test-protocol-with-context.js` (5 scenarios)
- **Critical**: Verified project context does NOT interfere with workflow enforcement
- Test coverage:
  - Hook blocks without token (no context) ✅
  - Hook blocks without token (with context) ✅
  - Hook allows with valid token (with context) ✅
  - Hook handles malformed context gracefully ✅
  - Hook respects disabled context ✅
- Results: 5/5 tests passed
- Confirms: TEACH → LEARN → REASON workflow enforcement remains intact
- Total test suite: 228 tests (was 223)

### Context - Why This Change
- v1.1.0 approach (custom hook code generation) tested with 100 real sub-agent scenarios
- Found critical safety issues:
  - 5% deadlock rate from infinite loops in generated hooks
  - 50% fallback failure from syntax errors
  - 50% recovery failure from bypass issues
- ZERO-TOLERANCE policy required complete redesign
- New data-driven approach eliminates all code execution risks

### Safety Guarantee
- **No code generation**: Only JSON data storage
- **No code execution**: Hooks read data, don't execute it
- **Validated input**: Schema enforcement on all data
- **Graceful fallback**: Malformed data silently skipped
- **Type safety**: Runtime type checking for all arrays/strings
- **Fast**: Average 69ms per operation

## [1.1.0] - 2026-01-30 [DEPRECATED - SAFETY ISSUES]

### Deprecation Notice
- **v1.1.0 DEPRECATED due to critical safety issues found in real testing**
- DO NOT USE v1.1.0 in production
- Upgrade to v1.2.0 immediately if you installed v1.1.0

### Added - Post-Reload Customization Proposal Step
- **New Feature**: Added STEP 4 to --init output for proposing configuration customizations
  - Displays between restart step and verification step
  - Provides copy-paste prompt for agent to execute after reload
  - **Agent proposes customization OPTIONS with benefits** (not directive steps)
  - Prompt structure:
    ```
    1. Review project analysis from installation
       - File counts, directory structure
       - .cursorrules, CONTRIBUTING.md, special files
       - Patterns, project type, complexity

    2. Propose customization options with benefits:
       - Record analysis to database?
         Benefits: searchable, persistent, reusable across sessions
       - Customize hooks with project context?
         Benefits: relevant reminders, project-specific guidance
       - Search for similar projects?
         Benefits: learn from patterns in comparable codebases

    3. Explain benefits and wait for approval before proceeding
    ```
  - **User approval required**: Agent explains benefits, user decides
  - Enables informed decisions about customization
  - Project-specific knowledge persisted only with consent
  - Note: "Generic hooks remain active. Customization supplements them."

### Changed - Installation Flow
- Updated step numbering to accommodate new customization step:
  - STEP 1: Configure MCP Settings (unchanged)
  - STEP 2: Configure Hooks if installed (unchanged)
  - STEP 3: Restart Claude/IDE (unchanged)
  - STEP 4: Customize Based on Analysis (NEW!)
  - STEP 5: Verify Installation (was STEP 4)
  - STEP 6: Start Using System (was STEP 5)
- All step references updated dynamically based on hook installation

### Context
- Addresses feedback: "agent didn't actually customize hooks to the project"
- Addresses feedback: "analysis should include .cursor/ and .cursorrules"
- Previous: Analysis performed but not persisted, generic hooks installed
- Now: Agent uses tools to persist analysis and customize configuration
- Flow enables dogfooding (system uses itself to configure itself)
- Customization happens post-reload when MCP tools are available

### Safety
- Dry testing framework created (simulated, proof of concept)
- 22 test scenarios: baseline, customizations, failure modes, recovery, edge cases
- Simulated results: 0.00% deadlock rate, 100% fallback, 100% recovery
- Real sub-agent testing required before production (documented in IMPLEMENTATION_PLAN.md)
- Generic hooks never replaced (customization supplements only)

### Documentation
- Updated CHANGELOG.md with v1.1.0 entry
- IMPLEMENTATION_PLAN.md includes post-reload enhancement documentation
- Dry testing framework created at scratchpad/test-post-reload-customization.js

## [1.0.5] - 2026-01-30

### Added - Project Analysis Checklist
- **Critical**: Added comprehensive analysis checklist before configuration selection
  - Displays BEFORE preset selection to guide thorough analysis
  - Checklist format with □ boxes for visual clarity
  - Emphasizes "CURRENT and COMPLETE analysis of actual project state"
  - Anti-shortcut language: "Do not rely on assumptions or prior knowledge"
  - Step 1: List available MCP tools FIRST
  - Explicit instruction: "Use these tools for ALL remaining steps where beneficial"
  - Each checklist item suggests which tools to use (filesystem, git, code analysis)
  - Six analysis steps covering:
    1. Available MCP tools discovery
    2. Codebase structure exploration
    3. Project complexity assessment
    4. Current Claude Code configuration review
    5. Development patterns from git history
    6. Project documentation examination
- Updated preset selection prompt: "Based on your analysis, enter choice..."
  - Links selection to completed analysis
  - Reinforces that choice should be informed by findings

### Testing
- Conducted dry tests with 4 verbiage variations using spawned sub-agents
- All agents performed thorough analysis (no shortcuts observed)
- Checklist format produced most structured analysis responses
- Option 3 verbiage ("actual/current/complete" + checklist) selected as optimal balance
- No new automated tests needed (output formatting only)

### Context
- User feedback: "agent should analyze the project to maximum configuration efficiency"
- User feedback: "analysis should happen before it's prompted for a reload"
- User feedback: "tell it to utilize any installed mcp tools it may benefit from"
- Goal: Agent discovers project characteristics → chooses optimal configuration
- Previous v1.0.4: Had recommendations but no analysis guidance
- Solution: Explicit analysis checklist with tool usage instructions
- Result: Agents perform structured project analysis before configuration

## [1.0.4] - 2026-01-30

### Changed - Optimal Configuration Guidance
- **Critical**: Enhanced --init wizard with clear recommended defaults for agent auto-configuration
  - **Preset selection**: Shows `[1]` as default with "RECOMMENDED" label
    - Three-gate preset marked as "Optimal for consistent learning and knowledge retention"
    - Empty input (press Enter) defaults to optimal choice
  - **Hook installation**: Changed to `[Y/n]` (default Yes) with strong recommendation
    - Clear explanation: "WITH hooks: Every file operation builds on accumulated knowledge"
    - Explicit: "default: Yes - recommended for agents"
    - Empty input (press Enter) installs hooks
  - **Migration**: Changed to `[Y/n]` (default: Yes - preserve your knowledge)
    - Defaults to migrating if old database exists
  - **Benefits listed**: Agents can "figure out" optimal path from clear guidance
    - Consistent workflow enforcement
    - Maximum knowledge retention and learning
    - Prevents failure patterns from research
- **Verification prompt**: Different prompts based on configuration
  - **With hooks**: Demonstrates full TEACH → LEARN → REASON → ACT workflow
    - Prompt: "Create installation-verified.txt" (will trigger enforcement)
    - Shows blocking → workflow → authorization → file creation cycle
  - **Without hooks**: Basic tool verification
    - Prompt: "Record and search for installation experience"
    - Shows basic tool functionality only
- **Opt-out still available**: Humans can explicitly choose non-optimal paths
  - Type '2', '3', '4', '5' for different presets
  - Type 'n' to skip hooks
  - Guidance makes optimal path obvious without forcing it

### Context
- User feedback: "the agent installed path should always utilize the maximum amount and consistency to utilize the tools and learn as much as possible"
- User feedback: "guidance should recommend the optimal configuration for the agent to 'figure out' that it needs to choose"
- Previous v1.0.3: Had recommendations but no clear defaults, agents couldn't auto-configure
- Goal: Agent reads output → understands optimal path → chooses automatically
- Solution: Clear RECOMMENDED labels, default values, explicit benefits, while keeping opt-out
- Result: Agents get optimal configuration (hooks + three-gate + migration), humans can still customize

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
