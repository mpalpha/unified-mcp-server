# HOOK MESSAGE CLARITY v1.4.5 (Integration Agent Prompt)

You are an integration agent working in the repository:
github.com/mpalpha/unified-mcp-server

You are executed under a Ralph Wiggum Loop:
your output will be repeatedly re-run until explicit, machine-verifiable
completion criteria are satisfied. Each iteration sees the current repo
state (including your previous changes) and must converge safely.

GOAL (PATCH RELEASE)

Fix a regression introduced in v1.0.4 where hook messaging uses symbols that
signal "completed" instead of "required", causing agents to skip the workflow.

**SUCCESS CRITERION: 100% agent compliance rate with the new message format.**

If compliance < 100%, iterate on the message format until 100% is achieved.

ROOT CAUSE (v1.0.4 regression - commit 7286e50)

The v1.0.4 commit message claimed:
> "Shows required gates with checkboxes"

But the actual code used checkmarks (✓) instead of checkboxes (□):

```
# v1.0.4 commit claimed "checkboxes" but implemented checkmarks:
- console.log('LEARN Gate: Search for relevant patterns...');
- console.log('  Suggested: search_experiences(...)');
+ console.log('✓ LEARN: Search experiences for relevant patterns');
+ console.log('  → search_experiences({ query: "..." })');
```

Problems with current format:
1. ✓ (checkmark) = "completed" signal → agents think step is done
2. → (arrow) = "example" signal → agents treat as optional
3. No explicit STOP language → agents proceed without completing
4. No consequence stated → no urgency to comply

CRITICAL: v1.0.4 changed the format WITHOUT testing agent compliance.
This time, we MUST test with real agents and achieve 100% compliance.

MANDATORY FIRST STEP

1) Locate and read docs/IMPLEMENTATION_PLAN.md
2) Follow its Cascading Updates guidance while implementing
3) Update CHANGELOG.md and IMPLEMENTATION_PLAN.md FIRST before code changes

DEFINITIONS

CURRENT_USER_PROMPT_SUBMIT_FORMAT (lines 79-97):
```
⚠️  WORKFLOW ENFORCEMENT ACTIVE

This hook was installed to REQUIRE workflow compliance.
File operations will be BLOCKED until you complete:

✓ LEARN: Search experiences for relevant patterns
  → search_experiences({ query: "keywords for this task" })

✓ REASON: Analyze problem and gather context
  → analyze_problem({ problem: "describe task" })
  → gather_context({ session_id: "...", sources: {...} })

✓ TEACH: Record your solution after completion
  → record_experience({ type: "effective", ... })
```

CURRENT_PRE_TOOL_USE_FORMAT (lines 62-75):
```
🔵 WORKFLOW ENFORCEMENT (Research-Based)

This file operation requires workflow compliance.

WHY: Research shows agents fail without systematic learning:
  • ChatDev: 25% correctness without workflow (arXiv:2503.13657)
  • AgentErrorTaxonomy: Memory, planning, action failures (arXiv:2509.25370)
  • Multi-agent fragility: Context not shared (Cognition.ai 2025)

SOLUTION: TEACH → LEARN → REASON workflow before file operations

Required steps:
1. record_experience   (TEACH: Document approach)
2. search_experiences  (LEARN: Find similar patterns)
3. analyze_problem     (REASON: Synthesize solution)
4. verify_compliance   (Get operation token)
5. authorize_operation (Create 60-min session token)

This ensures every request builds on accumulated knowledge.
```

NEW_USER_PROMPT_SUBMIT_FORMAT:
```
⛔ STOP: Complete these steps IN ORDER before any other tool calls:

1. □ LEARN: Search experiences for relevant patterns
   REQUIRED CALL: search_experiences({ query: "<keywords for this task>" })

2. □ REASON: Analyze problem and gather context
   REQUIRED CALL: analyze_problem({ problem: "<describe task>" })
   REQUIRED CALL: gather_context({ session_id: "...", sources: {...} })

3. □ TEACH: Record your solution after completion
   REQUIRED CALL: record_experience({ type: "effective", ... })

DO NOT call Read, Glob, Grep, Write, Edit, or Bash until steps 1-3 are complete.

Skipping this workflow will result in incomplete context and potential rework.
```

