/**
 * Memory System - Barrel Export
 *
 * Deterministic, low-token, governance-enforced, self-organizing memory system.
 */

const canonical = require('./canonical');
const schema = require('./schema');
const salience = require('./salience');
const sessions = require('./sessions');
const invocations = require('./invocations');
const experiences = require('./experiences');
const scenes = require('./scenes');
const consolidation = require('./consolidation');
const contextPack = require('./context-pack');
const guardedCycle = require('./guarded-cycle');
const finalize = require('./finalize');
const governance = require('./governance');

module.exports = {
  // Canonical JSON + Hashing + Signing
  ...canonical,

  // Schema
  applyMemorySchema: schema.applyMemorySchema,

  // Salience
  ...salience,

  // Sessions
  createSession: sessions.createSession,
  getSession: sessions.getSession,
  updateSession: sessions.updateSession,

  // Invocations
  recordInvocation: invocations.recordInvocation,
  getChainHead: invocations.getChainHead,
  verifyChain: invocations.verifyChain,

  // Episodic Experiences
  recordEpisodicExperience: experiences.recordExperience,
  getEpisodicExperience: experiences.getExperience,
  queryEpisodicExperiences: experiences.queryExperiences,
  countEpisodicExperiences: experiences.countExperiences,
  getExperiencesSince: experiences.getExperiencesSince,

  // Scenes + Cells
  createScene: scenes.createScene,
  getScene: scenes.getScene,
  getScenes: scenes.getScenes,
  createCell: scenes.createCell,
  getCell: scenes.getCell,
  getCellByCanonicalKey: scenes.getCellByCanonicalKey,
  linkCellEvidence: scenes.linkCellEvidence,
  recomputeCellSalience: scenes.recomputeCellSalience,
  queryCellsForContext: scenes.queryCellsForContext,
  computeOverlap: scenes.computeOverlap,

  // Consolidation
  runConsolidation: consolidation.runConsolidation,
  extractCandidates: consolidation.extractCandidates,

  // Context Pack
  contextPack: contextPack.contextPack,

  // Guarded Cycle
  PHASES: guardedCycle.PHASES,
  guardedCycle: guardedCycle.guardedCycle,
  getCycleStatus: guardedCycle.getCycleStatus,

  // Finalize Response
  finalizeResponse: finalize.finalizeResponse,

  // Governance
  validateGovernance: governance.validateGovernance,
  mintReceipt: governance.mintReceipt,
  verifyReceipt: governance.verifyReceipt,
  mintToken: governance.mintToken,
  verifyToken: governance.verifyToken,
  recordViolation: governance.recordViolation,
  recordSuccess: governance.recordSuccess
};
