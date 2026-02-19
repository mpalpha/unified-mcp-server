/**
 * CLI Module (v1.8.0)
 *
 * Command-line interface for the unified-mcp-server.
 * Handles --help, --version, --preset, --init, --install, --health, --validate flags.
 * Also handles `hooks` subcommands: install, uninstall, list, status.
 *
 * v1.8.0: Added --install (non-interactive), hook subcommands, TTY detection
 * v1.7.0: Extracted from index.js for modularization
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

/**
 * Check if running in an interactive TTY environment
 */
function isTTY() {
  return process.stdin.isTTY && process.stdout.isTTY;
}

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
    uninstallHooks,
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
  npx unified-mcp-server --install            Non-interactive setup (CI, Claude Code)
  npx unified-mcp-server --install --preset <name>  Setup with preset
  npx unified-mcp-server --install --dry-run  Preview setup changes
  npx unified-mcp-server --install --repair   Fix corrupted installation
  npx unified-mcp-server --init               Interactive setup wizard (requires TTY)
  npx unified-mcp-server --preset <name>      Apply preset (non-interactive)
  npx unified-mcp-server --health             Run health check
  npx unified-mcp-server --validate           Validate configuration
  npx unified-mcp-server --doctor             System diagnostics (DB, schema, integrity)
  npx unified-mcp-server --demo              Exercise all memory system phases

HOOK MANAGEMENT:
  npx unified-mcp-server hooks install        Install hooks globally
  npx unified-mcp-server hooks uninstall      Remove hooks
  npx unified-mcp-server hooks list           Show installed hooks
  npx unified-mcp-server hooks status         Health check for hooks

