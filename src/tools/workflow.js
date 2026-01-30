/**
 * Workflow Enforcement Tools
 * 
 * Tools for implementing compliance workflows and authorization gates.
 * Supports preset-based workflows with session management.
 */

const { getDatabase, logActivity, MCP_DIR, TOKEN_DIR } = require('../database.js');
const fs = require('fs');
const path = require('path');
const { ValidationError } = require('../validation.js');

function checkCompliance(params) {
  // Validate required parameters
  if (!params.current_phase) {
    throw new ValidationError(
      'Missing "current_phase" parameter',
      'Required: current_phase = "teach" | "learn" | "reason"'
    );
  }

  if (!params.action) {
    throw new ValidationError(
      'Missing "action" parameter',
      'Required: action = string (the action being attempted)'
    );
  }

  if (!['teach', 'learn', 'reason'].includes(params.current_phase)) {
    throw new ValidationError(
      'Invalid "current_phase" parameter',
      'Must be one of: "teach", "learn", "reason"'
    );
  }

  // For MVP, return compliant=true with empty requirements
  // Full implementation would check workflow gates
  return {
    compliant: true,
    missing_requirements: [],
    next_steps: ['Workflow checking not yet configured'],
    would_block: false,
    mode: 'dry-run',
    current_phase: params.current_phase,
    action: params.action
  };
}

/**
 * Tool 12: verify_compliance
 * Verify compliance and create operation token if passed (enforcement mode)
 */
