import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { query, withTransaction } from '../db/index.js';
import { authenticate, requireMusicDirector } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
router.use(authenticate);

// GET /rehearsals - list all rehearsals with attendance counts, optionally filtered by date range
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { from, to } = req.query;

    // COUNT is cast to int so it serializes as a number; Postgres bigint would come back as a string.
    let sql = `
    SELECT r.*,
      (SELECT COUNT(*)::int FROM attendance_records a WHERE a.rehearsal_id = r.id AND a.status IN ('absent_full', 'absent_partial') AND a.approval_status != 'denied') as absence_count
    FROM rehearsals r
  `;
    const conditions = [];
    const params = [];

    if (from) {
      params.push(from);
      conditions.push(`r.date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`r.date <= $${params.length}`);
    }
    if (conditions.length) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY r.date ASC, r.start_time ASC';

    const { rows: rehearsals } = await query(sql, params);

    // Attach the current user's own attendance record for each, in a single round trip.
    const ids = rehearsals.map((r) => r.id);
    const mine = ids.length
      ? (
          await query(
            `SELECT rehearsal_id, id, status, approval_status, reason
           FROM attendance_records
           WHERE user_id = $1 AND rehearsal_id = ANY($2)`,
            [req.user.id, ids]
          )
        ).rows
      : [];
    const byRehearsal = new Map(mine.map(({ rehearsal_id, ...rest }) => [rehearsal_id, rest]));

    const enriched = rehearsals.map((r) => ({ ...r, my_attendance: byRehearsal.get(r.id) || null }));

    res.json({ rehearsals: enriched });
  })
);

// GET /rehearsals/:id - single rehearsal with full attendance roster
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rows: rehearsalRows } = await query('SELECT * FROM rehearsals WHERE id = $1', [
      req.params.id,
    ]);
    const rehearsal = rehearsalRows[0];
    if (!rehearsal) return res.status(404).json({ error: 'Rehearsal not found' });

    const { rows: attendance } = await query(
      `
    SELECT a.id, a.status, a.absent_start_time, a.absent_end_time, a.reason,
           a.approval_status, a.reviewed_by, a.reviewed_at, a.created_at,
           u.id as user_id, u.name, u.voice_part
    FROM attendance_records a
    JOIN users u ON u.id = a.user_id
    WHERE a.rehearsal_id = $1
    ORDER BY u.name ASC
  `,
      [req.params.id]
    );

    const canViewReasons = req.user.role === 'music_director' || req.user.role === 'president';
    const filtered = attendance.map((a) => ({
      ...a,
      reason: a.user_id === req.user.id || canViewReasons ? a.reason : null,
    }));

    res.json({ rehearsal, attendance: filtered });
  })
);

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

// POST /rehearsals - music director only
router.post(
  '/',
  requireMusicDirector,
  asyncHandler(async (req, res) => {
    const parsed = rehearsalSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const { date, startTime, endTime, location, notes, recurrence } = parsed.data;

    let dates = [date];
    let recurrenceId = null;
    if (recurrence) {
      dates = generateRecurrenceDates(
        date,
        recurrence.daysOfWeek,
        recurrence.until,
        recurrence.occurrences
      );
      if (dates.length === 0) {
        return res.status(400).json({ error: 'Recurrence produced no rehearsal dates' });
      }
      recurrenceId = randomUUID();
    }

    // A long recurrence can be 100+ rehearsals x every member; batch the writes so
    // this stays a handful of round trips rather than one per row.
    const ids = await withTransaction(async (client) => {
      const { rows: members } = await client.query('SELECT id FROM users');
      const memberIds = members.map((m) => m.id);

      const rehearsalIds = dates.map(() => randomUUID());

      const rehearsalParams = [];
      const rehearsalTuples = dates.map((d, i) => {
        rehearsalParams.push(
          rehearsalIds[i],
          d,
          startTime,
          endTime || null,
          location,
          notes || null,
          recurrenceId,
          req.user.id
        );
        const base = rehearsalParams.length - 8;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
      });

      await client.query(
        `INSERT INTO rehearsals (id, date, start_time, end_time, location, notes, recurrence_id, created_by)
         VALUES ${rehearsalTuples.join(', ')}`,
        rehearsalParams
      );

      if (memberIds.length) {
        const attendanceParams = [];
        const attendanceTuples = [];
        for (const rehearsalId of rehearsalIds) {
          for (const memberId of memberIds) {
            attendanceParams.push(randomUUID(), rehearsalId, memberId);
            const base = attendanceParams.length - 3;
            attendanceTuples.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
          }
        }
        await client.query(
          `INSERT INTO attendance_records (id, rehearsal_id, user_id) VALUES ${attendanceTuples.join(', ')}`,
          attendanceParams
        );
      }

      return rehearsalIds;
    });

    const { rows: rehearsals } = await query(
      'SELECT * FROM rehearsals WHERE id = ANY($1) ORDER BY date ASC',
      [ids]
    );
    res.status(201).json({ rehearsals });
  })
);

const rehearsalUpdateSchema = rehearsalSchema.omit({ recurrence: true }).partial();

// PUT /rehearsals/:id - music director only; ?scope=series applies startTime/endTime/location/notes to the whole recurring series
router.put(
  '/:id',
  requireMusicDirector,
  asyncHandler(async (req, res) => {
    const { rows: existingRows } = await query(
      'SELECT id, recurrence_id FROM rehearsals WHERE id = $1',
      [req.params.id]
    );
    const existing = existingRows[0];
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
      params.push(value);
      setClauses.push(`${column} = $${params.length}`);
    }
    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    if (scope === 'series') {
      params.push(existing.recurrence_id);
      await query(
        `UPDATE rehearsals SET ${setClauses.join(', ')} WHERE recurrence_id = $${params.length}`,
        params
      );
      const { rows: rehearsals } = await query(
        'SELECT * FROM rehearsals WHERE recurrence_id = $1 ORDER BY date ASC',
        [existing.recurrence_id]
      );
      return res.json({ rehearsals });
    }

    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE rehearsals SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    res.json({ rehearsal: rows[0] });
  })
);

// DELETE /rehearsals/:id - music director only; ?scope=series deletes every rehearsal in the recurring series
router.delete(
  '/:id',
  requireMusicDirector,
  asyncHandler(async (req, res) => {
    const { rows: existingRows } = await query(
      'SELECT id, recurrence_id FROM rehearsals WHERE id = $1',
      [req.params.id]
    );
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ error: 'Rehearsal not found' });

    const scope = req.query.scope === 'series' ? 'series' : 'instance';
    if (scope === 'series') {
      if (!existing.recurrence_id) {
        return res.status(400).json({ error: 'This rehearsal is not part of a recurring series' });
      }
      await query('DELETE FROM rehearsals WHERE recurrence_id = $1', [existing.recurrence_id]);
      return res.status(204).send();
    }

    await query('DELETE FROM rehearsals WHERE id = $1', [req.params.id]);
    res.status(204).send();
  })
);

export default router;
