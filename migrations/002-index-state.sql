ALTER TABLE source_cursors ADD COLUMN cursor_json TEXT CHECK(cursor_json IS NULL OR json_valid(cursor_json));
CREATE UNIQUE INDEX sessions_source_path ON sessions(source_id,source_path) WHERE source_path IS NOT NULL;
CREATE TABLE index_leases(source_id TEXT PRIMARY KEY REFERENCES sources(id), owner TEXT NOT NULL, slot INTEGER NOT NULL UNIQUE CHECK(slot IN(0,1)), expires_at INTEGER NOT NULL);
