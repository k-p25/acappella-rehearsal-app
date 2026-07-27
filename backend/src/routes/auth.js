import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { query } from '../db/index.js';
import { signToken, authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
  skip: () => process.env.NODE_ENV === 'test',
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1),
  voicePart: z.string().optional(),
  role: z.enum(ROLES, { message: 'A valid organization role is required' }),
});

const UNIQUE_VIOLATION = '23505';

router.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const { email, password, name, voicePart, role } = parsed.data;

    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows[0]) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const id = randomUUID();
    const passwordHash = bcrypt.hashSync(password, 10);

    try {
      await query(
        `INSERT INTO users (id, email, password_hash, name, voice_part, role) VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, email, passwordHash, name, voicePart || null, role]
      );
    } catch (err) {
      // Two concurrent registrations for the same email race past the check above.
      if (err.code === UNIQUE_VIOLATION) {
        return res.status(409).json({ error: 'An account with this email already exists' });
      }
      throw err;
    }

    const user = { id, email, name, role };
    const token = signToken(user);
    res.status(201).json({ token, user });
  })
);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const { email, password } = parsed.data;

    const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
    const row = rows[0];
    if (!row || !bcrypt.compareSync(password, row.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = { id: row.id, email: row.email, name: row.name, role: row.role };
    const token = signToken(user);
    res.json({ token, user });
  })
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      'SELECT id, email, name, voice_part, role FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json({ user: rows[0] });
  })
);

export default router;
