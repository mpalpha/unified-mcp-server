/**
 * Knowledge Management Tools (v1.7.0)
 *
 * Tools for recording, searching, and managing working knowledge patterns.
 * v1.7.0: Synchronized with index.js implementation
 * v1.4.0: All experiences are project-scoped by location in .claude/
 */

const fs = require('fs');
const { getDatabase, ensureProjectContext, logActivity } = require('../database.js');
const { ValidationError, diceCoefficient } = require('../validation.js');

/**
 * Find duplicate experience using Dice coefficient similarity
 */
function findDuplicate(params, threshold) {
  const db = getDatabase();
  const candidates = db.prepare(`
    SELECT id, situation, approach, outcome, reasoning
    FROM experiences
    WHERE domain = ? AND type = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).all(params.domain, params.type);

  const newText = `${params.situation} ${params.approach} ${params.outcome} ${params.reasoning}`;

  for (const candidate of candidates) {
    const existingText = `${candidate.situation} ${candidate.approach} ${candidate.outcome} ${candidate.reasoning}`;
    const similarity = diceCoefficient(newText, existingText);

    if (similarity >= threshold) {
      return { id: candidate.id, similarity };
    }
  }

  return null;
}

/**
 * Tool 1: record_experience
 * Record a working knowledge pattern (effective or ineffective approach)
 */
function recordExperience(params) {
  const db = getDatabase();

  // Validate required parameters
  if (!params.type || !['effective', 'ineffective'].includes(params.type)) {
    throw new ValidationError(
      'Missing or invalid "type" parameter',
      'Required: type = "effective" | "ineffective"\\n\\n' +
      'Example:\\n' +
      JSON.stringify({
        type: 'effective',
        domain: 'Tools',
        situation: 'Need to search code for patterns',
        approach: 'Used Grep tool instead of bash grep',
        outcome: 'Search completed faster with better formatting',
        reasoning: 'Specialized tools provide better UX than raw commands'
      }, null, 2)
    );
  }

  const validDomains = ['Tools', 'Protocol', 'Communication', 'Process', 'Debugging', 'Decision'];
  if (!params.domain || !validDomains.includes(params.domain)) {
    throw new ValidationError(
      'Missing or invalid "domain" parameter',
      `Required: domain = ${validDomains.join(' | ')}\\n\\n` +
      'Example: domain: "Tools"'
    );
  }

  if (!params.situation || !params.approach || !params.outcome || !params.reasoning) {
    throw new ValidationError(
      'Missing required parameters',
      'Required: situation, approach, outcome, reasoning\\n\\n' +
      'All four fields must be provided to record an experience.'
    );
  }

  // v1.4.0: scope parameter removed - all experiences are project-scoped by location

  // Check for duplicates using Dice coefficient
  const duplicate = findDuplicate(params, 0.9);
  if (duplicate) {
    return {
      recorded: false,
      duplicate_id: duplicate.id,
      similarity: duplicate.similarity,
      message: `Similar experience already exists (ID: ${duplicate.id}, similarity: ${(duplicate.similarity * 100).toFixed(1)}%). Consider updating instead.`
    };
  }

  // Insert experience (v1.4.0: no scope field)
  const stmt = db.prepare(`
    INSERT INTO experiences (type, domain, situation, approach, outcome, reasoning, confidence, tags, revision_of)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    params.type,
    params.domain,
    params.situation,
    params.approach,
    params.outcome,
    params.reasoning,
    params.confidence || null,
    params.tags ? JSON.stringify(params.tags) : null,
    params.revision_of || null
  );

  // Log activity
  logActivity('experience_recorded', null, {
    experience_id: result.lastInsertRowid,
    type: params.type,
    domain: params.domain
  });

  return {
    recorded: true,
    experience_id: result.lastInsertRowid,
    message: `Experience recorded successfully (ID: ${result.lastInsertRowid})`
  };
}

/**
 * Tool 2: search_experiences
 * Search for relevant working knowledge using natural language queries
 */
