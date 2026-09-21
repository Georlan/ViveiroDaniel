CREATE TABLE IF NOT EXISTS shared_state (
  workspace_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
