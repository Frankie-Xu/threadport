CREATE TABLE session_search(
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  search_text TEXT NOT NULL,
  dirty INTEGER NOT NULL DEFAULT 0 CHECK(dirty IN (0,1))
);

INSERT INTO session_search(session_id,search_text,dirty)
SELECT s.id,COALESCE((
  SELECT group_concat(search_text,char(10))
  FROM (SELECT search_text FROM events WHERE session_id=s.id ORDER BY ordinal)
),''),0
FROM sessions s;

CREATE TRIGGER search_projection_event_insert AFTER INSERT ON events BEGIN
  INSERT INTO session_search(session_id,search_text,dirty) VALUES(NEW.session_id,'',1)
  ON CONFLICT(session_id) DO UPDATE SET dirty=1;
END;
CREATE TRIGGER search_projection_event_update AFTER UPDATE OF session_id,ordinal,search_text ON events BEGIN
  INSERT INTO session_search(session_id,search_text,dirty) VALUES(NEW.session_id,'',1)
  ON CONFLICT(session_id) DO UPDATE SET dirty=1;
  INSERT INTO session_search(session_id,search_text,dirty) VALUES(OLD.session_id,'',1)
  ON CONFLICT(session_id) DO UPDATE SET dirty=1;
END;
CREATE TRIGGER search_projection_event_delete AFTER DELETE ON events BEGIN
  INSERT INTO session_search(session_id,search_text,dirty)
  SELECT OLD.session_id,'',1 WHERE EXISTS (SELECT 1 FROM sessions WHERE id=OLD.session_id)
  ON CONFLICT(session_id) DO UPDATE SET dirty=1;
END;
