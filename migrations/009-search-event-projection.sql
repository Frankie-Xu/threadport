DROP TRIGGER search_projection_events_insert;
DROP TRIGGER search_projection_events_update;
DROP TRIGGER search_projection_events_delete;
DROP TABLE search_session_projection;
CREATE TABLE search_event_projection(
  event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  search_text TEXT NOT NULL
);
INSERT INTO search_event_projection(event_id, session_id, search_text)
SELECT id, session_id, search_text FROM events;
CREATE INDEX search_event_projection_session ON search_event_projection(session_id);
CREATE TRIGGER search_projection_events_insert AFTER INSERT ON events BEGIN
  INSERT INTO search_event_projection(event_id, session_id, search_text) VALUES(NEW.id, NEW.session_id, NEW.search_text);
END;
CREATE TRIGGER search_projection_events_update AFTER UPDATE OF id, session_id, search_text ON events BEGIN
  INSERT INTO search_event_projection(event_id, session_id, search_text) VALUES(NEW.id, NEW.session_id, NEW.search_text)
  ON CONFLICT(event_id) DO UPDATE SET session_id=excluded.session_id, search_text=excluded.search_text;
END;
CREATE TRIGGER search_projection_events_delete AFTER DELETE ON events BEGIN
  DELETE FROM search_event_projection WHERE event_id=OLD.id;
END;
