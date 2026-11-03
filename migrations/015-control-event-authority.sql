-- Old envelopes do not prove whether the API or an importer wrote them.
CREATE TABLE control_event_authority(
 event_id TEXT PRIMARY KEY REFERENCES control_events(event_id) ON DELETE CASCADE
);
