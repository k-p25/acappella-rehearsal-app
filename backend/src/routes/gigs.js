import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import db from '../db/index.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

const canManageGigs = (role) => ['music_director', 'president', 'business_manager'].includes(role);
const requireGigManager = (req, res, next) => {
  if (!canManageGigs(req.user?.role)) {
    return res.status(403).json({ error: 'You do not have permission to perform this action' });
  }
  next();
};

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
    SELECT gr.id, gr.status, gr.decline_reason, gr.updated_at, u.id as user_id, u.name, u.voice_part
    FROM gig_rsvps gr
    JOIN users u ON u.id = gr.user_id
    WHERE gr.gig_id = ?
    ORDER BY u.name ASC
  `).all(req.params.id);

  const canViewReasons = canManageGigs(req.user.role);
  const filtered = rsvps.map((r) => ({
    ...r,
    decline_reason: canViewReasons ? r.decline_reason : null,
  }));

  res.json({ gig, rsvps: filtered });
});

const gigSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Start time must be in HH:MM format'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  venue: z.string().min(1, 'Venue is required'),
});

// POST /gigs - music director, president, business manager - creates the gig plus a pending RSVP for every existing member
router.post('/', requireGigManager, (req, res) => {
  const parsed = gigSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { title, date, time, endTime, venue } = parsed.data;
  const id = randomUUID();

  const insertGig = db.prepare(`
    INSERT INTO gigs (id, title, date, time, end_time, venue, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertRsvp = db.prepare(`
    INSERT INTO gig_rsvps (id, user_id, gig_id, status) VALUES (?, ?, ?, 'pending')
  `);

  const createGigWithRsvps = db.transaction(() => {
    insertGig.run(id, title, date, time, endTime || null, venue, req.user.id);
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
  declineReason: z.string().max(500).optional().nullable(),
}).refine((data) => data.status !== 'declined' || data.declineReason, {
  message: 'A reason is required when declining a gig',
  path: ['declineReason'],
});

// PUT /gigs/:id/rsvp - current user updates their own RSVP status
router.put('/:id/rsvp', (req, res) => {
  const gig = db.prepare('SELECT id FROM gigs WHERE id = ?').get(req.params.id);
  if (!gig) return res.status(404).json({ error: 'Gig not found' });

  const parsed = rsvpSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { status, declineReason } = parsed.data;

  const existing = db.prepare(
    'SELECT id FROM gig_rsvps WHERE gig_id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);

  if (existing) {
    db.prepare(
      `UPDATE gig_rsvps SET status = ?, decline_reason = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(status, status === 'declined' ? declineReason : null, existing.id);
    return res.json({ rsvp: { id: existing.id, status, declineReason: status === 'declined' ? declineReason : null } });
  }

  const id = randomUUID();
  db.prepare(
    'INSERT INTO gig_rsvps (id, user_id, gig_id, status, decline_reason) VALUES (?, ?, ?, ?, ?)'
  ).run(id, req.user.id, req.params.id, status, status === 'declined' ? declineReason : null);

  res.json({ rsvp: { id, status, declineReason: status === 'declined' ? declineReason : null } });
});

// PUT /gigs/:id - music director, president, business manager - edit a gig
router.put('/:id', requireGigManager, (req, res) => {
  const existing = db.prepare('SELECT id FROM gigs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Gig not found' });

  const updateSchema = gigSchema.partial();
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const fields = parsed.data;

  const columnMap = { time: 'time', endTime: 'end_time' };
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
  db.prepare(`UPDATE gigs SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
  const gig = db.prepare('SELECT * FROM gigs WHERE id = ?').get(req.params.id);
  res.json({ gig });
});

// DELETE /gigs/:id - music director, president, business manager
router.delete('/:id', requireGigManager, (req, res) => {
  const result = db.prepare('DELETE FROM gigs WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Gig not found' });
  res.status(204).send();
});

export default router;