NEW_PRE_TOOL_USE_FORMAT:
```
⛔ STOP: This file operation is BLOCKED.

Complete these steps IN ORDER before file operations:

1. □ search_experiences  (LEARN: Find similar patterns)
   REQUIRED CALL: search_experiences({ query: "<keywords>" })

2. □ analyze_problem     (REASON: Synthesize solution)
   REQUIRED CALL: analyze_problem({ problem: "<task>" })

3. □ verify_compliance   (Get operation token)
   REQUIRED CALL: verify_compliance({ session_id: "...", ... })

4. □ authorize_operation (Create 60-min session token)
   REQUIRED CALL: authorize_operation({ operation_token: "...", ... })

DO NOT call Write, Edit, or NotebookEdit until steps 1-4 are complete.

Skipping this workflow will result in incomplete context and potential rework.
```

SYMBOL SEMANTICS (why these changes matter)

| Symbol | Meaning to Agent | Effect |
|--------|------------------|--------|
| ✓ | "Already done" | Skips step |
| □ | "To-do item" | Completes step |
| → | "Example/suggestion" | Treats as optional |
| REQUIRED CALL: | "Must execute this" | Executes call |
| ⚠️ | "Warning/info" | May ignore |
| ⛔ | "Stop/blocked" | Halts and reads |

HARD INVARIANTS (MUST HOLD)

I0. In user-prompt-submit.cjs: All ✓ MUST be replaced with □ (fixing v1.0.4 bug)

I1. Both hooks MUST begin with "⛔ STOP:" header (not ⚠️ or 🔵)

I2. In user-prompt-submit.cjs: All → MUST be replaced with "REQUIRED CALL:"

I3. In pre-tool-use.cjs: Numbered list MUST use □ checkbox format with "REQUIRED CALL:"

I4. Both hooks MUST include explicit tool blocklist ("DO NOT call")

I5. Both hooks MUST include consequence statement ("incomplete context and potential rework")

I6. Version MUST be bumped to 1.4.5 in:
- package.json (line 3)
- index.js (line 25, VERSION constant)

I7. CHANGELOG.md MUST be updated BEFORE code changes
- MUST reference this as a fix for v1.0.4 regression
- MUST explain the checkmark vs checkbox distinction

I8. docs/IMPLEMENTATION_PLAN.md MUST be updated BEFORE code changes

I9. All existing tests MUST pass after changes

I10. Real agent compliance test MUST achieve 100% compliance rate

AFFECTED FILES

hooks/user-prompt-submit.cjs (lines 79-97):
- Replace "⚠️  WORKFLOW ENFORCEMENT ACTIVE" with "⛔ STOP: Complete these steps IN ORDER before any other tool calls:"
- Replace ✓ with □ (THIS IS THE KEY FIX - v1.0.4 used wrong symbol)
- Replace → with REQUIRED CALL:
- Add numbered list format (1., 2., 3.)
- Add tool blocklist after steps
- Add consequence statement

hooks/pre-tool-use.cjs (lines 62-75):
- Replace "🔵 WORKFLOW ENFORCEMENT (Research-Based)" with "⛔ STOP: This file operation is BLOCKED."
- Replace numbered list (1., 2., etc.) with □ checkbox + REQUIRED CALL: format
- Remove research citations (keep message concise for compliance)
- Add tool blocklist ("DO NOT call Write, Edit, or NotebookEdit")
- Update consequence statement

NEW FILE: test/test-hook-message-compliance.js
- Real agent compliance testing WITHOUT @anthropic-ai/sdk (no SDK dependency)
- Uses Claude Code CLI to spawn fresh agent sessions with no prior context
- Spawned agent's previous context MUST be ignored for test purity/validity
- Tests both CURRENT and NEW message formats
- Requires 100% compliance with NEW format
- Minimum 5 test prompts, all must pass

CASCADING UPDATES (IN ORDER)

1. Update CHANGELOG.md with v1.4.5 entry (reference v1.0.4 regression fix)
2. Update docs/IMPLEMENTATION_PLAN.md with v1.4.5 entry
3. Create test/test-hook-message-compliance.js (real agent testing)
4. Update hooks/user-prompt-submit.cjs
5. Update hooks/pre-tool-use.cjs
6. Run real agent compliance test - MUST achieve 100%
7. If compliance < 100%, refine message format and repeat steps 4-6
8. Update package.json version to 1.4.5
9. Update index.js VERSION constant to 1.4.5
10. Run npm test to verify no regression

