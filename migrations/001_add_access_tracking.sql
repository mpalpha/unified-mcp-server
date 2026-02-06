-- Migration 001: Add access tracking columns for experience TTL/curation
-- Added in v1.8.2 as part of Experience Storage Evolution
-- These columns enable future curation logic (TTL, relevance decay, access frequency)

-- Add last_accessed_at column to track when experiences were last retrieved
ALTER TABLE experiences ADD COLUMN last_accessed_at INTEGER DEFAULT NULL;

-- Add access_count column to track how often experiences are retrieved
ALTER TABLE experiences ADD COLUMN access_count INTEGER DEFAULT 0;

-- Create index for efficient access-based queries (e.g., find stale experiences)
CREATE INDEX IF NOT EXISTS idx_experiences_last_accessed ON experiences(last_accessed_at);
CREATE INDEX IF NOT EXISTS idx_experiences_access_count ON experiences(access_count);
