import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDbPath = path.join(__dirname, 'test-rehearsals.db');
process.env.DB_PATH = testDbPath;

const { createApp } = await import('../app.js');
const db = (await import('../db/index.js')).default;
const request = (await import('supertest')).default;

const app = createApp();

beforeEach(() => {
  db.exec('DELETE FROM absences; DELETE FROM rehearsals; DELETE FROM users;');
});

after(() => {
  db.close();
  for (const ext of ['', '-wal', '-shm']) {
    if (fs.existsSync(testDbPath + ext)) fs.unlinkSync(testDbPath + ext);
  }
});

async function registerAdmin() {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'admin@group.com', password: 'password123', name: 'Admin' });
  return res.body.token;
}

async function registerMember(email = 'member@group.com') {
  await registerAdmin(); // ensures admin exists first so this user becomes a member
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'password123', name: 'Member' });
  return res.body.token;
}

test('admin can create a rehearsal', async () => {
  const token = await registerAdmin();

  const res = await request(app)
    .post('/api/rehearsals')
    .set('Authorization', `Bearer ${token}`)
    .send({ date: '2026-08-01', startTime: '18:30', location: 'Choir Room 2' });

  assert.equal(res.status, 201);
  assert.equal(res.body.rehearsal.location, 'Choir Room 2');
});

test('member cannot create a rehearsal', async () => {
  const token = await registerMember();

  const res = await request(app)
    .post('/api/rehearsals')
    .set('Authorization', `Bearer ${token}`)
    .send({ date: '2026-08-01', startTime: '18:30', location: 'Choir Room 2' });

  assert.equal(res.status, 403);
});

test('rehearsal creation rejects invalid date format', async () => {
  const token = await registerAdmin();

  const res = await request(app)
    .post('/api/rehearsals')
    .set('Authorization', `Bearer ${token}`)
    .send({ date: '08/01/2026', startTime: '18:30', location: 'Choir Room 2' });

  assert.equal(res.status, 400);
});

test('GET /api/rehearsals lists rehearsals in date order', async () => {
  const token = await registerAdmin();

  await request(app).post('/api/rehearsals').set('Authorization', `Bearer ${token}`)
    .send({ date: '2026-08-15', startTime: '18:00', location: 'Room A' });
  await request(app).post('/api/rehearsals').set('Authorization', `Bearer ${token}`)
    .send({ date: '2026-08-01', startTime: '18:00', location: 'Room B' });

  const res = await request(app).get('/api/rehearsals').set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.rehearsals.length, 2);
  assert.equal(res.body.rehearsals[0].date, '2026-08-01'); // earliest first
});

test('admin can delete a rehearsal', async () => {
  const token = await registerAdmin();
  const created = await request(app).post('/api/rehearsals').set('Authorization', `Bearer ${token}`)
    .send({ date: '2026-08-01', startTime: '18:00', location: 'Room A' });

  const res = await request(app)
    .delete(`/api/rehearsals/${created.body.rehearsal.id}`)
    .set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 204);

  const list = await request(app).get('/api/rehearsals').set('Authorization', `Bearer ${token}`);
  assert.equal(list.body.rehearsals.length, 0);
});

test('unauthenticated requests are rejected', async () => {
  const res = await request(app).get('/api/rehearsals');
  assert.equal(res.status, 401);
});
