CREATE TABLE IF NOT EXISTS control_events(
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 event_id TEXT NOT NULL UNIQUE,
 idempotency_key TEXT UNIQUE,
 payload_digest TEXT NOT NULL,
 event_json TEXT NOT NULL CHECK(json_valid(event_json)),
 recorded_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS control_event_evidence(
 event_id TEXT NOT NULL REFERENCES control_events(event_id) ON DELETE CASCADE,
 evidence_id TEXT NOT NULL,
 PRIMARY KEY(event_id,evidence_id)
);
CREATE TABLE IF NOT EXISTS session_lineage(
 id TEXT PRIMARY KEY,
 parent_session_id TEXT NOT NULL,
 child_session_id TEXT NOT NULL,
 relation TEXT NOT NULL,
 evidence_level TEXT NOT NULL,
 status TEXT NOT NULL,
 evidence_ids_json TEXT NOT NULL CHECK(json_valid(evidence_ids_json)),
 occurred_at TEXT
);
CREATE TABLE IF NOT EXISTS responsibility_edges(
 id TEXT PRIMARY KEY,
 task_id TEXT NOT NULL,
 scope TEXT NOT NULL,
 roles_json TEXT NOT NULL CHECK(json_valid(roles_json)),
 status TEXT NOT NULL,
 evidence_ids_json TEXT NOT NULL CHECK(json_valid(evidence_ids_json)),
 confirmed_at TEXT
);
CREATE TABLE IF NOT EXISTS context_manifests(
 handoff_id TEXT PRIMARY KEY,
 task_id TEXT NOT NULL,
 task_revision INTEGER NOT NULL,
 digest TEXT NOT NULL,
 body_json TEXT NOT NULL CHECK(json_valid(body_json)),
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS handoff_receipts(
 receipt_id TEXT PRIMARY KEY,
 handoff_id TEXT NOT NULL,
 target_session_id TEXT NOT NULL,
 target_run_id TEXT NOT NULL,
 manifest_digest TEXT NOT NULL,
 stage TEXT NOT NULL,
 status TEXT NOT NULL,
 nonce TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 created_at TEXT NOT NULL,
 confirmed_at TEXT,
 evidence_ids_json TEXT NOT NULL CHECK(json_valid(evidence_ids_json)),
 UNIQUE(handoff_id,nonce)
);
CREATE TABLE IF NOT EXISTS run_observations(
 observation_id TEXT PRIMARY KEY,
 run_id TEXT NOT NULL,
 session_id TEXT,
 run_state TEXT NOT NULL,
 health TEXT NOT NULL,
 observed_at TEXT,
 evidence_id TEXT
);
CREATE TABLE IF NOT EXISTS attention_items(
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL,
 severity TEXT NOT NULL,
 message TEXT NOT NULL,
 status TEXT NOT NULL,
 evidence_ids_json TEXT NOT NULL CHECK(json_valid(evidence_ids_json))
);
CREATE TABLE IF NOT EXISTS projection_cursors(
 name TEXT PRIMARY KEY,
 sequence INTEGER NOT NULL CHECK(sequence>=0)
);
CREATE INDEX IF NOT EXISTS control_events_recorded ON control_events(recorded_at,sequence);
CREATE INDEX IF NOT EXISTS control_events_idempotency ON control_events(idempotency_key);
CREATE INDEX IF NOT EXISTS lineage_parent_child ON session_lineage(parent_session_id,child_session_id);
CREATE INDEX IF NOT EXISTS receipts_handoff ON handoff_receipts(handoff_id,created_at);
CREATE INDEX IF NOT EXISTS observations_run ON run_observations(run_id,observed_at);
