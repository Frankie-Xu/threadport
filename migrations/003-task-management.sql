ALTER TABLE task_revisions ADD COLUMN session_ids_json TEXT CHECK(session_ids_json IS NULL OR json_valid(session_ids_json));
CREATE TABLE completed_task_events(task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, event_id TEXT NOT NULL, PRIMARY KEY(task_id,event_id));
-- Existing completed tasks start tracking from the migration's current evidence.
INSERT INTO completed_task_events(task_id,event_id)
SELECT t.id,e.id FROM tasks t JOIN task_sessions ts ON ts.task_id=t.id JOIN events e ON e.session_id=ts.session_id WHERE json_extract(t.body_json,'$.lifecycle')='completed';
