-- Materialize SQLite's existing ASCII lower() expression once per indexed event.
-- instr() retains literal substring semantics, including text after embedded NUL.
CREATE INDEX events_search_folded ON events(session_id,lower(search_text));