function searchExperiences(params) {
  const db = getDatabase();

  if (!params.query || typeof params.query !== 'string') {
    throw new ValidationError(
      'Missing or invalid "query" parameter',
      'Required: query = string (your search terms)\\n\\n' +
      'Example: query: "authentication JWT tokens"'
    );
  }

  // Split query into terms, quote each individually, join with OR
  // This enables partial matching with BM25 relevance ranking
  const terms = params.query.trim().split(/\s+/)
    .map(term => `"${term.replace(/"/g, '""')}"`)
    .join(' OR ');

  let sql = `
    SELECT e.*, bm25(experiences_fts) as rank
    FROM experiences e
    JOIN experiences_fts ON e.id = experiences_fts.rowid
    WHERE experiences_fts MATCH ?
  `;

  const sqlParams = [terms];

  // Add filters
  if (params.domain) {
    sql += ' AND e.domain = ?';
    sqlParams.push(params.domain);
  }

  if (params.type) {
    sql += ' AND e.type = ?';
    sqlParams.push(params.type);
  }

  if (params.min_confidence) {
    sql += ' AND e.confidence >= ?';
    sqlParams.push(params.min_confidence);
  }

  sql += ' ORDER BY rank';

  const limit = Math.min(params.limit || 20, 100);
  const offset = params.offset || 0;
  sql += ` LIMIT ? OFFSET ?`;
  sqlParams.push(limit, offset);

  const results = db.prepare(sql).all(...sqlParams);

  // Parse tags from JSON
  results.forEach(r => {
    if (r.tags) {
      try {
        r.tags = JSON.parse(r.tags);
      } catch (e) {
        r.tags = [];
      }
    } else {
      r.tags = [];
    }
  });

  return {
    results: results,
    count: results.length,
    query: params.query,
    filters: {
      domain: params.domain || null,
      type: params.type || null,
      min_confidence: params.min_confidence || null
    }
  };
}

/**
 * Tool 3: get_experience
 * Retrieve a specific experience by ID with full details
 */
function getExperience(params) {
  const db = getDatabase();

  if (!params.id || typeof params.id !== 'number') {
    throw new ValidationError(
      'Missing or invalid "id" parameter',
      'Required: id = number (experience ID from search results)\\n\\n' +
      'Example: id: 42'
    );
  }

  const experience = db.prepare(`
    SELECT * FROM experiences WHERE id = ?
  `).get(params.id);

  if (!experience) {
    throw new ValidationError(
      `Experience not found: ID ${params.id}`,
      `No experience exists with ID ${params.id}. Use search_experiences to find experiences.`
    );
  }

  // Parse tags
  if (experience.tags) {
    try {
      experience.tags = JSON.parse(experience.tags);
    } catch (e) {
      experience.tags = [];
    }
  }

  // Get revision history if applicable
  if (experience.revision_of) {
    experience.previous_version = db.prepare(`
      SELECT id, situation, approach, outcome, created_at
      FROM experiences WHERE id = ?
    `).get(experience.revision_of);
  }

  // Get revisions that supersede this one
  experience.newer_versions = db.prepare(`
    SELECT id, situation, approach, outcome, created_at
    FROM experiences WHERE revision_of = ?
    ORDER BY created_at DESC
  `).all(params.id);

  return experience;
}

/**
 * Tool 4: update_experience
 * Update an existing experience (creates revision, preserves history)
 */
