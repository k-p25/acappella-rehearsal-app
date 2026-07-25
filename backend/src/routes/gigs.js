import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import db from '../db/index.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// GET /gigs - list all gigs with the current user's RSVP status attached
router.get('/', (req, res) => {
  const gigs = db.prepare('SELECT * FROM gigs ORDER BY date ASC, time ASC').all();

  const rsvpStmt = db.prepare(
    'SELECT status FROM gig_rsvps WHERE gig_id = ? AND user_id = ?'
  );
  const enriched = gigs.map((g) => {
    const myRsvp = rsvpStmt.get(g.id, req.user.id);
    return { ...g, my_rsvp_status: myRsvp?.status || null };
  });

  res.json({ gigs: enriched });
});

// GET /gigs/:id - single gig detail with all members' RSVP statuses
router.get('/:id', (req, res) => {
  const gig = db.prepare('SELECT * FROM gigs WHERE id = ?').get(req.params.id);
  if (!gig) return res.status(404).json({ error: 'Gig not found' });

  const rsvps = db.prepare(`
    SELECT gr.id, gr.status, gr.updated_at, u.id as user_id, u.name, u.voice_part
    FROM gig_rsvps gr
    JOIN users u ON u.id = gr.user_id
    WHERE gr.gig_id = ?
    ORDER BY u.name ASC
  `).all(req.params.id);

  res.json({ gig, rsvps });
});

const gigSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'),
  venue: z.string().min(1, 'Venue is required'),
});

// POST /gigs - admin only, creates the gig plus a pending RSVP for every existing member
router.post('/', requireAdmin, (req, res) => {
  const parsed = gigSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { title, date, time, venue } = parsed.data;
  const id = randomUUID();

  const insertGig = db.prepare(`
    INSERT INTO gigs (id, title, date, time, venue, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertRsvp = db.prepare(`
    INSERT INTO gig_rsvps (id, user_id, gig_id, status) VALUES (?, ?, ?, 'pending')
  `);

  const createGigWithRsvps = db.transaction(() => {
    insertGig.run(id, title, date, time, venue, req.user.id);
    const members = db.prepare('SELECT id FROM users').all();
    for (const member of members) {
      insertRsvp.run(randomUUID(), member.id, id);
    }
  });
  createGigWithRsvps();

  const gig = db.prepare('SELECT * FROM gigs WHERE id = ?').get(id);
  res.status(201).json({ gig });
});

const rsvpSchema = z.object({
  status: z.enum(['accepted', 'declined']),
});

// PUT /gigs/:id/rsvp - current user updates their own RSVP status
router.put('/:id/rsvp', (req, res) => {
  const gig = db.prepare('SELECT id FROM gigs WHERE id = ?').get(req.params.id);
  if (!gig) return res.status(404).json({ error: 'Gig not found' });

  const parsed = rsvpSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { status } = parsed.data;

  const existing = db.prepare(
    'SELECT id FROM gig_rsvps WHERE gig_id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);

  if (existing) {
    db.prepare(
      `UPDATE gig_rsvps SET status = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(status, existing.id);
    return res.json({ rsvp: { id: existing.id, status } });
  }

  const id = randomUUID();
  db.prepare(
    'INSERT INTO gig_rsvps (id, user_id, gig_id, status) VALUES (?, ?, ?, ?)'
  ).run(id, req.user.id, req.params.id, status);

  res.json({ rsvp: { id, status } });
});

// DELETE /gigs/:id - admin only
router.delete('/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM gigs WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Gig not found' });
  res.status(204).send();
});

export default router;
