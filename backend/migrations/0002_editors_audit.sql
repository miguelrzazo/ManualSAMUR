-- #27: several editorial users, an admin-only user editor and a log of who
-- changed what. Cloudflare Access proves the identity; this table authorises it.
-- EDITOR_EMAIL (Worker secret) is always an active admin, so the owner can never
-- lock themselves out by editing this table.
CREATE TABLE editors (
  email TEXT PRIMARY KEY COLLATE NOCASE CHECK(email LIKE '%_@_%' AND length(email) <= 254),
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'editor' CHECK(role IN ('admin','editor')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Append-only: who did what, when. Never contains document bodies or notes.
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX audit_log_at ON audit_log(at DESC);
CREATE TRIGGER audit_log_append_only_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
CREATE TRIGGER audit_log_append_only_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;

-- Revision authorship. Automatic rows (official proposals, publication
-- triggers) keep NULL and are shown as "Sistema".
ALTER TABLE documents ADD COLUMN updated_by TEXT;
ALTER TABLE revisions ADD COLUMN author TEXT;
ALTER TABLE releases ADD COLUMN created_by TEXT;

DROP TRIGGER document_insert_history;
DROP TRIGGER document_update_history;
CREATE TRIGGER document_insert_history AFTER INSERT ON documents BEGIN
  INSERT INTO revisions(document_id,revision,title,data_json,private_notes,references_json,status,source_json,source_hash,incoming_source_json,created_at,author)
  VALUES(NEW.id,NEW.revision,NEW.title,NEW.data_json,NEW.private_notes,NEW.references_json,NEW.status,NEW.source_json,NEW.source_hash,NEW.incoming_source_json,NEW.updated_at,NEW.updated_by);
END;
-- System writers (proposal import, publication triggers) set updated_by=NULL
-- explicitly so their revisions are attributed to "Sistema", never to the
-- previous human editor.
CREATE TRIGGER document_update_history AFTER UPDATE ON documents BEGIN
  INSERT INTO revisions(document_id,revision,title,data_json,private_notes,references_json,status,source_json,source_hash,incoming_source_json,created_at,author)
  VALUES(NEW.id,NEW.revision,NEW.title,NEW.data_json,NEW.private_notes,NEW.references_json,NEW.status,NEW.source_json,NEW.source_hash,NEW.incoming_source_json,NEW.updated_at,NEW.updated_by);
END;

DROP TRIGGER first_release_visible;
DROP TRIGGER next_release_visible;
CREATE TRIGGER first_release_visible AFTER INSERT ON publication_pointer BEGIN
  UPDATE releases SET status='published',published_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.release_id;
  UPDATE documents SET status='published',revision=revision+1,updated_by=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE status='ready' AND EXISTS(SELECT 1 FROM release_documents rd WHERE rd.release_id=NEW.release_id AND rd.document_id=documents.id AND rd.revision=documents.revision);
  INSERT INTO audit_log(at,actor,action,target,detail) VALUES(strftime('%Y-%m-%dT%H:%M:%fZ','now'),'Sistema','release.published',NEW.release_id,'');
END;
CREATE TRIGGER next_release_visible AFTER UPDATE ON publication_pointer BEGIN
  UPDATE releases SET status='published',published_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.release_id;
  UPDATE documents SET status='draft',revision=revision+1,updated_by=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE status='published' AND NOT EXISTS(SELECT 1 FROM release_documents rd JOIN revisions r ON r.document_id=rd.document_id AND r.revision=rd.revision
      WHERE rd.release_id=NEW.release_id AND rd.document_id=documents.id AND r.data_json=documents.data_json AND r.title=documents.title);
  UPDATE documents SET status='published',revision=revision+1,updated_by=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE status='ready' AND EXISTS(SELECT 1 FROM release_documents rd WHERE rd.release_id=NEW.release_id AND rd.document_id=documents.id AND rd.revision=documents.revision);
  INSERT INTO audit_log(at,actor,action,target,detail) VALUES(strftime('%Y-%m-%dT%H:%M:%fZ','now'),'Sistema','release.published',NEW.release_id,'');
END;
