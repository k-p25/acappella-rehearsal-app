import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { query, NOW_TEXT, TODAY_TEXT } from '../db/index.js';
import { authenticate, requireMusicDirector } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { formatTime12h } from '../utils/time.js';

const router = Router();
router.use(authenticate);

const timeRegex = /^\d{2}:\d{2}$/;

const attendanceSchema = z
  .object({
    status: z.enum(['present', 'absent_full', 'absent_partial']),
    reason: z.string().max(500).optional().nullable(),
    absentStartTime: z.string().regex(timeRegex).optional().nullable(),
    absentEndTime: z.string().regex(timeRegex).optional().nullable(),
  })
  .refine((data) => data.status !== 'absent_partial' || (data.absentStartTime && data.absentEndTime), {
    message: 'Partial absence requires both a start and end time',
    path: ['absentStartTime'],
  });

// PUT /attendance/:rehearsalId - self-service, submit/update the current user's attendance for a rehearsal
router.put(
  '/:rehearsalId',
  asyncHandler(async (req, res) => {
    const { rows: rehearsalRows } = await query(
      'SELECT id, start_time, end_time FROM rehearsals WHERE id = $1',
      [req.params.rehearsalId]
    );
    const rehearsal = rehearsalRows[0];
    if (!rehearsal) return res.status(404).json({ error: 'Rehearsal not found' });

    const parsed = attendanceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const { status, reason, absentStartTime, absentEndTime } = parsed.data;

    const isDirector = req.user.role === 'music_director';
    const isAbsence = status === 'absent_full' || status === 'absent_partial';
    if (isAbsence && !isDirector && !reason) {
      return res.status(400).json({ error: 'A reason is required when reporting an absence' });
    }

    if (status === 'absent_partial') {
      if (absentStartTime >= absentEndTime) {
        return res.status(400).json({ error: 'Absence start time must be before end time' });
      }
      if (absentStartTime < rehearsal.start_time) {
        return res.status(400).json({
          error: `Absence cannot start before the rehearsal begins (${formatTime12h(rehearsal.start_time)})`,
        });
      }
      if (rehearsal.end_time && absentEndTime > rehearsal.end_time) {
        return res.status(400).json({
          error: `Absence cannot end after the rehearsal ends (${formatTime12h(rehearsal.end_time)})`,
        });
      }
    }

    const approvalStatus = isAbsence ? 'pending' : 'approved';
    const startTime = status === 'absent_partial' ? absentStartTime : null;
    const endTime = status === 'absent_partial' ? absentEndTime : null;

    const { rows: existingRows } = await query(
      'SELECT id FROM attendance_records WHERE rehearsal_id = $1 AND user_id = $2',
      [req.params.rehearsalId, req.user.id]
    );
    const existing = existingRows[0];

    if (existing) {
      const { rows } = await query(
        `UPDATE attendance_records
       SET status = $1, absent_start_time = $2, absent_end_time = $3, reason = $4,
           approval_status = $5, reviewed_by = NULL, reviewed_at = NULL, updated_at = ${NOW_TEXT}
       WHERE id = $6
       RETURNING *`,
        [status, startTime, endTime, reason || null, approvalStatus, existing.id]
      );
      return res.json({ attendance: rows[0] });
    }

    const { rows } = await query(
      `INSERT INTO attendance_records
       (id, rehearsal_id, user_id, status, absent_start_time, absent_end_time, reason, approval_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
      [
        randomUUID(),
        req.params.rehearsalId,
        req.user.id,
        status,
        startTime,
        endTime,
        reason || null,
        approvalStatus,
      ]
    );

    res.status(201).json({ attendance: rows[0] });
  })
);

// GET /attendance/pending - music director only, all pending absences across rehearsals
router.get(
  '/pending',
  requireMusicDirector,
  asyncHandler(async (req, res) => {
    const { rows: pending } = await query(`
    SELECT a.id, a.rehearsal_id, a.user_id, a.status, a.absent_start_time, a.absent_end_time,
           a.reason, a.approval_status, a.created_at,
           r.date, r.start_time, r.end_time, r.location,
           u.name, u.voice_part
    FROM attendance_records a
    JOIN rehearsals r ON r.id = a.rehearsal_id
    JOIN users u ON u.id = a.user_id
    WHERE a.approval_status = 'pending' AND (a.status = 'absent_full' OR a.status = 'absent_partial')
    ORDER BY r.date ASC, r.start_time ASC
  `);
    res.json({ attendance: pending });
  })
);

// GET /attendance/:rehearsalId - music director only, full roster for a rehearsal
router.get(
  '/:rehearsalId',
  requireMusicDirector,
  asyncHandler(async (req, res) => {
    const { rows: attendance } = await query(
      `
    SELECT a.*, u.name, u.voice_part
    FROM attendance_records a
    JOIN users u ON u.id = a.user_id
    WHERE a.rehearsal_id = $1
    ORDER BY u.name ASC
  `,
      [req.params.rehearsalId]
    );
    res.json({ attendance });
  })
);

const reviewSchema = z.object({
  approvalStatus: z.enum(['approved', 'denied']),
});

// PUT /attendance/:id/review - music director only, approve/deny a pending absence request
router.put(
  '/:id/review',
  requireMusicDirector,
  asyncHandler(async (req, res) => {
    const { rows: recordRows } = await query('SELECT id FROM attendance_records WHERE id = $1', [
      req.params.id,
    ]);
    if (!recordRows[0]) return res.status(404).json({ error: 'Attendance record not found' });

    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    const { rows } = await query(
      `UPDATE attendance_records
     SET approval_status = $1, reviewed_by = $2, reviewed_at = ${NOW_TEXT}, acknowledged_at = NULL, updated_at = ${NOW_TEXT}
     WHERE id = $3
     RETURNING *`,
      [parsed.data.approvalStatus, req.user.id, req.params.id]
    );

    res.json({ attendance: rows[0] });
  })
);

// GET /attendance/mine/upcoming - all of the current user's upcoming attendance records
router.get(
  '/mine/upcoming',
  asyncHandler(async (req, res) => {
    const { rows: attendance } = await query(
      `
    SELECT a.*, r.date, r.start_time, r.end_time, r.location
    FROM attendance_records a
    JOIN rehearsals r ON r.id = a.rehearsal_id
    WHERE a.user_id = $1 AND r.date >= ${TODAY_TEXT}
    ORDER BY r.date ASC
  `,
      [req.user.id]
    );
    res.json({ attendance });
  })
);

// GET /attendance/mine/notifications - current user's unacknowledged absence decisions
router.get(
  '/mine/notifications',
  asyncHandler(async (req, res) => {
    const { rows: notifications } = await query(
      `
    SELECT a.id, a.rehearsal_id, a.approval_status, a.reviewed_at,
           r.date, r.start_time, r.end_time, r.location
    FROM attendance_records a
    JOIN rehearsals r ON r.id = a.rehearsal_id
    WHERE a.user_id = $1 AND a.approval_status IN ('approved', 'denied')
           AND a.reviewed_at IS NOT NULL AND a.acknowledged_at IS NULL
    ORDER BY a.reviewed_at DESC
  `,
      [req.user.id]
    );
    res.json({ notifications });
  })
);

// PUT /attendance/:id/acknowledge - mark a notification as acknowledged
router.put(
  '/:id/acknowledge',
  asyncHandler(async (req, res) => {
    const { rows: recordRows } = await query(
      'SELECT user_id FROM attendance_records WHERE id = $1',
      [req.params.id]
    );
    const record = recordRows[0];
    if (!record) return res.status(404).json({ error: 'Attendance record not found' });
    if (record.user_id !== req.user.id) return res.status(403).json({ error: 'Unauthorized' });

    const { rows } = await query(
      `UPDATE attendance_records SET acknowledged_at = ${NOW_TEXT} WHERE id = $1 RETURNING *`,
      [req.params.id]
    );

    res.json({ attendance: rows[0] });
  })
);

export default router;
