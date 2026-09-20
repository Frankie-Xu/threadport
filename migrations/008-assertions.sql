CREATE TABLE assertion_revisions(
 id TEXT NOT NULL,
 task_id TEXT NOT NULL REFERENCES tasks(id),
 revision INTEGER NOT NULL CHECK(revision>0),
 task_revision INTEGER NOT NULL,
 body_json TEXT NOT NULL CHECK(json_valid(body_json)),
 PRIMARY KEY(id,revision),
 FOREIGN KEY(task_id,task_revision) REFERENCES task_revisions(task_id,revision)
);
CREATE INDEX assertions_task ON assertion_revisions(task_id,id,revision);
CREATE TRIGGER assertion_revision_immutable_update BEFORE UPDATE ON assertion_revisions BEGIN SELECT RAISE(ABORT,'Assertion revisions are immutable'); END;
