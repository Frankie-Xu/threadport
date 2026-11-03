-- Backfill from the same allowlist and redactor used by new indexing writes.
UPDATE events SET search_text=tp_search_event_v13(body_json,search_text)
WHERE search_text IS NOT tp_search_event_v13(body_json,search_text);

-- Event triggers marked affected sessions dirty and invalidated old cursors.
-- Rebuild now so existing sessions need neither a rescan nor a slow fallback.
UPDATE session_search
SET search_text=lower(COALESCE((
  SELECT group_concat(search_text,char(10))
  FROM (SELECT search_text FROM events WHERE session_id=session_search.session_id ORDER BY ordinal)
),'')),dirty=0
WHERE dirty=1;
