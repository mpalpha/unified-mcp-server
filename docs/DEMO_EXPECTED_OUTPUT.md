# Demo Expected Output

## Running the Demo

```bash
npx unified-mcp-server --demo
```

## Expected Markers

Each phase demo prints a marker on its own line when it passes:

```
DEMO_PASS_PHASE1
DEMO_PASS_PHASE2
DEMO_PASS_PHASE3
DEMO_PASS_PHASE4
DEMO_PASS_PHASE5
```

## What Each Phase Proves

### Phase 1: Episodic Memory Core + Invocation Ledger
- Session creation works (memory_sessions table)
- Invocation recording with hash chain (invocations table)
- Episodic experience recording and read-back (episodic_experiences table)
- Hash chain integrity verification passes

### Phase 2: Semantic Memory (Scenes + Cells + Evidence)
- Scene creation (scenes table)
- Cell creation with canonical key and salience computation (cells table)
- Evidence linking between cells and experiences (cell_evidence table)
- Context query returns cells with stable ordering (trust DESC, salience DESC, updated_at DESC, id ASC)

### Phase 3: Deterministic Consolidation Engine
- Experience processing into scenes and cells via conservative templates
- Consolidation produces deterministic results (same inputs = same outputs)
- Second consolidation run processes 0 new experiences (idempotent)

### Phase 4: Context Pack + Guarded Cycle
- Context packing with byte budget enforcement
- Context hash is reproducible (same inputs = same hash)
- Guarded cycle enforces phase ordering (SNAPSHOT, ROUTER, ...)

### Phase 5: Finalize Response + Governance
- Finalize response detects behavioral violations
- Governance validation checks phase order and hash chain
- Receipt minting and signature verification
- Token minting and signature verification
- Tamper detection: modified receipt signature fails verification

## Common Failure Causes

| Error | Cause | Remediation |
|-------|-------|-------------|
| `Database unavailable` | Not in a valid project directory | Run from a directory with `.git/`, `package.json`, or `.claude/` |
| `DEMO_FAIL_PHASE1: Experience read-back failed` | Schema not applied | Run `--init` first or check migration 002 |
| `DEMO_FAIL_PHASE2: No cells returned` | scenes/cells tables missing | Check migration 002 applied |
| `DEMO_FAIL_PHASE2: Stable ordering violated` | Bug in ORDER BY clause | Check `queryCellsForContext` ordering |
| `DEMO_FAIL_PHASE4: Context hash not reproducible` | Non-deterministic JSON | Check `canonicalJson` implementation |
| `DEMO_FAIL_PHASE5: Receipt/Token minting failed` | Missing signing key | Run `--init` to create `signing.key` |
| `DEMO_FAIL_PHASE5: Tamper detection failed` | Signature verification broken | Check `verify()` in canonical.js |
| `NO_SIGNING_KEY` | `.claude/signing.key` missing | Run `--init` |

## Phase Checklist Script

```bash
npm run phase-check
# or
node scripts/phase-checklist.js
```

This script:
1. Creates a temporary directory
2. Runs `--install` (non-interactive)
3. Runs `--demo`
4. Verifies all 5 `DEMO_PASS` markers appear in order
5. Exits non-zero if any phase fails