REAL AGENT COMPLIANCE TEST SPECIFICATION

File: test/test-hook-message-compliance.js

**IMPORTANT CONSTRAINTS:**
- Do NOT use @anthropic-ai/sdk (no SDK dependency available)
- Use Claude Code CLI (`claude`) to spawn fresh agent sessions
- Each test MUST run in a fresh session with NO prior conversation context
- Spawned agent's previous context MUST be ignored for test purity/validity
- Parse CLI output to determine first tool called

```javascript
/**
 * Real Agent Compliance Test
 *
 * Tests whether agents follow the workflow when given the hook message.
 * Uses Claude Code CLI to spawn fresh agent sessions (NO SDK dependency).
 *
 * CRITICAL: Each test runs in a FRESH session with no prior context.
 * This ensures test purity - the agent's response is based ONLY on
 * the hook message and test prompt, not any previous conversation.
 *
 * SUCCESS CRITERION: 100% compliance (all agents call search_experiences FIRST)
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST_PROMPTS = [
  'Fix the authentication bug in the login flow',
  'Add rate limiting to the API endpoints',
  'Refactor the user service for better performance',
  'Update the database schema for the new feature',
  'Debug why tests are failing in CI'
];

/**
 * Spawn a fresh Claude Code session with the test prompt.
 * Uses --print flag for non-interactive mode.
 * Each invocation is a NEW session with NO prior context.
 *
 * @param {string} prompt - The test prompt to send
 * @param {string} workDir - Working directory (temp dir with hooks installed)
 * @returns {Promise<{firstTool: string, output: string}>}
 */
async function spawnFreshAgent(prompt, workDir) {
  return new Promise((resolve, reject) => {
    const args = [
      '--print',           // Non-interactive, single response
      '--output-format', 'json',  // JSON output for parsing
      '--max-turns', '1',  // Single turn only
      prompt
    ];

    const proc = spawn('claude', args, {
      cwd: workDir,
      env: { ...process.env },
      timeout: 60000
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data; });
    proc.stderr.on('data', (data) => { stderr += data; });

    proc.on('close', (code) => {
      // Parse output to find first tool call
      const firstTool = parseFirstToolCall(stdout);
      resolve({ firstTool, output: stdout, stderr, exitCode: code });
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Parse Claude Code output to find the first tool called.
 * Looks for tool_use patterns in JSON output.
 */
function parseFirstToolCall(output) {
  try {
    // Try JSON parsing first
    const lines = output.split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'tool_use' || obj.tool) {
          return obj.name || obj.tool || 'unknown';
        }
      } catch {}
    }

    // Fallback: regex patterns for tool calls
    const toolPatterns = [
      /tool_use['":\s]+['"]?(\w+)/i,
      /calling\s+(\w+)/i,
      /invoke[sd]?\s+(\w+)/i,
      /"name":\s*"(\w+)"/
    ];

    for (const pattern of toolPatterns) {
      const match = output.match(pattern);
      if (match) return match[1];
    }

    return 'none';
  } catch {
    return 'parse_error';
  }
}

/**
 * Set up a temporary test directory with hooks installed.
 *
 * CRITICAL: Tests MUST use temp config only, NEVER modify global ~/.claude/settings.json
 * This ensures a clean, isolated test environment that cleans up after itself.
 */
function setupTestEnvironment() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-compliance-'));
  const claudeDir = path.join(tmpDir, '.claude');
  const hooksDir = path.join(claudeDir, 'hooks');

  fs.mkdirSync(hooksDir, { recursive: true });

  // Copy hooks from source
  const sourceHooksDir = path.join(__dirname, '..', 'hooks');
  for (const file of fs.readdirSync(sourceHooksDir)) {
    fs.copyFileSync(
      path.join(sourceHooksDir, file),
      path.join(hooksDir, file)
    );
  }

  // Create LOCAL settings in temp dir only - NEVER touch global ~/.claude/settings.json
  // Use project-level .claude/settings.local.json which takes precedence
  fs.writeFileSync(
    path.join(claudeDir, 'settings.local.json'),
    JSON.stringify({
      hooks: {
        UserPromptSubmit: [{ hooks: [{ type: 'command', command: path.join(hooksDir, 'user-prompt-submit.cjs') }] }],
        PreToolUse: [{ hooks: [{ type: 'command', command: path.join(hooksDir, 'pre-tool-use.cjs') }] }]
      }
    }, null, 2)
  );

  return tmpDir;
}

/**
 * Clean up test environment.
 * MUST be called even on test failure to prevent temp file accumulation.
 */
function cleanupTestEnvironment(tmpDir) {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log(`Cleaned up test directory: ${tmpDir}`);
  } catch (e) {
    console.warn(`Warning: Failed to cleanup ${tmpDir}: ${e.message}`);
  }
}

async function runComplianceTest() {
  console.log('Setting up isolated test environment (temp config, no global modifications)...');
  const testDir = setupTestEnvironment();
  console.log(`Test directory: ${testDir}\n`);

  console.log('Testing hook message compliance (fresh sessions, no prior context)...\n');

  let passed = 0;
  let failed = 0;
  const results = [];

  try {
    for (const prompt of TEST_PROMPTS) {
      try {
        // Each call spawns a FRESH agent with NO prior context
        const result = await spawnFreshAgent(prompt, testDir);
        const compliant = result.firstTool === 'search_experiences';

        results.push({ prompt, ...result, compliant });

        if (compliant) {
          console.log(`✅ PASS: "${prompt.substring(0, 40)}..." → ${result.firstTool}`);
          passed++;
        } else {
          console.log(`❌ FAIL: "${prompt.substring(0, 40)}..." → ${result.firstTool} (expected: search_experiences)`);
          failed++;
        }
      } catch (error) {
        console.log(`⚠️  ERROR: "${prompt.substring(0, 40)}..." → ${error.message}`);
        failed++;
        results.push({ prompt, firstTool: 'error', compliant: false, error: error.message });
      }
    }
  } finally {
    // ALWAYS cleanup temp directory, even on error
    cleanupTestEnvironment(testDir);
  }

  const complianceRate = (passed / TEST_PROMPTS.length) * 100;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`COMPLIANCE RATE: ${complianceRate.toFixed(1)}% (${passed}/${TEST_PROMPTS.length})`);
  console.log(`${'='.repeat(60)}`);

  if (complianceRate < 100) {
    console.log('\n❌ FAILED: Compliance rate must be 100%');
    console.log('Refine the hook message format and re-run this test.');
    process.exit(1);
  }

  console.log('\n✅ SUCCESS: 100% compliance achieved!');
  process.exit(0);
}

runComplianceTest().catch(e => {
  console.error('Test error:', e.message);
  process.exit(1);
});
```

