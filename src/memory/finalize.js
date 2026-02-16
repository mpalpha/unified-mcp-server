/**
 * Finalize Response (Phase 5)
 *
 * Enforces behavioral rules on draft responses:
 * - No implied research without citations
 * - No false precision
 * - Facts vs [Inference] separation (trust < 2)
 * - No guessing (critical missing info)
 * - Conservative contradiction surfacing
 * - Unsafe assumption correction
 * - Procedural responses => numbered steps
 * - Integrity marker
 */

/**
 * Finalize a response draft by applying behavioral rules.
 *
 * @param {object} params
 * @param {string} params.draft_text - Draft response text
 * @param {object[]} [params.selected_cells=[]] - Cells used in context
 * @param {object[]} [params.selected_experiences=[]] - Experiences used
 * @returns {object} { finalized_text, violations, integrity }
 */
function finalizeResponse({ draft_text, selected_cells = [], selected_experiences = [] }) {
  const violations = [];
  let text = draft_text;

  // Rule 1: No implied research without citations
  // Check if draft claims research but has no citation markers
  const researchPatterns = /\b(research shows|studies indicate|according to|experts say|evidence suggests)\b/i;
  const citationPatterns = /\[[\d]+\]|\(http|\[http|https?:\/\/|doi:|arxiv:/i;
  if (researchPatterns.test(text) && !citationPatterns.test(text)) {
    violations.push({
      rule: 'no_implied_research',
      severity: 'warning',
      message: 'Draft claims research/evidence without citations'
    });
  }

  // Rule 2: No false precision
  // Flag suspicious exactness (e.g., "73.2% of users" without a source)
  const precisionPattern = /\b\d+\.\d+%|\b\d{4,}\s+(users|people|cases|instances)\b/i;
  if (precisionPattern.test(text) && !citationPatterns.test(text)) {
    violations.push({
      rule: 'no_false_precision',
      severity: 'warning',
      message: 'Draft contains specific numbers without cited source'
    });
  }

  // Rule 3: Facts vs [Inference]
  // Claims derived from memory with trust < 2 must be labeled [Inference]
  const lowTrustCells = selected_cells.filter(c => c.trust < 2);
  if (lowTrustCells.length > 0) {
    const needsInference = lowTrustCells.some(c => {
      const titleLower = (c.title || '').toLowerCase();
      // Check if draft references this cell's content without inference label
      return text.toLowerCase().includes(titleLower.slice(0, 30)) &&
             !text.includes('[Inference]');
    });
    if (needsInference) {
      violations.push({
        rule: 'inference_labeling',
        severity: 'info',
        message: 'Low-trust memory used without [Inference] label',
        cells: lowTrustCells.map(c => c.cell_id || c.id)
      });
    }
  }

  // Rule 4: No guessing - check if critical info is missing
  const guessingPatterns = /\b(I think|probably|maybe|I guess|I believe|I assume)\b/i;
  const uncertaintyCount = (text.match(guessingPatterns) || []).length;
  if (uncertaintyCount >= 3) {
    violations.push({
      rule: 'no_guessing',
      severity: 'warning',
      message: 'Draft contains excessive uncertainty language suggesting missing information'
    });
  }

  // Rule 5: Conservative contradiction surfacing
  const contradictedCells = selected_cells.filter(c => (c.contradiction_count || 0) >= 1);
  if (contradictedCells.length > 0) {
    violations.push({
      rule: 'contradiction_notice',
      severity: 'info',
      message: `${contradictedCells.length} cell(s) have contradictions - resolution recommended`,
      cells: contradictedCells.map(c => ({
        id: c.cell_id || c.id,
        title: c.title,
        contradictions: c.contradiction_count
      }))
    });
  }

  // Rule 6: Unsafe assumption correction
  const assumptionPatterns = /\b(always works|guaranteed|100%|never fails|impossible to)\b/i;
  if (assumptionPatterns.test(text)) {
    violations.push({
      rule: 'unsafe_assumption',
      severity: 'warning',
      message: 'Draft contains absolute claims that may be unsafe assumptions'
    });
  }

  // Rule 7: Procedural responses => numbered steps
  const proceduralIndicators = /\b(step|first|then|next|finally|follow these|how to)\b/i;
  const hasNumberedSteps = /^\s*\d+[\.\)]/m.test(text);
  if (proceduralIndicators.test(text) && !hasNumberedSteps && text.length > 200) {
    violations.push({
      rule: 'procedural_numbering',
      severity: 'info',
      message: 'Procedural response should use numbered steps'
    });
  }

  // Determine integrity status
  const hasBlockingViolations = violations.some(v => v.severity === 'error');
  const hasWarnings = violations.some(v => v.severity === 'warning');
  let integrity;
  if (hasBlockingViolations) {
    integrity = 'BLOCKED';
  } else if (hasWarnings) {
    integrity = 'NEEDS_VERIFICATION';
  } else {
    integrity = 'OK';
  }

  return {
    finalized_text: text,
    violations,
    integrity,
    integrity_line: `[INTEGRITY: ${integrity}]`
  };
}

module.exports = {
  finalizeResponse
};
