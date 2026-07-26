import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import db from '../db/index.js';
import { authenticate, requireMusicDirector } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// GET /rehearsals - list all rehearsals with attendance counts, optionally filtered by date range
router.get('/', (req, res) => {
  const { from, to } = req.query;

  let query = `
    SELECT r.*,
      (SELECT COUNT(*) FROM attendance_records a WHERE a.rehearsal_id = r.id AND a.status IN ('absent_full', 'absent_partial') AND a.approval_status != 'denied') as absence_count
    FROM rehearsals r
  `;
  const conditions = [];
  const params = [];

  if (from) {
    conditions.push('r.date >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('r.date <= ?');
    params.push(to);
  }
  if (conditions.length) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  query += ' ORDER BY r.date ASC, r.start_time ASC';

  const rehearsals = db.prepare(query).all(...params);

  // Attach the current user's own attendance record for each
  const attendanceStmt = db.prepare(
    'SELECT id, status, approval_status, reason FROM attendance_records WHERE rehearsal_id = ? AND user_id = ?'
  );
  const enriched = rehearsals.map((r) => {
    const myAttendance = attendanceStmt.get(r.id, req.user.id);
    return { ...r, my_attendance: myAttendance || null };
  });

  res.json({ rehearsals: enriched });
});

// GET /rehearsals/:id - single rehearsal with full attendance roster
router.get('/:id', (req, res) => {
  const rehearsal = db.prepare('SELECT * FROM rehearsals WHERE id = ?').get(req.params.id);
  if (!rehearsal) return res.status(404).json({ error: 'Rehearsal not found' });

  const attendance = db.prepare(`
    SELECT a.id, a.status, a.absent_start_time, a.absent_end_time, a.reason,
           a.approval_status, a.reviewed_by, a.reviewed_at, a.created_at,
           u.id as user_id, u.name, u.voice_part
    FROM attendance_records a
    JOIN users u ON u.id = a.user_id
    WHERE a.rehearsal_id = ?
    ORDER BY u.name ASC
  `).all(req.params.id);

  const canViewReasons = req.user.role === 'music_director' || req.user.role === 'president';
  const filtered = attendance.map((a) => ({
    ...a,
    reason: (a.user_id === req.user.id || canViewReasons) ? a.reason : null,
  }));

  res.json({ rehearsal, attendance: filtered });
});

const rehearsalSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Start time must be in HH:MM format'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  location: z.string().min(1, 'Location is required'),
  notes: z.string().optional().nullable(),
  recurrence: z
    .object({
      daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, 'Select at least one day'),
      until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      occurrences: z.number().int().min(1).max(104).optional(),
    })
    .refine((r) => r.until || r.occurrences, {
      message: 'Recurrence must specify either an end date or a number of occurrences',
    })
    .optional()
    .nullable(),
});

