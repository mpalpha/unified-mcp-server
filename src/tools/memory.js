/**
 * Memory System MCP Tools
 *
 * MCP-facing wrappers for the deterministic memory system.
 * Delegates to src/memory/ modules for all logic.
 *
 * Tools:
 * - compliance_snapshot: Take compliance snapshot (SNAPSHOT phase)
 * - compliance_router: Route compliance check (ROUTER phase)
 * - context_pack: Byte-budgeted context packing
 * - guarded_cycle: Execute guarded reasoning phase
 * - finalize_response: Trust-aware response finalization
 * - run_consolidation: Deterministic consolidation engine
 */

const { ValidationError } = require('../validation');
const { logActivity } = require('../database');
const memory = require('../memory');

/**
 * Get current ISO timestamp.
 */
function now() {
  return new Date().toISOString();
}

/**
 * Tool: compliance_snapshot
 *
 * Takes a compliance snapshot of the current session state.
 * This is the SNAPSHOT phase of the guarded cycle.
 */
function complianceSnapshot(params) {
  const ts = now();
  let sessionId;

  if (!params.session_id && params.session_id !== 0) {
    // Auto-create memory session when session_id is omitted (v1.9.2)
    const session = memory.createSession({
      scope_mode: params.scope || 'project',
      flags: {},
      now: ts
    });
    sessionId = session.session_id;
  } else {
    sessionId = Number(params.session_id);
  }

  // Run SNAPSHOT phase of guarded cycle
  const result = memory.guardedCycle({
    session_id: sessionId,
    scope: params.scope || 'project',
    user_input: params.context || '',
    context_keys: params.context_keys || [],
    now: ts
  });

  if (result.error) {
    throw new ValidationError(result.message, `Error code: ${result.code}`);
  }

  logActivity('compliance_snapshot', String(sessionId), { phase: result.phase });

  return {
    snapshot_hash: result.last_context_hash || null,
    session_id: sessionId,
    phase: result.phase,
    status: result.status,
    scope_mode: result.scope_mode,
    flags: result.flags
  };
}

/**
 * Tool: compliance_router
 *
 * Routes the compliance check based on snapshot.
 * This is the ROUTER phase of the guarded cycle.
 */
function complianceRouter(params) {
  if (!params.session_id && params.session_id !== 0) {
    throw new ValidationError(
      'Missing "session_id" parameter',
      'Required: session_id = integer'
    );
  }
  if (!params.snapshot_hash && params.snapshot_hash !== '') {
    throw new ValidationError(
      'Missing "snapshot_hash" parameter',
      'Required: snapshot_hash from compliance_snapshot'
    );
  }

  const sessionId = Number(params.session_id);
  const ts = now();

  // Run ROUTER phase
  const result = memory.guardedCycle({
    session_id: sessionId,
    scope: params.scope || 'project',
    user_input: params.user_input || '',
    now: ts
  });

  if (result.error) {
    throw new ValidationError(result.message, `Error code: ${result.code}`);
  }

  logActivity('compliance_router', String(sessionId), { phase: result.phase, route: result.next_action });

  return {
    route: result.next_action || 'CONTEXT_PACK',
    session_id: sessionId,
    phase: result.phase,
    status: result.status,
    has_draft: result.has_draft || false
  };
}

/**
 * Tool: context_pack
 *
 * Packs relevant context within a byte budget.
 */
