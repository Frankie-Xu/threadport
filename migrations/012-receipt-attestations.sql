CREATE TABLE receipt_attestations(
 id TEXT PRIMARY KEY,
 receipt_id TEXT NOT NULL REFERENCES handoff_receipts(receipt_id) ON DELETE CASCADE,
 task_id TEXT NOT NULL,
 handoff_id TEXT NOT NULL,
 target_session_id TEXT NOT NULL,
 target_run_id TEXT NOT NULL,
 manifest_digest TEXT NOT NULL,
 stage TEXT NOT NULL CHECK(stage IN ('received','verified-complete')),
 recorded_at TEXT NOT NULL
);
