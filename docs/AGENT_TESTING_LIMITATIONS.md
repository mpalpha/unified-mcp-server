# Agent Testing Limitations - What We Can and Cannot Verify

## Executive Summary

**The Core Challenge:** We need to verify that tool descriptions will guide a real Claude Code agent to autonomously follow the TEACH → LEARN → REASON workflow. However, **we cannot fully automate this verification** without spawning real Claude Code instances.

## What Our Tests DO Verify ✅

### 1. Infrastructure Works (`test/test-*.js` - 140 tests)
- ✅ All 25 MCP tools are callable
- ✅ Database operations succeed
- ✅ Token system functions correctly
- ✅ Workflows complete end-to-end
- ✅ Presets apply properly

### 2. Hooks Physically Block (`test/test-hook-execution.js` - 5 tests)
- ✅ pre-tool-use.cjs exits with code 1 when no token exists
- ✅ pre-tool-use.cjs exits with code 0 when valid token exists
- ✅ Write/Edit operations are blocked/allowed correctly
- ✅ Non-file operations pass through
- ✅ Complete authorization workflow works

### 3. Tool Descriptions Guide Workflow (`test/test-tool-guidance.js` - 10 tests) **IMPROVED!**
- ✅ analyze_problem explicitly says "First step in reasoning workflow"
- ✅ gather_context session_id references "Session ID from analyze_problem"
- ✅ authorize_operation operation_token references "Token from verify_compliance"
- ✅ Three-gate phases (teach, learn, reason) defined in enums
- ✅ record_experience description implies TEACH phase ("Record a working knowledge pattern")
- ✅ search_experiences description implies LEARN phase ("Search for relevant working knowledge")
- ✅ reason_through description implies REASON phase ("Evaluate an approach")
- ✅ All tool descriptions use active voice (Record, Search, Analyze, Evaluate)
- ✅ Tools listed in logical order (TEACH → LEARN → REASON)
- ✅ Parameter descriptions include clear options via enums

**This directly addresses**: "How will we know if the messages will properly guide the agent?"
Tests verify tool descriptions ARE structured to guide agents through the workflow.

### 4. Expected Sequences Work (`test/agent-harness.js` - 3 scenarios)
- ✅ IF an agent calls tools in TEACH → LEARN → REASON order, it works
- ✅ Workflow compliance can be verified after execution
- ✅ Authorization workflow functions as designed

## What Our Tests CANNOT Verify ❌

### 1. Agent Decision-Making
**Question:** Will a real agent autonomously decide to call `record_experience` before trying to edit files?

**Why we can't test:**
- Requires real Claude Code agent running
- Agent interprets tool descriptions autonomously
- Agent makes decisions based on LLM inference
- We can't simulate LLM decision-making accurately

**What we have instead:**
- Tool descriptions *should* guide agents (validated in metadata tests)
- Manual testing guide provides verification procedures
- Agent harness shows expected sequences work IF followed

### 2. Tool Description Effectiveness
**Question:** Are the tool descriptions clear enough to guide agents without explicit workflow instructions?

**Why we can't test:**
- Requires observing real agent behavior
- Agent may interpret descriptions differently than intended
- Context and phrasing matter (subjective)
- Need multiple real-world prompts to validate

**What we have instead:**
- Metadata validation confirms descriptions mention workflow order
- Manual testing guide includes 5 realistic scenarios
- Tool descriptions follow best practices (active voice, clear prerequisites)

### 3. Hook Message Clarity
**Question:** When hooks block operations, will agents understand the guidance and complete the workflow?

**Why we can't test:**
- Hook messages are human-readable text
- Agent must parse and act on error messages
- Requires real agent to test understanding
- Context-dependent (different prompts = different interpretations)

**What we have instead:**
- Hook messages tested for technical correctness (exit codes)
- Messages include specific tool names and examples
- Manual testing guide shows how to observe hook behavior

### 4. Workflow Compliance Rate
**Question:** What percentage of real-world prompts will agents handle correctly?

**Why we can't test:**
- Requires large sample of real prompts
- Need to test diverse scenarios (bugs, features, refactoring, questions, etc.)
- Agent behavior may vary by prompt complexity
- Statistical analysis requires many runs

**What we have instead:**
- Agent harness tests 3 representative scenarios
- Manual testing guide covers 5 common scenarios
- Documentation for extending scenarios

## The Testing Gap