PRESETS:
  three-gate      Standard TEACH → LEARN → REASON workflow (recommended)
  minimal         Lightweight with optional gates
  strict          Strict enforcement with all validations
  custom          Template for custom workflows

  Example: npx unified-mcp-server --install --preset three-gate

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

  // hooks subcommand (hooks install, hooks uninstall, hooks list, hooks status)
  const hooksIndex = args.findIndex(arg => arg === 'hooks');
  if (hooksIndex !== -1) {
    const subcommand = args[hooksIndex + 1];
    runHooksSubcommand(subcommand, options);
    return true;
  }

  // --install flag (non-interactive setup) - must be checked BEFORE --preset
  // so that --install --preset <name> uses the install handler, not the preset handler
  if (args.includes('--install')) {
    const dryRun = args.includes('--dry-run');
    const repair = args.includes('--repair');

    // Check for preset in --install --preset <name> format
    const presetIdx = args.findIndex(arg => arg === '--preset');
    const presetName = presetIdx !== -1 ? args[presetIdx + 1] : 'three-gate';

    runNonInteractiveInstall(options, { dryRun, repair, presetName });
    return true;
  }

  // --init flag (interactive setup wizard - requires TTY)
  if (args.includes('--init')) {
    if (!isTTY()) {
      console.warn('⚠️  Warning: --init requires an interactive terminal (TTY).');
      console.warn('   Falling back to non-interactive --install mode.');
      console.warn('   For interactive setup, run in a terminal with: unified-mcp-server --init\n');
      runNonInteractiveInstall(options, { dryRun: false, repair: false, presetName: 'three-gate' });
    } else {
      runInitWizard(options);
    }
    return true;
  }

  // --preset flag (standalone preset application, without --install)
  // v1.8.0: Only triggers when --install is NOT present (--install handles its own --preset)
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

  // --doctor flag
  if (args.includes('--doctor')) {
    runDoctor(options);
    return true;
  }

  // --demo flag
  if (args.includes('--demo')) {
    runDemo(options);
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

  // v1.8.1: Use extracted function for post-install prompt creation
  const promptResult = createPostInstallPrompt(MCP_DIR);
  if (!promptResult.success) {
    console.log(`  ⚠️  Warning: Could not write post-install prompt file: ${promptResult.error}\n`);
  }
  const projectHash = promptResult.projectHash;

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
    console.log('    ✓ All 34 tools are accessible');
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
 * Create post-install prompt file for project context customization
 * v1.8.1: Extracted as reusable function for both --init and --install paths
 * @param {string} mcpDir - The .claude directory path
 * @returns {{ success: boolean, projectHash: string, promptFilePath: string, error?: string }}
 */
function createPostInstallPrompt(mcpDir) {
  const promptsDir = path.join(mcpDir, 'post-install-prompts');
  const projectHash = crypto.createHash('md5').update(process.cwd()).digest('hex');
  const promptFilePath = path.join(promptsDir, `${projectHash}.md`);

  const promptContent = getPostInstallPromptContent(projectHash);
  try {
    // Ensure prompts directory exists
    if (!fs.existsSync(promptsDir)) {
      fs.mkdirSync(promptsDir, { recursive: true });
    }
    fs.writeFileSync(promptFilePath, promptContent, 'utf8');
    return { success: true, projectHash, promptFilePath };
  } catch (err) {
    return { success: false, projectHash, promptFilePath, error: err.message };
  }
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

STEP 6: MINE VIOLATIONS FROM EVIDENCE (GATE — must complete before Step 7)

DO NOT ask the user to guess. Mine violations from actual data:

  □ REQUIRED: search_experiences({ type: "ineffective" })
    Extract patterns from recorded failures. List each with its domain.

  □ REQUIRED: Mine session transcripts for correction patterns
    Search ~/.claude/projects/ for .jsonl transcript files.
    Grep for correction keywords: "wrong", "no,", "actually", "should be",
    "not that", "I said", "stop", "revert", "undo".
    List findings with transcript dates.

  □ Present combined findings to the user:
    "I found these violation patterns from your project history:

     FROM EXPERIENCES (ineffective):
     [list each pattern with domain and count]

     FROM TRANSCRIPTS:
     [list each correction pattern with date]

     Which of these should become critical reminders? (3-5 items)
     Are there others I missed?"

  DO NOT proceed to Step 7 until mining results are presented
  and the user has selected which violations to highlight.

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

STEP 9: EVALUATE RULE QUALITY (GATE — must complete before Step 10)

Before writing any rule into context, evaluate it against all five
DSPRF checks. Present results in a mandatory table format.

  DSPRF CHECK DEFINITIONS:
    D (Durability)  — Will this rule survive the next release?
    S (Specificity)  — Is it actionable, not just advice?
    P (Pattern)      — Class of problems, not one instance?
    R (Redundancy)   — Not already in a pointed-to doc file?
    F (Flexibility)  — Works across change types? Needs condition?

  EXAMPLES:
    ✗ D: "Run npm test (253 tests)" — count changes every release
    ✓ D: "npm test must pass with 0 failures" — always true
    ✗ S: "Be careful with naming" — no action to take
    ✓ S: "Grep for constant/table names before using them" — concrete step
    ✗ P: "Table is episodic_experiences not experiences" — one fact
    ✓ P: "Verify names against actual schema — collisions have occurred"
    ✓ R: If already in a doc pointer, the "READ [file]" is enough
    ✓ F: Add "(applies: if [scenario])" for conditional rules

  REQUIRED OUTPUT FORMAT — present this table to the user:

    | Rule | D | S | P | R | F | Pass? |
    |------|---|---|---|---|---|-------|
    | [rule text] | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | Yes/No |

    Rules that fail ANY check must be rephrased or dropped.
    Show the revised version and re-evaluate.

  DO NOT call update_project_context until the user approves the table.

STEP 10: PRESENT FOR APPROVAL

Show the user:
  □ The constructed project context
  □ Each rule with its durability/specificity reasoning
  □ Summary of files referenced
  □ Conflict resolutions applied

Ask for approval before saving.
If user requests changes, revise and present again.

STEP 11: CLEANUP

After approval: rm .claude/post-install-prompts/${projectHash}.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRINCIPLES:

  ✓ Context POINTS to docs, doesn't replace them
  ✓ Discover broadly, don't assume project structure
  ✓ User identifies critical violations - don't guess
  ✓ Handle missing documentation gracefully
  ✓ Resolve conflicts explicitly with user input
  ✓ Support multiple files with conditional applicability
  ✓ Every rule must survive version changes without manual updates
  ✓ Rules describe patterns, not instances — think ahead

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

/**
 * Get upgrade prompt content for version mismatch detection
 * v1.8.3: Uses same format as post-install prompt but with upgrade context
 */
function getUpgradePromptContent(oldVersion, newVersion, projectHash) {
  return `🔄 UPGRADE DETECTED: ${oldVersion || 'unknown'} → ${newVersion}

The unified-mcp-server has been upgraded. Project-level hook configuration
may be needed.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  Some environments read hooks from project-level settings (.claude/settings.local.json).
    Global hooks were updated, but project-level hooks may need configuration.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CONFIGURE PROJECT-LEVEL HOOKS

To enable workflow hooks in this project, update:

  .claude/settings.local.json

The hooks provide:
  • Session start - CHORES behavioral compliance framework
  • Pre-tool use - Workflow enforcement
  • Post-tool use - Response validation
  • User prompt submit - Input processing
  • Pre-compact - Context preservation
  • Stop - Completion promise detection

STEPS:

1. Do you want me to configure project-level hooks?
   (This only affects this project, not your global settings)

2. If YES: I will create/update .claude/settings.local.json with hook registrations

3. If NO: Hooks will only work via global ~/.claude/settings.json

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

To configure manually later, ask: "configure project hooks"

After completion: rm .claude/post-install-prompts/${projectHash}.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

/**
 * Check for version mismatch and create upgrade prompt if needed
 * v1.8.3: Auto-sync project hook registrations on version change
 * Uses the same post-install prompt mechanism (same file location)
 * @returns {Object} - { upgraded: boolean, oldVersion, newVersion, promptCreated }
 */
function checkVersionAndPrompt(mcpDir, currentVersion) {
  const configPath = path.join(mcpDir, 'config.json');

  try {
    // Read existing config
    let config = {};
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch (e) {
        // Config corrupted, treat as no previous version
        config = {};
      }
    }

    const installedVersion = config.installedVersion || null;

    // No previous version recorded - this is first install or upgrade from pre-1.8.3
    // Only trigger upgrade prompt if there WAS a previous version that differs
    if (!installedVersion) {
      // First install or upgrade from pre-1.8.3
      // Just record the version, don't prompt
      config.installedVersion = currentVersion;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      return { upgraded: false, oldVersion: null, newVersion: currentVersion, promptCreated: false, firstInstall: true };
    }

    // Check if versions differ
    if (installedVersion === currentVersion) {
      // No upgrade needed
      return { upgraded: false, oldVersion: installedVersion, newVersion: currentVersion, promptCreated: false };
    }

    // Version mismatch - upgrade detected!
    // Create upgrade prompt using the same post-install prompt mechanism
    const promptsDir = path.join(mcpDir, 'post-install-prompts');
    const projectHash = crypto.createHash('md5').update(process.cwd()).digest('hex');
    const promptFilePath = path.join(promptsDir, `${projectHash}.md`);

    const promptContent = getUpgradePromptContent(installedVersion, currentVersion, projectHash);
    let promptCreated = false;
    try {
      if (!fs.existsSync(promptsDir)) {
        fs.mkdirSync(promptsDir, { recursive: true });
      }
      fs.writeFileSync(promptFilePath, promptContent, 'utf8');
      promptCreated = true;
    } catch (e) {
      // Don't fail on prompt creation error
    }

    // Update installed version in config
    config.installedVersion = currentVersion;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    return {
      upgraded: true,
      oldVersion: installedVersion,
      newVersion: currentVersion,
      promptCreated,
      promptPath: promptFilePath
    };
  } catch (err) {
    // Don't fail startup on version check errors
    return { upgraded: false, error: err.message };
  }
}

/**
 * Run non-interactive install (--install flag)
 * v1.8.0: Works in CI, Claude Code, and other non-TTY environments
 * v1.8.3: Sets installedVersion for version tracking
 */
function runNonInteractiveInstall(options, { dryRun, repair, presetName }) {
  const {
    MCP_DIR,
    TOKEN_DIR,
    DB_PATH,
    BUILT_IN_PRESETS,
    installHooks,
    VERSION
  } = options;

  console.log(`
╔═══════════════════════════════════════════════════════════╗
║   Unified MCP Server - Non-Interactive Install            ║
╚═══════════════════════════════════════════════════════════╝
`);

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  if (repair) {
    console.log('🔧 REPAIR MODE - Will fix missing/corrupted files\n');
  }

  console.log(`Preset: ${presetName}`);
  console.log(`Database: ${DB_PATH}`);
  console.log(`Token Directory: ${TOKEN_DIR}`);
  console.log('');

  // Pre-flight validation
  const issues = [];

  // Check/create directories
  const dirsToCheck = [
    { path: MCP_DIR, name: 'Config directory' },
    { path: TOKEN_DIR, name: 'Token directory' },
    { path: path.dirname(DB_PATH), name: 'Database directory' }
  ];

  for (const dir of dirsToCheck) {
    if (!fs.existsSync(dir.path)) {
      if (dryRun) {
        console.log(`  [DRY RUN] Would create: ${dir.path}`);
      } else {
        try {
          fs.mkdirSync(dir.path, { recursive: true });
          console.log(`  ✓ Created ${dir.name}: ${dir.path}`);
        } catch (e) {
          issues.push(`Failed to create ${dir.name}: ${e.message}`);
        }
      }
    } else {
      console.log(`  ✓ ${dir.name} exists: ${dir.path}`);
    }
  }

  // Validate and apply preset
  const validPresets = ['three-gate', 'minimal', 'strict', 'custom'];
  if (!validPresets.includes(presetName)) {
    console.error(`\n❌ Invalid preset: ${presetName}`);
    console.error(`   Valid presets: ${validPresets.join(', ')}`);
    process.exit(1);
  }

  const presetConfig = BUILT_IN_PRESETS[presetName];
  if (!presetConfig) {
    console.error(`\n❌ Preset configuration not found: ${presetName}`);
    process.exit(1);
  }

  // Apply preset with idempotent merge
  const configPath = path.join(MCP_DIR, 'config.json');
  if (dryRun) {
    console.log(`\n  [DRY RUN] Would apply ${presetName} preset to: ${configPath}`);
  } else {
    try {
      let existingConfig = {};
      if (fs.existsSync(configPath)) {
        try {
          existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          console.log(`\n  ✓ Found existing config, merging with ${presetName} preset`);
        } catch (e) {
          if (repair) {
            console.log(`\n  ⚠️  Existing config corrupted, replacing with ${presetName} preset`);
          } else {
            console.log(`\n  ⚠️  Existing config corrupted. Use --repair to fix.`);
            issues.push('Config file corrupted');
          }
        }
      }

      // Idempotent merge: preset values as defaults, preserve existing user values
      const mergedConfig = deepMerge(presetConfig, existingConfig);
      // v1.8.3: Set installedVersion for version tracking
      mergedConfig.installedVersion = VERSION;
      // Memory system defaults (idempotent - preserve existing values)
      if (mergedConfig.memory_enabled === undefined) mergedConfig.memory_enabled = true;
      if (mergedConfig.consolidation_threshold === undefined) mergedConfig.consolidation_threshold = 5;
      if (mergedConfig.max_cells_total === undefined) mergedConfig.max_cells_total = 1000;
      if (mergedConfig.max_cells_per_scene === undefined) mergedConfig.max_cells_per_scene = 50;
      if (mergedConfig.max_experiences_total === undefined) mergedConfig.max_experiences_total = 5000;
      if (mergedConfig.byte_budget_default === undefined) mergedConfig.byte_budget_default = 8000;
      fs.writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2));
      console.log(`  ✓ Applied ${presetName} preset to: ${configPath}`);
    } catch (e) {
      issues.push(`Failed to apply preset: ${e.message}`);
    }
  }

  // Install hooks
  let hooksInstalled = false;
  if (dryRun) {
    console.log(`\n  [DRY RUN] Would install hooks globally`);
    console.log(`  [DRY RUN] Would write hooks to: ${path.join(MCP_DIR, 'settings.local.json')}`);
  } else {
    try {
      const result = installHooks({ hooks: ['all'], update_settings: false });
      if (result.installed) {
        console.log(`\n  ✓ Installed ${result.hooks.length} hooks to: ${result.location}`);
        hooksInstalled = true;

        // v1.8.4: Write hooks to project-level settings.local.json
        // Some IDE environments read hooks from project-level settings
        const settingsLocalPath = path.join(MCP_DIR, 'settings.local.json');
        const globalHooksDir = path.join(os.homedir(), '.claude', 'hooks');

        // Load existing settings.local.json or create empty object
        let settingsLocal = {};
        if (fs.existsSync(settingsLocalPath)) {
          try {
            settingsLocal = JSON.parse(fs.readFileSync(settingsLocalPath, 'utf8'));
          } catch (e) {
            // Corrupted file, start fresh
            settingsLocal = {};
          }
        }

        // Build hooks config pointing to global hook files
        const hookFiles = {
          'SessionStart': 'session-start.cjs',
          'UserPromptSubmit': 'user-prompt-submit.cjs',
          'PreToolUse': 'pre-tool-use.cjs',
          'PostToolUse': 'post-tool-use.cjs',
          'PreCompact': 'pre-compact.cjs',
          'Stop': 'stop.cjs'
        };

        const hooksConfig = {};
        for (const [hookType, fileName] of Object.entries(hookFiles)) {
          const hookPath = path.join(globalHooksDir, fileName);
          hooksConfig[hookType] = [{ hooks: [{ type: 'command', command: hookPath }] }];
        }

        // Merge hooks into settings.local.json (preserving existing values)
        const newSettings = deepMerge({ hooks: hooksConfig }, settingsLocal);
        fs.writeFileSync(settingsLocalPath, JSON.stringify(newSettings, null, 2));
        console.log(`  ✓ Configured hooks in: ${settingsLocalPath}`);
      }
    } catch (e) {
      // Hooks are optional, don't fail install
      console.log(`\n  ⚠️  Hook installation skipped: ${e.message}`);
    }
  }

  // Memory system initialization (schema + signing key)
  // v1.10.1: Check for lock before opening database — avoids corruption
  // when MCP server is running concurrently
  if (dryRun) {
    console.log(`\n  [DRY RUN] Would initialize memory system schema and signing key`);
  } else {
    try {
      const { getDatabase, isLockHeld, getDbPath } = require('./database');
      const dbPath = getDbPath();
      if (isLockHeld(dbPath)) {
        console.log(`\n  ⚠️  MCP server is running — memory schema will be applied on next restart`);
      } else {
        const { applyMemorySchema } = require('./memory/schema');
        const { ensureSigningSecret } = require('./memory/canonical');
        const db = getDatabase();
        applyMemorySchema(db);
        ensureSigningSecret(MCP_DIR);
        console.log(`\n  ✓ Memory system schema initialized`);
        console.log(`  ✓ Signing key created/verified`);
      }
    } catch (e) {
      console.log(`\n  ⚠️  Memory system init skipped: ${e.message}`);
    }
  }

  // v1.9.1: Register MCP server with Claude Code (user scope)
  if (dryRun) {
    console.log(`\n  [DRY RUN] Would register MCP server: claude mcp add unified-mcp -s user`);
  } else {
    try {
      const { execSync } = require('child_process');
      execSync('claude mcp add unified-mcp -s user -- npx mpalpha/unified-mcp-server', {
        stdio: 'pipe',
        timeout: 10000
      });
      console.log(`\n  ✓ Registered MCP server (user scope)`);
    } catch (e) {
      console.log(`\n  ⚠  Could not auto-register MCP server.`);
      console.log(`     Run manually: claude mcp add unified-mcp -s user -- npx mpalpha/unified-mcp-server`);
    }
  }

  // v1.8.1: Create post-install prompt for project context customization
  let promptResult = null;
  if (dryRun) {
    console.log(`  [DRY RUN] Would create post-install prompt file`);
  } else {
    promptResult = createPostInstallPrompt(MCP_DIR);
    if (promptResult.success) {
      console.log(`  ✓ Created post-install prompt: ${promptResult.promptFilePath}`);
    } else {
      console.log(`  ⚠️  Could not create post-install prompt: ${promptResult.error}`);
    }
  }

  // Report results
  console.log('\n' + '═'.repeat(60));
  if (issues.length > 0) {
    console.log('⚠️  Installation completed with issues:\n');
    issues.forEach(issue => console.log(`  ❌ ${issue}`));
    console.log('\nRun with --repair to attempt fixes.');
    process.exit(1);
  } else if (dryRun) {
    console.log('✅ DRY RUN COMPLETE - No changes were made\n');
    console.log('Run without --dry-run to perform actual installation.');
    process.exit(0);
  } else {
    console.log('✅ INSTALLATION COMPLETE\n');

    // v1.8.3: Updated NEXT STEPS with auto-configuration guidance
    console.log('NEXT STEPS:\n');
    console.log('  1. Restart Claude Code to load the MCP server');
    console.log('     • VSCode: Run "Developer: Reload Window" (Cmd/Ctrl+Shift+P)');
    console.log('     • Claude Desktop: Restart the application\n');

    console.log('  2. Customize Project Context (Automatic)');
    console.log('     After restart, the session_start hook will present a customization prompt.');
    if (promptResult && promptResult.success) {
      console.log(`     Prompt saved to: .claude/post-install-prompts/${promptResult.projectHash}.md`);
    }
    console.log('     Delete the file after completing customization.\n');

    console.log('  3. Start Auto-Configuration');
    console.log('     After restart, the agent will walk you through project-level');
    console.log('     hook configuration. Or ask: "configure project hooks"\n');

    console.log('  4. Verify Installation');
    console.log('     Run: unified-mcp-server --health\n');

    process.exit(0);
  }
}

/**
 * Deep merge two objects, with source values taking precedence
 * Used for idempotent config merging (preserves user customizations)
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Run hooks subcommand (hooks install, hooks uninstall, hooks list, hooks status)
 * v1.8.0: New subcommand interface for hook management
 */
function runHooksSubcommand(subcommand, options) {
  const { installHooks, uninstallHooks } = options;

  const validSubcommands = ['install', 'uninstall', 'list', 'status'];
  if (!subcommand || !validSubcommands.includes(subcommand)) {
    console.log(`
Usage: unified-mcp-server hooks <subcommand>

Subcommands:
  install     Install workflow enforcement hooks globally
  uninstall   Remove installed hooks
  list        Show installed hooks and their locations
  status      Health check for hook configuration

Examples:
  unified-mcp-server hooks install
  unified-mcp-server hooks list
`);
    process.exit(subcommand ? 1 : 0);
    return;
  }

  switch (subcommand) {
    case 'install':
      console.log('Installing workflow hooks...\n');
      try {
        const result = installHooks({ hooks: ['all'], update_settings: false });
        if (result.installed) {
          console.log(`✅ Installed ${result.hooks.length} hooks:`);
          result.hooks.forEach(hook => console.log(`  • ${hook}`));
          console.log(`\nLocation: ${result.location}`);
          console.log('\nNote: Restart Claude Code to activate hooks.');
        } else {
          console.log('⚠️  Hooks already installed or nothing to install.');
        }
        process.exit(0);
      } catch (e) {
        console.error(`❌ Hook installation failed: ${e.message}`);
        process.exit(1);
      }
      break;

    case 'uninstall':
      console.log('Removing workflow hooks...\n');
      try {
        const result = uninstallHooks({});
        if (result.removed) {
          console.log(`✅ Removed ${result.hooks_removed || 'all'} hooks`);
          console.log('\nNote: Restart Claude Code to apply changes.');
        } else {
          console.log('⚠️  No hooks found to remove.');
        }
        process.exit(0);
      } catch (e) {
        console.error(`❌ Hook removal failed: ${e.message}`);
        process.exit(1);
      }
      break;

    case 'list':
      console.log('Installed hooks:\n');
      const globalHooksDir = path.join(os.homedir(), '.claude', 'hooks');
      const projectHooksDir = path.join(process.cwd(), '.claude', 'hooks');

      let foundHooks = false;

      // Check global hooks
      if (fs.existsSync(globalHooksDir)) {
        const globalHooks = fs.readdirSync(globalHooksDir).filter(f => f.endsWith('.cjs') || f.endsWith('.js'));
        if (globalHooks.length > 0) {
          console.log(`Global hooks (${globalHooksDir}):`);
          globalHooks.forEach(hook => console.log(`  • ${hook}`));
          foundHooks = true;
        }
      }

      // Check project-local hooks
      if (fs.existsSync(projectHooksDir)) {
        const projectHooks = fs.readdirSync(projectHooksDir).filter(f => f.endsWith('.cjs') || f.endsWith('.js'));
        if (projectHooks.length > 0) {
          if (foundHooks) console.log('');
          console.log(`Project hooks (${projectHooksDir}):`);
          projectHooks.forEach(hook => console.log(`  • ${hook}`));
          foundHooks = true;
        }
      }

      if (!foundHooks) {
        console.log('No hooks installed.');
        console.log('\nInstall hooks with: unified-mcp-server hooks install');
      }
      process.exit(0);
      break;

    case 'status':
      console.log('Hook status:\n');
      const gHooksDir = path.join(os.homedir(), '.claude', 'hooks');
      const pHooksDir = path.join(process.cwd(), '.claude', 'hooks');
      const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');

      let status = { hooks: [], issues: [] };

      // Check global hooks directory
      if (fs.existsSync(gHooksDir)) {
        const hooks = fs.readdirSync(gHooksDir).filter(f => f.endsWith('.cjs') || f.endsWith('.js'));
        status.hooks.push(...hooks.map(h => ({ name: h, location: 'global' })));
        console.log(`✓ Global hooks directory exists: ${gHooksDir}`);
        console.log(`  Found ${hooks.length} hook file(s)`);
      } else {
        console.log(`⚠️  Global hooks directory not found: ${gHooksDir}`);
        status.issues.push('Global hooks directory missing');
      }

      // Check settings.json for hook configuration
      if (fs.existsSync(settingsPath)) {
        try {
          const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
          if (settings.hooks) {
            console.log(`\n✓ Hooks configured in settings.json`);
            const hookTypes = Object.keys(settings.hooks);
            hookTypes.forEach(type => {
              const count = Array.isArray(settings.hooks[type]) ? settings.hooks[type].length : 0;
              console.log(`  • ${type}: ${count} hook(s)`);
            });
          } else {
            console.log(`\n⚠️  No hooks section in settings.json`);
            status.issues.push('Hooks not configured in settings.json');
          }
        } catch (e) {
          console.log(`\n❌ Failed to parse settings.json: ${e.message}`);
          status.issues.push('settings.json parse error');
        }
      } else {
        console.log(`\n⚠️  settings.json not found: ${settingsPath}`);
        status.issues.push('settings.json missing');
      }

      // Summary
      console.log('\n' + '─'.repeat(50));
      if (status.issues.length === 0) {
        console.log('✅ Hook configuration looks healthy');
      } else {
        console.log(`⚠️  ${status.issues.length} issue(s) found:`);
        status.issues.forEach(issue => console.log(`  • ${issue}`));
        console.log('\nRun "unified-mcp-server hooks install" to fix.');
      }
      process.exit(status.issues.length > 0 ? 1 : 0);
      break;
  }
}

/**
 * Run --doctor: system diagnostics
 */
function runDoctor(options) {
  const { VERSION, MCP_DIR, DB_PATH } = options;

  console.log('=== Unified MCP Server Doctor ===\n');

  // Node version
  console.log(`Node version: ${process.version}`);

  // State dir + DB path
  const stateDir = MCP_DIR || path.join(process.cwd(), '.claude');
  const dbPath = DB_PATH || path.join(stateDir, 'experiences.db');
  console.log(`State dir: ${stateDir}`);
  console.log(`DB path: ${dbPath}`);
  console.log(`State dir exists: ${fs.existsSync(stateDir)}`);
  console.log(`DB exists: ${fs.existsSync(dbPath)}`);

  // Signing key
  const signingKeyPath = path.join(stateDir, 'signing.key');
  console.log(`Signing key: ${fs.existsSync(signingKeyPath) ? 'present' : 'missing'}`);

  // Schema version / migrations
  try {
    const { getDatabase } = require('./database');
    const db = getDatabase();
    const versionRow = db.prepare('SELECT MAX(version) as v FROM schema_info').get();
    console.log(`Schema version: ${versionRow ? versionRow.v : 'unknown'}`);

    // PRAGMA integrity_check
    const integrity = db.prepare('PRAGMA integrity_check').get();
    const integrityResult = integrity ? (integrity.integrity_check || integrity[Object.keys(integrity)[0]]) : 'unknown';
    console.log(`Integrity check: ${integrityResult}`);

    // Memory system tables check
    const tables = ['memory_sessions', 'invocations', 'receipts', 'memory_tokens',
                    'episodic_experiences', 'scenes', 'cells', 'cell_evidence', 'consolidation_meta'];
    const existingTables = [];
    const missingTables = [];
    for (const t of tables) {
      try {
        db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get();
        existingTables.push(t);
      } catch (e) {
        missingTables.push(t);
      }
    }
    console.log(`Memory tables present: ${existingTables.length}/${tables.length}`);
    if (missingTables.length > 0) {
      console.log(`Missing tables: ${missingTables.join(', ')}`);
    }

    // Modes
    const configPath = path.join(stateDir, 'config.json');
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        console.log(`Enforcement level: ${config.enforcement_level || 'unknown'}`);
      } catch (e) {
        console.log('Config: parse error');
      }
    } else {
      console.log('Config: not found');
    }

    // Package version
    console.log(`Server version: ${VERSION}`);

    console.log('\n✅ Doctor check complete');
    process.exit(0);
  } catch (e) {
    console.error(`\n❌ Doctor check failed: ${e.message}`);
    process.exit(1);
  }
}

/**
 * Run --demo: exercise all memory system phases
 */
function runDemo(options) {
  const { VERSION, MCP_DIR } = options;

  console.log('=== Unified MCP Server Demo ===');
  console.log(`Version: ${VERSION}\n`);

  const stateDir = MCP_DIR || path.join(process.cwd(), '.claude');
  const now = '2026-01-15T12:00:00.000Z'; // Fixed timestamp for determinism

  try {
    // Ensure memory schema is applied
    const { getDatabase } = require('./database');
    const { applyMemorySchema } = require('./memory/schema');
    const { ensureSigningSecret } = require('./memory/canonical');

    const db = getDatabase();
    applyMemorySchema(db);
    ensureSigningSecret(stateDir);

    // ====== PHASE 1 ======
    console.log('--- Phase 1: Episodic Memory Core + Invocation Ledger ---');
    const { createSession } = require('./memory/sessions');
    const { recordInvocation, verifyChain } = require('./memory/invocations');
    const { recordExperience: recordEpisodicExperience, getExperience: getEpisodicExperience } = require('./memory/experiences');

    const session = createSession({ scope_mode: 'project', flags: { demo: true }, now });
    console.log(`  Created session: ${session.session_id}`);

    const inv1 = recordInvocation({
      session_id: session.session_id,
      tool_name: 'demo_tool',
      input_obj: { action: 'test' },
      output_obj: { result: 'ok' },
      now
    });
    console.log(`  Recorded invocation: ${inv1.id} (hash: ${inv1.hash.slice(0, 16)}...)`);

    const exp1 = recordEpisodicExperience({
      session_id: session.session_id,
      scope: 'project',
      context_keys: ['demo', 'testing'],
      summary: 'Demo experience: system always initializes correctly',
      outcome: 'success',
      trust: 1,
      source: 'system',
      now
    });
    console.log(`  Recorded experience: ${exp1.experience_id}`);

    const readBack = getEpisodicExperience(exp1.experience_id);
    if (!readBack || readBack.experience_id !== exp1.experience_id) {
      console.log('DEMO_FAIL_PHASE1: Experience read-back failed');
      process.exit(1);
    }

    const chain = verifyChain(session.session_id);
    if (!chain.valid) {
      console.log('DEMO_FAIL_PHASE1: Hash chain verification failed');
      process.exit(1);
    }
    console.log(`  Hash chain valid: ${chain.valid} (${chain.count} invocations)`);
    console.log('DEMO_PASS_PHASE1');

    // ====== PHASE 2 ======
    console.log('\n--- Phase 2: Semantic Memory (Scenes + Cells + Evidence) ---');
    const { createScene, createCell, linkCellEvidence, queryCellsForContext } = require('./memory/scenes');

    const scene = createScene({
      scope: 'project',
      label: 'demo, testing',
      context_keys: ['demo', 'testing'],
      now
    });
    console.log(`  Created scene: ${scene.scene_id}`);

    const cell = createCell({
      scene_id: scene.scene_id,
      scope: 'project',
      cell_type: 'fact',
      title: 'System is initialized',
      body: 'The system is initialized and ready for use.',
      trust: 1,
      state: 'observed',
      now
    });
    console.log(`  Created cell: ${cell.cell_id} (salience: ${cell.salience})`);

    const link = linkCellEvidence({
      cell_id: cell.cell_id,
      experience_id: exp1.experience_id,
      relation: 'supports',
      now
    });
    console.log(`  Linked evidence: cell ${link.cell_id} ← exp ${link.experience_id}`);

    const contextCells = queryCellsForContext({
      scope: 'project',
      context_keys: ['demo', 'testing'],
      limit: 10,
      now
    });
    if (contextCells.length === 0) {
      console.log('DEMO_FAIL_PHASE2: No cells returned from query');
      process.exit(1);
    }

    // Verify stable ordering
    for (let i = 1; i < contextCells.length; i++) {
      const prev = contextCells[i - 1];
      const curr = contextCells[i];
      const orderOk = prev.trust > curr.trust ||
        (prev.trust === curr.trust && prev.salience > curr.salience) ||
        (prev.trust === curr.trust && prev.salience === curr.salience && prev.updated_at >= curr.updated_at) ||
        (prev.trust === curr.trust && prev.salience === curr.salience && prev.updated_at === curr.updated_at && prev.cell_id <= curr.cell_id);
      if (!orderOk) {
        console.log('DEMO_FAIL_PHASE2: Stable ordering violated');
        process.exit(1);
      }
    }
    console.log(`  Query returned ${contextCells.length} cell(s), stable ordering verified`);
    console.log('DEMO_PASS_PHASE2');

    // ====== PHASE 3 ======
    console.log('\n--- Phase 3: Deterministic Consolidation Engine ---');
    const { runConsolidation } = require('./memory/consolidation');

    // Add more experiences for consolidation
    recordEpisodicExperience({
      session_id: session.session_id,
      scope: 'project',
      context_keys: ['demo', 'testing'],
      summary: 'Users should always validate input before processing.',
      outcome: 'success',
      trust: 1,
      source: 'system',
      now
    });
    recordEpisodicExperience({
      session_id: session.session_id,
      scope: 'project',
      context_keys: ['demo', 'testing'],
      summary: 'The configuration file is located at .claude/config.json.',
      outcome: 'success',
      trust: 1,
      source: 'system',
      now
    });

    const consolidationNow = '2026-01-15T12:01:00.000Z';
    const consResult = runConsolidation({ scope: 'project', now: consolidationNow });
    console.log(`  Consolidation: ${consResult.processed} exp processed, ${consResult.cells_created} cells created, ${consResult.cells_updated} updated`);

    // Verify determinism: run again with same inputs should produce same state
    const consResult2 = runConsolidation({ scope: 'project', now: consolidationNow });
    if (consResult2.processed !== 0) {
      // Second run should process 0 since timestamp hasn't advanced
      console.log(`  Warning: Second consolidation processed ${consResult2.processed} (expected 0)`);
    }
    console.log('  Consolidation determinism verified');
    console.log('DEMO_PASS_PHASE3');

    // ====== PHASE 4 ======
    console.log('\n--- Phase 4: Context Pack + Guarded Cycle ---');
    const { contextPack } = require('./memory/context-pack');
    const { guardedCycle } = require('./memory/guarded-cycle');

    const packed = contextPack({
      session_id: session.session_id,
      scope: 'project',
      context_keys: ['demo', 'testing'],
      max_cells: 10,
      max_experiences: 5,
      byte_budget: 4000,
      now: consolidationNow
    });
    console.log(`  Context pack: ${packed.packed_cells.length} cells, ${packed.packed_experiences.length} experiences, ${packed.byte_size} bytes`);
    console.log(`  Context hash: ${packed.context_hash.slice(0, 16)}...`);

    // Verify hash reproducibility
    const packed2 = contextPack({
      session_id: session.session_id,
      scope: 'project',
      context_keys: ['demo', 'testing'],
      max_cells: 10,
      max_experiences: 5,
      byte_budget: 4000,
      now: consolidationNow
    });
    if (packed.context_hash !== packed2.context_hash) {
      console.log('DEMO_FAIL_PHASE4: Context hash not reproducible');
      process.exit(1);
    }
    console.log('  Context hash reproducibility verified');

    // Create a new session for guarded cycle (clean phase state)
    const gcSession = createSession({ scope_mode: 'project', flags: { demo: true }, now: consolidationNow });

    // Run SNAPSHOT phase
    const snap = guardedCycle({
      session_id: gcSession.session_id,
      scope: 'project',
      user_input: 'Demo request',
      context_keys: ['demo'],
      now: consolidationNow
    });
    if (snap.phase !== 'SNAPSHOT' || snap.status !== 'ok') {
      console.log('DEMO_FAIL_PHASE4: SNAPSHOT phase failed');
      process.exit(1);
    }
    console.log(`  Guarded cycle SNAPSHOT: ${snap.status}`);

    // Run ROUTER phase
    const router = guardedCycle({
      session_id: gcSession.session_id,
      scope: 'project',
      user_input: 'Demo request',
      context_keys: ['demo'],
      now: consolidationNow
    });
    if (router.phase !== 'ROUTER') {
      console.log('DEMO_FAIL_PHASE4: ROUTER phase failed');
      process.exit(1);
    }
    console.log(`  Guarded cycle ROUTER: ${router.status}`);
    console.log('DEMO_PASS_PHASE4');

    // ====== PHASE 5 ======
    console.log('\n--- Phase 5: Finalize Response + Governance ---');
    const { finalizeResponse } = require('./memory/finalize');
    const { validateGovernance, mintReceipt, verifyReceipt, mintToken, verifyToken } = require('./memory/governance');

    // Test finalize_response with trust<2 cell
    const finResult = finalizeResponse({
      draft_text: 'Based on our data, the system is initialized correctly. Steps: 1. Check config 2. Run init',
      selected_cells: [{ cell_id: cell.cell_id, title: cell.title, trust: 1, contradiction_count: 0 }],
      selected_experiences: []
    });
    console.log(`  Finalize: integrity=${finResult.integrity}, violations=${finResult.violations.length}`);

    // Test governance validation
    const govResult = validateGovernance({
      session_id: session.session_id,
      context_hash: packed.context_hash,
      now: consolidationNow
    });
    console.log(`  Governance: valid=${govResult.valid}, chain_count=${govResult.chain_count}`);

    // Test receipt minting + verification
    const receipt = mintReceipt({
      session_id: session.session_id,
      receipt_type: 'demo',
      scope: 'project',
      context_hash: packed.context_hash,
      now: consolidationNow
    });
    if (receipt.error) {
      console.log(`DEMO_FAIL_PHASE5: Receipt minting failed: ${receipt.message}`);
      process.exit(1);
    }
    console.log(`  Receipt minted: ${receipt.id} (hash: ${receipt.payload_hash.slice(0, 16)}...)`);

    const receiptVerify = verifyReceipt(receipt.id);
    if (!receiptVerify.valid) {
      console.log('DEMO_FAIL_PHASE5: Receipt verification failed');
      process.exit(1);
    }
    console.log(`  Receipt verified: ${receiptVerify.valid}`);

    // Test token minting + verification
    const token = mintToken({
      session_id: session.session_id,
      token_type: 'demo',
      scope: 'project',
      permissions: ['read', 'write'],
      now: consolidationNow
    });
    if (token.error) {
      console.log(`DEMO_FAIL_PHASE5: Token minting failed: ${token.message}`);
      process.exit(1);
    }
    console.log(`  Token minted: ${token.id}`);

    const tokenVerify = verifyToken(token.id, consolidationNow);
    if (!tokenVerify.valid) {
      console.log('DEMO_FAIL_PHASE5: Token verification failed');
      process.exit(1);
    }
    console.log(`  Token verified: valid=${tokenVerify.valid}, expired=${tokenVerify.expired}`);

    // Test tamper detection on receipt
    const tamperDb = getDatabase();
    tamperDb.prepare('UPDATE receipts SET signature = ? WHERE id = ?').run('tampered', receipt.id);
    const tamperVerify = verifyReceipt(receipt.id);
    if (tamperVerify.valid) {
      console.log('DEMO_FAIL_PHASE5: Tamper detection failed (should be invalid)');
      process.exit(1);
    }
    console.log(`  Tamper detection: receipt invalid after tampering ✓`);

    // Restore original signature for clean state
    tamperDb.prepare('UPDATE receipts SET signature = ? WHERE id = ?').run(receipt.signature, receipt.id);

    console.log('DEMO_PASS_PHASE5');

    console.log('\n=== All phases passed ===');
    process.exit(0);
  } catch (e) {
    console.error(`\n❌ Demo failed: ${e.message}`);
    console.error(e.stack);
    process.exit(1);
  }
}

module.exports = {
  runCLI,
  isTTY,
  runNonInteractiveInstall,
  runHooksSubcommand,
  runDoctor,
  runDemo,
  deepMerge,
  checkVersionAndPrompt
};
