/**
 * Knowledge Management Tools
 *
 * Tools for recording, searching, and managing working knowledge patterns.
 * Tracks effective and ineffective approaches across different domains.
 *
 * v1.4.0: All experiences are project-scoped by location in .claude/
 * No scope field or detectScope() - location IS scope.
 */

const { getDatabase, logActivity } = require('../database.js');
const { ValidationError } = require('../validation.js');

/**
 * Calculate Dice coefficient similarity between two strings
 */
function diceCoefficient(str1, str2) {
  const bigrams1 = getBigrams(str1);
  const bigrams2 = getBigrams(str2);

  const intersection = bigrams1.filter(b => bigrams2.includes(b)).length;
  return (2.0 * intersection) / (bigrams1.length + bigrams2.length);
}

/**
 * Get bigrams from a string for similarity calculation
 */
function getBigrams(str) {
  const normalized = str.toLowerCase().replace(/\s+/g, ' ').trim();
  const bigrams = [];
  for (let i = 0; i < normalized.length - 1; i++) {
    bigrams.push(normalized.substring(i, i + 2));
  }
  return bigrams;
}

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
 * Record a working knowledge pattern (effective or ineffective approach)
 *
 * v1.4.0: Removed scope parameter - all experiences are project-scoped by location
 *
 * @param {Object} params - Experience parameters
 * @param {string} params.type - Type of experience ('effective' or 'ineffective')
 * @param {string} params.domain - Domain category
 * @param {string} params.situation - The situation or context
 * @param {string} params.approach - The approach taken
 * @param {string} params.outcome - The outcome or result
 * @param {string} params.reasoning - Why this approach worked/didn't work
 * @param {number} [params.confidence] - Confidence level (0-1)
 * @param {string[]} [params.tags] - Optional tags
 * @param {number} [params.revision_of] - ID of experience being revised
 * @returns {Object} Result with recorded status and experience ID
 */
