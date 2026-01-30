/**
 * Reasoning Tools
 * 
 * Tools for structured problem analysis and decision-making.
 * Implements a multi-phase reasoning workflow with context gathering and confidence tracking.
 */

const { getDatabase, logActivity } = require('../database.js');
const { ValidationError } = require('../validation.js');

// Import knowledge tools for auto-recording experiences
const { recordExperience } = require('./knowledge.js');

function analyzeProblem(params) {
  if (!params.problem || typeof params.problem !== 'string') {
    throw new ValidationError(
      'Missing or invalid "problem" parameter',
      'Required: problem = string (user request or question)\\n\\n' +
      'Example:\\n' +
      JSON.stringify({
        problem: 'How to implement user authentication in my React app',
        available_tools: ['search_experiences', 'web_search', 'read_file']
      }, null, 2)
    );
  }

  // Generate session ID
  const sessionId = `reasoning-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Extract key concepts (simple word extraction)
  const words = params.problem.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3);

  const keyConcepts = [...new Set(words)].slice(0, 10);

  // Detect intent patterns
  const userIntent = {
    goal: detectGoal(params.problem),
    priority: detectPriority(params.problem),
    format: detectFormat(params.problem),
    context: detectContext(params.problem)
  };

  // Suggest queries based on problem
  const suggestedQueries = {
    search: {
      query: keyConcepts.slice(0, 5).join(' '),
      patterns: keyConcepts
    },
    localFiles: suggestLocalFiles(params.problem),
    webSearch: {
      query: `${params.problem} best practices 2026`
    }
  };

  // Check available tools
  const availableTools = params.available_tools || [];
  if (availableTools.includes('search_experiences') || availableTools.length === 0) {
    suggestedQueries.search.recommended = true;
  }

  // Create reasoning session
  getDatabase().prepare(`
    INSERT INTO reasoning_sessions (session_id, problem, user_intent, phase)
    VALUES (?, ?, ?, ?)
  `).run(sessionId, params.problem, JSON.stringify(userIntent), 'analyze');

  logActivity('problem_analyzed', sessionId, { problem: params.problem });

  return {
    session_id: sessionId,
    user_intent: userIntent,
    suggested_queries: suggestedQueries,
    key_concepts: keyConcepts,
    next_step: 'Call gather_context with sources collected from suggested queries'
  };
}

function detectGoal(problem) {
  const p = problem.toLowerCase();
  if (p.includes('how') || p.includes('implement') || p.includes('build')) return 'implementation';
  if (p.includes('why') || p.includes('explain')) return 'understanding';
  if (p.includes('fix') || p.includes('debug') || p.includes('error')) return 'debugging';
  if (p.includes('choose') || p.includes('select') || p.includes('which')) return 'decision';
  return 'general';
}

function detectPriority(problem) {
  const p = problem.toLowerCase();
  if (p.includes('urgent') || p.includes('asap') || p.includes('critical')) return 'high';
  if (p.includes('when you can') || p.includes('eventually')) return 'low';
  return 'medium';
}

function detectFormat(problem) {
  const p = problem.toLowerCase();
  if (p.includes('step by step') || p.includes('guide') || p.includes('tutorial')) return 'tutorial';
  if (p.includes('example') || p.includes('show me')) return 'example';
  if (p.includes('list') || p.includes('options')) return 'list';
  return 'explanation';
}

function detectContext(problem) {
  const p = problem.toLowerCase();
  const contexts = [];
  if (p.includes('react') || p.includes('vue') || p.includes('angular')) contexts.push('frontend');
  if (p.includes('node') || p.includes('express') || p.includes('api')) contexts.push('backend');
  if (p.includes('database') || p.includes('sql') || p.includes('mongodb')) contexts.push('database');
  if (p.includes('test') || p.includes('testing')) contexts.push('testing');
  return contexts.join(', ') || 'general';
}

function suggestLocalFiles(problem) {
  const suggestions = [];
  const p = problem.toLowerCase();

  if (p.includes('auth') || p.includes('login') || p.includes('user')) {
    suggestions.push('src/auth/', 'src/components/Auth', 'README.md');
  }
  if (p.includes('config') || p.includes('setup')) {
    suggestions.push('package.json', 'tsconfig.json', '.env.example');
  }
  if (p.includes('test')) {
    suggestions.push('test/', '__tests__/', '*.test.*');
  }

  return suggestions.length > 0 ? suggestions : ['README.md', 'docs/', 'src/'];
}

/**
 * Tool 8: gather_context
 * Collect and synthesize context from multiple sources
 */
function gatherContext(params) {
  if (!params.session_id) {
    throw new ValidationError(
      'Missing "session_id" parameter',
      'Required: session_id from analyze_problem\\n\\n' +
      'Example:\\n' +
      JSON.stringify({
        session_id: 'reasoning-123-abc',
        problem: 'Same problem from analyze step',
        sources: {
          experiences: [],
          local_docs: [],
          mcp_data: {},
          web_results: []
        }
      }, null, 2)
    );
  }

  if (!params.sources || typeof params.sources !== 'object') {
    throw new ValidationError(
      'Missing or invalid "sources" parameter',
      'Required: sources = object with experiences, local_docs, mcp_data, web_results\\n\\n' +
      'At least one source should have data.'
    );
  }

  // Get session
  const session = getDatabase().prepare(`
    SELECT * FROM reasoning_sessions WHERE session_id = ?
  `).get(params.session_id);

  if (!session) {
    throw new ValidationError(
      `Session not found: ${params.session_id}`,
      'Create a session first with analyze_problem'
    );
  }

  // Count sources
  const experiences = params.sources.experiences || [];
  const localDocs = params.sources.local_docs || [];
  const mcpData = params.sources.mcp_data || {};
  const webResults = params.sources.web_results || [];

  const totalItems = experiences.length + localDocs.length +
                     Object.keys(mcpData).length + webResults.length;

  if (totalItems === 0) {
    return {
      session_id: params.session_id,
      synthesized_context: 'No context sources provided. Consider searching experiences or reading relevant files.',
      token_count: 50,
      priority_breakdown: { critical: 0, high: 0, medium: 0, low: 0 },
      warning: 'Empty context - reasoning will be based on general knowledge only'
    };
  }

  // Synthesize context with 4-tier priority system
  let synthesis = '';
  let tokenCount = 0;
  const MAX_TOKENS = 20000;
  const priority = { critical: 0, high: 0, medium: 0, low: 0 };

  // TIER 1: Critical - Effective experiences
  const effective = experiences.filter(e => e.type === 'effective').slice(0, 5);
  if (effective.length > 0) {
    synthesis += '## Effective Approaches\\n\\n';
    for (const exp of effective) {
      synthesis += `- **${exp.domain}**: ${exp.approach} → ${exp.outcome}\\n`;
      tokenCount += 50;
      priority.critical++;
    }
    synthesis += '\\n';
  }

  // TIER 2: High - Local documentation
  if (localDocs.length > 0 && tokenCount < MAX_TOKENS * 0.6) {
    synthesis += '## Project Documentation\\n\\n';
    for (const doc of localDocs.slice(0, 3)) {
      synthesis += `**${doc.path}**: ${(doc.content || '').substring(0, 200)}...\\n\\n`;
      tokenCount += 100;
      priority.high++;
    }
  }

  // TIER 3: Medium - MCP data and web results
  if (Object.keys(mcpData).length > 0 && tokenCount < MAX_TOKENS * 0.8) {
    synthesis += '## Additional Context\\n\\n';
    for (const [key, value] of Object.entries(mcpData)) {
      synthesis += `${key}: ${JSON.stringify(value).substring(0, 100)}...\\n`;
      tokenCount += 50;
      priority.medium++;
    }
  }

  // TIER 4: Low - Ineffective experiences (what NOT to do)
  const ineffective = experiences.filter(e => e.type === 'ineffective').slice(0, 2);
  if (ineffective.length > 0 && tokenCount < MAX_TOKENS * 0.9) {
    synthesis += '\\n## Approaches to Avoid\\n\\n';
    for (const exp of ineffective) {
      synthesis += `- **Don't**: ${exp.approach} (${exp.outcome})\\n`;
      tokenCount += 40;
      priority.low++;
    }
  }

  // Update session
  getDatabase().prepare(`
    UPDATE reasoning_sessions
    SET phase = ?, updated_at = strftime('%s', 'now')
    WHERE session_id = ?
  `).run('gather', params.session_id);

  logActivity('context_gathered', params.session_id, {
    total_items: totalItems,
    token_count: tokenCount
  });

  return {
    session_id: params.session_id,
    synthesized_context: synthesis,
    token_count: tokenCount,
    priority_breakdown: priority,
    next_step: 'Call reason_through to evaluate approaches'
  };
}

