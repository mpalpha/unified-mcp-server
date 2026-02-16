/**
 * Guarded Cycle State Machine (Phase 4)
 *
 * Enforces fixed phase order:
 * 1) SNAPSHOT
 * 2) ROUTER
 * 3) CONTEXT_PACK
 * 4) DRAFT
 * 5) FINALIZE_RESPONSE
 * 6) GOVERNANCE_VALIDATE
 * 7) MEMORY_UPDATE
 *
 * No skipping. Max 1 roundtrip per phase.
 */

const { getSession, updateSession } = require('./sessions');
const { recordInvocation } = require('./invocations');
const { contextPack } = require('./context-pack');
const { recordExperience } = require('./experiences');

const PHASES = [
  'SNAPSHOT',
  'ROUTER',
  'CONTEXT_PACK',
  'DRAFT',
  'FINALIZE_RESPONSE',
  'GOVERNANCE_VALIDATE',
  'MEMORY_UPDATE'
];

/**
 * Run a guarded cycle.
 *
 * @param {object} params
 * @param {number} params.session_id
 * @param {string} [params.scope='project']
 * @param {string} params.user_input
 * @param {string[]} [params.context_keys]
 * @param {string} params.now - ISO timestamp
 * @param {number} [params.byte_budget=8000]
 * @param {number} [params.max_cells=20]
 * @param {number} [params.max_experiences=10]
 * @param {string} [params.draft] - Draft text (for DRAFT phase)
 * @param {object} [params.finalize_result] - Result from finalize_response
 * @param {object} [params.governance_result] - Result from governance validation
 * @returns {object} Phase result with status
 */
function guardedCycle({
  session_id,
  scope = 'project',
  user_input,
  context_keys = [],
  now,
  byte_budget = 8000,
  max_cells = 20,
  max_experiences = 10,
  draft,
  finalize_result,
  governance_result
}) {
  const session = getSession(session_id);
  if (!session) {
    return { error: true, code: 'SESSION_NOT_FOUND', message: `Session ${session_id} not found` };
  }

  const lastPhase = session.last_phase;
  const nextPhaseIndex = lastPhase ? PHASES.indexOf(lastPhase) + 1 : 0;

  if (nextPhaseIndex >= PHASES.length) {
    return { error: true, code: 'CYCLE_COMPLETE', message: 'All phases already completed' };
  }

  const currentPhase = PHASES[nextPhaseIndex];
  let phaseResult;

  switch (currentPhase) {
    case 'SNAPSHOT': {
      const flags = JSON.parse(session.flags_json || '{}');
      phaseResult = {
        phase: 'SNAPSHOT',
        session_id,
        scope_mode: session.scope_mode,
        flags,
        last_phase: lastPhase,
        last_context_hash: session.last_context_hash,
        status: 'ok'
      };
      break;
    }

    case 'ROUTER': {
      // Determine next actions based on state
      const requiredElements = [];
      if (!user_input && !draft) {
        requiredElements.push('user_input or draft');
      }
      if (requiredElements.length > 0) {
        phaseResult = {
          phase: 'ROUTER',
          status: 'blocked',
          missing: requiredElements,
          message: 'Required elements missing'
        };
      } else {
        phaseResult = {
          phase: 'ROUTER',
          status: 'ok',
          next_action: draft ? 'FINALIZE_RESPONSE' : 'CONTEXT_PACK',
          has_draft: !!draft
        };
      }
      break;
    }

    case 'CONTEXT_PACK': {
      const packed = contextPack({
        session_id,
        scope,
        context_keys,
        max_cells,
        max_experiences,
        byte_budget,
        now
      });
      phaseResult = {
        phase: 'CONTEXT_PACK',
        status: 'ok',
        ...packed
      };
      break;
    }

    case 'DRAFT': {
      if (draft) {
        // Record draft invocation hashes
        recordInvocation({
          session_id,
          tool_name: 'draft',
          input_obj: { user_input, context_keys },
          output_obj: { draft },
          now
        });
        phaseResult = {
          phase: 'DRAFT',
          status: 'ok',
          draft_provided: true
        };
      } else {
        phaseResult = {
          phase: 'DRAFT',
          status: 'waiting',
          message: 'Draft not provided. Caller should produce draft and re-submit.'
        };
      }
      break;
    }

    case 'FINALIZE_RESPONSE': {
      if (finalize_result) {
        phaseResult = {
          phase: 'FINALIZE_RESPONSE',
          status: 'ok',
          ...finalize_result
        };
      } else {
        phaseResult = {
          phase: 'FINALIZE_RESPONSE',
          status: 'waiting',
          message: 'Call finalize_response with draft and memory signals, then re-submit.'
        };
      }
      break;
    }

    case 'GOVERNANCE_VALIDATE': {
      if (governance_result) {
        phaseResult = {
          phase: 'GOVERNANCE_VALIDATE',
          status: governance_result.valid ? 'ok' : 'failed',
          ...governance_result
        };
      } else {
        phaseResult = {
          phase: 'GOVERNANCE_VALIDATE',
          status: 'waiting',
          message: 'Call governance validation, then re-submit.'
        };
      }
      break;
    }

    case 'MEMORY_UPDATE': {
      // Record experience based on cycle outcome
      const outcome = (governance_result && governance_result.valid) ? 'success' : 'fail';
      recordExperience({
        session_id,
        scope,
        context_keys,
        summary: `Guarded cycle completed for: ${(user_input || '').slice(0, 100)}`,
        outcome,
        trust: 1,
        source: 'system',
        now
      });
      phaseResult = {
        phase: 'MEMORY_UPDATE',
        status: 'ok',
        outcome
      };
      break;
    }
  }

  // Update session phase
  updateSession(session_id, { last_phase: currentPhase });

  return phaseResult;
}

/**
 * Get the current phase for a session.
 *
 * @param {number} sessionId
 * @returns {object} { current_phase, next_phase, completed }
 */
function getCycleStatus(sessionId) {
  const session = getSession(sessionId);
  if (!session) return null;

  const lastPhase = session.last_phase;
  const lastIndex = lastPhase ? PHASES.indexOf(lastPhase) : -1;
  const nextIndex = lastIndex + 1;

  return {
    current_phase: lastPhase || null,
    next_phase: nextIndex < PHASES.length ? PHASES[nextIndex] : null,
    completed: nextIndex >= PHASES.length,
    phases_done: PHASES.slice(0, lastIndex + 1),
    phases_remaining: PHASES.slice(lastIndex + 1)
  };
}

module.exports = {
  PHASES,
  guardedCycle,
  getCycleStatus
};
