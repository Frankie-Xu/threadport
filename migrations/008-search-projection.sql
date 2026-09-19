-- A compact, source-derived event-text projection keeps candidate selection at
-- session cardinality while preserving the event rows used for snippets.
CREATE TABLE search_session_projection(
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  search_text TEXT NOT NULL
);
INSERT INTO search_session_projection(session_id, search_text)
SELECT s.id, COALESCE((SELECT group_concat(e.search_text, char(10)) FROM events e WHERE e.session_id=s.id), '')
FROM sessions s;

CREATE TRIGGER search_projection_events_insert AFTER INSERT ON events BEGIN
  INSERT INTO search_session_projection(session_id, search_text)
  VALUES(NEW.session_id, NEW.search_text)
  ON CONFLICT(session_id) DO UPDATE SET search_text=CASE WHEN search_session_projection.search_text='' THEN excluded.search_text ELSE search_session_projection.search_text||char(10)||excluded.search_text END;
END;
CREATE TRIGGER search_projection_events_update AFTER UPDATE OF session_id, search_text ON events
WHEN OLD.session_id IS NOT NEW.session_id OR OLD.search_text IS NOT NEW.search_text BEGIN
  INSERT INTO search_session_projection(session_id, search_text)
  VALUES(OLD.session_id, COALESCE((SELECT group_concat(search_text, char(10)) FROM events WHERE session_id=OLD.session_id), ''))
  ON CONFLICT(session_id) DO UPDATE SET search_text=excluded.search_text;
  INSERT INTO search_session_projection(session_id, search_text)
  VALUES(NEW.session_id, COALESCE((SELECT group_concat(search_text, char(10)) FROM events WHERE session_id=NEW.session_id), ''))
  ON CONFLICT(session_id) DO UPDATE SET search_text=excluded.search_text;
END;
CREATE TRIGGER search_projection_events_delete AFTER DELETE ON events BEGIN
  INSERT INTO search_session_projection(session_id, search_text)
  VALUES(OLD.session_id, COALESCE((SELECT group_concat(search_text, char(10)) FROM events WHERE session_id=OLD.session_id), ''))
  ON CONFLICT(session_id) DO UPDATE SET search_text=excluded.search_text;
END;
