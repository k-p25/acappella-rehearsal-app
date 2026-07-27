import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Copy backend/.env.example to backend/.env and point it at a Postgres database.'
  );
}

// Hosted Postgres (Supabase) requires TLS; a local dev/test server does not.
// Parsed rather than pattern-matched so a URL without userinfo still resolves.
let host = '';
try {
  host = new URL(connectionString).hostname;
} catch {
  // Non-URL connection strings (key=value form) fall through to TLS on.
}
const isLocal = ['localhost', '127.0.0.1', '::1'].includes(host);

// Tests give each file its own schema so they can run in parallel against one database.
const schema = process.env.PG_SCHEMA || 'public';

const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  // Only sent when non-default, since connection poolers can reject startup options.
  ...(schema === 'public' ? {} : { options: `-c search_path=${schema}` }),
});

/**
 * SQLite stored timestamps as UTC 'YYYY-MM-DD HH:MM:SS' TEXT. These expressions
 * reproduce that exact format so stored values and API responses are unchanged.
 */
export const NOW_TEXT = `to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`;
export const TODAY_TEXT = `to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;

export function query(text, params) {
  return pool.query(text, params);
}

/** Run `fn` inside a transaction, passing it a dedicated client. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Create the schema. Must be awaited before the app serves traffic. */
export async function initDb() {
  if (schema !== 'public') {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      voice_part TEXT, -- e.g. Soprano, Alto, Tenor, Bass
      role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('president', 'music_director', 'business_manager', 'social_chair', 'member')),
      created_at TEXT NOT NULL DEFAULT ${NOW_TEXT}
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
      created_at TEXT NOT NULL DEFAULT ${NOW_TEXT}
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
      acknowledged_at TEXT,
      created_at TEXT NOT NULL DEFAULT ${NOW_TEXT},
      updated_at TEXT NOT NULL DEFAULT ${NOW_TEXT},
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
      created_at TEXT NOT NULL DEFAULT ${NOW_TEXT}
    );

    CREATE TABLE IF NOT EXISTS gig_rsvps (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      gig_id TEXT NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'declined')),
      decline_reason TEXT,
      created_at TEXT NOT NULL DEFAULT ${NOW_TEXT},
      updated_at TEXT NOT NULL DEFAULT ${NOW_TEXT},
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
}

/** Wipe all rows. Test-only helper. */
export async function truncateAll() {
  await pool.query(
    'TRUNCATE gig_rsvps, gigs, attendance_records, rehearsals, users RESTART IDENTITY CASCADE'
  );
}

export async function closeDb() {
  await pool.end();
}

export default pool;
