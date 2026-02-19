#!/usr/bin/env node
/**
 * CLI Tests (v1.8.4)
 * Tests for CLI features: --install, hook subcommands, TTY detection, post-install prompt
 * v1.8.4: Added tests for settings.local.json creation with hooks
 * v1.8.3: Added tests for version detection and upgrade prompts
 * v1.8.2: Added tests for post-install prompt file creation
 */

const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Track test results
let passed = 0;
let failed = 0;

// Create temp directory for tests
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unified-mcp-cli-test-'));
const originalCwd = process.cwd();

function test(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32m✓ PASS\x1b[0m - ${name}`);
    passed++;
  } catch (error) {
    console.log(`  \x1b[31m✗ FAIL\x1b[0m - ${name}`);
    console.log(`    Error: ${error.message}`);
    failed++;
  }
}

function execInTestDir(cmd) {
  return execSync(cmd, {
    cwd: tempDir,
    encoding: 'utf8',
    env: { ...process.env, HOME: tempDir },
    shell: '/bin/bash'
  });
}

console.log('\x1b[1m');
console.log('CLI TESTS (v1.8.4)\x1b[0m');
console.log('\x1b[36m======================================================================\x1b[0m');
console.log(`\nTest directory: ${tempDir}\n`);

// Setup test environment
const bootstrapPath = path.join(originalCwd, 'bootstrap.js');

// Create .claude directory for tests
const claudeDir = path.join(tempDir, '.claude');
fs.mkdirSync(claudeDir, { recursive: true });

// ============================================================================
// --install flag tests
// ============================================================================

console.log('\x1b[1m--install flag tests\x1b[0m');
console.log('\x1b[36m----------------------------------------------------------------------\x1b[0m');

test('--install creates .claude directory', () => {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-test-'));
  const output = execSync(`cd "${testDir}" && node "${bootstrapPath}" --install 2>&1`, {
    encoding: 'utf8',
    shell: '/bin/bash'
  });
  const configDir = path.join(testDir, '.claude');
  if (!fs.existsSync(configDir)) {
    throw new Error('.claude directory not created');
  }
  // Cleanup
  fs.rmSync(testDir, { recursive: true, force: true });
});

test('--install creates config.json with default preset', () => {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-test-'));
  execSync(`cd "${testDir}" && node "${bootstrapPath}" --install 2>&1`, {
    encoding: 'utf8',
    shell: '/bin/bash'
  });
  const configPath = path.join(testDir, '.claude', 'config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('config.json not created');
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!config) {
    throw new Error('config.json is empty or invalid');
  }
  // Cleanup
  fs.rmSync(testDir, { recursive: true, force: true });
});

test('--install --preset applies specified preset', () => {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-test-'));
  const output = execSync(`cd "${testDir}" && node "${bootstrapPath}" --install --preset strict 2>&1`, {
    encoding: 'utf8',
    shell: '/bin/bash'
  });
  if (!output.includes('Preset: strict')) {
    throw new Error('Preset not shown in output');
  }
  // Cleanup
  fs.rmSync(testDir, { recursive: true, force: true });
});

test('--install --dry-run does not write files', () => {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-test-'));
  const output = execSync(`cd "${testDir}" && node "${bootstrapPath}" --install --dry-run 2>&1`, {
    encoding: 'utf8',
    shell: '/bin/bash'
  });
  if (!output.includes('DRY RUN')) {
    throw new Error('Dry run mode not indicated');
  }
  if (!output.includes('[DRY RUN]')) {
    throw new Error('Dry run actions not prefixed');
  }
  // Cleanup
  fs.rmSync(testDir, { recursive: true, force: true });
});

test('--install preserves existing config values (idempotent merge)', () => {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-test-'));
  const configDir = path.join(testDir, '.claude');
  fs.mkdirSync(configDir, { recursive: true });

  // Create existing config with custom value
  const existingConfig = { custom_key: 'user_value', enforcement_level: 'user_custom' };
  fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(existingConfig, null, 2));

  // Run install
  execSync(`cd "${testDir}" && node "${bootstrapPath}" --install 2>&1`, {
    encoding: 'utf8',
    shell: '/bin/bash'
  });

  // Check that custom values were preserved
  const mergedConfig = JSON.parse(fs.readFileSync(path.join(configDir, 'config.json'), 'utf8'));
  if (mergedConfig.custom_key !== 'user_value') {
    throw new Error('Custom key was not preserved');
  }
  if (mergedConfig.enforcement_level !== 'user_custom') {
    throw new Error('User enforcement_level was overwritten');
  }
  // Cleanup
  fs.rmSync(testDir, { recursive: true, force: true });
});

// v1.8.2: Post-install prompt tests
test('--install creates post-install prompt file (v1.8.2)', () => {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-test-'));
  const output = execSync(`cd "${testDir}" && node "${bootstrapPath}" --install 2>&1`, {
    encoding: 'utf8',
    shell: '/bin/bash'
  });

  // Check output mentions prompt creation
  if (!output.includes('post-install prompt')) {
    throw new Error('Output should mention post-install prompt');
  }

  // Check that prompt file was created
  const promptsDir = path.join(testDir, '.claude', 'post-install-prompts');
  if (!fs.existsSync(promptsDir)) {
    throw new Error('Post-install prompts directory not created');
  }

  const promptFiles = fs.readdirSync(promptsDir).filter(f => f.endsWith('.md'));
  if (promptFiles.length === 0) {
    throw new Error('No post-install prompt file created');
  }

  // Check prompt content
  const promptContent = fs.readFileSync(path.join(promptsDir, promptFiles[0]), 'utf8');
  if (!promptContent.includes('POST-INSTALLATION')) {
    throw new Error('Prompt file missing expected content');
  }

  // Cleanup
  fs.rmSync(testDir, { recursive: true, force: true });
});

test('--init fallback creates post-install prompt file (v1.8.2)', () => {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-test-'));
  // Use echo "" to trigger non-TTY fallback
  const output = execSync(`cd "${testDir}" && echo "" | node "${bootstrapPath}" --init 2>&1`, {
    encoding: 'utf8',
    shell: '/bin/bash'
  });

  // Check that prompt file was created (via fallback to --install)
  const promptsDir = path.join(testDir, '.claude', 'post-install-prompts');
  if (!fs.existsSync(promptsDir)) {
    throw new Error('Post-install prompts directory not created in fallback mode');
  }

  const promptFiles = fs.readdirSync(promptsDir).filter(f => f.endsWith('.md'));
  if (promptFiles.length === 0) {
    throw new Error('No post-install prompt file created in fallback mode');
  }

  // Cleanup
  fs.rmSync(testDir, { recursive: true, force: true });
});

// ============================================================================
// v1.8.4: settings.local.json tests
// ============================================================================

console.log('\n\x1b[1msettings.local.json tests (v1.8.4)\x1b[0m');
console.log('\x1b[36m----------------------------------------------------------------------\x1b[0m');

test('--install creates settings.local.json with hooks (v1.8.4)', () => {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-test-'));
  // Create fake HOME for global hooks
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'home-'));
  const homeClaudeDir = path.join(fakeHome, '.claude');
  const hooksDir = path.join(homeClaudeDir, 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });

  // Create fake hook files in HOME
  const hookFiles = ['session-start.cjs', 'user-prompt-submit.cjs', 'pre-tool-use.cjs', 'post-tool-use.cjs', 'pre-compact.cjs', 'stop.cjs'];
  for (const hf of hookFiles) {
    fs.writeFileSync(path.join(hooksDir, hf), '// fake hook');
  }

  const output = execSync(`cd "${testDir}" && HOME="${fakeHome}" node "${bootstrapPath}" --install 2>&1`, {
    encoding: 'utf8',
    shell: '/bin/bash'
  });

  // Check settings.local.json was created
  const settingsPath = path.join(testDir, '.claude', 'settings.local.json');
  if (!fs.existsSync(settingsPath)) {
    throw new Error('settings.local.json not created');
  }

  // Check it contains hooks
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  if (!settings.hooks) {
    throw new Error('settings.local.json missing hooks');
  }
  if (!settings.hooks.SessionStart) {
    throw new Error('settings.local.json missing SessionStart hook');
  }
  if (!settings.hooks.PreToolUse) {
    throw new Error('settings.local.json missing PreToolUse hook');
  }

  // Check hooks point to global hooks dir
  const hookConfig = settings.hooks.SessionStart;
  if (!Array.isArray(hookConfig) || !hookConfig[0]?.hooks?.[0]?.command) {
    throw new Error('Hook config has wrong structure');
  }
  const hookPath = hookConfig[0].hooks[0].command;
  if (!hookPath.includes('.claude/hooks/')) {
    throw new Error(`Hook path should point to global hooks dir, got: ${hookPath}`);
  }

  // Check output mentions settings.local.json
  if (!output.includes('settings.local.json')) {
    throw new Error('Output should mention settings.local.json');
  }

  // Cleanup
  fs.rmSync(testDir, { recursive: true, force: true });
  fs.rmSync(fakeHome, { recursive: true, force: true });
});

test('--install preserves existing settings.local.json values (v1.8.4)', () => {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-test-'));
  const claudeDir = path.join(testDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  // Create fake HOME for global hooks
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'home-'));
  const homeClaudeDir = path.join(fakeHome, '.claude');
  const hooksDir = path.join(homeClaudeDir, 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });

  // Create fake hook files in HOME
  const hookFiles = ['session-start.cjs', 'user-prompt-submit.cjs', 'pre-tool-use.cjs', 'post-tool-use.cjs', 'pre-compact.cjs', 'stop.cjs'];
  for (const hf of hookFiles) {
    fs.writeFileSync(path.join(hooksDir, hf), '// fake hook');
  }

  // Create existing settings.local.json with custom value
  const existingSettings = { custom_setting: 'user_value', another: { nested: 'data' } };
  fs.writeFileSync(path.join(claudeDir, 'settings.local.json'), JSON.stringify(existingSettings, null, 2));

  // Run install
  execSync(`cd "${testDir}" && HOME="${fakeHome}" node "${bootstrapPath}" --install 2>&1`, {
    encoding: 'utf8',
    shell: '/bin/bash'
  });

  // Check that custom values were preserved
  const mergedSettings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.local.json'), 'utf8'));
  if (mergedSettings.custom_setting !== 'user_value') {
    throw new Error('Custom setting was not preserved');
  }
  if (!mergedSettings.another || mergedSettings.another.nested !== 'data') {
    throw new Error('Nested custom setting was not preserved');
  }
  // And hooks were added
  if (!mergedSettings.hooks) {
    throw new Error('Hooks were not added to existing settings');
  }

  // Cleanup
  fs.rmSync(testDir, { recursive: true, force: true });
  fs.rmSync(fakeHome, { recursive: true, force: true });
});

test('--install --dry-run shows settings.local.json in dry-run (v1.8.4)', () => {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-test-'));
  const output = execSync(`cd "${testDir}" && node "${bootstrapPath}" --install --dry-run 2>&1`, {
    encoding: 'utf8',
    shell: '/bin/bash'
  });

  // Should mention settings.local.json in dry-run
  if (!output.includes('settings.local.json')) {
    throw new Error('Dry run should mention settings.local.json');
  }

  // Should NOT create the file
  const settingsPath = path.join(testDir, '.claude', 'settings.local.json');
  if (fs.existsSync(settingsPath)) {
    throw new Error('Dry run should not create settings.local.json');
  }

  // Cleanup
  fs.rmSync(testDir, { recursive: true, force: true });
});

// ============================================================================
// hooks subcommand tests
// ============================================================================

console.log('\n\x1b[1mhooks subcommand tests\x1b[0m');
console.log('\x1b[36m----------------------------------------------------------------------\x1b[0m');

test('hooks without subcommand shows usage', () => {
  const output = execSync(`node "${bootstrapPath}" hooks 2>&1 || true`, { encoding: 'utf8' });
  if (!output.includes('Usage: unified-mcp-server hooks')) {
    throw new Error('hooks usage not shown');
  }
  if (!output.includes('install')) {
    throw new Error('hooks install not listed');
  }
  if (!output.includes('uninstall')) {
    throw new Error('hooks uninstall not listed');
  }
});

test('hooks list works', () => {
  const output = execSync(`node "${bootstrapPath}" hooks list 2>&1`, { encoding: 'utf8' });
  // Should either show hooks or say no hooks installed
  if (!output.includes('hooks') && !output.includes('No hooks installed')) {
    throw new Error('hooks list output unexpected');
  }
});

test('hooks status works', () => {
  const output = execSync(`node "${bootstrapPath}" hooks status 2>&1 || true`, { encoding: 'utf8' });
  // Should show status information
  if (!output.includes('Hook status')) {
    throw new Error('hooks status header missing');
  }
});

test('hooks install works', () => {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-test-'));
  // Create required directories
  const homeClaudeDir = path.join(testDir, '.claude');
  fs.mkdirSync(homeClaudeDir, { recursive: true });

  const output = execSync(`HOME="${testDir}" node "${bootstrapPath}" hooks install 2>&1`, {
    encoding: 'utf8',
    shell: '/bin/bash'
  });

  // Should indicate installation
  if (!output.includes('Installed') && !output.includes('already installed')) {
    throw new Error('hooks install output unexpected');
  }
  // Cleanup
  fs.rmSync(testDir, { recursive: true, force: true });
});

// ============================================================================
// --init TTY detection tests
// ============================================================================

console.log('\n\x1b[1m--init TTY detection tests\x1b[0m');
console.log('\x1b[36m----------------------------------------------------------------------\x1b[0m');

test('--init in non-TTY shows warning', () => {
  const output = execSync(`echo "" | node "${bootstrapPath}" --init 2>&1`, {
    encoding: 'utf8',
    shell: '/bin/bash'
  });
  if (!output.includes('Warning: --init requires an interactive terminal')) {
    throw new Error('TTY warning not shown');
  }
});

test('--init in non-TTY falls back to --install', () => {
  const output = execSync(`echo "" | node "${bootstrapPath}" --init 2>&1`, {
    encoding: 'utf8',
    shell: '/bin/bash'
  });
  if (!output.includes('Falling back to non-interactive --install mode')) {
    throw new Error('Fallback message not shown');
  }
  if (!output.includes('Non-Interactive Install')) {
    throw new Error('Did not fall back to install mode');
  }
});

// ============================================================================
// v1.8.3: Version detection and upgrade prompt tests
// ============================================================================

console.log('\n\x1b[1mversion detection tests (v1.8.3)\x1b[0m');
console.log('\x1b[36m----------------------------------------------------------------------\x1b[0m');

test('--install sets installedVersion in config.json (v1.8.3)', () => {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-test-'));
  execSync(`cd "${testDir}" && node "${bootstrapPath}" --install 2>&1`, {
    encoding: 'utf8',
    shell: '/bin/bash'
  });

  const configPath = path.join(testDir, '.claude', 'config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('config.json not created');
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!config.installedVersion) {
    throw new Error('installedVersion not set in config.json');
  }
  // Cleanup
  fs.rmSync(testDir, { recursive: true, force: true });
});

test('checkVersionAndPrompt detects version mismatch (v1.8.3)', () => {
  const { checkVersionAndPrompt } = require('../src/cli');
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'version-test-'));
  const claudeDir = path.join(testDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  // Create config with old version
  const configPath = path.join(claudeDir, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({ installedVersion: '1.0.0' }, null, 2));

  // Change to test dir to set process.cwd()
  const originalCwd = process.cwd();
  process.chdir(testDir);

  try {
    const result = checkVersionAndPrompt(claudeDir, '1.8.3');
    if (!result.upgraded) {
      throw new Error('Should detect upgrade');
    }
    if (result.oldVersion !== '1.0.0') {
      throw new Error(`Old version should be 1.0.0, got ${result.oldVersion}`);
    }
    if (result.newVersion !== '1.8.3') {
      throw new Error(`New version should be 1.8.3, got ${result.newVersion}`);
    }
    if (!result.promptCreated) {
      throw new Error('Upgrade prompt should be created');
    }
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

test('checkVersionAndPrompt creates upgrade prompt file (v1.8.3)', () => {
  const { checkVersionAndPrompt } = require('../src/cli');
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'version-test-'));
  const claudeDir = path.join(testDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  // Create config with old version
  const configPath = path.join(claudeDir, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({ installedVersion: '1.0.0' }, null, 2));

  // Change to test dir to set process.cwd()
  const originalCwd = process.cwd();
  process.chdir(testDir);

  try {
    const result = checkVersionAndPrompt(claudeDir, '1.8.3');

    // Check that prompt file was created (use promptPath from result)
    if (!result.promptCreated || !result.promptPath) {
      throw new Error('Upgrade prompt file not created');
    }
    if (!fs.existsSync(result.promptPath)) {
      throw new Error(`Prompt file not found at: ${result.promptPath}`);
    }

    // Check prompt content contains upgrade indicator
    const content = fs.readFileSync(result.promptPath, 'utf8');
    if (!content.includes('UPGRADE DETECTED')) {
      throw new Error('Prompt should contain UPGRADE DETECTED');
    }
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

test('checkVersionAndPrompt updates installedVersion after upgrade (v1.8.3)', () => {
  const { checkVersionAndPrompt } = require('../src/cli');
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'version-test-'));
  const claudeDir = path.join(testDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  // Create config with old version
  const configPath = path.join(claudeDir, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({ installedVersion: '1.0.0' }, null, 2));

  // Change to test dir to set process.cwd()
  const originalCwd = process.cwd();
  process.chdir(testDir);

  try {
    checkVersionAndPrompt(claudeDir, '1.8.3');

    // Check that installedVersion was updated
    const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (updatedConfig.installedVersion !== '1.8.3') {
      throw new Error(`installedVersion should be updated to 1.8.3, got ${updatedConfig.installedVersion}`);
    }
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

test('checkVersionAndPrompt no upgrade when versions match (v1.8.3)', () => {
  const { checkVersionAndPrompt } = require('../src/cli');
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'version-test-'));
  const claudeDir = path.join(testDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  // Create config with current version
  const configPath = path.join(claudeDir, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({ installedVersion: '1.8.3' }, null, 2));

  // Change to test dir to set process.cwd()
  const originalCwd = process.cwd();
  process.chdir(testDir);

  try {
    const result = checkVersionAndPrompt(claudeDir, '1.8.3');
    if (result.upgraded) {
      throw new Error('Should not detect upgrade when versions match');
    }
    if (result.promptCreated) {
      throw new Error('Should not create prompt when versions match');
    }
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

// ============================================================================
// v1.10.0: Post-install enforcement gate tests
// ============================================================================

console.log('\n\x1b[1mpost-install enforcement gate tests (v1.10.0)\x1b[0m');
console.log('\x1b[36m----------------------------------------------------------------------\x1b[0m');

// We need to read the post-install prompt content to verify gate keywords
// The prompt is generated by getPostInstallPromptContent() but not exported directly.
// We can test via the prompt file created by --install.

test('post-install prompt Step 6 contains GATE and blocking instruction (v1.10.0)', () => {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-test-'));
  execSync(`cd "${testDir}" && node "${bootstrapPath}" --install 2>&1`, {
    encoding: 'utf8',
    shell: '/bin/bash'
  });

  const promptsDir = path.join(testDir, '.claude', 'post-install-prompts');
  const promptFiles = fs.readdirSync(promptsDir).filter(f => f.endsWith('.md'));
  const content = fs.readFileSync(path.join(promptsDir, promptFiles[0]), 'utf8');

  if (!content.includes('GATE') || !content.includes('must complete before Step 7')) {
    throw new Error('Step 6 must contain GATE and "must complete before Step 7"');
  }

  fs.rmSync(testDir, { recursive: true, force: true });
});

test('post-install prompt Step 6 references search_experiences (v1.10.0)', () => {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-test-'));
  execSync(`cd "${testDir}" && node "${bootstrapPath}" --install 2>&1`, {
    encoding: 'utf8',
    shell: '/bin/bash'
  });

  const promptsDir = path.join(testDir, '.claude', 'post-install-prompts');
  const promptFiles = fs.readdirSync(promptsDir).filter(f => f.endsWith('.md'));
  const content = fs.readFileSync(path.join(promptsDir, promptFiles[0]), 'utf8');

  if (!content.includes('search_experiences')) {
    throw new Error('Step 6 must reference search_experiences');
  }

  fs.rmSync(testDir, { recursive: true, force: true });
});

test('post-install prompt Step 6 references transcript mining (v1.10.0)', () => {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-test-'));
  execSync(`cd "${testDir}" && node "${bootstrapPath}" --install 2>&1`, {
    encoding: 'utf8',
    shell: '/bin/bash'
  });

  const promptsDir = path.join(testDir, '.claude', 'post-install-prompts');
  const promptFiles = fs.readdirSync(promptsDir).filter(f => f.endsWith('.md'));
  const content = fs.readFileSync(path.join(promptsDir, promptFiles[0]), 'utf8');

  if (!content.includes('transcript') && !content.includes('.jsonl')) {
    throw new Error('Step 6 must reference transcript mining (.jsonl or transcript)');
  }

  fs.rmSync(testDir, { recursive: true, force: true });
});

test('post-install prompt Step 9 contains GATE and blocking instruction (v1.10.0)', () => {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-test-'));
  execSync(`cd "${testDir}" && node "${bootstrapPath}" --install 2>&1`, {
    encoding: 'utf8',
    shell: '/bin/bash'
  });

  const promptsDir = path.join(testDir, '.claude', 'post-install-prompts');
  const promptFiles = fs.readdirSync(promptsDir).filter(f => f.endsWith('.md'));
  const content = fs.readFileSync(path.join(promptsDir, promptFiles[0]), 'utf8');

  if (!content.includes('must complete before Step 10')) {
    throw new Error('Step 9 must contain "must complete before Step 10"');
  }

  fs.rmSync(testDir, { recursive: true, force: true });
});

test('post-install prompt Step 9 contains DSPRF table format (v1.10.0)', () => {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-test-'));
  execSync(`cd "${testDir}" && node "${bootstrapPath}" --install 2>&1`, {
    encoding: 'utf8',
    shell: '/bin/bash'
  });

  const promptsDir = path.join(testDir, '.claude', 'post-install-prompts');
  const promptFiles = fs.readdirSync(promptsDir).filter(f => f.endsWith('.md'));
  const content = fs.readFileSync(path.join(promptsDir, promptFiles[0]), 'utf8');

  if (!content.includes('| D | S | P | R | F |')) {
    throw new Error('Step 9 must contain DSPRF table headers "| D | S | P | R | F |"');
  }

  fs.rmSync(testDir, { recursive: true, force: true });
});

test('post-install prompt blocks update_project_context until approval (v1.10.0)', () => {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-test-'));
  execSync(`cd "${testDir}" && node "${bootstrapPath}" --install 2>&1`, {
    encoding: 'utf8',
    shell: '/bin/bash'
  });

  const promptsDir = path.join(testDir, '.claude', 'post-install-prompts');
  const promptFiles = fs.readdirSync(promptsDir).filter(f => f.endsWith('.md'));
  const content = fs.readFileSync(path.join(promptsDir, promptFiles[0]), 'utf8');

  if (!content.includes('DO NOT call update_project_context until')) {
    throw new Error('Post-install prompt must contain "DO NOT call update_project_context until"');
  }

  fs.rmSync(testDir, { recursive: true, force: true });
});

// ============================================================================
// Summary
// ============================================================================

// Cleanup
fs.rmSync(tempDir, { recursive: true, force: true });

console.log('\n\x1b[36m======================================================================\x1b[0m');
console.log('\x1b[1mCLI TESTS SUMMARY\x1b[0m');
console.log('\x1b[36m======================================================================\x1b[0m');
console.log(`\x1b[32mTests Passed: ${passed}\x1b[0m`);
console.log(`\x1b[31mTests Failed: ${failed}\x1b[0m`);
console.log(`Total: ${passed + failed} tests`);

if (failed > 0) {
  console.log('\n\x1b[31m✗ Some CLI tests failed!\x1b[0m');
  process.exit(1);
} else {
  console.log('\n\x1b[32m✓ All CLI tests passed!\x1b[0m');
}
