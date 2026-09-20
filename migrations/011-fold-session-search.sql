-- Fold the cache once; original event text remains available for snippets.
UPDATE session_search SET search_text=lower(search_text);

-- Trigrams only narrow candidates. Literal instr() remains the final authority.
CREATE VIRTUAL TABLE session_search_fts USING fts5(
  search_text, content='session_search', content_rowid='rowid',
  tokenize='trigram case_sensitive 1', detail='none'
);
INSERT INTO session_search_fts(session_search_fts) VALUES('rebuild');
CREATE TRIGGER session_search_fts_insert AFTER INSERT ON session_search BEGIN
  INSERT INTO session_search_fts(rowid,search_text) VALUES(NEW.rowid,NEW.search_text);
END;
CREATE TRIGGER session_search_fts_delete AFTER DELETE ON session_search BEGIN
  INSERT INTO session_search_fts(session_search_fts,rowid,search_text) VALUES('delete',OLD.rowid,OLD.search_text);
END;
CREATE TRIGGER session_search_fts_update AFTER UPDATE OF search_text ON session_search
WHEN OLD.search_text IS NOT NEW.search_text BEGIN
  INSERT INTO session_search_fts(session_search_fts,rowid,search_text) VALUES('delete',OLD.rowid,OLD.search_text);
  INSERT INTO session_search_fts(rowid,search_text) VALUES(NEW.rowid,NEW.search_text);
END;
