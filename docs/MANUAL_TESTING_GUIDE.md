# Manual Testing Guide - Real Agent Workflow Verification

This guide shows how to test that a real Claude Code agent follows the three-gate workflow properly when using this MCP server.

## Prerequisites

1. Install the server: `npm install` in this directory
2. Configure Claude Code MCP settings:
   ```json
   {
     "mcpServers": {
       "unified-mcp": {
         "command": "node",
         "args": ["/absolute/path/to/unified-mcp-server/index.js"]
       }
     }
   }
   ```
3. Install hooks: `node index.js --init` (hooks auto-install to `~/.claude/hooks/`)
4. Hooks are automatically configured in `~/.claude/settings.json` during installation
5. Restart Claude Code

## Test 1: Agent Bug Fix Workflow

**Objective:** Verify agent follows TEACH → LEARN → REASON before making file changes.

### Setup
```bash
# Clean state
rm -rf .claude/data.db .claude/tokens/*
```

### Test Steps

1. **Start a conversation in Claude Code:**
   ```
   I need to fix a bug where user authentication fails with a 401 error
   even when credentials are correct. The issue is in src/auth/validator.js
   where the JWT token expiry check uses local time instead of UTC.
   ```

2. **Observe agent behavior - it SHOULD:**

   ✅ **TEACH Phase (Gate 1):**
   - Call `record_experience` to document the bug pattern
   - Parameters should include:
     - `type: "effective"`
     - `domain: "Debugging"`
     - `situation`: describes the 401 auth bug
     - `approach`: describes the JWT timezone fix

   ✅ **LEARN Phase (Gate 2):**
   - Call `search_experiences` to find similar issues
   - Query like: "authentication JWT token timezone"
   - Review results before proceeding

   ✅ **REASON Phase (Gate 3):**
   - Call `analyze_problem` to create reasoning session
   - Call `gather_context` if needed
   - Call `reason_through` with analysis
   - Call `finalize_decision` with conclusion

   ✅ **Authorization:**
   - Call `verify_compliance` with `current_phase: "reason"`
   - Call `authorize_operation` with the operation token
   - Receive session token

   ✅ **File Operation:**
   - NOW call `Edit` or `Write` to fix the file
   - Hook should allow because session token exists

3. **Agent SHOULD NOT:**

   ❌ Try to call `Edit` or `Write` before completing the workflow
   ❌ Skip any of the three gates
   ❌ Make assumptions without searching for prior knowledge

### Expected Hook Behavior

- **user-prompt-submit hook**: Displays workflow guidance
- **pre-tool-use hook**:
  - BLOCKS `Edit`/`Write` if no session token exists
  - ALLOWS `Edit`/`Write` after workflow completion
- **post-tool-use hook**: Suggests recording the outcome

### Verification

Check the workflow was followed:
```bash
# Check experiences were recorded
echo "SELECT * FROM experiences ORDER BY created_at DESC LIMIT 5;" | sqlite3 .claude/data.db

# Check reasoning session
echo "SELECT * FROM reasoning_sessions ORDER BY created_at DESC LIMIT 1;" | sqlite3 .claude/data.db

# Check tokens were created
ls -la .claude/tokens/
```

Expected output:
- At least 1 experience in TEACH phase
- 1 reasoning session
- 1 session token file (during active session)

## Test 2: New Feature Implementation

**Objective:** Verify agent uses workflow for new feature development.

### Setup
```bash
# Clean state
rm -rf .claude/data.db .claude/tokens/*
```

### Test Steps

1. **Prompt:**
   ```
   Add a rate limiting feature to the API. It should use a sliding window
   algorithm and store counts in Redis. Limit to 100 requests per minute
   per user.
   ```

2. **Expected agent workflow:**

   1. **TEACH**: `record_experience` about rate limiting patterns
   2. **LEARN**: `search_experiences` for "rate limiting API Redis"
   3. **REASON**:
      - `analyze_problem` → get session_id
      - `gather_context` with search results
      - `reason_through` to evaluate approach
      - `finalize_decision` with implementation plan
   4. **AUTHORIZE**: `verify_compliance` → `authorize_operation`
   5. **IMPLEMENT**: Create/edit files