function updateExperience(params) {
  const db = getDatabase();

  if (!params.id || typeof params.id !== 'number') {
    throw new ValidationError(
      'Missing or invalid "id" parameter',
      'Required: id = number (experience ID to update)'
    );
  }

  if (!params.changes || typeof params.changes !== 'object') {
    throw new ValidationError(
      'Missing or invalid "changes" parameter',
      'Required: changes = object (fields to update)\\n\\n' +
      'Example:\\n' +
      JSON.stringify({
        id: 42,
        changes: { outcome: 'Updated outcome', reasoning: 'Refined reasoning' },
        reason: 'Clarified based on new evidence'
      }, null, 2)
    );
  }

  if (!params.reason) {
    throw new ValidationError(
      'Missing "reason" parameter',
      'Required: reason = string (why updating)\\n\\n' +
      'Always provide a reason for updating experiences to maintain audit trail.'
    );
  }

  // Get original experience
  const original = db.prepare(`SELECT * FROM experiences WHERE id = ?`).get(params.id);
  if (!original) {
    throw new ValidationError(
      `Experience not found: ID ${params.id}`,
      `No experience exists with ID ${params.id}.`
    );
  }

  // Create new revision (v1.4.0: scope field removed)
  const fields = ['type', 'domain', 'situation', 'approach', 'outcome', 'reasoning', 'confidence', 'tags'];
  const newData = { ...original };

  for (const field of fields) {
    if (params.changes[field] !== undefined) {
      newData[field] = params.changes[field];
    }
  }

  const stmt = db.prepare(`
    INSERT INTO experiences (type, domain, situation, approach, outcome, reasoning, confidence, tags, revision_of)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    newData.type,
    newData.domain,
    newData.situation,
    newData.approach,
    newData.outcome,
    newData.reasoning,
    newData.confidence,
    newData.tags ? JSON.stringify(newData.tags) : null,
    params.id
  );

  logActivity('experience_updated', null, {
    original_id: params.id,
    new_id: result.lastInsertRowid,
    reason: params.reason
  });

  return {
    updated: true,
    original_id: params.id,
    new_id: result.lastInsertRowid,
    message: `Experience updated (new revision ID: ${result.lastInsertRowid}). Original preserved for history.`
  };
}

/**
 * Tool 5: tag_experience
 * Add searchable tags to experiences for better organization
 */
function tagExperience(params) {
  const db = getDatabase();

  if (!params.id || typeof params.id !== 'number') {
    throw new ValidationError(
      'Missing or invalid "id" parameter',
      'Required: id = number (experience ID)'
    );
  }

  if (!params.tags || !Array.isArray(params.tags)) {
    throw new ValidationError(
      'Missing or invalid "tags" parameter',
      'Required: tags = array of strings\\n\\n' +
      'Example: tags: ["authentication", "jwt", "security"]'
    );
  }

  // Get existing tags
  const experience = db.prepare(`SELECT tags FROM experiences WHERE id = ?`).get(params.id);
  if (!experience) {
    throw new ValidationError(
      `Experience not found: ID ${params.id}`,
      `No experience exists with ID ${params.id}.`
    );
  }

  let existingTags = [];
  if (experience.tags) {
    try {
      existingTags = JSON.parse(experience.tags);
    } catch (e) {
      existingTags = [];
    }
  }

  // Merge tags (deduplicate)
  const allTags = [...new Set([...existingTags, ...params.tags])];

  // Update
  db.prepare(`UPDATE experiences SET tags = ?, updated_at = strftime('%s', 'now') WHERE id = ?`)
    .run(JSON.stringify(allTags), params.id);

  return {
    updated: true,
    experience_id: params.id,
    tags: allTags,
    message: `Tags updated for experience ${params.id}`
  };
}

/**
 * Tool 6: export_experiences
 * Export experiences to JSON or Markdown for sharing/backup
 */
function exportExperiences(params) {
  const db = getDatabase();

  if (!params.format || !['json', 'markdown'].includes(params.format)) {
    throw new ValidationError(
      'Missing or invalid "format" parameter',
      'Required: format = "json" | "markdown"\\n\\n' +
      'Example: format: "json"'
    );
  }

  // Build query with filters
  let sql = 'SELECT * FROM experiences WHERE 1=1';
  const sqlParams = [];

  if (params.filter) {
    if (params.filter.domain) {
      sql += ' AND domain = ?';
      sqlParams.push(params.filter.domain);
    }
    if (params.filter.type) {
      sql += ' AND type = ?';
      sqlParams.push(params.filter.type);
    }
    // v1.4.0: scope filter removed - all experiences are project-scoped by location
  }

  sql += ' ORDER BY created_at DESC';

  const experiences = db.prepare(sql).all(...sqlParams);

  // Parse tags
  experiences.forEach(e => {
    if (e.tags) {
      try {
        e.tags = JSON.parse(e.tags);
      } catch (err) {
        e.tags = [];
      }
    }
  });

  let output;
  if (params.format === 'json') {
    output = JSON.stringify(experiences, null, 2);
  } else {
    // Markdown format
    output = '# Experiences Export\\n\\n';
    output += `Exported: ${new Date().toISOString()}\\n`;
    output += `Total: ${experiences.length} experiences\\n\\n`;
    output += '---\\n\\n';

    for (const exp of experiences) {
      output += `## Experience ${exp.id}: ${exp.domain}\\n\\n`;
      output += `**Type:** ${exp.type}\\n`;
      output += `**Confidence:** ${exp.confidence || 'N/A'}\\n`;
      // v1.4.0: scope field removed - all experiences are project-scoped by location
      output += `**Tags:** ${exp.tags && exp.tags.length ? exp.tags.join(', ') : 'None'}\\n\\n`;
      output += `### Situation\\n${exp.situation}\\n\\n`;
      output += `### Approach\\n${exp.approach}\\n\\n`;
      output += `### Outcome\\n${exp.outcome}\\n\\n`;
      output += `### Reasoning\\n${exp.reasoning}\\n\\n`;
      output += '---\\n\\n';
    }
  }

  // Write to file if path provided
  if (params.output_path) {
    fs.writeFileSync(params.output_path, output);
    return {
      exported: true,
      count: experiences.length,
      format: params.format,
      output_path: params.output_path,
      message: `Exported ${experiences.length} experiences to ${params.output_path}`
    };
  }

  // Return inline
  return {
    exported: true,
    count: experiences.length,
    format: params.format,
    output: output,
    message: `Exported ${experiences.length} experiences`
  };
}