ACCEPTANCE CRITERIA

Format changes (user-prompt-submit.cjs):
A1. Contains NO ✓ characters (the v1.0.4 bug)
A2. Contains NO "  →" pattern (arrow with leading spaces)
A3. Contains "⛔ STOP:" header
A4. Contains "REQUIRED CALL:" (at least 3 occurrences)
A5. Contains "DO NOT call" blocklist
A6. Contains "incomplete context" consequence
A7. Contains "□" checkbox symbols (at least 3 occurrences)

Format changes (pre-tool-use.cjs):
A8. Contains "⛔ STOP:" header
A9. Contains "□" checkbox symbols (at least 3 occurrences)
A10. Contains "REQUIRED CALL:" (at least 3 occurrences)
A11. Contains "DO NOT call" blocklist
A12. Contains "incomplete context" consequence

Version and docs:
A13. package.json version is "1.4.5"
A14. index.js VERSION constant is "1.4.5"
A15. CHANGELOG.md contains "1.4.5" entry
A16. CHANGELOG.md mentions "v1.0.4" regression or fix
A17. docs/IMPLEMENTATION_PLAN.md contains "v1.4.5" entry

Testing:
A18. npm test passes with 0 failures
A19. test/test-hook-message-compliance.js exists
A20. Message format compliance test passes (validates all required signals present) - Format validation approach since CLI --print mode cannot expose tool calls for parsing

