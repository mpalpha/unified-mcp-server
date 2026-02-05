/**
 * CLI Module (v1.7.0)
 *
 * Command-line interface for the unified-mcp-server.
 * Handles --help, --version, --preset, --init, --health, --validate flags.
 *
 * v1.7.0: Extracted from index.js for modularization
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

/**
 * Run CLI mode if flags are provided
 * Returns true if CLI mode was activated (caller should exit)
 * Returns false if no CLI flags - continue to MCP server mode
 */
function runCLI(options) {
  const {
    args,
    VERSION,
    MCP_DIR,
    TOKEN_DIR,
    DB_PATH,
    BUILT_IN_PRESETS,
    installHooks,
    healthCheck,
    validateConfig
  } = options;

  // --help flag
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Unified MCP Server v${VERSION}
Combines memory-augmented reasoning and protocol enforcement

USAGE:
  npx unified-mcp-server                      Start MCP server (JSON-RPC over stdio)
  npx unified-mcp-server --help               Show this help message
  npx unified-mcp-server --version            Show version number
  npx unified-mcp-server --init               Run interactive setup wizard
  npx unified-mcp-server --preset <name>      Apply preset (non-interactive)
  npx unified-mcp-server --health             Run health check
  npx unified-mcp-server --validate           Validate configuration

PRESETS:
  three-gate      Standard TEACH → LEARN → REASON workflow (recommended)
  minimal         Lightweight with optional gates
  strict          Strict enforcement with all validations
  custom          Template for custom workflows

  Example: npx unified-mcp-server --preset three-gate

INSTALLATION:
  # From gist (recommended)
  npx mpalpha/unified-mcp-server

  # Or install globally
  npm install -g unified-mcp-server

CONFIGURATION:
  Database:      ${DB_PATH}
  Token Dir:     ${TOKEN_DIR}

DOCUMENTATION:
  https://github.com/mpalpha/unified-mcp-server

28 TOOLS AVAILABLE:
  Knowledge Management (7 tools):
    - record_experience, search_experiences, get_experience
    - update_experience, tag_experience, export_experiences, import_experiences

  Reasoning (4 tools):
    - analyze_problem, gather_context, reason_through, finalize_decision

  Workflow Enforcement (5 tools):
    - check_compliance, verify_compliance, authorize_operation
    - get_workflow_status, reset_workflow

  Configuration (5 tools):
    - list_presets, apply_preset, validate_config, get_config, export_config

  Automation (5 tools):
    - install_hooks, uninstall_hooks, get_session_state, health_check, import_data

  Project Context (2 tools):
    - update_project_context, get_project_context
`);
    process.exit(0);
    return true;
  }

  // --version flag
  if (args.includes('--version') || args.includes('-v')) {
    console.log(VERSION);
    process.exit(0);
    return true;
  }

  // --preset flag (non-interactive preset application)
  const presetIndex = args.findIndex(arg => arg === '--preset');
  if (presetIndex !== -1 && args[presetIndex + 1]) {
    const presetName = args[presetIndex + 1];
    const validPresets = ['three-gate', 'minimal', 'strict', 'custom'];

    if (!validPresets.includes(presetName)) {
      console.error(`Error: Invalid preset "${presetName}"`);
      console.error(`Valid presets: ${validPresets.join(', ')}`);
      process.exit(1);
    }

    const presetConfig = BUILT_IN_PRESETS[presetName];
    if (!presetConfig) {
      console.error(`Error: Preset "${presetName}" not found`);
      process.exit(1);
    }

    try {
      const configPath = path.join(MCP_DIR, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify(presetConfig, null, 2));
      console.log(`✓ Applied ${presetName} preset`);
      console.log(`  Config saved to: ${configPath}`);
      console.log(`\nPreset details:`);
      console.log(`  Enforcement level: ${presetConfig.enforcement_level || 'custom'}`);
      console.log(`  Tools: ${Object.keys(presetConfig.tools || {}).length} configured`);
      process.exit(0);
    } catch (error) {
      console.error(`Error applying preset: ${error.message}`);
      process.exit(1);
    }
    return true;
  }

  // --init flag (interactive setup wizard)
  if (args.includes('--init')) {
    runInitWizard(options);
    return true;
  }

  // --health flag
  if (args.includes('--health')) {
    console.log('Running health check...\n');
    try {
      const result = healthCheck({});
      console.log(`Status: ${result.status}`);
      console.log(`Database: ${result.database_path}`);
      console.log(`Token Directory: ${result.token_directory}`);
      console.log(`\nExperiences: ${result.experience_count}`);
      console.log(`Reasoning Sessions: ${result.reasoning_session_count}`);
      console.log(`Workflow Sessions: ${result.workflow_session_count}`);

      if (result.issues && result.issues.length > 0) {
        console.log(`\nIssues Found (${result.issues.length}):`);
        result.issues.forEach(issue => console.log(`  ❌ ${issue}`));
        process.exit(1);
      } else {
        console.log('\n✅ All checks passed');
        process.exit(0);
      }
    } catch (e) {
      console.error(`❌ Health check failed: ${e.message}`);
      process.exit(1);
    }
    return true;
  }

  // --validate flag
  if (args.includes('--validate')) {
    console.log('Validating configuration...\n');
    try {
      // v1.4.0: Load config from project-local .claude/config.json
      const claudeDir = path.join(process.cwd(), '.claude');
      const configPath = path.join(claudeDir, 'config.json');

      if (!fs.existsSync(configPath)) {
        console.log('No configuration file found at:', configPath);
        console.log('\nUsing default configuration (valid)');
        console.log('✅ Configuration is valid');
        process.exit(0);
      }

      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const result = validateConfig({ config });

      console.log(`Configuration: ${configPath}`);
      console.log(`\nValidation Result:`);

      if (result.errors && result.errors.length > 0) {
        console.log(`\n❌ Errors (${result.errors.length}):`);
        result.errors.forEach(err => console.log(`  - ${err}`));
      }

      if (result.warnings && result.warnings.length > 0) {
        console.log(`\n⚠️  Warnings (${result.warnings.length}):`);
        result.warnings.forEach(warn => console.log(`  - ${warn}`));
      }

      if (result.valid) {
        console.log('\n✅ Configuration is valid');
        process.exit(0);
      } else {
        console.log('\n❌ Configuration is invalid');
        process.exit(1);
      }
    } catch (e) {
      console.error(`❌ Validation failed: ${e.message}`);
      process.exit(1);
    }
    return true;
  }

  // No CLI flags - continue to MCP server mode
  return false;
}

/**
 * Run interactive setup wizard (--init)
 */
function runInitWizard(options) {
  const {
    VERSION,
    MCP_DIR,
    TOKEN_DIR,
    DB_PATH,
    BUILT_IN_PRESETS,
    installHooks
  } = options;

  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(`
╔═══════════════════════════════════════════════════════════╗
║   Unified MCP Server v${VERSION} - Interactive Setup      ║
╚═══════════════════════════════════════════════════════════╝

DATABASE LOCATION: ${DB_PATH}
TOKEN DIRECTORY:   ${TOKEN_DIR}

SETUP STATUS:
  ✓ Database directory created
  ✓ Token directory created
  ✓ Namespace: .claude/ (project-local, v1.4.0)
`);

  // v1.4.0: Check for and cleanup old global storage
  const oldGlobalDir = path.join(os.homedir(), '.unified-mcp');
  if (fs.existsSync(oldGlobalDir)) {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║   v1.4.0 MIGRATION: Old Global Storage Detected           ║
╚═══════════════════════════════════════════════════════════╝

Found old global storage at: ${oldGlobalDir}

v1.4.0 uses project-local storage (.claude/) instead.
The old global storage is no longer used and can be safely removed.

To remove: rm -rf ${oldGlobalDir}
`);
  }

  const setupState = {
    preset: null,
    installHooks: false,
    hooksInstalled: false,
    hooksLocation: null  // v1.5.0: Track actual install location (global vs project-local)
  };

  // Display analysis checklist before configuration
  console.log(`
${'═'.repeat(60)}
CONFIGURATION OPTIMIZATION
${'═'.repeat(60)}

You are expected to perform a CURRENT and COMPLETE analysis of the
actual project state before selecting configuration.

Do not rely on assumptions or prior knowledge - analyze the actual
current state:

ANALYSIS CHECKLIST (complete all steps):

□ List currently available MCP tools (check actual installed tools)

  → Use these available tools for ALL remaining analysis steps where
    they provide benefit.

□ Explore actual codebase structure and organization
  (use filesystem/code analysis tools if available)

□ Assess actual project complexity (file counts, patterns, architecture)
  (use code analysis/search tools if available)

□ Review current Claude Code configuration (read actual settings.json)
  (use filesystem tools if available)

□ Identify actual development patterns from current git history
  (use git/github tools if available)

□ Examine actual project documentation and architecture
  (use documentation/search tools if available)

After completing this checklist with available tools, select the
configuration that best fits the actual project characteristics.

${'═'.repeat(60)}
`);

  // Question 1: Preset selection
  rl.question(`
Which workflow preset would you like to use?

  1. three-gate (RECOMMENDED) - Standard TEACH → LEARN → REASON workflow
                                Optimal for consistent learning and knowledge retention
  2. minimal                  - Lightweight with optional gates
  3. strict                   - Strict enforcement with all validations
  4. custom                   - Template for custom workflows
  5. skip                     - Don't apply a preset now

Based on your analysis, enter choice [1-5] (default: 1 - three-gate): `, (answer) => {
    const choice = answer.trim() || '1'; // Default to 1 if empty
    const presets = { '1': 'three-gate', '2': 'minimal', '3': 'strict', '4': 'custom', '5': null };
    setupState.preset = presets[choice] || null;

    if (setupState.preset) {
      console.log(`\n✓ Selected preset: ${setupState.preset}`);
    } else {
      console.log('\n✓ Skipping preset configuration');
    }

    // Question 2: Hook installation
    rl.question(`
Install workflow enforcement hooks? (RECOMMENDED)

Hooks enforce TEACH → LEARN → REASON workflow for optimal operation:
  • WITHOUT hooks: Agents may skip workflow, reducing effectiveness
  • WITH hooks:    Every file operation builds on accumulated knowledge

Benefits:
  ✓ Consistent workflow enforcement across all requests
  ✓ Maximum knowledge retention and learning
  ✓ Prevents failure patterns documented in AgentErrorTaxonomy research
  ✓ Blocks file operations until workflow complete (optimal behavior)

Install hooks? [Y/n] (default: Yes - recommended for agents): `, (answer) => {
      const response = answer.trim().toLowerCase();
      setupState.installHooks = response === '' || response === 'y' || response === 'yes';

      if (setupState.installHooks) {
        console.log('\n✓ Hooks will be installed');
      } else {
        console.log('\n✓ Skipping hook installation');
      }

      // Question 3: Migration from old database
      rl.question(`
Do you have an old memory-augmented-reasoning.db to migrate?

If you previously used memory-augmented-reasoning, you can import all
your experiences into this unified server. The migration tool will:
  • Find and convert all your existing experiences
  • Preserve revision relationships
  • Never modify your source database (read-only)

Common locations:
  • ~/.cursor/memory-augmented-reasoning.db
  • <project>/.cursor/memory-augmented-reasoning.db

Migrate old database? [Y/n] (default: Yes - preserve your knowledge): `, (answer) => {
        const response = answer.trim().toLowerCase();
        setupState.migrate = response === '' || response === 'y' || response === 'yes';

        if (setupState.migrate) {
          console.log('\n✓ Will help you migrate old database');
        } else {
          console.log('\n✓ Skipping migration');
        }

        // Execute setup
        console.log('\n' + '─'.repeat(60));
        console.log('EXECUTING SETUP...\n');

        executeSetup(setupState, options, rl);
      });
    });
  });
}