/**
 * Tool 9: reason_through
 * Evaluate an approach or thought with confidence tracking
 */
function reasonThrough(params) {
  if (!params.session_id) {
    throw new ValidationError(
      'Missing "session_id" parameter',
      'Required: session_id from analyze_problem'
    );
  }

  if (!params.thought || typeof params.thought !== 'string') {
    throw new ValidationError(
      'Missing or invalid "thought" parameter',
      'Required: thought = string (reasoning step)\\n\\n' +
      'Example:\\n' +
      JSON.stringify({
        session_id: 'reasoning-123-abc',
        thought: 'Use JWT tokens for stateless authentication',
        thought_number: 1,
        confidence: 0.8
      }, null, 2)
    );
  }

  if (typeof params.thought_number !== 'number' || params.thought_number < 1) {
    throw new ValidationError(
      'Missing or invalid "thought_number" parameter',
      'Required: thought_number = positive integer (1, 2, 3...)\\n\\n' +
      'Use sequential numbering for your reasoning chain.'
    );
  }

  // Get session
  const session = getDatabase().prepare(`
    SELECT * FROM reasoning_sessions WHERE session_id = ?
  `).get(params.session_id);

  if (!session) {
    throw new ValidationError(
      `Session not found: ${params.session_id}`,
      'Create a session first with analyze_problem'
    );
  }

  // Detect scope creep (thought doesn't match original problem)
  const problemWords = new Set(session.problem.toLowerCase().split(/\s+/));
  const thoughtWords = new Set(params.thought.toLowerCase().split(/\s+/));
  const overlap = [...problemWords].filter(w => thoughtWords.has(w)).length;
  const scopeCreep = overlap < 2;

  // Insert thought
  const result = getDatabase().prepare(`
    INSERT INTO reasoning_thoughts (session_id, thought_number, thought, confidence, is_revision, revises_thought)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    params.session_id,
    params.thought_number,
    params.thought,
    params.confidence || null,
    params.is_revision ? 1 : 0,
    params.revises_thought || null
  );

  // Update session phase
  getDatabase().prepare(`
    UPDATE reasoning_sessions
    SET phase = ?, updated_at = strftime('%s', 'now')
    WHERE session_id = ?
  `).run('reason', params.session_id);

  logActivity('thought_recorded', params.session_id, {
    thought_number: params.thought_number,
    confidence: params.confidence
  });

  return {
    session_id: params.session_id,
    thought_id: result.lastInsertRowid,
    thought_number: params.thought_number,
    scope_creep_detected: scopeCreep,
    scope_creep_warning: scopeCreep ?
      'This thought may be diverging from the original problem. Consider refocusing.' : null,
    next_step: params.thought_number === 1 ?
      'Continue with more thoughts or call finalize_decision' :
      'Call finalize_decision when reasoning is complete'
  };
}

/**
 * Tool 10: finalize_decision
 * Record final decision/conclusion and close reasoning session
 */
function finalizeDecision(params) {
  if (!params.session_id) {
    throw new ValidationError(
      'Missing "session_id" parameter',
      'Required: session_id from analyze_problem'
    );
  }

  if (!params.conclusion || typeof params.conclusion !== 'string') {
    throw new ValidationError(
      'Missing or invalid "conclusion" parameter',
      'Required: conclusion = string (final decision)\\n\\n' +
      'Example:\\n' +
      JSON.stringify({
        session_id: 'reasoning-123-abc',
        conclusion: 'Implement JWT-based authentication with refresh tokens',
        rationale: 'Stateless, scalable, and well-supported by libraries',
        record_as_experience: true
      }, null, 2)
    );
  }

  // Get session
  const session = getDatabase().prepare(`
    SELECT * FROM reasoning_sessions WHERE session_id = ?
  `).get(params.session_id);

  if (!session) {
    throw new ValidationError(
      `Session not found: ${params.session_id}`,
      'Create a session first with analyze_problem'
    );
  }

  // Get all thoughts
  const thoughts = getDatabase().prepare(`
    SELECT * FROM reasoning_thoughts
    WHERE session_id = ?
    ORDER BY thought_number
  `).all(params.session_id);

  let experienceId = null;

  // Auto-capture as experience if requested (default: true)
  if (params.record_as_experience !== false) {
    const userIntent = JSON.parse(session.user_intent || '{}');

    try {
      const expResult = recordExperience({
        type: 'effective',
        domain: userIntent.goal === 'debugging' ? 'Debugging' : 'Decision',
        situation: session.problem,
        approach: thoughts.map(t => t.thought).join('; '),
        outcome: params.conclusion,
        reasoning: params.rationale || 'Systematic reasoning process',
        confidence: thoughts.length > 0 ?
          (thoughts.reduce((sum, t) => sum + (t.confidence || 0.5), 0) / thoughts.length) : 0.7,
        scope: 'auto'
      });

      if (expResult.recorded) {
        experienceId = expResult.experience_id;
      }
    } catch (e) {
      // Don't fail if experience recording fails
      console.error('[unified-mcp] Warning: Could not record experience:', e.message);
    }
  }

  // Finalize session
  getDatabase().prepare(`
    UPDATE reasoning_sessions
    SET phase = ?, conclusion = ?, finalized_at = strftime('%s', 'now'),
        updated_at = strftime('%s', 'now'), experience_id = ?
    WHERE session_id = ?
  `).run('finalized', params.conclusion, experienceId, params.session_id);

  logActivity('decision_finalized', params.session_id, {
    conclusion: params.conclusion,
    experience_id: experienceId
  });

  return {
    session_id: params.session_id,
    conclusion: params.conclusion,
    experience_id: experienceId,
    session_summary: {
      problem: session.problem,
      thoughts_count: thoughts.length,
      avg_confidence: thoughts.length > 0 ?
        (thoughts.reduce((sum, t) => sum + (t.confidence || 0.5), 0) / thoughts.length) : null
    },
    message: experienceId ?
      `Decision finalized and recorded as experience ${experienceId}` :
      'Decision finalized'
  };
}

// ============================================================================
// WORKFLOW ENFORCEMENT TOOLS (5 tools)
// ============================================================================

/**
 * Tool 11: check_compliance
 * Check if current state satisfies workflow requirements (dry-run, doesn't enforce)
 */


module.exports = {
  analyzeProblem,
  gatherContext,
  reasonThrough,
  finalizeDecision
};