/**
 * Tool 7: import_experiences (v1.4.0)
 * Import experiences from a JSON file into the current project
 * Enables cross-project knowledge sharing via export/import workflow
 */
function importExperiences(params) {
  const db = getDatabase();

  if (!params.filename || typeof params.filename !== 'string') {
    throw new ValidationError(
      'Missing or invalid "filename" parameter',
      'Required: filename = string (path to JSON file from export_experiences)\\n\\n' +
      'Example:\\n' +
      JSON.stringify({
        filename: 'exported-experiences.json'
      }, null, 2)
    );
  }

  // Ensure project context
  ensureProjectContext();

  // Check file exists
  if (!fs.existsSync(params.filename)) {
    throw new ValidationError(
      `File not found: ${params.filename}`,
      'Provide the path to a JSON file created by export_experiences.'
    );
  }

  // Read and parse file
  let data;
  try {
    const content = fs.readFileSync(params.filename, 'utf8');
    data = JSON.parse(content);
  } catch (e) {
    throw new ValidationError(
      `Failed to parse JSON file: ${e.message}`,
      'The file must be valid JSON from export_experiences with format: json'
    );
  }

  // Validate structure
  if (!Array.isArray(data)) {
    throw new ValidationError(
      'Invalid export format',
      'Expected an array of experiences from export_experiences'
    );
  }

  // Import each experience
  let imported = 0;
  let skipped = 0;
  const errors = [];

  for (const exp of data) {
    try {
      // Validate required fields
      if (!exp.type || !exp.domain || !exp.situation || !exp.approach || !exp.outcome || !exp.reasoning) {
        skipped++;
        continue;
      }

      // Insert without preserving original ID (let SQLite assign new one)
      const stmt = db.prepare(`
        INSERT INTO experiences (type, domain, situation, approach, outcome, reasoning, confidence, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        exp.type,
        exp.domain,
        exp.situation,
        exp.approach,
        exp.outcome,
        exp.reasoning,
        exp.confidence || null,
        exp.tags ? (typeof exp.tags === 'string' ? exp.tags : JSON.stringify(exp.tags)) : null
      );

      imported++;
    } catch (e) {
      errors.push(`Experience ${exp.id || '?'}: ${e.message}`);
      skipped++;
    }
  }

  logActivity('experiences_imported', null, {
    filename: params.filename,
    imported,
    skipped,
    total: data.length
  });

  return {
    imported,
    skipped,
    total: data.length,
    errors: errors.length > 0 ? errors.slice(0, 5) : undefined, // Show first 5 errors
    message: `Imported ${imported} experiences (${skipped} skipped)`
  };
}

module.exports = {
  findDuplicate,
  recordExperience,
  searchExperiences,
  getExperience,
  updateExperience,
  tagExperience,
  exportExperiences,
  importExperiences
};
