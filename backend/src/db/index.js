import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/app.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Schema ---
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    voice_part TEXT, -- e.g. Soprano, Alto, Tenor, Bass
    role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member', 'admin')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS rehearsals (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,       -- ISO date, e.g. 2026-08-01
    start_time TEXT NOT NULL, -- e.g. 18:30
    end_time TEXT,
    location TEXT NOT NULL,
    notes TEXT,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS absences (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rehearsal_id TEXT NOT NULL REFERENCES rehearsals(id) ON DELETE CASCADE,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, rehearsal_id)
  );

  CREATE INDEX IF NOT EXISTS idx_rehearsals_date ON rehearsals(date);
  CREATE INDEX IF NOT EXISTS idx_absences_rehearsal ON absences(rehearsal_id);
  CREATE INDEX IF NOT EXISTS idx_absences_user ON absences(user_id);
`);

export default db;
