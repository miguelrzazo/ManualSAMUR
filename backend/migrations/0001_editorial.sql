PRAGMA foreign_keys = ON;

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK(category IN ('procedure','dataset')),
  title TEXT NOT NULL,
  data_json TEXT NOT NULL CHECK(json_valid(data_json)),
  private_notes TEXT NOT NULL DEFAULT '',
  references_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(references_json)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','in_review','ready','published','archived')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
  source_json TEXT CHECK(source_json IS NULL OR json_valid(source_json)),
  source_hash TEXT,
  incoming_source_json TEXT CHECK(incoming_source_json IS NULL OR json_valid(incoming_source_json)),
  updated_at TEXT NOT NULL
);
CREATE INDEX documents_status ON documents(status);

CREATE TABLE revisions (
  document_id TEXT NOT NULL REFERENCES documents(id),
  revision INTEGER NOT NULL,
  title TEXT NOT NULL,
  data_json TEXT NOT NULL,
  private_notes TEXT NOT NULL,
  references_json TEXT NOT NULL,
  status TEXT NOT NULL,
  source_json TEXT,
  source_hash TEXT,
  incoming_source_json TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY(document_id, revision)
);
CREATE TRIGGER document_insert_history AFTER INSERT ON documents BEGIN
  INSERT INTO revisions VALUES(NEW.id,NEW.revision,NEW.title,NEW.data_json,NEW.private_notes,NEW.references_json,NEW.status,NEW.source_json,NEW.source_hash,NEW.incoming_source_json,NEW.updated_at);
END;
CREATE TRIGGER document_update_history AFTER UPDATE ON documents BEGIN
  INSERT INTO revisions VALUES(NEW.id,NEW.revision,NEW.title,NEW.data_json,NEW.private_notes,NEW.references_json,NEW.status,NEW.source_json,NEW.source_hash,NEW.incoming_source_json,NEW.updated_at);
END;
CREATE TRIGGER document_revision_guard BEFORE UPDATE ON documents
WHEN NEW.revision != OLD.revision + 1 BEGIN
  SELECT RAISE(ABORT, 'revision must increase by one');
END;

CREATE TABLE releases (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('preparing','published','failed')),
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL,
  published_at TEXT,
  parent_id TEXT REFERENCES releases(id),
  hash TEXT,
  package_hash TEXT,
  metadata_json TEXT,
  changelog_json TEXT,
  error TEXT
);
CREATE TABLE release_documents (
  release_id TEXT NOT NULL REFERENCES releases(id),
  document_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  PRIMARY KEY(release_id, document_id),
  FOREIGN KEY(document_id,revision) REFERENCES revisions(document_id,revision)
);
-- One build in flight prevents an older build overwriting a newer publication.
CREATE UNIQUE INDEX one_preparing_release ON releases(status) WHERE status='preparing';
CREATE TABLE publication_pointer (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  release_id TEXT NOT NULL REFERENCES releases(id)
);
-- Publication artifacts are precompiled off-worker and split below the D1 row
-- and SQL statement limits. They contain public projections only.
CREATE TABLE release_artifacts (
  release_id TEXT NOT NULL REFERENCES releases(id),
  name TEXT NOT NULL,
  part INTEGER NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY(release_id,name,part)
);
CREATE TABLE public_documents (
  release_id TEXT NOT NULL REFERENCES releases(id),
  id TEXT NOT NULL,
  slug TEXT,
  title TEXT NOT NULL,
  data_json TEXT NOT NULL,
  PRIMARY KEY(release_id,id)
);
CREATE INDEX public_documents_slug ON public_documents(release_id,slug);
CREATE TABLE ingest_parts (
  batch TEXT NOT NULL,
  name TEXT NOT NULL,
  part INTEGER NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY(batch,name,part)
);

CREATE TRIGGER activate_first_release BEFORE INSERT ON publication_pointer BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM releases r WHERE r.id=NEW.release_id AND r.status='preparing'
      AND r.parent_id IS NULL AND r.hash IS NOT NULL AND json_valid(r.metadata_json)
      AND EXISTS(SELECT 1 FROM release_artifacts a WHERE a.release_id=r.id AND a.name='snapshot.json')
      AND EXISTS(SELECT 1 FROM release_artifacts a WHERE a.release_id=r.id AND a.name='changelog.pdf')
      AND EXISTS(SELECT 1 FROM public_documents d WHERE d.release_id=r.id)
  ) THEN RAISE(ABORT,'unverified first publication') END;
END;
CREATE TRIGGER activate_next_release BEFORE UPDATE ON publication_pointer BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM releases r WHERE r.id=NEW.release_id AND r.status='preparing'
      AND r.parent_id=OLD.release_id AND r.hash IS NOT NULL AND json_valid(r.metadata_json)
      AND EXISTS(SELECT 1 FROM release_artifacts a WHERE a.release_id=r.id AND a.name='snapshot.json')
      AND EXISTS(SELECT 1 FROM release_artifacts a WHERE a.release_id=r.id AND a.name='changelog.pdf')
      AND EXISTS(SELECT 1 FROM public_documents d WHERE d.release_id=r.id)
  ) THEN RAISE(ABORT,'stale or unverified publication') END;
END;
CREATE TRIGGER first_release_visible AFTER INSERT ON publication_pointer BEGIN
  UPDATE releases SET status='published',published_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.release_id;
  UPDATE documents SET status='published',revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE status='ready' AND EXISTS(SELECT 1 FROM release_documents rd WHERE rd.release_id=NEW.release_id AND rd.document_id=documents.id AND rd.revision=documents.revision);
END;
CREATE TRIGGER next_release_visible AFTER UPDATE ON publication_pointer BEGIN
  UPDATE releases SET status='published',published_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.release_id;
  UPDATE documents SET status='draft',revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE status='published' AND NOT EXISTS(SELECT 1 FROM release_documents rd JOIN revisions r ON r.document_id=rd.document_id AND r.revision=rd.revision
      WHERE rd.release_id=NEW.release_id AND rd.document_id=documents.id AND r.data_json=documents.data_json AND r.title=documents.title);
  UPDATE documents SET status='published',revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE status='ready' AND EXISTS(SELECT 1 FROM release_documents rd WHERE rd.release_id=NEW.release_id AND rd.document_id=documents.id AND rd.revision=documents.revision);
END;
