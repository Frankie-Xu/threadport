CREATE TABLE workspace_runs(
 id TEXT PRIMARY KEY REFERENCES launch_attempts(id) ON DELETE CASCADE,
 workspace_root TEXT NOT NULL,
 owner_json TEXT NOT NULL CHECK(json_valid(owner_json)),
 target_json TEXT CHECK(target_json IS NULL OR json_valid(target_json)),
 state TEXT NOT NULL CHECK(state IN ('running','unknown','released')),
 nonce TEXT NOT NULL UNIQUE
);
CREATE INDEX workspace_runs_occupied ON workspace_runs(workspace_root,state);
CREATE TABLE run_recoveries(
 id INTEGER PRIMARY KEY,
 attempt_id TEXT NOT NULL REFERENCES launch_attempts(id) ON DELETE CASCADE,
 recovered_at TEXT NOT NULL,
 evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)),
 confirmation TEXT NOT NULL
);
-- Legacy launches lack a reusable process identity. Preserve every reservation, including overlaps.
INSERT INTO workspace_runs(id,workspace_root,owner_json,target_json,state,nonce)
 SELECT a.id,coalesce(json_extract(h.body_json,'$.workspace.canonicalRoot'),'unbound'),
 json_object('pid',coalesce(json_extract(h.body_json,'$.approval.launch.ownerPid'),0),'instance',null,'platform','unknown','boot',null,'start',null),
 NULL,'unknown',a.id
 FROM launch_attempts a JOIN handoffs h ON h.id=a.handoff_id WHERE a.status='launching';
UPDATE handoffs SET state='unknown' WHERE state='launching';
UPDATE launch_attempts SET status='unknown',error_code='LEGACY_RUN_UNKNOWN' WHERE status='launching';