function generateRecurrenceDates(startDate, daysOfWeek, until, occurrences) {
  const dates = [];
  const cursor = new Date(`${startDate}T00:00:00`);
  const untilDate = until ? new Date(`${until}T00:00:00`) : null;
  const daySet = new Set(daysOfWeek);

  // Cap the search window so a bad combination of inputs can't loop forever.
  const maxIterations = 366 * 2;
  for (let i = 0; i < maxIterations; i++) {
    if (daySet.has(cursor.getDay())) {
      if (untilDate && cursor > untilDate) break;
      dates.push(cursor.toISOString().slice(0, 10));
      if (occurrences && dates.length >= occurrences) break;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function insertRehearsalWithAttendance(insertStmt, insertAttendanceStmt, fields, memberIds) {
  const id = randomUUID();
  insertStmt.run(
    id,
    fields.date,
    fields.startTime,
    fields.endTime || null,
    fields.location,
    fields.notes || null,
    fields.recurrenceId || null,
    fields.createdBy
  );
  for (const memberId of memberIds) {
    insertAttendanceStmt.run(randomUUID(), id, memberId);
  }
  return id;
}

// POST /rehearsals - music director only
router.post('/', requireMusicDirector, (req, res) => {
  const parsed = rehearsalSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { date, startTime, endTime, location, notes, recurrence } = parsed.data;

  const insertRehearsal = db.prepare(`
    INSERT INTO rehearsals (id, date, start_time, end_time, location, notes, recurrence_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertAttendance = db.prepare(`
    INSERT INTO attendance_records (id, rehearsal_id, user_id) VALUES (?, ?, ?)
  `);

  const createWithAttendance = db.transaction((dates, recurrenceId) => {
    const memberIds = db.prepare('SELECT id FROM users').all().map((u) => u.id);
    const ids = [];
    for (const d of dates) {
      const id = insertRehearsalWithAttendance(
        insertRehearsal,
        insertAttendance,
        { date: d, startTime, endTime, location, notes, recurrenceId, createdBy: req.user.id },
        memberIds
      );
      ids.push(id);
    }
    return ids;
  });

  let ids;
  if (recurrence) {
    const dates = generateRecurrenceDates(date, recurrence.daysOfWeek, recurrence.until, recurrence.occurrences);
    if (dates.length === 0) {
      return res.status(400).json({ error: 'Recurrence produced no rehearsal dates' });
    }
    ids = createWithAttendance(dates, randomUUID());
  } else {
    ids = createWithAttendance([date], null);
  }

  const rehearsals = db
    .prepare(`SELECT * FROM rehearsals WHERE id IN (${ids.map(() => '?').join(',')})`)
    .all(...ids);
  res.status(201).json({ rehearsals });
});

const rehearsalUpdateSchema = rehearsalSchema.omit({ recurrence: true }).partial();

// PUT /rehearsals/:id - music director only; ?scope=series applies startTime/endTime/location/notes to the whole recurring series
router.put('/:id', requireMusicDirector, (req, res) => {
  const existing = db.prepare('SELECT id, recurrence_id FROM rehearsals WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Rehearsal not found' });

  const parsed = rehearsalUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const fields = parsed.data;
  const scope = req.query.scope === 'series' ? 'series' : 'instance';

  const columnMap = { startTime: 'start_time', endTime: 'end_time' };
  let updateFields = fields;
  if (scope === 'series') {
    if (!existing.recurrence_id) {
      return res.status(400).json({ error: 'This rehearsal is not part of a recurring series' });
    }
    // Only time/location/notes propagate across the series; each instance keeps its own date.
    const { date: _date, ...seriesFields } = fields;
    updateFields = seriesFields;
  }

  const setClauses = [];
  const params = [];
  for (const [key, value] of Object.entries(updateFields)) {
    const column = columnMap[key] || key;
    setClauses.push(`${column} = ?`);
    params.push(value);
  }
  if (setClauses.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  if (scope === 'series') {
    db.prepare(`UPDATE rehearsals SET ${setClauses.join(', ')} WHERE recurrence_id = ?`).run(
      ...params,
      existing.recurrence_id
    );
    const rehearsals = db
      .prepare('SELECT * FROM rehearsals WHERE recurrence_id = ? ORDER BY date ASC')
      .all(existing.recurrence_id);
    return res.json({ rehearsals });
  }

  params.push(req.params.id);
  db.prepare(`UPDATE rehearsals SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
  const rehearsal = db.prepare('SELECT * FROM rehearsals WHERE id = ?').get(req.params.id);
  res.json({ rehearsal });
});

// DELETE /rehearsals/:id - music director only; ?scope=series deletes every rehearsal in the recurring series
router.delete('/:id', requireMusicDirector, (req, res) => {
  const existing = db.prepare('SELECT id, recurrence_id FROM rehearsals WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Rehearsal not found' });

  const scope = req.query.scope === 'series' ? 'series' : 'instance';
  if (scope === 'series') {
    if (!existing.recurrence_id) {
      return res.status(400).json({ error: 'This rehearsal is not part of a recurring series' });
    }
    db.prepare('DELETE FROM rehearsals WHERE recurrence_id = ?').run(existing.recurrence_id);
    return res.status(204).send();
  }

  db.prepare('DELETE FROM rehearsals WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

export default router;
