-- Cloudflare-native editorial jobs. No credentials or private bodies in job logs.
CREATE TABLE content_jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('check','publish')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','completed_with_warnings','failed','cancelled')),
  scope_json TEXT NOT NULL CHECK(json_valid(scope_json)),
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  error TEXT,
  generation INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX one_active_content_job ON content_jobs(kind) WHERE status IN ('queued','running');
CREATE TABLE content_job_tasks (
  job_id TEXT NOT NULL REFERENCES content_jobs(id),
  id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  title TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  error TEXT,
  PRIMARY KEY(job_id,id)
);
CREATE INDEX content_jobs_created ON content_jobs(created_at DESC);
CREATE TABLE content_assets (
  hash TEXT PRIMARY KEY,
  bytes INTEGER NOT NULL CHECK(bytes >= 0),
  mime TEXT NOT NULL,
  created_at TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE content_asset_refs (
  hash TEXT NOT NULL REFERENCES content_assets(hash),
  document_id TEXT NOT NULL,
  release_id TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(hash,document_id,release_id)
);
CREATE TABLE content_usage (
  day TEXT PRIMARY KEY,
  writes INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE source_inventory (
  job_id TEXT NOT NULL REFERENCES content_jobs(id),
  source_url TEXT NOT NULL,
  document_id TEXT NOT NULL,
  PRIMARY KEY(job_id,source_url)
);
CREATE TABLE content_job_parts (
  job_id TEXT NOT NULL REFERENCES content_jobs(id),
  name TEXT NOT NULL,
  part INTEGER NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY(job_id,name,part)
);

-- Announcements are versioned like all other reviewed datasets.
INSERT OR IGNORE INTO documents(id,category,title,data_json,status,updated_at)
VALUES('dataset:updates','dataset','Anuncios de novedades','{"value":[]}','draft',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