/**
 * Execute the setup based on user choices
 */
function executeSetup(setupState, options, rl) {
  const {
    MCP_DIR,
    BUILT_IN_PRESETS,
    installHooks
  } = options;

  try {
    // Apply preset if selected
    if (setupState.preset) {
      const presetConfig = BUILT_IN_PRESETS[setupState.preset];
      if (presetConfig) {
        // Save preset to .claude/config.json (v1.4.0: project-local)
        const configPath = path.join(MCP_DIR, 'config.json');
        fs.writeFileSync(configPath, JSON.stringify(presetConfig, null, 2));
        console.log(`✓ Applied ${setupState.preset} preset to ${configPath}`);
      }
    }

    // Install hooks if requested
    if (setupState.installHooks) {
      try {
        const result = installHooks({ hooks: ['all'], update_settings: false });
        if (result.installed) {
          console.log(`✓ Installed ${result.hooks.length} hooks to ${result.location}`);
          console.log('  Note: You need to manually add hooks to Claude Code settings.json');
          setupState.hooksInstalled = true;
          setupState.hooksLocation = result.location;  // v1.5.0: Track where hooks were installed
        }
      } catch (e) {
        console.log(`✗ Hook installation failed: ${e.message}`);
      }
    }

    // Run migration if requested
    if (setupState.migrate) {
      runMigrationPrompt();
    }

    // Display completion and next steps
    displaySetupCompletion(setupState, options);

  } catch (e) {
    console.error(`\n✗ Setup failed: ${e.message}`);
  }

  rl.close();
  process.exit(0);
}

