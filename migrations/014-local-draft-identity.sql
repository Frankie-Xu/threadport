CREATE TABLE local_draft_identity(
 id INTEGER PRIMARY KEY CHECK(id=1),
 secret TEXT NOT NULL CHECK(length(secret)=64)
);
