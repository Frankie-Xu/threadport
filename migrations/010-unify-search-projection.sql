-- These are derived search caches from the unpublished local v8/v9 lineage.
-- Canonical session_search was backfilled before this cleanup. User event rows,
-- handoffs, task history, and control-plane evidence are never removed.
DROP TRIGGER IF EXISTS search_projection_events_insert;
DROP TRIGGER IF EXISTS search_projection_events_update;
DROP TRIGGER IF EXISTS search_projection_events_delete;
DROP TABLE IF EXISTS search_session_projection;
DROP TABLE IF EXISTS search_event_projection;