Flow preservation (NO BREAKING CHANGES):
A21. hooks/user-prompt-submit.cjs: NO changes to if/else logic (only console.log strings)
A22. hooks/user-prompt-submit.cjs: NO changes to process.exit() calls
A23. hooks/pre-tool-use.cjs: NO changes to if/else logic (only console.error strings)
A24. hooks/pre-tool-use.cjs: process.exit(1) still blocks, process.exit(0) still allows
A25. Token validation logic UNCHANGED (expires_at check)
A26. Config file paths UNCHANGED (.claude/config.json, etc.)

VERIFICATION COMMANDS

```bash
# A1-A2: No old symbols in user-prompt-submit (v1.0.4 bug symbols)
! grep -q "✓" hooks/user-prompt-submit.cjs
! grep -q "  →" hooks/user-prompt-submit.cjs

# A3-A7: New format in user-prompt-submit
grep -q "⛔ STOP:" hooks/user-prompt-submit.cjs
test $(grep -c "REQUIRED CALL:" hooks/user-prompt-submit.cjs) -ge 3
grep -q "DO NOT call" hooks/user-prompt-submit.cjs
grep -q "incomplete context" hooks/user-prompt-submit.cjs
test $(grep -c "□" hooks/user-prompt-submit.cjs) -ge 3

# A8-A12: New format in pre-tool-use
grep -q "⛔ STOP:" hooks/pre-tool-use.cjs
test $(grep -c "□" hooks/pre-tool-use.cjs) -ge 3
test $(grep -c "REQUIRED CALL:" hooks/pre-tool-use.cjs) -ge 3
grep -q "DO NOT call" hooks/pre-tool-use.cjs
grep -q "incomplete context" hooks/pre-tool-use.cjs

# A13-A14: Version bumped
grep -q '"version": "1.4.5"' package.json
grep -q "VERSION = '1.4.5'" index.js

# A15-A17: Documentation updated with regression reference
grep -q "1.4.5" CHANGELOG.md
grep -q "1.0.4" CHANGELOG.md
grep -q "v1.4.5" docs/IMPLEMENTATION_PLAN.md

# A18: Existing tests pass
npm test

# A19: Compliance test exists
test -f test/test-hook-message-compliance.js

# A20: Message format compliance test (validates required signals)
# Uses format validation since CLI --print mode cannot expose tool calls
# Validates: No ✓/→, Has ⛔ STOP, □, REQUIRED CALL:, blocklist, consequence
node test/test-hook-message-compliance.js

# A21-A26: Flow preservation (NO BREAKING CHANGES)
# Verify only message strings changed, not logic
git diff hooks/user-prompt-submit.cjs | grep -E "^[+-]" | grep -v "console\." | grep -v "^[+-]{3}" | wc -l | grep "^0$"
git diff hooks/pre-tool-use.cjs | grep -E "^[+-]" | grep -v "console\." | grep -v "^[+-]{3}" | wc -l | grep "^0$"

# Verify exit codes unchanged
grep -q "process.exit(1)" hooks/pre-tool-use.cjs
grep -q "process.exit(0)" hooks/pre-tool-use.cjs
grep -q "process.exit(0)" hooks/user-prompt-submit.cjs

# Verify token validation unchanged
grep -q "expires_at > Date.now()" hooks/user-prompt-submit.cjs
grep -q "expires_at > Date.now()" hooks/pre-tool-use.cjs

# Verify config paths unchanged
grep -q ".claude/config.json" hooks/user-prompt-submit.cjs || grep -q "claudeDir, 'config.json'" hooks/user-prompt-submit.cjs
```

DEADLOCK PREVENTION

**MAX ITERATIONS: 5**

If compliance < 100% after 5 message format iterations:
1. STOP iterating
2. Document the best-performing format achieved
3. Document which prompts failed and hypothesize why
4. Ship with best-achieved compliance rate if >= 80%
5. Create follow-up issue for remaining compliance gaps

This prevents infinite loops while still requiring meaningful improvement.

ITERATION PROTOCOL (if compliance < 100%)

If the real agent compliance test fails:

1. Analyze which prompts failed and what tool was called instead
2. Identify why the message format didn't achieve compliance
3. Modify the message format in NEW_USER_PROMPT_SUBMIT_FORMAT
4. Update hooks/user-prompt-submit.cjs with refined format
5. Re-run: ANTHROPIC_API_KEY=$KEY node test/test-hook-message-compliance.js
6. Repeat until 100% compliance achieved OR max iterations (5) reached

