import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import db from '../db/index.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

const absenceSchema = z.object({
  rehearsalId: z.string().min(1),
  reason: z.string().max(500).optional().nullable(),
});

// POST /absences - mark the current user absent for a rehearsal
router.post('/', (req, res) => {
  const parsed = absenceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { rehearsalId, reason } = parsed.data;

  const rehearsal = db.prepare('SELECT id FROM rehearsals WHERE id = ?').get(rehearsalId);
  if (!rehearsal) return res.status(404).json({ error: 'Rehearsal not found' });

  const existing = db.prepare(
    'SELECT id FROM absences WHERE user_id = ? AND rehearsal_id = ?'
  ).get(req.user.id, rehearsalId);

  if (existing) {
    // Update the reason if they're already marked absent
    db.prepare('UPDATE absences SET reason = ? WHERE id = ?').run(reason || null, existing.id);
    return res.json({ absence: { id: existing.id, reason } });
  }

  const id = randomUUID();
  db.prepare(
    'INSERT INTO absences (id, user_id, rehearsal_id, reason) VALUES (?, ?, ?, ?)'
  ).run(id, req.user.id, rehearsalId, reason || null);

  res.status(201).json({ absence: { id, reason } });
});

// DELETE /absences/:rehearsalId - unmark absence (user is attending after all) for the current user
router.delete('/:rehearsalId', (req, res) => {
  const result = db.prepare(
    'DELETE FROM absences WHERE user_id = ? AND rehearsal_id = ?'
  ).run(req.user.id, req.params.rehearsalId);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'No absence found to remove' });
  }
  res.status(204).send();
});

// GET /absences/mine - all of the current user's upcoming absences
router.get('/mine', (req, res) => {
  const absences = db.prepare(`
    SELECT a.id, a.reason, r.id as rehearsal_id, r.date, r.start_time, r.location
    FROM absences a
    JOIN rehearsals r ON r.id = a.rehearsal_id
    WHERE a.user_id = ? AND r.date >= date('now')
    ORDER BY r.date ASC
  `).all(req.user.id);
  res.json({ absences });
});

export default router;