/**
 * Display migration prompt and instructions
 */
function runMigrationPrompt() {
  console.log('\n' + '─'.repeat(60));
  console.log('MIGRATION SETUP\n');

  // Find common database locations
  const homeDir = os.homedir();
  const commonPaths = [
    path.join(homeDir, '.cursor', 'memory-augmented-reasoning.db'),
    path.join(process.cwd(), '.cursor', 'memory-augmented-reasoning.db')
  ];

  let foundDatabases = [];
  for (const dbPath of commonPaths) {
    if (fs.existsSync(dbPath)) {
      foundDatabases.push(dbPath);
    }
  }

  if (foundDatabases.length > 0) {
    console.log('Found old database(s):\n');
    foundDatabases.forEach((db, i) => {
      console.log(`  ${i + 1}. ${db}`);
    });
    console.log('\nTo migrate, run:\n');
    console.log(`  node scripts/migrate-experiences.js --source ${foundDatabases[0]} --dry-run`);
    console.log('  (Preview migration without changes)\n');
    console.log(`  node scripts/migrate-experiences.js --source ${foundDatabases[0]}`);
    console.log('  (Perform actual migration)\n');
    console.log('See docs/MIGRATION_GUIDE.md for complete instructions.');
  } else {
    console.log('No old database found in common locations.\n');
    console.log('To migrate from a custom location, run:\n');
    console.log('  node scripts/migrate-experiences.js --source /path/to/old.db --dry-run\n');
    console.log('See docs/MIGRATION_GUIDE.md for complete instructions.');
  }
}

