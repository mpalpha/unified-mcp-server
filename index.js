#!/usr/bin/env node

/**
 * Unified MCP Server v1.7.0
 *
 * Combines memory-augmented reasoning and protocol enforcement with modern tool ergonomics.
 * - 28 atomic, composable tools (not monolithic)
 * - Project-scoped experiences (v1.4.0)
 * - Zero-config defaults
 * - Automated hook installation
 * - Comprehensive documentation
 * - Modularized codebase (v1.7.0)
 *
 * Version: 1.7.0
 * License: MIT
 * Author: Jason Lusk <jason@jasonlusk.com>
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const crypto = require('crypto');

// v1.7.0: Import from modules
const { ValidationError, diceCoefficient, getBigrams } = require('./src/validation');
const {
  getProjectDir, getDbPath, getTokenDir, getConfigPath,
  ensureProjectContext, ensureGlobalConfig,
  initDatabase, getDatabase, logActivity
} = require('./src/database');

// v1.7.0: Import knowledge management tools from module
const {
  findDuplicate,
  recordExperience,
  searchExperiences,
  getExperience,
  updateExperience,
  tagExperience,
  exportExperiences,
  importExperiences
} = require('./src/tools/knowledge');

// v1.7.0: Import reasoning tools from module
const {
  detectGoal,
  detectPriority,
  detectFormat,
  detectContext,
  suggestLocalFiles,
  analyzeProblem,
  gatherContext,
  reasonThrough,
  finalizeDecision
} = require('./src/tools/reasoning');

// v1.7.0: Import workflow enforcement tools from module
const {
  checkCompliance,
  verifyCompliance,
  authorizeOperation,
  getWorkflowStatus,
  resetWorkflow
} = require('./src/tools/workflow');

const VERSION = '1.7.0';

// v1.7.0: Database and validation functions imported from modules
// Legacy constants for backward compatibility
const MCP_DIR = getProjectDir();
const TOKEN_DIR = getTokenDir();
const DB_PATH = getDbPath();

// v1.7.0: Initialize database using module
const db = getDatabase();

// v1.7.0: Knowledge management tools imported from ./src/tools/knowledge.js
// v1.7.0: Reasoning tools imported from ./src/tools/reasoning.js
// v1.7.0: Workflow enforcement tools imported from ./src/tools/workflow.js

// v1.7.0: Import configuration tools from module
const {
  BUILT_IN_PRESETS,
  listPresets,
  applyPreset,
  validateConfig,
  getConfig,
  exportConfig
} = require('./src/tools/config');

// v1.7.0: Import automation tools from module
const {
  installHooks,
  uninstallHooks,
  getSessionState,
  healthCheck,
  importData,
  updateProjectContext,
  getProjectContext
} = require('./src/tools/automation');

// v1.7.0: Import CLI module
const { runCLI } = require('./src/cli');

// v1.7.0: All tool implementations imported from modules

// ============================================================================
// CLI MODE (if flags provided)
// ============================================================================

const args = process.argv.slice(2);

// Run CLI if any flags provided
const cliRan = runCLI({
  args,
  VERSION,
  MCP_DIR,
  TOKEN_DIR,
  DB_PATH,
  BUILT_IN_PRESETS,
  installHooks,
  healthCheck,
  validateConfig
});

// If CLI ran and exited, this won't execute
// If CLI returned false, continue to MCP server

// No CLI flags provided - start MCP server
// ============================================================================
// MCP PROTOCOL IMPLEMENTATION
// ============================================================================

// State management
const state = {
  sessions: new Map()
};

// Read stdin
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Send JSON-RPC response
function sendResponse(id, result) {
  const response = {
    jsonrpc: '2.0',
    id: id,
    result: result
  };
  console.log(JSON.stringify(response));
}

// Send JSON-RPC error
function sendError(id, code, message, data) {
  const error = {
    jsonrpc: '2.0',
    id: id,
    error: {
      code: code,
      message: message
    }
  };
  if (data) error.error.data = data;
  console.log(JSON.stringify(error));
}

// Handle JSON-RPC requests
rl.on('line', (line) => {
  try {
    const request = JSON.parse(line);
    const { method, params, id } = request;

    switch (method) {
      case 'initialize':
        sendResponse(id, {
          protocolVersion: '2024-11-05',
          serverInfo: {
            name: 'unified-mcp-server',
            version: VERSION
          },
          capabilities: {
            tools: {}
          }
        });
        break;

      case 'tools/list':
        sendResponse(id, {
          tools: [
            {
              name: 'record_experience',
              description: 'Record a working knowledge pattern (effective or ineffective approach). Also use for "remember X" requests - stores user-directed memories for later recall.',
              inputSchema: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['effective', 'ineffective'] },
                  domain: { type: 'string', enum: ['Tools', 'Protocol', 'Communication', 'Process', 'Debugging', 'Decision'] },
                  situation: { type: 'string' },
                  approach: { type: 'string' },
                  outcome: { type: 'string' },
                  reasoning: { type: 'string' },
                  confidence: { type: 'number', minimum: 0, maximum: 1 },
                  // v1.4.0: scope removed - all experiences are project-scoped by location
                  tags: { type: 'array', items: { type: 'string' } },
                  revision_of: { type: 'number' }
                },
                required: ['type', 'domain', 'situation', 'approach', 'outcome', 'reasoning']
              }
            },
            {
              name: 'search_experiences',
              description: 'Search for relevant working knowledge using natural language queries with FTS5 + BM25 ranking. Also use for "what did I tell you?" or "recall X" - retrieves stored memories and past experiences.',
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Multi-term search query (uses OR logic)' },
                  domain: { type: 'string', enum: ['Tools', 'Protocol', 'Communication', 'Process', 'Debugging', 'Decision'] },
                  type: { type: 'string', enum: ['effective', 'ineffective'] },
                  min_confidence: { type: 'number', minimum: 0, maximum: 1 },
                  limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
                  offset: { type: 'number', minimum: 0, default: 0 }
                },
                required: ['query']
              }
            },
            {
              name: 'get_experience',
              description: 'Retrieve a specific experience by ID with full details including revision history',
              inputSchema: {
                type: 'object',
                properties: {
                  id: { type: 'number', description: 'Experience ID from search results' }
                },
                required: ['id']
              }
            },
            {
              name: 'update_experience',
              description: 'Update an existing experience (creates revision, preserves history)',
              inputSchema: {
                type: 'object',
                properties: {
                  id: { type: 'number' },
                  changes: { type: 'object', description: 'Fields to update' },
                  reason: { type: 'string', description: 'Why updating (audit trail)' }
                },
                required: ['id', 'changes', 'reason']
              }
            },
            {
              name: 'tag_experience',
              description: 'Add searchable tags to experiences for better organization',
              inputSchema: {
                type: 'object',
                properties: {
                  id: { type: 'number' },
                  tags: { type: 'array', items: { type: 'string' } }
                },
                required: ['id', 'tags']
              }
            },
            {
              name: 'export_experiences',
              description: 'Export experiences to JSON or Markdown for sharing/backup',
              inputSchema: {
                type: 'object',
                properties: {
                  format: { type: 'string', enum: ['json', 'markdown'] },
                  filter: { type: 'object', description: 'Optional filters (domain, type, tags)' },
                  output_path: { type: 'string', description: 'Optional file path (defaults to stdout)' }
                },
                required: ['format']
              }
            },
            {
              name: 'import_experiences',
              description: 'Import experiences from a JSON file exported from another project',
              inputSchema: {
                type: 'object',
                properties: {
                  filename: { type: 'string', description: 'Path to JSON file to import' },
                  filter: { type: 'object', description: 'Optional filters (domain, type)' }
                },
                required: ['filename']
              }
            },
            {
              name: 'analyze_problem',
              description: 'Extract intent, concepts, and priorities from a user request. First step in reasoning workflow.',
              inputSchema: {
                type: 'object',
                properties: {
                  problem: { type: 'string', description: 'User request or question' },
                  available_tools: { type: 'array', items: { type: 'string' }, description: 'MCP tool names available' }
                },
                required: ['problem']
              }
            },
            {
              name: 'gather_context',
              description: 'Collect and synthesize context from multiple sources (experiences, docs, MCP tools)',
              inputSchema: {
                type: 'object',
                properties: {
                  session_id: { type: 'string', description: 'Session ID from analyze_problem' },
                  problem: { type: 'string', description: 'Original problem statement' },
                  sources: {
                    type: 'object',
                    description: 'Context sources',
                    properties: {
                      experiences: { type: 'array', description: 'From search_experiences' },
                      local_docs: { type: 'array', description: 'From Read tool' },
                      mcp_data: { type: 'object', description: 'From other MCP servers' },
                      web_results: { type: 'array', description: 'From WebSearch' }
                    }
                  }
                },
                required: ['session_id', 'sources']
              }
            },
            {
              name: 'reason_through',
              description: 'Evaluate an approach or thought with confidence tracking. Can be called multiple times for sequential reasoning.',
              inputSchema: {
                type: 'object',
                properties: {
                  session_id: { type: 'string' },
                  thought: { type: 'string', description: 'Reasoning step' },
                  thought_number: { type: 'number', description: 'Sequential number (1, 2, 3...)' },
                  confidence: { type: 'number', minimum: 0, maximum: 1 },
                  is_revision: { type: 'boolean', description: 'Revising previous thought?' },
                  revises_thought: { type: 'number', description: 'Which thought to revise' }
                },
                required: ['session_id', 'thought', 'thought_number']
              }
            },
            {
              name: 'finalize_decision',
              description: 'Record final decision/conclusion and close reasoning session',
              inputSchema: {
                type: 'object',
                properties: {
                  session_id: { type: 'string' },
                  conclusion: { type: 'string', description: 'Final decision' },
                  rationale: { type: 'string', description: 'Why this decision' },
                  record_as_experience: { type: 'boolean', description: 'Auto-capture as experience? (default: true)' }
                },
                required: ['session_id', 'conclusion']
              }
            },
            {
              name: 'check_compliance',
              description: 'Check workflow compliance without enforcement (dry-run mode)',
              inputSchema: {
                type: 'object',
                properties: {
                  session_id: { type: 'string' },
                  current_phase: { type: 'string', enum: ['teach', 'learn', 'reason'], description: 'Current workflow phase' },
                  action: { type: 'string', description: 'Action being attempted' }
                },
                required: ['current_phase', 'action']
              }
            },
            {
              name: 'verify_compliance',
              description: 'Verify workflow compliance and create operation token',
              inputSchema: {
                type: 'object',
                properties: {
                  session_id: { type: 'string' },
                  current_phase: { type: 'string', enum: ['teach', 'learn', 'reason'], description: 'Current workflow phase' },
                  action: { type: 'string', description: 'Action being attempted' }
                },
                required: ['current_phase', 'action']
              }
            },
            {
              name: 'authorize_operation',
              description: 'Authorize operation with token and optionally create session token',
              inputSchema: {
                type: 'object',
                properties: {
                  operation_token: { type: 'string', description: 'Token from verify_compliance' },
                  create_session_token: { type: 'boolean', description: 'Create 60min session token?' }
                },
                required: ['operation_token']
              }
            },
            {
              name: 'get_workflow_status',
              description: 'Get current workflow session status and phase',
              inputSchema: {
                type: 'object',
                properties: {
                  session_id: { type: 'string' }
                }
              }
            },
            {
              name: 'reset_workflow',
              description: 'Reset workflow session and cleanup expired tokens',
              inputSchema: {
                type: 'object',
                properties: {
                  session_id: { type: 'string' },
                  cleanup_only: { type: 'boolean', description: 'Only cleanup expired tokens?' }
                }
              }
            },
            {
              name: 'list_presets',
              description: 'List available configuration presets',
              inputSchema: {
                type: 'object',
                properties: {}
              }
            },
            {
              name: 'apply_preset',
              description: 'Apply a configuration preset to session',
              inputSchema: {
                type: 'object',
                properties: {
                  preset_name: { type: 'string', description: 'Name of preset to apply' },
                  session_id: { type: 'string', description: 'Session to apply preset to' }
                },
                required: ['preset_name']
              }
            },
            {
              name: 'validate_config',
              description: 'Validate a configuration structure',
              inputSchema: {
                type: 'object',
                properties: {
                  config: { type: 'object', description: 'Configuration object to validate' }
                },
                required: ['config']
              }
            },
            {
              name: 'get_config',
              description: 'Get current active configuration',
              inputSchema: {
                type: 'object',
                properties: {
                  session_id: { type: 'string', description: 'Session ID (optional)' }
                }
              }
            },
            {
              name: 'export_config',
              description: 'Export configuration preset to file',
              inputSchema: {
                type: 'object',
                properties: {
                  preset_name: { type: 'string', description: 'Preset name to export' },
                  file_path: { type: 'string', description: 'Export file path (optional)' }
                },
                required: ['preset_name']
              }
            },
            {
              name: 'install_hooks',
              description: 'Install workflow automation hooks to ~/.claude/hooks/ (global by default, use project_hooks:true for project-local)',
              inputSchema: {
                type: 'object',
                properties: {}
              }
            },
            {
              name: 'uninstall_hooks',
              description: 'Remove installed workflow hooks from ~/.claude/hooks/',
              inputSchema: {
                type: 'object',
                properties: {}
              }
            },
            {
              name: 'get_session_state',
              description: 'Get complete session state',
              inputSchema: {
                type: 'object',
                properties: {
                  session_id: { type: 'string', description: 'Session ID to get state for' }
                },
                required: ['session_id']
              }
            },
            {
              name: 'health_check',
              description: 'Run system health diagnostics',
              inputSchema: {
                type: 'object',
                properties: {}
              }
            },
            {
              name: 'import_data',
              description: 'Import data from legacy servers',
              inputSchema: {
                type: 'object',
                properties: {
                  source_file: { type: 'string', description: 'Path to JSON file with experiences' }
                },
                required: ['source_file']
              }
            },
            {
              name: 'update_project_context',
              description: 'Update project-specific context (data-only, no code execution)',
              inputSchema: {
                type: 'object',
                properties: {
                  enabled: { type: 'boolean', description: 'Enable/disable project context display' },
                  summary: { type: 'string', description: 'One-line project summary (max 200 chars)' },
                  highlights: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Key project highlights (max 5 items, 100 chars each)'
                  },
                  reminders: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Important reminders (max 3 items, 100 chars each)'
                  },
                  preImplementation: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Checklist items to address BEFORE writing code (200 chars each)'
                  },
                  postImplementation: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Checklist items to verify AFTER writing code (200 chars each)'
                  },
                  project_path: { type: 'string', description: 'Project directory path (optional, defaults to cwd)' }
                },
                required: ['enabled']
              }
            },
            {
              name: 'get_project_context',
              description: 'Get current project context configuration',
              inputSchema: {
                type: 'object',
                properties: {
                  project_path: { type: 'string', description: 'Project directory path (optional, defaults to cwd)' }
                }
              }
            }
          ]
        });
        break;

      case 'tools/call':
        const toolName = params.name;
        const toolParams = params.arguments || {};

        let result;
        try {
          switch (toolName) {
            case 'record_experience':
              result = recordExperience(toolParams);
              break;
            case 'search_experiences':
              result = searchExperiences(toolParams);
              break;
            case 'get_experience':
              result = getExperience(toolParams);
              break;
            case 'update_experience':
              result = updateExperience(toolParams);
              break;
            case 'tag_experience':
              result = tagExperience(toolParams);
              break;
            case 'export_experiences':
              result = exportExperiences(toolParams);
              break;
            case 'import_experiences':
              result = importExperiences(toolParams);
              break;
            case 'analyze_problem':
              result = analyzeProblem(toolParams);
              break;
            case 'gather_context':
              result = gatherContext(toolParams);
              break;
            case 'reason_through':
              result = reasonThrough(toolParams);
              break;
            case 'finalize_decision':
              result = finalizeDecision(toolParams);
              break;
            case 'check_compliance':
              result = checkCompliance(toolParams);
              break;
            case 'verify_compliance':
              result = verifyCompliance(toolParams);
              break;
            case 'authorize_operation':
              result = authorizeOperation(toolParams);
              break;
            case 'get_workflow_status':
              result = getWorkflowStatus(toolParams);
              break;
            case 'reset_workflow':
              result = resetWorkflow(toolParams);
              break;
            case 'list_presets':
              result = listPresets(toolParams);
              break;
            case 'apply_preset':
              result = applyPreset(toolParams);
              break;
            case 'validate_config':
              result = validateConfig(toolParams);
              break;
            case 'get_config':
              result = getConfig(toolParams);
              break;
            case 'export_config':
              result = exportConfig(toolParams);
              break;
            case 'install_hooks':
              result = installHooks(toolParams);
              break;
            case 'uninstall_hooks':
              result = uninstallHooks(toolParams);
              break;
            case 'get_session_state':
              result = getSessionState(toolParams);
              break;
            case 'health_check':
              result = healthCheck(toolParams);
              break;
            case 'import_data':
              result = importData(toolParams);
              break;
            case 'update_project_context':
              result = updateProjectContext(toolParams);
              break;
            case 'get_project_context':
              result = getProjectContext(toolParams);
              break;
            default:
              sendError(id, -32601, `Unknown tool: ${toolName}`);
              return;
          }

          sendResponse(id, {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          });
        } catch (error) {
          if (error instanceof ValidationError) {
            sendError(id, error.code, error.message, error.details);
          } else {
            console.error('[unified-mcp] Error:', error);
            sendError(id, -32603, 'Internal error: ' + error.message);
          }
        }
        break;

      case 'notifications/initialized':
        // No response needed for notifications
        break;

      default:
        sendError(id, -32601, `Unknown method: ${method}`);
    }
  } catch (error) {
    console.error('[unified-mcp] Error parsing request:', error);
    sendError(null, -32700, 'Parse error');
  }
});

// Handle STDIN close
rl.on('close', () => {
  console.error('[unified-mcp] STDIN closed, shutting down gracefully');
  setImmediate(() => {
    process.stdout.write('', () => {
      // Give a moment for any pending database operations to complete
      // This prevents FTS5 corruption when processes close rapidly
      setTimeout(() => {
        db.close();
        process.exit(0);
      }, 50);
    });
  });
});

// Handle errors
process.on('uncaughtException', (error) => {
  console.error('[unified-mcp] Uncaught exception:', error);
  process.exit(1);
});

// Auto-configure global settings (idempotent, self-healing)
const globalConfigUpdated = ensureGlobalConfig();
if (globalConfigUpdated) {
  console.error('⚠️ Configuration updated. Reload Claude Code/IDE for changes to take effect.');
}

console.error(`[unified-mcp] Server started (v${VERSION})`);
console.error(`[unified-mcp] Database: ${DB_PATH}`);
console.error(`[unified-mcp] Token directory: ${TOKEN_DIR}`);