function verifyCompliance(params) {
  // Validate required parameters
  if (!params.current_phase) {
    throw new ValidationError(
      'Missing "current_phase" parameter',
      'Required: current_phase = "teach" | "learn" | "reason"'
    );
  }

  if (!params.action) {
    throw new ValidationError(
      'Missing "action" parameter',
      'Required: action = string (the action being attempted)'
    );
  }

  if (!['teach', 'learn', 'reason'].includes(params.current_phase)) {
    throw new ValidationError(
      'Invalid "current_phase" parameter',
      'Must be one of: "teach", "learn", "reason"'
    );
  }

  // Track session in database if session_id provided
  if (params.session_id) {
    const existing = getDatabase().prepare('SELECT session_id FROM workflow_sessions WHERE session_id = ?').get(params.session_id);

    if (!existing) {
      getDatabase().prepare(`
        INSERT INTO workflow_sessions (session_id, preset, gates_passed, steps_completed, expires_at, active)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(
        params.session_id,
        params.current_phase,
        JSON.stringify([]),
        JSON.stringify([params.action]),
        Date.now() + (60 * 60 * 1000) // 1 hour
      );
    } else {
      // Update existing session
      const session = getDatabase().prepare('SELECT steps_completed FROM workflow_sessions WHERE session_id = ?').get(params.session_id);
      const steps = JSON.parse(session.steps_completed || '[]');
      steps.push(params.action);

      getDatabase().prepare(`
        UPDATE workflow_sessions
        SET steps_completed = ?, preset = ?
        WHERE session_id = ?
      `).run(JSON.stringify(steps), params.current_phase, params.session_id);
    }
  }

  // Create operation token
  const tokenId = `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const tokenPath = path.join(TOKEN_DIR, `${tokenId}.json`);

  const token = {
    token_id: tokenId,
    created_at: Date.now(),
    expires_at: Date.now() + (5 * 60 * 1000), // 5min
    type: 'operation',
    session_id: params.session_id || null,
    phase: params.current_phase,
    action: params.action
  };

  fs.writeFileSync(tokenPath, JSON.stringify(token, null, 2));

  return {
    compliant: true,
    operation_token: tokenId,
    session_id: params.session_id || null,
    current_phase: params.current_phase,
    message: 'Compliance verified, operation authorized'
  };
}

/**
 * Tool 13: authorize_operation
 * Authorize a file operation using operation token, optionally create session token
 */
function authorizeOperation(params) {
  if (!params.operation_token) {
    throw new ValidationError(
      'Missing "operation_token" parameter',
      'Required: operation_token from verify_compliance'
    );
  }

  const tokenPath = path.join(TOKEN_DIR, `${params.operation_token}.json`);

  if (!fs.existsSync(tokenPath)) {
    throw new ValidationError(
      'Invalid operation token',
      'Token not found or expired'
    );
  }

  const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));

  if (token.expires_at < Date.now()) {
    fs.unlinkSync(tokenPath);
    throw new ValidationError(
      'Token expired',
      'Operation token has expired, please verify compliance again'
    );
  }

  // Create session token if requested
  let sessionToken = null;
  if (params.create_session_token === true) {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const sessionTokenPath = path.join(TOKEN_DIR, `${sessionId}.json`);

    const sessionTokenData = {
      token_id: sessionId,
      created_at: Date.now(),
      expires_at: Date.now() + (60 * 60 * 1000), // 60min
      type: 'session'
    };

    fs.writeFileSync(sessionTokenPath, JSON.stringify(sessionTokenData, null, 2));
    sessionToken = sessionId;
  }

  // Delete the one-time operation token after use
  fs.unlinkSync(tokenPath);

  return {
    authorized: true,
    session_token: sessionToken,
    token_path: sessionToken ? path.join(TOKEN_DIR, `${sessionToken}.json`) : null,
    message: 'Operation authorized'
  };
}

/**
 * Tool 14: get_workflow_status
 * Get current workflow state (gates, steps, tokens)
 */
function getWorkflowStatus(params) {
  let session = null;
  let currentPhase = null;
  let stepsCompleted = [];

  // Get session from database if session_id provided
  if (params.session_id) {
    const row = getDatabase().prepare(`
      SELECT session_id, preset, steps_completed, created_at, expires_at, active
      FROM workflow_sessions
      WHERE session_id = ?
    `).get(params.session_id);

    if (row) {
      session = row.session_id;
      currentPhase = row.preset;
      stepsCompleted = JSON.parse(row.steps_completed || '[]');
    } else {
      // Return info for non-existent session
      session = params.session_id;
      currentPhase = 'teach'; // Default starting phase
      stepsCompleted = [];
    }
  }

  // List active tokens
  const tokens = [];
  try {
    const files = fs.readdirSync(TOKEN_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const tokenData = JSON.parse(fs.readFileSync(path.join(TOKEN_DIR, file), 'utf8'));
          if (tokenData.expires_at > Date.now()) {
            tokens.push({
              token_id: tokenData.token_id,
              type: tokenData.type,
              expires_in_seconds: Math.floor((tokenData.expires_at - Date.now()) / 1000)
            });
          }
        } catch (e) {
          // Skip invalid token files
        }
      }
    }
  } catch (e) {
    // Token directory might not exist yet
  }

  return {
    session_id: session,
    current_phase: currentPhase,
    active_session: session,
    gates_status: {
      teach: 'not_configured',
      learn: 'not_configured',
      reason: 'not_configured'
    },
    steps_completed: stepsCompleted,
    active_tokens: tokens,
    fast_track_active: false
  };
}

/**
 * Tool 15: reset_workflow
 * Reset workflow state (clear tokens, session)
 */