/**
 * Display setup completion message and next steps
 */
function displaySetupCompletion(setupState, options) {
  const { MCP_DIR } = options;

  // Write post-install prompt file for hook to inject after restart
  const promptsDir = path.join(MCP_DIR, 'post-install-prompts');
  const projectHash = crypto.createHash('md5').update(process.cwd()).digest('hex');
  const promptFilePath = path.join(promptsDir, `${projectHash}.md`);

  const promptContent = getPostInstallPromptContent(projectHash);
  try {
    // Ensure prompts directory exists
    if (!fs.existsSync(promptsDir)) {
      fs.mkdirSync(promptsDir, { recursive: true });
    }
    fs.writeFileSync(promptFilePath, promptContent, 'utf8');
  } catch (err) {
    console.log(`  ⚠️  Warning: Could not write post-install prompt file: ${err.message}\n`);
  }

  // Display next steps
  console.log('\n' + '='.repeat(60));
  console.log('✅ SETUP COMPLETE!\n');
  console.log('='.repeat(60));
  console.log('\n📋 PROJECT INITIALIZED:\n');
  console.log(`  Project directory: ${process.cwd()}`);
  console.log(`  Config location: ${MCP_DIR}\n`);
  console.log('  ✓ .claude/ directory created');
  console.log('  ✓ Project-local configuration ready');
  if (setupState.hooksInstalled) {
    console.log('  ✓ Workflow hooks installed');
  }
  console.log('\n💡 Global settings (mcpServers, hooks) are auto-configured on server start.');
  console.log('   No manual configuration needed.\n');

  // Step 3: Restart Claude Code
  const nextStep = setupState.hooksInstalled ? 3 : 2;
  console.log(`STEP ${nextStep}: Restart Claude Code\n`);
  console.log('  ⚠️  AGENT: Instruct the user to restart Claude Code now.\n');
  console.log('  WHY: Claude Code must be restarted to load the new MCP server.\n');
  console.log('  HOW TO RESTART:\n');
  console.log('    • VSCode: Run "Developer: Reload Window" command (Cmd/Ctrl+Shift+P)');
  console.log('    • Claude Desktop: Restart the application');
  console.log('    • CLI: Exit and restart claude-code\n');

  // Step 4: Post-Reload Customization (AUTOMATIC)
  console.log(`STEP ${nextStep + 1}: Customize Project Context (Automatic)\n`);
  console.log('  🤖 WHAT HAPPENS AFTER RESTART:\n');
  console.log('  The session_start hook will automatically present a customization prompt.\n');
  console.log('  This prompt asks you to:\n');
  console.log('    1. Review project analysis from installation');
  console.log('    2. Propose customization options (record to database, add to hooks, or search)');
  console.log('    3. Wait for user approval before executing\n');
  console.log('  💡 HOW IT WORKS:');
  console.log(`    ✓ Prompt saved to .claude/post-install-prompts/${projectHash}.md`);
  console.log('    ✓ Hook injects prompt automatically after restart');
  console.log('    ✓ Agent/user deletes file after completing customization');
  console.log('    ✓ If not deleted, prompt re-appears on next session (retry safety)\n');
  console.log('  ⚠️  AGENT: After restart, you will receive this prompt automatically.');
  console.log('      Execute it, then delete the prompt file as instructed.\n');
  console.log('  💡 SAFETY: Data-driven approach (no code generation)');
  console.log('    ✓ Context stored as JSON data');
  console.log('    ✓ Hooks read data safely (no code execution)');
  console.log('    ✓ Can be enabled/disabled anytime');
  console.log('    ✓ Generic hooks remain active (context supplements)\n');

  // Step 5: Verify installation
  console.log(`STEP ${nextStep + 2}: Verify Installation\n`);
  console.log('  ⚠️  AGENT/USER ACTION REQUIRED:\n');
  console.log('  SUBMIT this prompt to verify the system is working:\n');

  if (setupState.hooksInstalled) {
    // With hooks: demonstrate full workflow enforcement
    console.log('  ┌─────────────────────────────────────────────────────────────┐');
    console.log('  │ Create a file called installation-verified.txt with the    │');
    console.log('  │ content "Installation complete and enforcement working".   │');
    console.log('  └─────────────────────────────────────────────────────────────┘\n');
    console.log('  EXPECTED BEHAVIOR:');
    console.log('    1. Hooks will BLOCK the Write operation initially');
    console.log('    2. System guides you through workflow:');
    console.log('       • Record an experience (TEACH phase)');
    console.log('       • Search past experiences (LEARN phase)');
    console.log('       • Reason through the task (REASON phase)');
    console.log('    3. After completing workflow, Write is authorized');
    console.log('    4. File is created successfully');
    console.log('    5. This experience is saved for future use\n');
    console.log('  This verifies:');
    console.log('    ✓ MCP server is connected');
    console.log('    ✓ All 25 tools are accessible');
    console.log('    ✓ Database is working');
    console.log('    ✓ Workflow enforcement is ACTIVE');
    console.log('    ✓ Hooks are blocking/authorizing correctly');
    console.log('    ✓ Complete TEACH → LEARN → REASON → ACT cycle\n');
  } else {
    // Without hooks: basic tool verification
    console.log('  ┌─────────────────────────────────────────────────────────────┐');
    console.log('  │ Record this installation as a successful experience, then   │');
    console.log('  │ search for "installation" to verify the database works.    │');
    console.log('  └─────────────────────────────────────────────────────────────┘\n');
    console.log('  EXPECTED OUTPUT:');
    console.log('    • Experience recorded with an ID');
    console.log('    • Search returns the installation experience');
    console.log('    • Database path: .claude/experiences.db\n');
    console.log('  This verifies:');
    console.log('    ✓ MCP server is connected');
    console.log('    ✓ Basic tools are accessible (record_experience, search_experiences)');
    console.log('    ✓ Database is working');
    console.log('    ⚠️  Workflow enforcement is NOT active (hooks not installed)\n');
  }

  console.log('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('  ⏭️  AFTER VERIFICATION SUCCEEDS:\n');
  console.log('  Installation is complete! System is ready for normal use.\n');
  console.log(`  See STEP ${nextStep + 3} below for workflow examples.\n`);

  // Step 6: Start using
  console.log(`STEP ${nextStep + 3}: Start Using the System\n`);
  console.log('  WORKFLOW: TEACH → LEARN → REASON → ACT\n');
  console.log('  Example task: "Add a login button to my React app"\n');
  console.log('    1. Claude searches past experiences: search_experiences("login button")\n');
  console.log('    2. Claude analyzes problem: analyze_problem("Add login button")\n');
  console.log('    3. Claude gathers context: gather_context(...)\n');
  console.log('    4. Claude reasons through solution: reason_through(...)\n');
  console.log('    5. Claude makes changes: Write/Edit files\n');
  console.log('    6. Claude records experience: record_experience(...)\n');
  console.log('\n💡 TIP: The workflow is enforced automatically if hooks are installed.\n');

  // Documentation
  console.log('📚 DOCUMENTATION:\n');
  console.log('  Full Documentation:');
  console.log('    https://github.com/mpalpha/unified-mcp-server\n');
  console.log('  Quick Reference:');
  console.log('    https://github.com/mpalpha/unified-mcp-server/tree/main/docs\n');
  console.log('  Troubleshooting:');
  console.log('    https://github.com/mpalpha/unified-mcp-server#troubleshooting\n');

  console.log('='.repeat(60));
  console.log('🚀 Ready to use! Restart Claude Code to begin.');
}

/**
 * Get the post-install prompt content
 */
function getPostInstallPromptContent(projectHash) {
  return `🔍 POST-INSTALLATION: PROJECT CONTEXT CONFIGURATION

The MCP server is now connected. Configure project context to guide
future sessions toward reading the FULL documentation - not summaries.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  CRITICAL: Context is a POINTER, not a REPLACEMENT.
    DO NOT summarize rules. Create pointers that enforce reading full docs.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1: BROAD DISCOVERY

Search for files that might contain rules, guidelines, or checklists:

  □ Bash: find . -type f \\( -name "*.md" -o -name "*.txt" -o -name ".*rules*" \\) 2>/dev/null | head -100
  □ Exclude: Filter out paths containing dependency caches, build outputs,
      vendored code, or version control (determine what these are based on
      the project's ecosystem)
  □ Bash: ls -la (root dotfiles)
  □ Read: package.json, pyproject.toml, or equivalent (scripts, config references)
  □ Read: README.md

STEP 2: READ DISCOVERED FILES

For each potentially relevant file from Step 1:
  □ Read the file contents
  □ Note what type of guidance it contains (code style, testing, accessibility, etc.)
  □ Note sections relevant to pre-implementation planning
  □ Note sections relevant to post-implementation verification
  □ Note any lint/test/build commands referenced

STEP 3: PRESENT FINDINGS

Present discovered files with content summaries:

  "I found these files containing project rules or guidelines:

   [list each file with description of what it contains]

   Are there other locations where rules, checklists, or guidelines
   are documented? (other files, wiki, external docs?)"

If user identifies additional sources:
  - For files: discover and read them
  - For external docs the agent cannot access: ask user to summarize
    key points or provide links to include in reminders

STEP 4: HANDLE NO FORMAL DOCUMENTATION

If no rule files are found:

  "I didn't find formal documentation for project rules or checklists.

   Would you like to:
   A) Describe key rules - I'll help structure them into context
   B) Skip project context for now"

If user chooses A, capture their rules and help identify which are
critical violations vs general guidelines.

STEP 5: ANALYZE FOR CONFLICTS

Compare rules across all discovered files. Look for:
  □ Contradictory statements
  □ Overlapping guidance with different specifics
  □ Ambiguous precedence

Present conflicts to user for resolution:

  "I found potential conflicts between your rule files:

   CONFLICT: [topic]
   - [File A] says: '...'
   - [File B] says: '...'

   Which takes precedence?"

STEP 6: IDENTIFY CRITICAL VIOLATIONS

Ask the user - do not guess:

  "Which rules are MOST COMMONLY VIOLATED - the specific items you
   frequently have to correct? (3-5 items)

   These become critical reminders shown every session."

STEP 7: MAP FILES TO SCENARIOS

Determine which files apply to which types of changes:

  □ Which files should ALWAYS be read before/after coding?
  □ Which files apply only to specific scenarios (UI, tests, API, etc.)?
  □ What verification commands should run after changes?

STEP 8: CONSTRUCT PROJECT CONTEXT

Build context following these principles:

  ✓ HONEST - Summary admits full rules are elsewhere
  ✓ ACTIONABLE - Points to exact files discovered
  ✓ CRITICAL ONLY - Highlights are user-identified violations
  ✓ ENFORCES READING - Pre/post say "READ [file]"
  ✓ CONFLICT-AWARE - Notes resolved conflicts
  ✓ CONDITIONAL - Notes which files apply when

Note: Each item has a 200 character limit. Keep pointers concise.

  update_project_context({
    enabled: true,

    summary: "[Project] - [Stack]. ALWAYS read full docs before/after coding.",

    highlights: [
      // User-identified most-violated rules from Step 6
      // These are specific gotchas, not general documentation
    ],

    reminders: [
      // Point to primary rule sources discovered
      "READ [file] BEFORE coding",
      "READ [file] AFTER coding to verify"
    ],

    preImplementation: [
      // "READ [file]" items first, then action items
      "READ [file1] - [section] (applies: always)",
      "READ [file2] - [section] (applies: if [scenario])",
      // Critical actions not covered in files
    ],

    postImplementation: [
      // "READ [file]" items first, then verification commands
      "READ [file1] - [section] (applies: always)",
      "READ [file2] - [section] (applies: if [scenario])",
      // Verification commands
      "[lint/test command] - must pass"
    ]
  })

STEP 9: PRESENT FOR APPROVAL

Show the user:
  □ The constructed project context
  □ Summary of files referenced
  □ Conflict resolutions applied

Ask for approval before saving.
If user requests changes, revise and present again.

STEP 10: CLEANUP

After approval: rm .claude/post-install-prompts/${projectHash}.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRINCIPLES:

  ✓ Context POINTS to docs, doesn't replace them
  ✓ Discover broadly, don't assume project structure
  ✓ User identifies critical violations - don't guess
  ✓ Handle missing documentation gracefully
  ✓ Resolve conflicts explicitly with user input
  ✓ Support multiple files with conditional applicability

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

module.exports = {
  runCLI
};