function contextPackTool(params) {
  if (!params.session_id && params.session_id !== 0) {
    throw new ValidationError(
      'Missing "session_id" parameter',
      'Required: session_id = integer'
    );
  }

  const sessionId = Number(params.session_id);
  const scope = params.scope || 'project';
  const byteBudget = params.byte_budget || 8000;
  const contextKeys = params.context_keys || [];
  const ts = now();

  const result = memory.contextPack({
    session_id: sessionId,
    scope,
    context_keys: contextKeys,
    max_cells: params.max_cells || 20,
    max_experiences: params.max_experiences || 10,
    byte_budget: byteBudget,
    now: ts
  });

  logActivity('context_pack', String(sessionId), {
    byte_size: result.byte_size,
    cells: result.packed_cells.length,
    experiences: result.packed_experiences.length
  });

  return {
    packed_context: {
      cells: result.packed_cells,
      experiences: result.packed_experiences
    },
    context_hash: result.context_hash,
    byte_count: result.byte_size,
    phase: 'CONTEXT_PACK'
  };
}

/**
 * Tool: guarded_cycle
 *
 * Execute a phase of the guarded reasoning cycle.
 * Must be called in phase order.
 */
function guardedCycleTool(params) {
  if (!params.session_id && params.session_id !== 0) {
    throw new ValidationError(
      'Missing "session_id" parameter',
      'Required: session_id = integer'
    );
  }
  if (!params.phase) {
    throw new ValidationError(
      'Missing "phase" parameter',
      'Required: phase = one of: ' + memory.PHASES.join(', ')
    );
  }

  const sessionId = Number(params.session_id);
  const input = params.input || {};
  const ts = now();

  const result = memory.guardedCycle({
    session_id: sessionId,
    scope: input.scope || 'project',
    user_input: input.user_input || '',
    context_keys: input.context_keys || [],
    now: ts,
    byte_budget: input.byte_budget || 8000,
    max_cells: input.max_cells || 20,
    max_experiences: input.max_experiences || 10,
    draft: input.draft,
    finalize_result: input.finalize_result,
    governance_result: input.governance_result
  });

  if (result.error) {
    throw new ValidationError(result.message, `Error code: ${result.code}`);
  }

  // Determine next phase
  const status = memory.getCycleStatus(sessionId);

  logActivity('guarded_cycle', String(sessionId), { phase: result.phase, status: result.status });

  return {
    phase: result.phase,
    output: result,
    next_phase: status ? status.next_phase : null,
    session_id: sessionId
  };
}

/**
 * Tool: finalize_response
 *
 * Finalize a response with trust-aware labeling and integrity markers.
 */
function finalizeResponseTool(params) {
  if (!params.session_id && params.session_id !== 0) {
    throw new ValidationError(
      'Missing "session_id" parameter',
      'Required: session_id = integer'
    );
  }
  if (!params.draft || typeof params.draft !== 'string') {
    throw new ValidationError(
      'Missing or invalid "draft" parameter',
      'Required: draft = string (response text to finalize)'
    );
  }

  const sessionId = Number(params.session_id);
  const cells = params.cells || [];
  const experiences = params.experiences || [];

  const result = memory.finalizeResponse({
    draft_text: params.draft,
    selected_cells: cells,
    selected_experiences: experiences
  });

  logActivity('finalize_response', String(sessionId), {
    integrity: result.integrity,
    violations: result.violations.length
  });

  return {
    response: result.finalized_text,
    integrity: result.integrity,
    integrity_line: result.integrity_line,
    violations: result.violations
  };
}

/**
 * Tool: run_consolidation
 *
 * Run the deterministic consolidation engine.
 */
function runConsolidationTool(params) {
  const scope = params.scope || 'project';
  const threshold = params.threshold || 5;
  const ts = now();

  const result = memory.runConsolidation({
    scope,
    threshold,
    now: ts
  });

  logActivity('run_consolidation', 'system', {
    scope,
    processed: result.processed,
    cells_created: result.cells_created
  });

  return {
    processed: result.processed,
    cells_created: result.cells_created,
    cells_updated: result.cells_updated || 0,
    idempotent: result.processed === 0
  };
}

module.exports = {
  complianceSnapshot,
  complianceRouter,
  contextPack: contextPackTool,
  guardedCycle: guardedCycleTool,
  finalizeResponse: finalizeResponseTool,
  runConsolidation: runConsolidationTool
};