```
┌─────────────────────────────────────────────┐
│  WHAT WE CAN TEST AUTOMATICALLY             │
├─────────────────────────────────────────────┤
│  ✅ Tools work                              │
│  ✅ Hooks block/allow correctly             │
│  ✅ Metadata is structured properly         │
│  ✅ Expected sequences function             │
└─────────────────────────────────────────────┘
                    ⬇
            TESTING GAP
                    ⬇
┌─────────────────────────────────────────────┐
│  WHAT REQUIRES MANUAL TESTING               │
├─────────────────────────────────────────────┤
│  ❓ Will agents interpret descriptions?    │
│  ❓ Will agents follow workflow?            │
│  ❓ Will agents understand hook messages?   │
│  ❓ What is the compliance rate?            │
└─────────────────────────────────────────────┘
```

## Why Full Automation Is Hard

### Technical Challenges

1. **No Claude Code API**
   - Claude Code doesn't expose programmatic control API
   - Can't spawn agent, send prompt, monitor tool calls
   - Would need to reverse-engineer or use unofficial methods

2. **LLM Non-Determinism**
   - Same prompt may yield different tool sequences
   - Agent decisions influenced by model updates
   - Hard to establish "correct" behavior baseline

3. **Context Sensitivity**
   - Agent behavior depends on conversation context
   - File structure, existing code matters
   - Can't fully isolate test scenarios

4. **Integration Complexity**
   - Need full Claude Code environment
   - MCP server + hooks + settings configuration
   - Difficult to automate setup/teardown

### What Would Be Needed

To fully automate agent testing, we would need:

```javascript
// Hypothetical API (doesn't exist)
const agent = await ClaudeCode.spawn({
  mcpServers: { unified: { command: 'node', args: ['index.js'] } },
  hooks: { /* ... */ }
});

const response = await agent.sendPrompt(
  'Fix the authentication bug in src/auth/validator.js'
);

const toolCalls = response.getToolCallSequence();
assert(toolCalls[0] === 'record_experience'); // TEACH
assert(toolCalls[1] === 'search_experiences'); // LEARN
assert(toolCalls[2] === 'analyze_problem');    // REASON
```

This API doesn't exist, and building it would be a major project.

## Our Approach: Layered Verification

Since full automation isn't feasible, we use a layered approach:

### Layer 1: Automated Unit Tests (140 tests)
**Verifies:** Infrastructure works correctly
**Confidence:** 100% - All functionality tested
**Limitations:** Doesn't test agent behavior

### Layer 2: Automated Hook Execution (5 tests)
**Verifies:** Hooks physically block operations
**Confidence:** 100% - Real hook scripts executed
**Limitations:** Doesn't test agent response to blocking

### Layer 3: Automated Sequence Tests (3 scenarios)
**Verifies:** Expected sequences work IF followed
**Confidence:** 100% - Sequences tested
**Limitations:** Doesn't test if agents will follow sequences

### Layer 4: Manual Testing Guide
**Verifies:** Real agent behavior with real prompts
**Confidence:** Depends on thorough manual testing
**Limitations:** Time-consuming, not automated

## Recommendations

### For Immediate Deployment

1. **Run all automated tests** (140 tests)
   ```bash
   npm test
   ```
   ✅ Confirms infrastructure works

2. **Run agent harness** (3 scenarios)
   ```bash
   node test/agent-harness.js
   ```
   ✅ Confirms expected sequences work

3. **Manual test with Claude Code** (5 scenarios)
   - Follow `docs/MANUAL_TESTING_GUIDE.md`
   - Test 5 realistic prompts
   - Observe tool call sequences
   - Verify workflow compliance

4. **Document findings**
   - Record which prompts worked
   - Note where agents skipped workflow
   - Identify confusing tool descriptions
   - Iterate on descriptions if needed

### For Continuous Improvement

1. **Collect real usage data**
   - Monitor `~/.unified-mcp/data.db`
   - Check if experiences are being recorded
   - Verify searches happen before implementations
   - Track compliance rate

2. **Iterate on tool descriptions**
   - If agents skip TEACH, emphasize record_experience more
   - If agents skip LEARN, make search_experiences more prominent
   - Update descriptions based on observed behavior

3. **Improve hook messages**
   - If agents don't understand blocking, clarify messages
   - Add more examples if needed
   - Test message clarity with real agents

4. **Expand test scenarios**
   - Add more scenarios to agent harness
   - Cover edge cases (questions, exploration, multi-step tasks)
   - Build statistical baseline

## Bottom Line

### What We Know ✅
- Infrastructure is solid (140 tests passing)
- Hooks physically block correctly (verified)
- Tool metadata follows best practices (validated)
- Expected workflows function (tested)

### What We Don't Know ❓
- Will real agents follow the workflow autonomously?
- Are tool descriptions clear enough?
- Will agents understand hook guidance?
- What is the real-world compliance rate?

### What To Do About It 📋
1. Deploy with confidence in infrastructure
2. Manual test with representative prompts
3. Monitor real usage and iterate
4. Collect data to inform improvements

The gap between "infrastructure works" and "agents behave correctly" can only be closed through real-world testing with actual Claude Code instances.
