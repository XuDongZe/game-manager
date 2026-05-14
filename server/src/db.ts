import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = process.env.DATA_DIR ?? "/opt/game-manager/data";
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "games.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS games (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    user_name   TEXT NOT NULL,
    tags        TEXT DEFAULT '[]',
    cover_url   TEXT,
    repo_path   TEXT NOT NULL,
    www_path    TEXT NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS versions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id     TEXT NOT NULL REFERENCES games(id),
    version_num INTEGER NOT NULL,
    commit_hash TEXT NOT NULL,
    git_tag     TEXT NOT NULL,
    deployed_by TEXT NOT NULL,
    deployed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status      TEXT DEFAULT 'deploying',
    is_rollback BOOLEAN DEFAULT FALSE,
    rollback_to INTEGER,
    file_size_kb INTEGER,
    UNIQUE(game_id, version_num)
  );
`);

export default db;
