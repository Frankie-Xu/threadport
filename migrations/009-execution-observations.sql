CREATE TABLE execution_observations(
 id TEXT PRIMARY KEY,
 task_id TEXT NOT NULL REFERENCES tasks(id),
 session_id TEXT NOT NULL REFERENCES sessions(id),
 handoff_id TEXT NOT NULL,
 body_json TEXT NOT NULL CHECK(json_valid(body_json))
);
CREATE INDEX observations_task_session ON execution_observations(task_id,session_id);
CREATE TRIGGER observation_finished_immutable BEFORE UPDATE ON execution_observations
 WHEN json_extract(OLD.body_json,'$.status')!='running'
 BEGIN SELECT RAISE(ABORT,'Completed observations are immutable'); END;
