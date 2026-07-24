import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import db from '../db/index.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// GET /rehearsals - list all rehearsals with absence counts, optionally filtered by date range
router.get('/', (req, res) => {
  const { from, to } = req.query;

  let query = `
    SELECT r.*,
      (SELECT COUNT(*) FROM absences a WHERE a.rehearsal_id = r.id) as absence_count
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

  // Attach whether the current user is marked absent for each
  const absenceStmt = db.prepare(
    'SELECT id, reason FROM absences WHERE rehearsal_id = ? AND user_id = ?'
  );
  const enriched = rehearsals.map((r) => {
    const myAbsence = absenceStmt.get(r.id, req.user.id);
    return { ...r, my_absence: myAbsence || null };
  });

  res.json({ rehearsals: enriched });
});

// GET /rehearsals/:id - single rehearsal with full absence list
router.get('/:id', (req, res) => {
  const rehearsal = db.prepare('SELECT * FROM rehearsals WHERE id = ?').get(req.params.id);
  if (!rehearsal) return res.status(404).json({ error: 'Rehearsal not found' });

  const absences = db.prepare(`
    SELECT a.id, a.reason, a.created_at, u.id as user_id, u.name, u.voice_part
    FROM absences a
    JOIN users u ON u.id = a.user_id
    WHERE a.rehearsal_id = ?
    ORDER BY u.name ASC
  `).all(req.params.id);

  res.json({ rehearsal, absences });
});

const rehearsalSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Start time must be in HH:MM format'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  location: z.string().min(1, 'Location is required'),
  notes: z.string().optional().nullable(),
});

// POST /rehearsals - admin only
router.post('/', requireAdmin, (req, res) => {
  const parsed = rehearsalSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { date, startTime, endTime, location, notes } = parsed.data;
  const id = randomUUID();

  db.prepare(`
    INSERT INTO rehearsals (id, date, start_time, end_time, location, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, date, startTime, endTime || null, location, notes || null, req.user.id);

  const rehearsal = db.prepare('SELECT * FROM rehearsals WHERE id = ?').get(id);
  res.status(201).json({ rehearsal });
});

// PUT /rehearsals/:id - admin only
router.put('/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT id FROM rehearsals WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Rehearsal not found' });

  const parsed = rehearsalSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const fields = parsed.data;
  const columnMap = { startTime: 'start_time', endTime: 'end_time' };
  const setClauses = [];
  const params = [];

  for (const [key, value] of Object.entries(fields)) {
    const column = columnMap[key] || key;
    setClauses.push(`${column} = ?`);
    params.push(value);
  }
  if (setClauses.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  params.push(req.params.id);

  db.prepare(`UPDATE rehearsals SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
  const rehearsal = db.prepare('SELECT * FROM rehearsals WHERE id = ?').get(req.params.id);
  res.json({ rehearsal });
});

// DELETE /rehearsals/:id - admin only
router.delete('/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM rehearsals WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Rehearsal not found' });
  res.status(204).send();
});

export default router;
