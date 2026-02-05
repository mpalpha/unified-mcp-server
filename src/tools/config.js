/**
 * Configuration Management Tools (v1.7.0)
 *
 * Tools for managing server configuration, presets, and validation:
 * - list_presets: List available configuration presets
 * - apply_preset: Apply a preset to current session
 * - validate_config: Validate a configuration structure
 * - get_config: Get current active configuration
 * - export_config: Export configuration to file
 *
 * Also exports BUILT_IN_PRESETS for CLI usage.
 *
 * v1.7.0: Synchronized with index.js implementation
 * v1.4.0: All presets stored in project-local .claude/presets/
 */

const fs = require('fs');
const path = require('path');
const { getDatabase, getProjectDir, logActivity } = require('../database.js');
const { ValidationError } = require('../validation.js');

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


function listPresets(params) {
  const presets = [];

  // Add built-in presets
  for (const [key, preset] of Object.entries(BUILT_IN_PRESETS)) {
    presets.push({
      name: preset.name,
      description: preset.description,
      enforcement: preset.enforcement,
      type: 'built-in'
    });
  }

  // v1.4.0: Add custom presets from project-local .claude/presets/
  const PRESETS_DIR = path.join(getProjectDir(), 'presets');
  try {
    if (fs.existsSync(PRESETS_DIR)) {
      const files = fs.readdirSync(PRESETS_DIR);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const presetPath = path.join(PRESETS_DIR, file);
            const customPreset = JSON.parse(fs.readFileSync(presetPath, 'utf8'));
            presets.push({
              name: customPreset.name,
              description: customPreset.description,
              enforcement: customPreset.enforcement || 'custom',
              type: 'custom',
              path: presetPath
            });
          } catch (e) {
            // Skip invalid preset files
          }
        }
      }
    }
  } catch (e) {
    // Presets directory might not exist
  }

  return {
    presets,
    count: presets.length,
    built_in_count: Object.keys(BUILT_IN_PRESETS).length,
    custom_count: presets.length - Object.keys(BUILT_IN_PRESETS).length
  };
}

/**
 * Tool 17: apply_preset
 * Apply a preset to current session
 */
