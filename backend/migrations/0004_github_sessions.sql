-- Opaque session/nonce tokens are stored as SHA-256 hashes. OAuth access tokens
-- are only used during the callback and are never persisted.
CREATE TABLE oauth_states (
  hash TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE editorial_sessions (
  hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  github_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX editorial_sessions_expiry ON editorial_sessions(expires_at);
