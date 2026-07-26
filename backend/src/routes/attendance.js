import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import db from '../db/index.js';
import { authenticate, requireMusicDirector } from '../middleware/auth.js';
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
router.put('/:rehearsalId', (req, res) => {
  const rehearsal = db.prepare('SELECT id, start_time, end_time FROM rehearsals WHERE id = ?').get(req.params.rehearsalId);
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

  const existing = db
    .prepare('SELECT id FROM attendance_records WHERE rehearsal_id = ? AND user_id = ?')
    .get(req.params.rehearsalId, req.user.id);

  if (existing) {
    db.prepare(
      `UPDATE attendance_records
       SET status = ?, absent_start_time = ?, absent_end_time = ?, reason = ?,
           approval_status = ?, reviewed_by = NULL, reviewed_at = NULL, updated_at = datetime('now')
       WHERE id = ?`
    ).run(status, startTime, endTime, reason || null, approvalStatus, existing.id);
    const record = db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(existing.id);
    return res.json({ attendance: record });
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO attendance_records
       (id, rehearsal_id, user_id, status, absent_start_time, absent_end_time, reason, approval_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, req.params.rehearsalId, req.user.id, status, startTime, endTime, reason || null, approvalStatus);

  const record = db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(id);
  res.status(201).json({ attendance: record });
});

// GET /attendance/pending - music director only, all pending absences across rehearsals
router.get('/pending', requireMusicDirector, (req, res) => {
  const pending = db.prepare(`
    SELECT a.id, a.rehearsal_id, a.user_id, a.status, a.absent_start_time, a.absent_end_time,
           a.reason, a.approval_status, a.created_at,
           r.date, r.start_time, r.end_time, r.location,
           u.name, u.voice_part
    FROM attendance_records a
    JOIN rehearsals r ON r.id = a.rehearsal_id
    JOIN users u ON u.id = a.user_id
    WHERE a.approval_status = 'pending' AND (a.status = 'absent_full' OR a.status = 'absent_partial')
    ORDER BY r.date ASC, r.start_time ASC
  `).all();
  res.json({ attendance: pending });
});

// GET /attendance/:rehearsalId - music director only, full roster for a rehearsal
router.get('/:rehearsalId', requireMusicDirector, (req, res) => {
  const attendance = db.prepare(`
    SELECT a.*, u.name, u.voice_part
    FROM attendance_records a
    JOIN users u ON u.id = a.user_id
    WHERE a.rehearsal_id = ?
    ORDER BY u.name ASC
  `).all(req.params.rehearsalId);
  res.json({ attendance });
});

const reviewSchema = z.object({
  approvalStatus: z.enum(['approved', 'denied']),
});

// PUT /attendance/:id/review - music director only, approve/deny a pending absence request
router.put('/:id/review', requireMusicDirector, (req, res) => {
  const record = db.prepare('SELECT id FROM attendance_records WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Attendance record not found' });

  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  db.prepare(
    `UPDATE attendance_records
     SET approval_status = ?, reviewed_by = ?, reviewed_at = datetime('now'), acknowledged_at = NULL, updated_at = datetime('now')
     WHERE id = ?`
  ).run(parsed.data.approvalStatus, req.user.id, req.params.id);

  const updated = db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(req.params.id);
  res.json({ attendance: updated });
});

// GET /attendance/mine/upcoming - all of the current user's upcoming attendance records
router.get('/mine/upcoming', (req, res) => {
  const attendance = db.prepare(`
    SELECT a.*, r.date, r.start_time, r.end_time, r.location
    FROM attendance_records a
    JOIN rehearsals r ON r.id = a.rehearsal_id
    WHERE a.user_id = ? AND r.date >= date('now')
    ORDER BY r.date ASC
  `).all(req.user.id);
  res.json({ attendance });
});

// GET /attendance/mine/notifications - current user's unacknowledged absence decisions
router.get('/mine/notifications', (req, res) => {
  const notifications = db.prepare(`
    SELECT a.id, a.rehearsal_id, a.approval_status, a.reviewed_at,
           r.date, r.start_time, r.end_time, r.location
    FROM attendance_records a
    JOIN rehearsals r ON r.id = a.rehearsal_id
    WHERE a.user_id = ? AND a.approval_status IN ('approved', 'denied')
           AND a.reviewed_at IS NOT NULL AND a.acknowledged_at IS NULL
    ORDER BY a.reviewed_at DESC
  `).all(req.user.id);
  res.json({ notifications });
});

// PUT /attendance/:id/acknowledge - mark a notification as acknowledged
router.put('/:id/acknowledge', (req, res) => {
  const record = db.prepare('SELECT user_id FROM attendance_records WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Attendance record not found' });
  if (record.user_id !== req.user.id) return res.status(403).json({ error: 'Unauthorized' });

  db.prepare('UPDATE attendance_records SET acknowledged_at = datetime(\'now\') WHERE id = ?').run(
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(req.params.id);
  res.json({ attendance: updated });
});

export default router;