function recordExperience(params) {
  const db = getDatabase();

  // Validate required parameters
  if (!params.type || !['effective', 'ineffective'].includes(params.type)) {
    throw new ValidationError(
      'Missing or invalid "type" parameter',
      'Required: type = "effective" | "ineffective"\n\n' +
      'Example:\n' +
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
      `Required: domain = ${validDomains.join(' | ')}\n\n` +
      'Example: domain: "Tools"'
    );
  }

  if (!params.situation || !params.approach || !params.outcome || !params.reasoning) {
    throw new ValidationError(
      'Missing required parameters',
      'Required: situation, approach, outcome, reasoning\n\n' +
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

  // v1.4.0: Insert experience WITHOUT scope field
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
 * Search for relevant working knowledge using natural language queries
 *
 * v1.4.0: Removed scope parameter and source field from results
 * All experiences are project-scoped by location
 *
 * @param {Object} params - Search parameters
 * @param {string} params.query - Natural language search query
 * @param {string[]} [params.domains] - Filter by domains
 * @param {string} [params.type] - Filter by type ('effective' or 'ineffective')
 * @param {number} [params.limit] - Maximum results (default 10)
 * @returns {Object} Search results with experiences
 */
function searchExperiences(params) {
  const db = getDatabase();

  if (!params.query) {
    throw new ValidationError(
      'Missing "query" parameter',
      'Required: query = <natural language search string>\n\n' +
      'Example: query: "how to handle API errors"'
    );
  }

  // v1.4.0: Removed scope from SELECT
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
      e.created_at,
      fts.rank AS relevance_score
    FROM experiences_fts fts
    JOIN experiences e ON fts.rowid = e.id
    WHERE experiences_fts MATCH ?
  `;

  const conditions = [];
  const queryParams = [params.query];

  // Filter by type
  if (params.type) {
    conditions.push('e.type = ?');
    queryParams.push(params.type);
  }

  // Filter by domains
  if (params.domains && params.domains.length > 0) {
    const placeholders = params.domains.map(() => '?').join(',');
    conditions.push(`e.domain IN (${placeholders})`);
    queryParams.push(...params.domains);
  }

  // v1.4.0: Removed scope filter - all experiences are project-scoped

  if (conditions.length > 0) {
    sql += ' AND ' + conditions.join(' AND ');
  }

  sql += `
    ORDER BY fts.rank
    LIMIT ?
  `;
  queryParams.push(params.limit || 10);

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
    query: params.query,
    total: results.length,
    experiences: results
  };
}

/**
 * Retrieve a specific experience by ID
 * 
 * @param {Object} params - Parameters
 * @param {number} params.experience_id - The experience ID to retrieve
 * @param {boolean} [params.include_history] - Include revision history
 * @returns {Object} Experience details
 */
function getExperience(params) {
  const db = getDatabase();
  
  if (!params.experience_id) {
    throw new ValidationError(
      'Missing "experience_id" parameter',
      'Required: experience_id = <integer ID>\n\n' +
      'Example: experience_id: 123'
    );
  }

  const experience = db.prepare(`
    SELECT * FROM experiences WHERE id = ?
  `).get(params.experience_id);

  if (!experience) {
    throw new ValidationError(
      `Experience ${params.experience_id} not found`,
      'The specified experience ID does not exist in the database.'
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

  // Include revision history if requested
  if (params.include_history) {
    const revisions = db.prepare(`
      SELECT id, situation, approach, outcome, reasoning, created_at
      FROM experiences
      WHERE revision_of = ?
      ORDER BY created_at DESC
    `).all(params.experience_id);

    experience.revisions = revisions;
  }

  return experience;
}

/**
 * Update an existing experience
 * 
 * @param {Object} params - Update parameters
 * @param {number} params.experience_id - The experience ID to update
 * @param {string} [params.situation] - Updated situation
 * @param {string} [params.approach] - Updated approach
 * @param {string} [params.outcome] - Updated outcome
 * @param {string} [params.reasoning] - Updated reasoning
 * @param {number} [params.confidence] - Updated confidence
 * @param {string[]} [params.tags] - Updated tags
 * @param {boolean} [params.create_revision] - Create new revision instead of updating
 * @returns {Object} Update result
 */
function updateExperience(params) {
  const db = getDatabase();
  
  if (!params.experience_id) {
    throw new ValidationError(
      'Missing "experience_id" parameter',
      'Required: experience_id = <integer ID>'
    );
  }

  // Check if experience exists
  const existing = db.prepare('SELECT * FROM experiences WHERE id = ?').get(params.experience_id);
  if (!existing) {
    throw new ValidationError(
      `Experience ${params.experience_id} not found`,
      'Cannot update non-existent experience'
    );
  }

  // If create_revision is true, create a new experience record
  if (params.create_revision) {
    const newExp = {
      type: existing.type,
      domain: existing.domain,
      situation: params.situation || existing.situation,
      approach: params.approach || existing.approach,
      outcome: params.outcome || existing.outcome,
      reasoning: params.reasoning || existing.reasoning,
      confidence: params.confidence !== undefined ? params.confidence : existing.confidence,
      scope: existing.scope,
      tags: params.tags || (existing.tags ? JSON.parse(existing.tags) : null),
      revision_of: params.experience_id
    };

    return recordExperience(newExp);
  }

  // Build update query
  const updates = [];
  const values = [];

  if (params.situation !== undefined) {
    updates.push('situation = ?');
    values.push(params.situation);
  }
  if (params.approach !== undefined) {
    updates.push('approach = ?');
    values.push(params.approach);
  }
  if (params.outcome !== undefined) {
    updates.push('outcome = ?');
    values.push(params.outcome);
  }
  if (params.reasoning !== undefined) {
    updates.push('reasoning = ?');
    values.push(params.reasoning);
  }
  if (params.confidence !== undefined) {
    updates.push('confidence = ?');
    values.push(params.confidence);
  }
  if (params.tags !== undefined) {
    updates.push('tags = ?');
    values.push(JSON.stringify(params.tags));
  }

  if (updates.length === 0) {
    throw new ValidationError(
      'No fields to update',
      'At least one field must be provided to update'
    );
  }

  updates.push("updated_at = strftime('%s', 'now')");
  values.push(params.experience_id);

  db.prepare(`
    UPDATE experiences
    SET ${updates.join(', ')}
    WHERE id = ?
  `).run(...values);

  logActivity('experience_updated', null, {
    experience_id: params.experience_id,
    fields_updated: updates.length - 1
  });

  return {
    updated: true,
    experience_id: params.experience_id,
    message: 'Experience updated successfully'
  };
}

/**
 * Add tags to an experience
 * 
 * @param {Object} params - Parameters
 * @param {number} params.experience_id - The experience ID
 * @param {string[]} params.tags - Tags to add
 * @param {boolean} [params.replace] - Replace existing tags instead of merging
 * @returns {Object} Update result
 */
function tagExperience(params) {
  const db = getDatabase();
  
  if (!params.experience_id) {
    throw new ValidationError('Missing "experience_id" parameter');
  }

  if (!params.tags || !Array.isArray(params.tags) || params.tags.length === 0) {
    throw new ValidationError(
      'Missing or invalid "tags" parameter',
      'Required: tags = [array of strings]\n\n' +
      'Example: tags: ["api", "error-handling"]'
    );
  }

  const existing = db.prepare('SELECT tags FROM experiences WHERE id = ?').get(params.experience_id);
  if (!existing) {
    throw new ValidationError(`Experience ${params.experience_id} not found`);
  }

  let finalTags;
  if (params.replace) {
    finalTags = params.tags;
  } else {
    const currentTags = existing.tags ? JSON.parse(existing.tags) : [];
    finalTags = [...new Set([...currentTags, ...params.tags])];
  }

  db.prepare(`
    UPDATE experiences
    SET tags = ?, updated_at = strftime('%s', 'now')
    WHERE id = ?
  `).run(JSON.stringify(finalTags), params.experience_id);

  return {
    updated: true,
    experience_id: params.experience_id,
    tags: finalTags,
    message: 'Tags updated successfully'
  };
}

/**
 * Export experiences to JSON format
 *
 * v1.4.0: Removed scope parameter - always exports current project
 *
 * @param {Object} params - Export parameters
 * @param {string[]} [params.domains] - Filter by domains
 * @param {string} [params.type] - Filter by type
 * @param {number} [params.since] - Unix timestamp to filter experiences after
 * @returns {Object} Exported experiences
 */
function exportExperiences(params = {}) {
  const db = getDatabase();

  let sql = 'SELECT * FROM experiences WHERE 1=1';
  const queryParams = [];

  if (params.type) {
    sql += ' AND type = ?';
    queryParams.push(params.type);
  }

  if (params.domains && params.domains.length > 0) {
    const placeholders = params.domains.map(() => '?').join(',');
    sql += ` AND domain IN (${placeholders})`;
    queryParams.push(...params.domains);
  }

  // v1.4.0: Removed scope filter - all experiences are project-scoped

  if (params.since) {
    sql += ' AND created_at >= ?';
    queryParams.push(params.since);
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

  logActivity('experiences_exported', null, {
    count: experiences.length,
    filters: {
      type: params.type,
      domains: params.domains,
      since: params.since
    }
  });

  return {
    exported_at: Math.floor(Date.now() / 1000),
    total: experiences.length,
    filters: {
      type: params.type,
      domains: params.domains,
      since: params.since
    },
    experiences: experiences
  };
}

/**
 * Import experiences from JSON file into current project
 *
 * v1.4.0: New tool for cross-project sharing
 *
 * @param {Object} params - Import parameters
 * @param {string} params.filename - Path to JSON file to import
 * @returns {Object} Import result with count
 */
function importExperiences(params) {
  const fs = require('fs');
  const db = getDatabase();

  if (!params.filename) {
    throw new ValidationError(
      'Missing "filename" parameter',
      'Required: filename = <path to JSON file>\n\n' +
      'Example: filename: "exported-experiences.json"'
    );
  }

  if (!fs.existsSync(params.filename)) {
    throw new ValidationError(
      `File not found: ${params.filename}`,
      'The specified file does not exist. Check the path and try again.'
    );
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(params.filename, 'utf8'));
  } catch (e) {
    throw new ValidationError(
      'Invalid JSON file',
      `Could not parse ${params.filename}: ${e.message}`
    );
  }

  if (!data.experiences || !Array.isArray(data.experiences)) {
    throw new ValidationError(
      'Invalid export format',
      'The JSON file must have an "experiences" array property.'
    );
  }

  let imported = 0;
  let skipped = 0;

  const insertStmt = db.prepare(`
    INSERT INTO experiences (type, domain, situation, approach, outcome, reasoning, confidence, tags, revision_of)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const exp of data.experiences) {
    // Skip invalid experiences
    if (!exp.type || !exp.domain || !exp.situation || !exp.approach || !exp.outcome || !exp.reasoning) {
      skipped++;
      continue;
    }

    try {
      insertStmt.run(
        exp.type,
        exp.domain,
        exp.situation,
        exp.approach,
        exp.outcome,
        exp.reasoning,
        exp.confidence || null,
        exp.tags ? (typeof exp.tags === 'string' ? exp.tags : JSON.stringify(exp.tags)) : null,
        null // Don't preserve revision_of relationships across projects
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
    message: `Imported ${imported} experiences (${skipped} skipped)`
  };
}

module.exports = {
  recordExperience,
  searchExperiences,
  getExperience,
  updateExperience,
  tagExperience,
  exportExperiences,
  // v1.4.0: New tool for cross-project sharing
  importExperiences
};
