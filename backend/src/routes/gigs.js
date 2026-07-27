import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { query, withTransaction, NOW_TEXT } from '../db/index.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

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
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows: gigs } = await query('SELECT * FROM gigs ORDER BY date ASC, time ASC');

    // Pull every RSVP for this user in one round trip rather than one query per gig.
    const ids = gigs.map((g) => g.id);
    const mine = ids.length
      ? (
          await query(
            'SELECT gig_id, status FROM gig_rsvps WHERE user_id = $1 AND gig_id = ANY($2)',
            [req.user.id, ids]
          )
        ).rows
      : [];
    const statusByGig = new Map(mine.map((r) => [r.gig_id, r.status]));

    const enriched = gigs.map((g) => ({ ...g, my_rsvp_status: statusByGig.get(g.id) || null }));

    res.json({ gigs: enriched });
  })
);

// GET /gigs/:id - single gig detail with all members' RSVP statuses
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rows: gigRows } = await query('SELECT * FROM gigs WHERE id = $1', [req.params.id]);
    const gig = gigRows[0];
    if (!gig) return res.status(404).json({ error: 'Gig not found' });

    const { rows: rsvps } = await query(
      `
    SELECT gr.id, gr.status, gr.decline_reason, gr.updated_at, u.id as user_id, u.name, u.voice_part
    FROM gig_rsvps gr
    JOIN users u ON u.id = gr.user_id
    WHERE gr.gig_id = $1
    ORDER BY u.name ASC
  `,
      [req.params.id]
    );

    const canViewReasons = canManageGigs(req.user.role);
    const filtered = rsvps.map((r) => ({
      ...r,
      decline_reason: canViewReasons ? r.decline_reason : null,
    }));

    res.json({ gig, rsvps: filtered });
  })
);

const gigSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Start time must be in HH:MM format'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  venue: z.string().min(1, 'Venue is required'),
});

// POST /gigs - music director, president, business manager - creates the gig plus a pending RSVP for every existing member
router.post(
  '/',
  requireGigManager,
  asyncHandler(async (req, res) => {
    const parsed = gigSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const { title, date, time, endTime, venue } = parsed.data;
    const id = randomUUID();

    const gig = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO gigs (id, title, date, time, end_time, venue, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [id, title, date, time, endTime || null, venue, req.user.id]
      );

      const { rows: members } = await client.query('SELECT id FROM users');
      if (members.length) {
        const params = [];
        const tuples = members.map((member) => {
          params.push(randomUUID(), member.id, id);
          const base = params.length - 3;
          return `($${base + 1}, $${base + 2}, $${base + 3}, 'pending')`;
        });
        await client.query(
          `INSERT INTO gig_rsvps (id, user_id, gig_id, status) VALUES ${tuples.join(', ')}`,
          params
        );
      }

      return rows[0];
    });

    res.status(201).json({ gig });
  })
);

const rsvpSchema = z
  .object({
    status: z.enum(['accepted', 'declined']),
    declineReason: z.string().max(500).optional().nullable(),
  })
  .refine((data) => data.status !== 'declined' || data.declineReason, {
    message: 'A reason is required when declining a gig',
    path: ['declineReason'],
  });

// PUT /gigs/:id/rsvp - current user updates their own RSVP status
router.put(
  '/:id/rsvp',
  asyncHandler(async (req, res) => {
    const { rows: gigRows } = await query('SELECT id FROM gigs WHERE id = $1', [req.params.id]);
    if (!gigRows[0]) return res.status(404).json({ error: 'Gig not found' });

    const parsed = rsvpSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const { status, declineReason } = parsed.data;
    const reason = status === 'declined' ? declineReason : null;

    const { rows: existingRows } = await query(
      'SELECT id FROM gig_rsvps WHERE gig_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    const existing = existingRows[0];

    if (existing) {
      await query(
        `UPDATE gig_rsvps SET status = $1, decline_reason = $2, updated_at = ${NOW_TEXT} WHERE id = $3`,
        [status, reason, existing.id]
      );
      return res.json({ rsvp: { id: existing.id, status, declineReason: reason } });
    }

    const id = randomUUID();
    await query(
      'INSERT INTO gig_rsvps (id, user_id, gig_id, status, decline_reason) VALUES ($1, $2, $3, $4, $5)',
      [id, req.user.id, req.params.id, status, reason]
    );

    res.json({ rsvp: { id, status, declineReason: reason } });
  })
);

// PUT /gigs/:id - music director, president, business manager - edit a gig
router.put(
  '/:id',
  requireGigManager,
  asyncHandler(async (req, res) => {
    const { rows: existingRows } = await query('SELECT id FROM gigs WHERE id = $1', [req.params.id]);
    if (!existingRows[0]) return res.status(404).json({ error: 'Gig not found' });

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
      params.push(value);
      setClauses.push(`${column} = $${params.length}`);
    }
    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE gigs SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    res.json({ gig: rows[0] });
  })
);

// DELETE /gigs/:id - music director, president, business manager
router.delete(
  '/:id',
  requireGigManager,
  asyncHandler(async (req, res) => {
    const result = await query('DELETE FROM gigs WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Gig not found' });
    res.status(204).send();
  })
);

export default router;