3. **Observe:**
   - Agent should NOT jump straight to creating files
   - Should research existing patterns first
   - Should reason through the approach
   - Should explicitly get authorization

## Test 3: Hook Blocking Behavior

**Objective:** Verify hooks actually prevent unauthorized operations.

### Test Steps

1. **Clean tokens:**
   ```bash
   rm -f .claude/tokens/session-*
   ```

2. **Prompt with explicit file request:**
   ```
   Write a new file at /tmp/test.txt with content "unauthorized test"
   ```

3. **Expected behavior:**
   - pre-tool-use hook should BLOCK the Write operation
   - Agent should see blocking message
   - Agent should recognize need to follow workflow
   - Agent should:
     1. Record why this file is needed (TEACH)
     2. Search for similar patterns (LEARN)
     3. Analyze and reason (REASON)
     4. Get authorization
     5. THEN create the file

4. **Verification:**
   ```bash
   # Check if agent got blocked
   # Hook will log to stderr - check Claude Code output

   # Check if workflow was followed
   sqlite3 .claude/data.db "SELECT COUNT(*) FROM experiences;"
   # Should be > 0 if agent followed workflow
   ```

## Test 4: Preset Enforcement

**Objective:** Test that strict preset enforces all required tools.

### Setup
```bash
rm -rf .claude/data.db .claude/tokens/*

# Apply strict preset programmatically
node -e "
const { spawn } = require('child_process');
const server = spawn('node', ['index.js']);
server.stdin.write(JSON.stringify({
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } }
}) + '\\n');
server.stdin.write(JSON.stringify({
  jsonrpc: '2.0', id: 2, method: 'tools/call',
  params: { name: 'apply_preset', arguments: { preset_name: 'strict', session_id: 'test-strict' } }
}) + '\\n');
setTimeout(() => server.stdin.end(), 100);
server.stdout.on('data', d => process.stdout.write(d));
"
```

### Test Steps

1. **Prompt:**
   ```
   Refactor the authentication module to use async/await instead of callbacks.
   ```

2. **Expected with strict preset:**
   - Agent MUST use all required tools:
     - `record_experience`
     - `search_experiences`
     - `reason_through`
   - Agent cannot skip any steps
   - `verify_compliance` will enforce strict requirements

## Test 5: Session State Persistence

**Objective:** Verify session maintains state across multiple operations.

### Test Steps

1. **Clean state:**
   ```bash
   rm -rf .claude/data.db .claude/tokens/*
   ```

2. **Multi-step prompt:**
   ```
   I need to:
   1. Fix the database connection timeout issue
   2. Add connection pooling
   3. Update the configuration documentation

   Let's work through these systematically.
   ```

3. **Expected:**
   - Agent creates ONE reasoning session for all three tasks
   - Uses `get_session_state` to track progress
   - Maintains session token across all file operations
   - Records multiple thoughts in same session

4. **Verification:**
   ```bash
   # Check session has multiple thoughts
   sqlite3 .claude/data.db "
   SELECT s.session_id, COUNT(t.id) as thought_count
   FROM reasoning_sessions s
   LEFT JOIN reasoning_thoughts t ON s.session_id = t.session_id
   GROUP BY s.session_id;
   "
   # Should show 1 session with 3+ thoughts
   ```

## Test 6: Memory System Guarded Cycle (v1.9.0+)

**Objective:** Verify agent uses the guarded cycle workflow with auto-created memory sessions.

### Setup
```bash
# Clean state
rm -rf .claude/experiences.db .claude/tokens/*
```

### Test Steps

1. **Prompt:**
   ```
   Analyze this codebase and suggest improvements to the error handling.
   ```

2. **Expected agent workflow:**

   1. **LEARN**: `search_experiences({ query: "error handling improvements" })`
   2. **GUARDED_REASON**:
      - `compliance_snapshot({})` → auto-creates session, returns `session_id`
      - `context_pack({ session_id: <from snapshot> })` → packs relevant context
   3. **TEACH**: `record_experience({ type: "effective", ... })` after completion

3. **Key observations:**
   - `compliance_snapshot({})` should work without providing `session_id`
   - The returned `session_id` should be an integer
   - Downstream tools should use the same `session_id`
   - No separate session creation step is needed