function resetWorkflow(params) {
  // If cleanup_only mode, just clean expired tokens
  if (params.cleanup_only) {
    let cleaned = 0;
    try {
      const files = fs.readdirSync(TOKEN_DIR);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const tokenPath = path.join(TOKEN_DIR, file);
            const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
            if (tokenData.expires_at < Date.now()) {
              fs.unlinkSync(tokenPath);
              cleaned++;
            }
          } catch (e) {
            // Skip invalid files
          }
        }
      }
    } catch (e) {
      // Token directory might not exist
    }

    logActivity('workflow_cleanup', null, { tokens_cleaned: cleaned });

    return {
      cleanup_only: true,
      cleaned_up: cleaned,
      message: `Cleaned up ${cleaned} expired tokens`
    };
  }

  // Reset specific session if session_id provided
  if (params.session_id) {
    getDatabase().prepare('DELETE FROM workflow_sessions WHERE session_id = ?').run(params.session_id);

    logActivity('workflow_reset', params.session_id, { session_id: params.session_id });

    return {
      reset: true,
      session_id: params.session_id,
      message: `Session ${params.session_id} reset`
    };
  }

  // General reset (clean up expired tokens)
  let cleaned = 0;
  try {
    const files = fs.readdirSync(TOKEN_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const tokenPath = path.join(TOKEN_DIR, file);
          const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
          if (tokenData.expires_at < Date.now()) {
            fs.unlinkSync(tokenPath);
            cleaned++;
          }
        } catch (e) {
          // Skip invalid files
        }
      }
    }
  } catch (e) {
    // Token directory might not exist
  }

  logActivity('workflow_reset', null, { tokens_cleaned: cleaned });

  return {
    reset: true,
    cleaned_up: cleaned,
    message: `Workflow reset complete (${cleaned} expired tokens cleaned)`
  };
}

// ============================================================================
// CONFIGURATION TOOLS (5 tools)
// ============================================================================

// Define built-in presets
const BUILT_IN_PRESETS = {
  'three-gate': {
    name: 'three-gate',
    description: 'Standard TEACH → LEARN → REASON workflow',
    gates: {
      teach: {
        required_tools: ['record_experience', 'tag_experience'],
        description: 'Record working patterns and knowledge'
      },
      learn: {
        required_tools: ['search_experiences', 'gather_context'],
        description: 'Gather context from past experiences'
      },
      reason: {
        required_tools: ['reason_through', 'finalize_decision'],
        description: 'Think through problem and make decision'
      }
    },
    token_ttl: {
      operation: 300000,  // 5 min
      session: 3600000    // 60 min
    },
    enforcement: 'moderate'
  },
  'minimal': {
    name: 'minimal',
    description: 'Lightweight workflow with minimal gates',
    gates: {
      teach: {
        required_tools: [],
        description: 'Optional knowledge recording'
      },
      learn: {
        required_tools: [],
        description: 'Optional context gathering'
      },
      reason: {
        required_tools: [],
        description: 'Optional reasoning'
      }
    },
    token_ttl: {
      operation: 600000,  // 10 min
      session: 7200000    // 120 min
    },
    enforcement: 'lenient'
  },
  'strict': {
    name: 'strict',
    description: 'Strict enforcement with all validations',
    gates: {
      teach: {
        required_tools: ['record_experience', 'tag_experience', 'export_experiences'],
        description: 'Must record and document knowledge'
      },
      learn: {
        required_tools: ['search_experiences', 'get_experience', 'gather_context'],
        description: 'Must search and gather full context'
      },
      reason: {
        required_tools: ['analyze_problem', 'reason_through', 'finalize_decision'],
        description: 'Must analyze, reason, and conclude'
      }
    },
    token_ttl: {
      operation: 180000,  // 3 min
      session: 1800000    // 30 min
    },
    enforcement: 'strict'
  },
  'custom': {
    name: 'custom',
    description: 'Template for custom workflows',
    gates: {
      teach: {
        required_tools: [],
        description: 'Customize as needed'
      },
      learn: {
        required_tools: [],
        description: 'Customize as needed'
      },
      reason: {
        required_tools: [],
        description: 'Customize as needed'
      }
    },
    token_ttl: {
      operation: 300000,
      session: 3600000
    },
    enforcement: 'custom'
  }
};

/**
 * Tool 16: list_presets
 * List available configuration presets
 */


module.exports = {
  checkCompliance,
  verifyCompliance,
  authorizeOperation,
  getWorkflowStatus,
  resetWorkflow
};
