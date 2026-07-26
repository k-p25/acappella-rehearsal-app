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
    role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('president', 'music_director', 'business_manager', 'social_chair', 'member')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS rehearsals (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,       -- ISO date, e.g. 2026-08-01
    start_time TEXT NOT NULL, -- e.g. 18:30
    end_time TEXT,
    location TEXT NOT NULL,
    notes TEXT,
    recurrence_id TEXT, -- groups instances generated from the same recurring rehearsal
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS attendance_records (
    id TEXT PRIMARY KEY,
    rehearsal_id TEXT NOT NULL REFERENCES rehearsals(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'present', 'absent_full', 'absent_partial')),
    absent_start_time TEXT,
    absent_end_time TEXT,
    reason TEXT,
    approval_status TEXT NOT NULL DEFAULT 'pending' CHECK(approval_status IN ('pending', 'approved', 'denied')),
    reviewed_by TEXT REFERENCES users(id),
    reviewed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, rehearsal_id)
  );

  CREATE TABLE IF NOT EXISTS gigs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    date TEXT NOT NULL,  -- ISO date, e.g. 2026-08-01
    time TEXT NOT NULL,  -- start time, e.g. 18:30
    end_time TEXT,
    venue TEXT NOT NULL,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS gig_rsvps (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gig_id TEXT NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'declined')),
    decline_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, gig_id)
  );

  CREATE INDEX IF NOT EXISTS idx_rehearsals_date ON rehearsals(date);
  CREATE INDEX IF NOT EXISTS idx_rehearsals_recurrence ON rehearsals(recurrence_id);
  CREATE INDEX IF NOT EXISTS idx_attendance_rehearsal ON attendance_records(rehearsal_id);
  CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance_records(user_id);
  CREATE INDEX IF NOT EXISTS idx_gigs_date ON gigs(date);
  CREATE INDEX IF NOT EXISTS idx_gig_rsvps_gig ON gig_rsvps(gig_id);
  CREATE INDEX IF NOT EXISTS idx_gig_rsvps_user ON gig_rsvps(user_id);
`);

// Add acknowledged_at column if it doesn't exist (for existing DBs)
const tableInfo = db.pragma('table_info(attendance_records)');
if (!tableInfo.some((col) => col.name === 'acknowledged_at')) {
  db.exec('ALTER TABLE attendance_records ADD COLUMN acknowledged_at TEXT;');
}

// Add decline_reason column to gig_rsvps if it doesn't exist (for existing DBs)
const rsvpTableInfo = db.pragma('table_info(gig_rsvps)');
if (!rsvpTableInfo.some((col) => col.name === 'decline_reason')) {
  db.exec('ALTER TABLE gig_rsvps ADD COLUMN decline_reason TEXT;');
}

export default db;