### Verification
```bash
# Check memory session was created
node -e "
  require('./src/database').initDatabase();
  const { applyMemorySchema } = require('./src/memory/schema');
  const { getDatabase } = require('./src/database');
  applyMemorySchema(getDatabase());
  const rows = getDatabase().prepare('SELECT * FROM memory_sessions ORDER BY session_id DESC LIMIT 1').all();
  console.log('Latest memory session:', rows[0]);
"

# Check compliance_snapshot auto-creation works
node -e "
  require('./src/database').initDatabase();
  const m = require('./src/tools/memory');
  const r = m.complianceSnapshot({});
  console.assert(typeof r.session_id === 'number', 'session_id must be number');
  console.assert(r.phase === 'SNAPSHOT', 'phase must be SNAPSHOT');
  console.log('PASS: auto-create works, session_id =', r.session_id);
"
```

## Automated Verification Scripts

### Check if agent followed workflow
```bash
#!/bin/bash
# check-workflow.sh

DB="$HOME/.unified-mcp/data.db"

echo "=== Workflow Compliance Check ==="
echo ""

echo "Experiences recorded (TEACH):"
sqlite3 "$DB" "SELECT COUNT(*) FROM experiences;"

echo ""
echo "Searches performed (LEARN):"
# Note: searches aren't logged, check via reasoning_context
sqlite3 "$DB" "SELECT COUNT(*) FROM reasoning_context;"

echo ""
echo "Reasoning sessions (REASON):"
sqlite3 "$DB" "SELECT COUNT(*) FROM reasoning_sessions WHERE concluded = 1;"

echo ""
echo "Session tokens issued:"
ls -1 .claude/tokens/session-* 2>/dev/null | wc -l

echo ""
if [ $(sqlite3 "$DB" "SELECT COUNT(*) FROM experiences;") -gt 0 ] && \
   [ $(sqlite3 "$DB" "SELECT COUNT(*) FROM reasoning_sessions WHERE concluded = 1;") -gt 0 ]; then
  echo "✅ Agent followed three-gate workflow"
else
  echo "❌ Agent may have skipped workflow steps"
fi
```

### Monitor hook execution
```bash
#!/bin/bash
# monitor-hooks.sh

echo "Monitoring hook execution in Claude Code..."
echo "Watch for these messages:"
echo "  - 'Protocol guidance' from user-prompt-submit hook"
echo "  - 'BLOCKED' from pre-tool-use hook (if no token)"
echo "  - 'ALLOWED' from pre-tool-use hook (with token)"
echo ""
echo "Tokens in .claude/tokens/:"
watch -n 1 "ls -lh .claude/tokens/ 2>/dev/null || echo 'No tokens yet'"
```

## Success Criteria

For each test, the agent should demonstrate:

1. ✅ **Autonomous workflow compliance** - follows TEACH → LEARN → REASON without being told
2. ✅ **Hook enforcement works** - pre-tool-use hook blocks unauthorized operations
3. ✅ **Proper tool sequencing** - uses tools in logical order guided by descriptions
4. ✅ **Context gathering** - searches for existing knowledge before implementing
5. ✅ **Reasoning documentation** - records thoughts and decisions
6. ✅ **Authorization obtained** - gets tokens before file operations
7. ✅ **Experience recording** - teaches system about outcomes

## Troubleshooting

### Agent skips workflow
- Check hook installation: `ls .claude/hooks/`
- Verify hooks in Claude Code settings.json
- Check hook permissions: `chmod +x .claude/hooks/*.cjs`

### Agent doesn't use tools
- Verify MCP server is running: check Claude Code logs
- Test tools manually: `npm test`
- Check tool descriptions are clear: `npm run test:tool-guidance`

### Hooks don't block
- Test hook execution: `npm run test:hook-execution`
- Check hook syntax: `node .claude/hooks/pre-tool-use.cjs`
- Verify Claude Code hook configuration

## Next Steps

After manual testing:
1. Document any issues found
2. Update tool descriptions if agent confused
3. Improve hook messages if not clear
4. Add more examples to tool schemas if needed