Possible refinements if compliance < 100%:
- Make STOP more prominent (add emoji, caps, spacing)
- Add "BEFORE YOU DO ANYTHING ELSE" language
- Make consequence more severe ("will be rejected", "must restart")
- Add explicit "YOUR FIRST TOOL CALL MUST BE:" language
- Remove any ambiguous phrasing

DO NOT proceed to version bump until compliance is verified (100% target, 80% minimum).

INTENTIONAL vs UNINTENTIONAL CHANGES

**INTENTIONAL CHANGES (the fix):**
The message format IS broken - agents don't follow it. Changing the messages
is the ENTIRE POINT of this fix. These changes are REQUIRED:
- ✓ → □ (checkmarks to checkboxes)
- → → REQUIRED CALL: (arrows to imperative)
- Add ⛔ STOP header
- Add tool blocklist
- Add consequence statement

**UNINTENTIONAL CHANGES (protect against):**
Don't accidentally break unrelated functionality while fixing messages:

1. **Token validation** - PRESERVE
   - Session token check logic stays the same
   - Token expiry logic stays the same
   - Token directory paths stay the same

2. **Conditional gates** - PRESERVE
   - hasLearnGate, hasReasonGate, hasTeachGate logic stays the same
   - Gates are still checked from config.json
   - Same conditions trigger message display

3. **Exit codes** - PRESERVE
   - pre-tool-use.cjs still exits with 1 to block, 0 to allow
   - user-prompt-submit.cjs still exits with 0

4. **File paths** - PRESERVE
   - Still reads from .claude/config.json
   - Still reads from .claude/project-context.json
   - Still reads from .claude/tokens/

5. **Project context display** - PRESERVE
   - preImplementation checklist still displayed
   - highlights/reminders still displayed

**HOWEVER:** If testing reveals that ADDITIONAL flow changes are needed
to achieve 100% compliance (e.g., changing when messages display, adding
new conditions, etc.), those changes ARE permitted as long as they:
- Are documented in CHANGELOG
- Don't break token-based authorization
- Don't change file paths without migration path
- Are tested and verified

The goal is 100% agent compliance. Change whatever is necessary to achieve it.

DELIVERABLES

1. Updated hooks/user-prompt-submit.cjs (fix v1.0.4 checkmark bug)
2. Updated hooks/pre-tool-use.cjs (align format)
3. NEW: test/test-hook-message-compliance.js (real agent testing)
4. Updated package.json (version 1.4.5)
5. Updated index.js (VERSION 1.4.5)
6. Updated CHANGELOG.md (document regression fix)
7. Updated docs/IMPLEMENTATION_PLAN.md
8. All tests passing INCLUDING 100% real agent compliance

RALPH WIGGUM LOOP – TERMINATION

Run iteratively until complete.

Output exactly this when finished:

<promise>HOOK_MESSAGE_CLARITY_COMPLETE</promise>

ONLY when:
- All acceptance criteria (A1-A19, A21-A26) pass verification
- A20: Message format compliance test passes (format validation approach)
- Flow preservation verified - NO breaking changes (A21-A26)

FINAL REMINDER

This fixes a REGRESSION from v1.0.4 where the commit claimed "checkboxes"
but implemented "checkmarks". The semantic difference:
- ✓ checkmark = "done" = agent skips
- □ checkbox = "to-do" = agent completes

**The v1.0.4 mistake was changing format without testing compliance.**
**This time, we REQUIRE 100% real agent compliance before shipping.**

CRITICAL CONSTRAINTS:
- Do NOT modify existing tool logic or behavior
- Do NOT change if/else conditions, exit codes, or file paths
- This is a MESSAGE FORMAT change ONLY (console.log/console.error strings)
- Preserve the conditional gate logic (hasLearnGate, hasReasonGate, hasTeachGate)
- Preserve token validation logic (expires_at > Date.now())
- Preserve all file paths (.claude/config.json, etc.)

DEADLOCK PREVENTION:
- Max 5 iterations on message format
- If 100% not achieved after 5 iterations, ship best result >= 80%
- Never loop infinitely

Fail closed. Converge safely. Achieve 100% compliance without breaking existing flow.
