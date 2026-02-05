/**
 * Knowledge Management Tools (v1.7.0)
 *
 * Tools for recording, searching, and managing working knowledge patterns.
 * v1.4.0: All experiences are project-scoped by location in .claude/
 */

const fs = require('fs');
const { getDatabase, logActivity } = require('../database.js');
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

  // Build search query
  let sql = `
    SELECT
      e.id,
      e.type,
      e.domain,
      e.situation,
      e.approach,
      e.outcome,
      e.reasoning,
      e.confidence,
      e.tags,
      e.revision_of,
      e.created_at,
      e.updated_at,
      bm25(experiences_fts) as rank
    FROM experiences_fts
    JOIN experiences e ON experiences_fts.rowid = e.id
    WHERE experiences_fts MATCH ?
  `;

  const queryParams = [params.query];

  // Add domain filter
  if (params.domain) {
    sql += ' AND e.domain = ?';
    queryParams.push(params.domain);
  }

  // Add type filter
  if (params.type) {
    sql += ' AND e.type = ?';
    queryParams.push(params.type);
  }

  // Add min_confidence filter
  if (params.min_confidence !== undefined) {
    sql += ' AND e.confidence >= ?';
    queryParams.push(params.min_confidence);
  }

  sql += ' ORDER BY rank';

  // Add limit with offset
  const limit = params.limit || 20;
  const offset = params.offset || 0;
  sql += ` LIMIT ? OFFSET ?`;
  queryParams.push(limit, offset);

  const results = db.prepare(sql).all(...queryParams);

  // Parse tags JSON
  results.forEach(r => {
    if (r.tags) {
      try {
        r.tags = JSON.parse(r.tags);
      } catch (e) {
        r.tags = [];
      }
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

  if (!params.id) {
    throw new ValidationError(
      'Missing "id" parameter',
      'Required: id = experience ID (number)\\n\\n' +
      'Example: id: 123'
    );
  }

  const experience = db.prepare(`
    SELECT * FROM experiences WHERE id = ?
  `).get(params.id);

  if (!experience) {
    throw new ValidationError(
      `Experience not found: ${params.id}`,
      'The specified experience ID does not exist.'
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

  // Get revision history if this is original
  const revisions = db.prepare(`
    SELECT id, created_at FROM experiences WHERE revision_of = ?
    ORDER BY created_at DESC
  `).all(params.id);

  // Get original if this is a revision
  let original = null;
  if (experience.revision_of) {
    original = db.prepare('SELECT id FROM experiences WHERE id = ?').get(experience.revision_of);
  }

  return {
    ...experience,
    revision_history: revisions,
    original: original ? original.id : null
  };
}

/**
 * Tool 4: update_experience
 * Update an existing experience (creates revision, preserves history)
 */
function updateExperience(params) {
  const db = getDatabase();

  if (!params.id) {
    throw new ValidationError(
      'Missing "id" parameter',
      'Required: id = experience ID to update'
    );
  }

  if (!params.changes || typeof params.changes !== 'object') {
    throw new ValidationError(
      'Missing "changes" parameter',
      'Required: changes = object with fields to update\\n\\n' +
      'Example: changes: { outcome: "new outcome", confidence: 0.95 }'
    );
  }

  if (!params.reason) {
    throw new ValidationError(
      'Missing "reason" parameter',
      'Required: reason = why updating (audit trail)\\n\\n' +
      'Example: reason: "Fixed typo in approach"'
    );
  }

  // Get existing experience
  const existing = db.prepare('SELECT * FROM experiences WHERE id = ?').get(params.id);
  if (!existing) {
    throw new ValidationError(
      `Experience not found: ${params.id}`,
      'Cannot update non-existent experience.'
    );
  }

  // Build update data
  const newData = { ...existing };
  delete newData.id;
  delete newData.created_at;
  delete newData.updated_at;

  // Apply changes
  for (const [key, value] of Object.entries(params.changes)) {
    if (key in newData && key !== 'id' && key !== 'created_at') {
      newData[key] = value;
    }
  }

  // Update in place
  const updateFields = [];
  const updateValues = [];

  for (const [key, value] of Object.entries(params.changes)) {
    if (['situation', 'approach', 'outcome', 'reasoning', 'confidence', 'tags'].includes(key)) {
      updateFields.push(`${key} = ?`);
      if (key === 'tags') {
        updateValues.push(value ? JSON.stringify(value) : null);
      } else {
        updateValues.push(value);
      }
    }
  }

  if (updateFields.length === 0) {
    throw new ValidationError(
      'No valid fields to update',
      'Valid fields: situation, approach, outcome, reasoning, confidence, tags'
    );
  }

  updateFields.push("updated_at = strftime('%s', 'now')");
  updateValues.push(params.id);

  db.prepare(`
    UPDATE experiences
    SET ${updateFields.join(', ')}
    WHERE id = ?
  `).run(...updateValues);

  logActivity('experience_updated', null, {
    experience_id: params.id,
    reason: params.reason,
    fields_updated: Object.keys(params.changes)
  });

  return {
    updated: true,
    experience_id: params.id,
    fields_updated: Object.keys(params.changes),
    reason: params.reason
  };
}

/**
 * Tool 5: tag_experience
 * Add searchable tags to experiences for better organization
 */
function tagExperience(params) {
  const db = getDatabase();

  if (!params.id) {
    throw new ValidationError(
      'Missing "id" parameter',
      'Required: id = experience ID'
    );
  }

  if (!params.tags || !Array.isArray(params.tags)) {
    throw new ValidationError(
      'Missing or invalid "tags" parameter',
      'Required: tags = array of strings\\n\\n' +
      'Example: tags: ["api", "authentication"]'
    );
  }

  // Get existing experience
  const existing = db.prepare('SELECT tags FROM experiences WHERE id = ?').get(params.id);
  if (!existing) {
    throw new ValidationError(
      `Experience not found: ${params.id}`,
      'Cannot tag non-existent experience.'
    );
  }

  // Merge tags
  let currentTags = [];
  if (existing.tags) {
    try {
      currentTags = JSON.parse(existing.tags);
    } catch (e) {
      currentTags = [];
    }
  }

  const mergedTags = [...new Set([...currentTags, ...params.tags])];

  db.prepare(`
    UPDATE experiences
    SET tags = ?, updated_at = strftime('%s', 'now')
    WHERE id = ?
  `).run(JSON.stringify(mergedTags), params.id);

  return {
    experience_id: params.id,
    tags: mergedTags,
    added: params.tags.filter(t => !currentTags.includes(t))
  };
}

/**
 * Tool 6: export_experiences
 * Export experiences to JSON or Markdown for sharing/backup
 */
function exportExperiences(params) {
  const db = getDatabase();

  const format = params.format || 'json';
  if (!['json', 'markdown'].includes(format)) {
    throw new ValidationError(
      'Invalid "format" parameter',
      'Valid formats: json, markdown'
    );
  }

  // Build query with filters
  let sql = 'SELECT * FROM experiences WHERE 1=1';
  const queryParams = [];

  if (params.filter) {
    if (params.filter.domain) {
      sql += ' AND domain = ?';
      queryParams.push(params.filter.domain);
    }
    if (params.filter.type) {
      sql += ' AND type = ?';
      queryParams.push(params.filter.type);
    }
    if (params.filter.tags && params.filter.tags.length > 0) {
      for (const tag of params.filter.tags) {
        sql += ' AND tags LIKE ?';
        queryParams.push(`%"${tag}"%`);
      }
    }
  }

  sql += ' ORDER BY created_at DESC';

  const experiences = db.prepare(sql).all(...queryParams);

  // Parse tags
  experiences.forEach(exp => {
    if (exp.tags) {
      try {
        exp.tags = JSON.parse(exp.tags);
      } catch (e) {
        exp.tags = [];
      }
    }
  });

  if (format === 'markdown') {
    let markdown = '# Exported Experiences\\n\\n';
    for (const exp of experiences) {
      markdown += `## ${exp.domain} - ${exp.type}\\n\\n`;
      markdown += `**Situation:** ${exp.situation}\\n\\n`;
      markdown += `**Approach:** ${exp.approach}\\n\\n`;
      markdown += `**Outcome:** ${exp.outcome}\\n\\n`;
      markdown += `**Reasoning:** ${exp.reasoning}\\n\\n`;
      if (exp.confidence) markdown += `**Confidence:** ${exp.confidence}\\n\\n`;
      if (exp.tags && exp.tags.length > 0) markdown += `**Tags:** ${exp.tags.join(', ')}\\n\\n`;
      markdown += '---\\n\\n';
    }

    if (params.output_path) {
      fs.writeFileSync(params.output_path, markdown);
      return { exported: experiences.length, file: params.output_path };
    }
    return { exported: experiences.length, content: markdown };
  }

  // JSON format
  const output = {
    exported_at: new Date().toISOString(),
    count: experiences.length,
    experiences: experiences
  };

  if (params.output_path) {
    fs.writeFileSync(params.output_path, JSON.stringify(output, null, 2));
    return { exported: experiences.length, file: params.output_path };
  }
  return output;
}

/**
 * Tool 7: import_experiences
 * Import experiences from a JSON file exported from another project
 */
function importExperiences(params) {
  const db = getDatabase();

  if (!params.filename) {
    throw new ValidationError(
      'Missing "filename" parameter',
      'Required: filename = path to JSON file'
    );
  }

  if (!fs.existsSync(params.filename)) {
    throw new ValidationError(
      `File not found: ${params.filename}`,
      'Check the path and try again.'
    );
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(params.filename, 'utf8'));
  } catch (e) {
    throw new ValidationError(
      'Invalid JSON file',
      `Could not parse: ${e.message}`
    );
  }

  if (!data.experiences || !Array.isArray(data.experiences)) {
    throw new ValidationError(
      'Invalid export format',
      'File must contain an "experiences" array.'
    );
  }

  let imported = 0;
  let skipped = 0;

  const stmt = db.prepare(`
    INSERT INTO experiences (type, domain, situation, approach, outcome, reasoning, confidence, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const exp of data.experiences) {
    // Validate required fields
    if (!exp.type || !exp.domain || !exp.situation || !exp.approach || !exp.outcome || !exp.reasoning) {
      skipped++;
      continue;
    }

    // Apply filters if specified
    if (params.filter) {
      if (params.filter.domain && exp.domain !== params.filter.domain) {
        skipped++;
        continue;
      }
      if (params.filter.type && exp.type !== params.filter.type) {
        skipped++;
        continue;
      }
    }

    try {
      stmt.run(
        exp.type,
        exp.domain,
        exp.situation,
        exp.approach,
        exp.outcome,
        exp.reasoning,
        exp.confidence || null,
        exp.tags ? JSON.stringify(exp.tags) : null
      );
      imported++;
    } catch (e) {
      skipped++;
    }
  }

  logActivity('experiences_imported', null, {
    filename: params.filename,
    imported: imported,
    skipped: skipped
  });

  return {
    imported: imported,
    skipped: skipped,
    message: `Imported ${imported} experiences, skipped ${skipped}`
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