function applyPreset(params) {
  if (!params.preset_name) {
    throw new ValidationError(
      'Missing "preset_name" parameter',
      'Required: preset_name = name of preset to apply'
    );
  }

  // Check built-in presets first
  let preset = BUILT_IN_PRESETS[params.preset_name];

  // If not built-in, check custom presets in project-local .claude/presets/
  if (!preset) {
    const PRESETS_DIR = path.join(getProjectDir(), 'presets');
    const presetPath = path.join(PRESETS_DIR, `${params.preset_name}.json`);

    if (fs.existsSync(presetPath)) {
      preset = JSON.parse(fs.readFileSync(presetPath, 'utf8'));
    } else {
      throw new ValidationError(
        'Preset not found',
        `No preset named "${params.preset_name}" found. Use list_presets to see available presets.`
      );
    }
  }

  // Apply to session if session_id provided
  if (params.session_id) {
    const existing = getDatabase().prepare('SELECT session_id FROM workflow_sessions WHERE session_id = ?').get(params.session_id);

    if (!existing) {
      getDatabase().prepare(`
        INSERT INTO workflow_sessions (session_id, preset, gates_passed, steps_completed, expires_at, active)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(
        params.session_id,
        params.preset_name,
        JSON.stringify([]),
        JSON.stringify([]),
        Date.now() + (preset.token_ttl?.session || 3600000)
      );
    } else {
      getDatabase().prepare(`
        UPDATE workflow_sessions
        SET preset = ?, expires_at = ?
        WHERE session_id = ?
      `).run(
        params.preset_name,
        Date.now() + (preset.token_ttl?.session || 3600000),
        params.session_id
      );
    }

    logActivity('preset_applied', params.session_id, { preset: params.preset_name });
  }

  return {
    applied: true,
    preset_name: params.preset_name,
    session_id: params.session_id || null,
    gates: preset.gates,
    enforcement: preset.enforcement,
    message: `Preset "${params.preset_name}" applied successfully`
  };
}

/**
 * Tool 18: validate_config
 * Validate a configuration structure
 */
function validateConfig(params) {
  if (!params.config) {
    throw new ValidationError(
      'Missing "config" parameter',
      'Required: config = object to validate'
    );
  }

  const errors = [];
  const warnings = [];
  const config = params.config;

  // Check required fields
  if (!config.name) errors.push('Missing required field: name');
  if (!config.description) warnings.push('Missing recommended field: description');
  if (!config.gates) errors.push('Missing required field: gates');

  if (config.gates) {
    // Validate gates structure
    const requiredGates = ['teach', 'learn', 'reason'];
    for (const gate of requiredGates) {
      if (!config.gates[gate]) {
        errors.push(`Missing required gate: ${gate}`);
      } else {
        if (!config.gates[gate].required_tools) {
          warnings.push(`Gate "${gate}" missing required_tools array`);
        }
        if (!config.gates[gate].description) {
          warnings.push(`Gate "${gate}" missing description`);
        }
      }
    }
  }

  if (config.token_ttl) {
    if (typeof config.token_ttl.operation !== 'number') {
      warnings.push('token_ttl.operation should be a number (milliseconds)');
    }
    if (typeof config.token_ttl.session !== 'number') {
      warnings.push('token_ttl.session should be a number (milliseconds)');
    }
  }

  const valid = errors.length === 0;

  return {
    valid,
    errors,
    warnings,
    message: valid
      ? 'Configuration is valid'
      : `Configuration has ${errors.length} error(s) and ${warnings.length} warning(s)`
  };
}

/**
 * Tool 19: get_config
 * Get current active configuration
 */
function getConfig(params) {
  let activePreset = 'three-gate'; // default

  // Get active preset from session if provided
  if (params.session_id) {
    const session = getDatabase().prepare('SELECT preset FROM workflow_sessions WHERE session_id = ?').get(params.session_id);
    if (session && session.preset) {
      activePreset = session.preset;
    }
  }

  // Get preset config
  let config = BUILT_IN_PRESETS[activePreset];

  if (!config) {
    // Try custom preset in project-local .claude/presets/
    const PRESETS_DIR = path.join(getProjectDir(), 'presets');
    const presetPath = path.join(PRESETS_DIR, `${activePreset}.json`);

    if (fs.existsSync(presetPath)) {
      config = JSON.parse(fs.readFileSync(presetPath, 'utf8'));
    } else {
      config = BUILT_IN_PRESETS['three-gate']; // fallback
      activePreset = 'three-gate';
    }
  }

  return {
    active_preset: activePreset,
    config,
    session_id: params.session_id || null
  };
}

/**
 * Tool 20: export_config
 * Export configuration to file
 */
function exportConfig(params) {
  if (!params.preset_name) {
    throw new ValidationError(
      'Missing "preset_name" parameter',
      'Required: preset_name = name of preset to export'
    );
  }

  // Get preset
  let preset = BUILT_IN_PRESETS[params.preset_name];

  if (!preset) {
    // Try custom preset in project-local .claude/presets/
    const PRESETS_DIR = path.join(getProjectDir(), 'presets');
    const presetPath = path.join(PRESETS_DIR, `${params.preset_name}.json`);

    if (fs.existsSync(presetPath)) {
      preset = JSON.parse(fs.readFileSync(presetPath, 'utf8'));
    } else {
      throw new ValidationError(
        'Preset not found',
        `No preset named "${params.preset_name}" found`
      );
    }
  }

  // v1.4.0: Export to project-local .claude/presets/
  let exportPath;
  if (params.file_path) {
    exportPath = params.file_path;
  } else {
    const PRESETS_DIR = path.join(getProjectDir(), 'presets');
    if (!fs.existsSync(PRESETS_DIR)) {
      fs.mkdirSync(PRESETS_DIR, { recursive: true });
    }
    exportPath = path.join(PRESETS_DIR, `${params.preset_name}.json`);
  }

  // Write to file
  fs.writeFileSync(exportPath, JSON.stringify(preset, null, 2));

  return {
    exported: true,
    preset_name: params.preset_name,
    file_path: exportPath,
    size_bytes: fs.statSync(exportPath).size,
    message: `Preset "${params.preset_name}" exported to ${exportPath}`
  };
}

module.exports = {
  BUILT_IN_PRESETS,
  listPresets,
  applyPreset,
  validateConfig,
  getConfig,
  exportConfig
};
