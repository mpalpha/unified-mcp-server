-- Migration 003: Backfill episodic_experiences from experiences
-- Bridges legacy knowledge store to v1.9.0 memory system
-- Only inserts rows that don't already exist (idempotent via LEFT JOIN)

INSERT INTO episodic_experiences (
  session_id,
  scope,
  context_keys_json,
  summary,
  outcome,
  trust,
  salience,
  created_at,
  source
)
SELECT
  NULL,
  'project',
  json_array(LOWER(e.domain)),
  SUBSTR(e.situation, 1, 4000),
  CASE WHEN e.type = 'effective' THEN 'success' ELSE 'fail' END,
  CASE
    WHEN e.confidence > 0.75 THEN 3
    WHEN e.confidence > 0.5 THEN 2
    WHEN e.confidence > 0.25 THEN 1
    ELSE 0
  END,
  CASE
    WHEN e.confidence > 0.75 THEN 220
    WHEN e.confidence > 0.5 THEN 180
    WHEN e.confidence > 0.25 THEN 130
    ELSE 80
  END,
  datetime(e.created_at, 'unixepoch'),
  'agent'
FROM experiences e
LEFT JOIN episodic_experiences ee
  ON ee.summary = SUBSTR(e.situation, 1, 4000)
  AND ee.source = 'agent'
  AND ee.outcome = CASE WHEN e.type = 'effective' THEN 'success' ELSE 'fail' END
WHERE ee.experience_id IS NULL;
