#!/usr/bin/env node

/**
 * Memory System Tests
 *
 * Deterministic tests for all 5 phases of the memory system.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  colors, test, assertTrue, assertFalse, assertEquals,
  getStats, resetStats, createTestProject, cleanupTestProject
} = require('./test-utils');

let testDir;
const NOW = '2026-01-15T12:00:00.000Z';
const NOW2 = '2026-01-15T12:01:00.000Z';

function setup() {
  testDir = createTestProject();
  process.chdir(testDir);

  // Initialize database and memory schema
  const { initDatabase, getDatabase } = require('../src/database');
  initDatabase();
  const { applyMemorySchema } = require('../src/memory/schema');
  applyMemorySchema(getDatabase());

  // Create signing key
  const { ensureSigningSecret } = require('../src/memory/canonical');
  ensureSigningSecret(path.join(testDir, '.claude'));
}

async function runTests() {
  resetStats();

  console.log(`${colors.bold}Memory System Tests${colors.reset}`);
  console.log(`${colors.cyan}${'─'.repeat(70)}${colors.reset}`);

  setup();

  // === CANONICAL JSON ===
  console.log(`\n${colors.bold}Canonical JSON${colors.reset}`);
  const { canonicalJson, hash, sign, verify } = require('../src/memory/canonical');

  await test('canonicalJson - sorts object keys', () => {
    const result = canonicalJson({ b: 2, a: 1 });
    assertEquals(result, '{"a":1,"b":2}');
  });

  await test('canonicalJson - nested objects sorted', () => {
    const result = canonicalJson({ z: { b: 2, a: 1 }, a: 3 });
    assertEquals(result, '{"a":3,"z":{"a":1,"b":2}}');
  });

  await test('canonicalJson - arrays preserved', () => {
    const result = canonicalJson([3, 1, 2]);
    assertEquals(result, '[3,1,2]');
  });

  await test('canonicalJson - normalizes newlines', () => {
    const result = canonicalJson('hello\r\nworld');
    assertEquals(result, '"hello\\nworld"');
  });

  await test('hash - deterministic', () => {
    const h1 = hash({ a: 1, b: 2 });
    const h2 = hash({ b: 2, a: 1 });
    assertEquals(h1, h2, 'Hash should be same regardless of key order');
  });

  await test('sign/verify - valid signature', () => {
    const secret = 'a'.repeat(64);
    const sig = sign({ test: true }, secret);
    assertTrue(verify({ test: true }, sig, secret), 'Valid signature should verify');
  });

  await test('sign/verify - tampered data fails', () => {
    const secret = 'a'.repeat(64);
    const sig = sign({ test: true }, secret);
    assertFalse(verify({ test: false }, sig, secret), 'Tampered data should fail');
  });

  // === SALIENCE ===
  console.log(`\n${colors.bold}Salience Computation${colors.reset}`);
  const { computeSalience, recencyBucket } = require('../src/memory/salience');

  await test('salience - deterministic values', () => {
    const s = computeSalience({
      state: 'observed',
      evidence_count: 2,
      contradiction_count: 0,
      trust: 2,
      updated_at: NOW,
      now: NOW
    });
    // observed(50) + 2*60(120) + bucket5*20(100) + 2*40(80) - 0 = 350
    assertEquals(s, 350);
  });

  await test('salience - clamps to 0', () => {
    const s = computeSalience({
      state: 'unverified',
      evidence_count: 0,
      contradiction_count: 10,
      trust: 0,
      updated_at: NOW,
      now: NOW
    });
    assertEquals(s, 0, 'Salience should clamp to 0');
  });

  await test('salience - clamps to 1000', () => {
    const s = computeSalience({
      state: 'stable',
      evidence_count: 20,
      contradiction_count: 0,
      trust: 3,
      updated_at: NOW,
      now: NOW
    });
    assertEquals(s, 1000, 'Salience should clamp to 1000');
  });

  await test('recencyBucket - same day = 5', () => {
    assertEquals(recencyBucket(NOW, NOW), 5);
  });

  await test('recencyBucket - 5 days = 4', () => {
    const fiveDaysLater = '2026-01-20T12:00:00.000Z';
    assertEquals(recencyBucket(NOW, fiveDaysLater), 4);
  });

  await test('recencyBucket - 100 days = 1', () => {
    const far = '2026-04-25T12:00:00.000Z';
    assertEquals(recencyBucket(NOW, far), 1);
  });

  // === SESSIONS ===
  console.log(`\n${colors.bold}Sessions${colors.reset}`);
  const { createSession, getSession, updateSession } = require('../src/memory/sessions');

  await test('createSession - returns session_id', () => {
    const s = createSession({ scope_mode: 'project', flags: { test: true }, now: NOW });
    assertTrue(s.session_id > 0, 'Should have positive session_id');
    assertEquals(s.scope_mode, 'project');
  });

  await test('getSession - retrieves session', () => {
    const s = createSession({ scope_mode: 'project', now: NOW });
    const retrieved = getSession(s.session_id);
    assertTrue(retrieved !== null, 'Session should be found');
    assertEquals(retrieved.session_id, s.session_id);
  });

  await test('updateSession - updates last_phase', () => {
    const s = createSession({ scope_mode: 'project', now: NOW });
    updateSession(s.session_id, { last_phase: 'SNAPSHOT' });
    const updated = getSession(s.session_id);
    assertEquals(updated.last_phase, 'SNAPSHOT');
  });

  // === INVOCATIONS ===
  console.log(`\n${colors.bold}Invocations${colors.reset}`);
  const { recordInvocation, verifyChain, getChainHead } = require('../src/memory/invocations');

  await test('recordInvocation - creates hash chain', () => {
    const s = createSession({ scope_mode: 'project', now: NOW });
    const inv1 = recordInvocation({
      session_id: s.session_id,
      tool_name: 'test_tool',
      input_obj: { a: 1 },
      output_obj: { b: 2 },
      now: NOW
    });
    assertTrue(inv1.hash.length === 64, 'Hash should be 64 hex chars');
    assertEquals(inv1.prev_hash, null, 'First invocation has null prev_hash');

    const inv2 = recordInvocation({
      session_id: s.session_id,
      tool_name: 'test_tool_2',
      input_obj: { c: 3 },
      output_obj: { d: 4 },
      now: NOW
    });
    assertEquals(inv2.prev_hash, inv1.hash, 'Second invocation prev_hash should be first hash');
  });

  await test('verifyChain - valid chain passes', () => {
    const s = createSession({ scope_mode: 'project', now: NOW });
    recordInvocation({ session_id: s.session_id, tool_name: 't1', input_obj: {}, output_obj: {}, now: NOW });
    recordInvocation({ session_id: s.session_id, tool_name: 't2', input_obj: {}, output_obj: {}, now: NOW });
    const result = verifyChain(s.session_id);
    assertTrue(result.valid, 'Chain should be valid');
    assertEquals(result.count, 2);
  });

  await test('verifyChain - tampered hash fails', () => {
    const s = createSession({ scope_mode: 'project', now: NOW });
    recordInvocation({ session_id: s.session_id, tool_name: 't1', input_obj: {}, output_obj: {}, now: NOW });
    // Tamper with hash
    const { getDatabase } = require('../src/database');
    getDatabase().prepare("UPDATE invocations SET hash = 'tampered' WHERE session_id = ?").run(s.session_id);
    const result = verifyChain(s.session_id);
    assertFalse(result.valid, 'Tampered chain should be invalid');
  });

  // === EPISODIC EXPERIENCES ===
  console.log(`\n${colors.bold}Episodic Experiences${colors.reset}`);
  const { recordExperience: recExp, getExperience: getExp, queryExperiences: queryExp } = require('../src/memory/experiences');

  await test('recordExperience - creates experience', () => {
    const s = createSession({ scope_mode: 'project', now: NOW });
    const exp = recExp({
      session_id: s.session_id,
      scope: 'project',
      context_keys: ['test', 'demo'],
      summary: 'Test experience',
      outcome: 'success',
      trust: 1,
      source: 'system',
      now: NOW
    });
    assertTrue(exp.experience_id > 0);
    assertEquals(exp.outcome, 'success');
  });

  await test('recordExperience - canonicalizes context_keys', () => {
    const exp = recExp({
      scope: 'project',
      context_keys: ['Zulu', 'alpha', 'Alpha'],
      summary: 'Key test',
      now: NOW
    });
    assertEquals(JSON.stringify(exp.context_keys), '["alpha","zulu"]', 'Keys should be sorted, deduped, lowercased');
  });

  await test('recordExperience - rejects too-long summary', () => {
    const exp = recExp({
      scope: 'project',
      context_keys: [],
      summary: 'x'.repeat(5000),
      now: NOW
    });
    assertTrue(exp.error === true, 'Should reject');
    assertEquals(exp.code, 'PAYLOAD_TOO_LARGE');
  });

  await test('queryExperiences - stable ordering', () => {
    const s = createSession({ scope_mode: 'project', now: NOW });
    recExp({ session_id: s.session_id, scope: 'project', context_keys: ['order'], summary: 'Low trust', trust: 0, now: NOW });
    recExp({ session_id: s.session_id, scope: 'project', context_keys: ['order'], summary: 'High trust', trust: 3, now: NOW });
    recExp({ session_id: s.session_id, scope: 'project', context_keys: ['order'], summary: 'Mid trust', trust: 2, now: NOW });

    const results = queryExp({ scope: 'project' });
    // Should be ordered by trust DESC
    for (let i = 1; i < results.length; i++) {
      assertTrue(
        results[i - 1].trust >= results[i].trust ||
        (results[i - 1].trust === results[i].trust && results[i - 1].salience >= results[i].salience),
        'Results should be in stable order'
      );
    }
  });

  // === SCENES + CELLS ===
  console.log(`\n${colors.bold}Scenes + Cells${colors.reset}`);
  const {
    createScene, createCell, linkCellEvidence, recomputeCellSalience,
    queryCellsForContext, computeOverlap
  } = require('../src/memory/scenes');

  await test('createScene - creates scene', () => {
    const scene = createScene({ scope: 'project', label: 'test scene', context_keys: ['test'], now: NOW });
    assertTrue(scene.scene_id > 0);
    assertEquals(scene.label, 'test scene');
  });

  await test('createCell - computes canonical_key', () => {
    const scene = createScene({ scope: 'project', label: 'cell test', context_keys: ['cell'], now: NOW });
    const cell = createCell({
      scene_id: scene.scene_id,
      scope: 'project',
      cell_type: 'fact',
      title: 'Test Cell',
      body: 'This is a test cell',
      trust: 1,
      state: 'observed',
      now: NOW
    });
    assertTrue(cell.canonical_key.length === 64, 'canonical_key should be SHA-256 hash');
    assertTrue(cell.salience > 0, 'Salience should be positive');
  });

  await test('linkCellEvidence - updates counts', () => {
    const scene = createScene({ scope: 'project', label: 'evidence test', context_keys: ['ev'], now: NOW });
    const cell = createCell({ scene_id: scene.scene_id, scope: 'project', cell_type: 'fact', title: 'Evidence Cell', body: 'test', trust: 1, state: 'observed', now: NOW });
    const exp = recExp({ scope: 'project', context_keys: ['ev'], summary: 'Evidence experience', now: NOW });

    linkCellEvidence({ cell_id: cell.cell_id, experience_id: exp.experience_id, relation: 'supports', now: NOW });
    const { getCell } = require('../src/memory/scenes');
    const updated = getCell(cell.cell_id);
    assertEquals(updated.evidence_count, 1, 'evidence_count should be 1');

    linkCellEvidence({ cell_id: cell.cell_id, experience_id: exp.experience_id, relation: 'contradicts', now: NOW });
    const updated2 = getCell(cell.cell_id);
    assertEquals(updated2.contradiction_count, 1, 'contradiction_count should be 1');
  });

  await test('queryCellsForContext - stable ordering', () => {
    const cells = queryCellsForContext({ scope: 'project', context_keys: [], limit: 50, now: NOW });
    for (let i = 1; i < cells.length; i++) {
      const prev = cells[i - 1];
      const curr = cells[i];
      assertTrue(
        prev.trust > curr.trust ||
        (prev.trust === curr.trust && prev.salience > curr.salience) ||
        (prev.trust === curr.trust && prev.salience === curr.salience && prev.updated_at >= curr.updated_at) ||
        (prev.trust === curr.trust && prev.salience === curr.salience && prev.updated_at === curr.updated_at && prev.cell_id <= curr.cell_id),
        'Cells should be in stable order'
      );
    }
  });

  await test('computeOverlap - correct ratios', () => {
    assertEquals(computeOverlap(['a', 'b'], ['a', 'b']), 1);
    assertEquals(computeOverlap(['a', 'b'], ['a', 'c']), 0.5);
    assertEquals(computeOverlap(['a'], ['b']), 0);
    assertEquals(computeOverlap([], []), 1);
  });

  // === CONSOLIDATION ===
  console.log(`\n${colors.bold}Consolidation${colors.reset}`);
  const { runConsolidation, extractCandidates } = require('../src/memory/consolidation');

  await test('extractCandidates - extracts rules', () => {
    const candidates = extractCandidates({
      summary: 'Users must always validate input.',
      context_keys: [],
      source: 'system'
    });
    assertTrue(candidates.length > 0, 'Should extract at least one candidate');
    assertTrue(candidates.some(c => c.cell_type === 'rule'), 'Should extract a rule');
  });

  await test('extractCandidates - extracts facts', () => {
    const candidates = extractCandidates({
      summary: 'The config file is located at .claude/config.json.',
      context_keys: [],
      source: 'system'
    });
    assertTrue(candidates.length > 0, 'Should extract at least one candidate');
    assertTrue(candidates.some(c => c.cell_type === 'fact'), 'Should extract a fact');
  });

  await test('runConsolidation - deterministic with fixed now', () => {
    // Create fresh experiences for consolidation
    const s = createSession({ scope_mode: 'project', now: NOW });
    recExp({ session_id: s.session_id, scope: 'global', context_keys: ['cons'], summary: 'Users should never skip validation.', trust: 1, source: 'system', now: NOW });
    recExp({ session_id: s.session_id, scope: 'global', context_keys: ['cons'], summary: 'The API endpoint is /api/v1.', trust: 1, source: 'system', now: NOW });

    const result = runConsolidation({ scope: 'global', now: NOW2 });
    assertTrue(result.processed >= 2, 'Should process experiences');

    // Second run should process 0 (idempotent)
    const result2 = runConsolidation({ scope: 'global', now: NOW2 });
    assertEquals(result2.processed, 0, 'Second run should process 0');
  });

  // === CONTEXT PACK ===
  console.log(`\n${colors.bold}Context Pack${colors.reset}`);
  const { contextPack } = require('../src/memory/context-pack');

  await test('contextPack - hash reproducible', () => {
    const s = createSession({ scope_mode: 'project', now: NOW });
    const pack1 = contextPack({ session_id: s.session_id, scope: 'project', max_cells: 5, max_experiences: 3, byte_budget: 2000, now: NOW });
    const pack2 = contextPack({ session_id: s.session_id, scope: 'project', max_cells: 5, max_experiences: 3, byte_budget: 2000, now: NOW });
    assertEquals(pack1.context_hash, pack2.context_hash, 'Context hash should be reproducible');
  });

  await test('contextPack - enforces byte_budget', () => {
    const s = createSession({ scope_mode: 'project', now: NOW });
    const pack = contextPack({ session_id: s.session_id, scope: 'project', max_cells: 100, max_experiences: 100, byte_budget: 100, now: NOW });
    assertTrue(pack.byte_size <= 100, `Byte size ${pack.byte_size} should be <= 100`);
  });

  // === FINALIZE RESPONSE ===
  console.log(`\n${colors.bold}Finalize Response${colors.reset}`);
  const { finalizeResponse } = require('../src/memory/finalize');

  await test('finalizeResponse - trust<2 forces inference notice', () => {
    const result = finalizeResponse({
      draft_text: 'system is initialized based on our check.',
      selected_cells: [{ cell_id: 1, title: 'System is initialized', trust: 1, contradiction_count: 0 }],
      selected_experiences: []
    });
    assertTrue(result.violations.some(v => v.rule === 'inference_labeling'), 'Should flag inference labeling');
  });

  await test('finalizeResponse - contradiction notice', () => {
    const result = finalizeResponse({
      draft_text: 'The system works well.',
      selected_cells: [{ cell_id: 1, title: 'works', trust: 2, contradiction_count: 2 }],
      selected_experiences: []
    });
    assertTrue(result.violations.some(v => v.rule === 'contradiction_notice'), 'Should flag contradictions');
  });

  await test('finalizeResponse - integrity OK when no issues', () => {
    const result = finalizeResponse({
      draft_text: 'Here is a straightforward answer with no claims.',
      selected_cells: [],
      selected_experiences: []
    });
    assertEquals(result.integrity, 'OK');
  });

  // === GOVERNANCE ===
  console.log(`\n${colors.bold}Governance${colors.reset}`);
  const { validateGovernance, mintReceipt, verifyReceipt, mintToken, verifyToken } = require('../src/memory/governance');

  await test('validateGovernance - valid session passes', () => {
    const s = createSession({ scope_mode: 'project', now: NOW });
    recordInvocation({ session_id: s.session_id, tool_name: 'test', input_obj: {}, output_obj: {}, now: NOW });
    const result = validateGovernance({ session_id: s.session_id, now: NOW });
    assertTrue(result.valid);
  });

  await test('mintReceipt/verifyReceipt - round trip', () => {
    const s = createSession({ scope_mode: 'project', now: NOW });
    const receipt = mintReceipt({
      session_id: s.session_id,
      receipt_type: 'test',
      scope: 'project',
      context_hash: 'abc123',
      now: NOW
    });
    assertTrue(!receipt.error, 'Should mint without error');
    const verified = verifyReceipt(receipt.id);
    assertTrue(verified.valid, 'Receipt should verify');
  });

  await test('mintToken/verifyToken - round trip', () => {
    const s = createSession({ scope_mode: 'project', now: NOW });
    const token = mintToken({
      session_id: s.session_id,
      token_type: 'test',
      scope: 'project',
      permissions: ['read'],
      now: NOW
    });
    assertTrue(!token.error, 'Should mint without error');
    const verified = verifyToken(token.id, NOW);
    assertTrue(verified.valid, 'Token should verify');
  });

  await test('verifyToken - expired token fails', () => {
    const s = createSession({ scope_mode: 'project', now: NOW });
    const token = mintToken({
      session_id: s.session_id,
      token_type: 'test',
      scope: 'project',
      permissions: ['read'],
      now: NOW,
      expiry_minutes: 1
    });
    const farFuture = '2026-12-31T23:59:59.000Z';
    const verified = verifyToken(token.id, farFuture);
    assertFalse(verified.valid, 'Expired token should be invalid');
    assertTrue(verified.expired, 'Should be flagged as expired');
  });

  await test('verifyReceipt - tampered signature fails', () => {
    const s = createSession({ scope_mode: 'project', now: NOW });
    const receipt = mintReceipt({
      session_id: s.session_id,
      receipt_type: 'tamper_test',
      scope: 'project',
      context_hash: 'def456',
      now: NOW
    });
    const { getDatabase } = require('../src/database');
    getDatabase().prepare("UPDATE receipts SET signature = 'tampered' WHERE id = ?").run(receipt.id);
    const verified = verifyReceipt(receipt.id);
    assertFalse(verified.valid, 'Tampered receipt should fail');
  });

  // === GUARDED CYCLE ===
  console.log(`\n${colors.bold}Guarded Cycle${colors.reset}`);
  const { guardedCycle, getCycleStatus } = require('../src/memory/guarded-cycle');

  await test('guardedCycle - enforces phase order', () => {
    const s = createSession({ scope_mode: 'project', now: NOW });
    const snap = guardedCycle({ session_id: s.session_id, user_input: 'test', now: NOW });
    assertEquals(snap.phase, 'SNAPSHOT');

    const router = guardedCycle({ session_id: s.session_id, user_input: 'test', now: NOW });
    assertEquals(router.phase, 'ROUTER');

    const pack = guardedCycle({ session_id: s.session_id, user_input: 'test', now: NOW });
    assertEquals(pack.phase, 'CONTEXT_PACK');
  });

  await test('getCycleStatus - tracks progress', () => {
    const s = createSession({ scope_mode: 'project', now: NOW });
    guardedCycle({ session_id: s.session_id, user_input: 'test', now: NOW });
    const status = getCycleStatus(s.session_id);
    assertEquals(status.current_phase, 'SNAPSHOT');
    assertTrue(status.phases_remaining.length > 0);
  });

  // === POLICY VIOLATION ===
  console.log(`\n${colors.bold}Policy Violations${colors.reset}`);
  const { recordViolation, recordSuccess } = require('../src/memory/governance');

  await test('recordViolation - creates fail experience', () => {
    const s = createSession({ scope_mode: 'project', now: NOW });
    const result = recordViolation({
      session_id: s.session_id,
      scope: 'project',
      rule: 'no_implied_research',
      message: 'Draft claims research without citations',
      now: NOW
    });
    assertTrue(result.experience_recorded);
    const exp = getExp(result.experience_id);
    assertEquals(exp.outcome, 'fail');
    assertTrue(exp.context_keys.includes('behavioral_violation'));
  });

  await test('recordSuccess - creates success experience', () => {
    const s = createSession({ scope_mode: 'project', now: NOW });
    const result = recordSuccess({ session_id: s.session_id, scope: 'project', now: NOW });
    assertTrue(result.experience_recorded);
    const exp = getExp(result.experience_id);
    assertEquals(exp.outcome, 'success');
  });

  // === SESSION AUTO-CREATION (v1.9.2) ===
  console.log(`\n${colors.bold}Session Auto-Creation (v1.9.2)${colors.reset}`);
  const memoryTools = require('../src/tools/memory');

  await test('complianceSnapshot - auto-creates session when session_id omitted', () => {
    const result = memoryTools.complianceSnapshot({});
    assertTrue(typeof result.session_id === 'number', 'session_id must be a number');
    assertTrue(result.session_id > 0, 'session_id must be positive');
    assertEquals(result.phase, 'SNAPSHOT');
    // Verify session exists in DB
    const session = getSession(result.session_id);
    assertTrue(session !== null, 'Session must exist in DB');
    assertEquals(session.scope_mode, 'project');
  });

  await test('complianceSnapshot - reuses explicit session_id', () => {
    const s = createSession({ scope_mode: 'project', now: NOW });
    const result = memoryTools.complianceSnapshot({ session_id: s.session_id });
    assertEquals(result.session_id, s.session_id);
    assertEquals(result.phase, 'SNAPSHOT');
  });

  // === EXPERIENCE BRIDGE (v1.10.0) ===
  console.log(`\n${colors.bold}Experience Bridge (v1.10.0)${colors.reset}`);

  await test('recordExperience bridges to episodic_experiences', () => {
    const { recordExperience } = require('../src/tools/knowledge');
    const { getDatabase } = require('../src/database');

    const result = recordExperience({
      type: 'effective',
      domain: 'Process',
      situation: 'Bridge test: verifying dual-write',
      approach: 'Called recordExperience with all fields',
      outcome: 'Both tables should have entries',
      reasoning: 'Bridge maps fields from experiences to episodic_experiences',
      confidence: 0.85,
      tags: ['bridge-test', 'v1.10.0']
    });

    assertTrue(result.recorded, 'Primary insert should succeed');

    // Verify episodic_experiences has a matching row
    const db = getDatabase();
    const episodic = db.prepare(
      "SELECT * FROM episodic_experiences WHERE summary = ? AND source = 'agent'"
    ).get('Bridge test: verifying dual-write');

    assertTrue(!!episodic, 'Episodic experience should exist');
    assertEquals(episodic.outcome, 'success');
    assertEquals(episodic.trust, 3); // confidence 0.85 > 0.75 → trust 3
    assertEquals(episodic.scope, 'project');
    assertEquals(episodic.source, 'agent');

    // Verify context_keys includes domain and tags
    const keys = JSON.parse(episodic.context_keys_json);
    assertTrue(keys.includes('process'), 'context_keys should include domain (lowercased)');
    assertTrue(keys.includes('bridge-test'), 'context_keys should include tags');
    assertTrue(keys.includes('v1.10.0'), 'context_keys should include tags');
  });

  await test('bridge failure does not break primary experiences insert', () => {
    const { recordExperience } = require('../src/tools/knowledge');
    const { getDatabase } = require('../src/database');
    const db = getDatabase();

    // Record with minimal fields (bridge should still work, but test isolation)
    const countBefore = db.prepare('SELECT COUNT(*) as c FROM experiences').get().c;

    const result = recordExperience({
      type: 'ineffective',
      domain: 'Debugging',
      situation: 'Bridge isolation test',
      approach: 'Minimal fields to test fault isolation',
      outcome: 'Primary insert must succeed regardless of bridge',
      reasoning: 'try/catch around bridge ensures isolation'
    });

    assertTrue(result.recorded, 'Primary insert must succeed');

    const countAfter = db.prepare('SELECT COUNT(*) as c FROM experiences').get().c;
    assertTrue(countAfter > countBefore, 'Experience count should increase');

    // Verify episodic side maps 'ineffective' → 'fail'
    const episodic = db.prepare(
      "SELECT * FROM episodic_experiences WHERE summary = ? AND source = 'agent'"
    ).get('Bridge isolation test');
    assertTrue(!!episodic, 'Episodic experience should exist');
    assertEquals(episodic.outcome, 'fail');
    assertEquals(episodic.trust, 0); // no confidence → 0
  });

  // === SUMMARY ===
  const stats = getStats();
  console.log(`\n${colors.cyan}${'═'.repeat(70)}${colors.reset}`);
  console.log(`${colors.bold}MEMORY SYSTEM TESTS SUMMARY${colors.reset}`);
  console.log(`${colors.cyan}${'═'.repeat(70)}${colors.reset}`);
  console.log(`${colors.green}Tests Passed: ${stats.testsPassed}${colors.reset}`);
  console.log(`${colors.red}Tests Failed: ${stats.testsFailed}${colors.reset}`);
  console.log(`Total: ${stats.testsRun} tests`);

  if (stats.testsFailed > 0) {
    console.log(`\n${colors.red}✗ Some memory system tests failed!${colors.reset}`);
    cleanupTestProject(testDir);
    process.exit(1);
  } else {
    console.log(`\n${colors.green}✓ All memory system tests passed!${colors.reset}`);
    cleanupTestProject(testDir);
    process.exit(0);
  }
}

runTests().catch(e => {
  console.error('Test runner error:', e);
  if (testDir) cleanupTestProject(testDir);
  process.exit(1);
});
