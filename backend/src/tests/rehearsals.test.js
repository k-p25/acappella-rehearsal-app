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
  db.exec('DELETE FROM attendance_records; DELETE FROM rehearsals; DELETE FROM users;');
});

after(() => {
  db.close();
  for (const ext of ['', '-wal', '-shm']) {
    if (fs.existsSync(testDbPath + ext)) fs.unlinkSync(testDbPath + ext);
  }
});

async function registerDirector() {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'director@group.com', password: 'password123', name: 'Director', role: 'music_director' });
  return res.body.token;
}

async function registerMember(email = 'member@group.com') {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'password123', name: 'Member', role: 'member' });
  return res.body.token;
}

test('music director can create a rehearsal', async () => {
  const token = await registerDirector();

  const res = await request(app)
    .post('/api/rehearsals')
    .set('Authorization', `Bearer ${token}`)
    .send({ date: '2026-08-01', startTime: '18:30', location: 'Choir Room 2' });

  assert.equal(res.status, 201);
  assert.equal(res.body.rehearsals.length, 1);
  assert.equal(res.body.rehearsals[0].location, 'Choir Room 2');
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
  const token = await registerDirector();

  const res = await request(app)
    .post('/api/rehearsals')
    .set('Authorization', `Bearer ${token}`)
    .send({ date: '08/01/2026', startTime: '18:30', location: 'Choir Room 2' });

  assert.equal(res.status, 400);
});

test('GET /api/rehearsals lists rehearsals in date order', async () => {
  const token = await registerDirector();

  await request(app).post('/api/rehearsals').set('Authorization', `Bearer ${token}`)
    .send({ date: '2026-08-15', startTime: '18:00', location: 'Room A' });
  await request(app).post('/api/rehearsals').set('Authorization', `Bearer ${token}`)
    .send({ date: '2026-08-01', startTime: '18:00', location: 'Room B' });

  const res = await request(app).get('/api/rehearsals').set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.rehearsals.length, 2);
  assert.equal(res.body.rehearsals[0].date, '2026-08-01'); // earliest first
});

test('music director can delete a rehearsal', async () => {
  const token = await registerDirector();
  const created = await request(app).post('/api/rehearsals').set('Authorization', `Bearer ${token}`)
    .send({ date: '2026-08-01', startTime: '18:00', location: 'Room A' });

  const res = await request(app)
    .delete(`/api/rehearsals/${created.body.rehearsals[0].id}`)
    .set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 204);

  const list = await request(app).get('/api/rehearsals').set('Authorization', `Bearer ${token}`);
  assert.equal(list.body.rehearsals.length, 0);
});

test('creating a rehearsal pre-creates a pending attendance record for every member', async () => {
  const directorToken = await registerDirector();
  const memberToken = await registerMember();

  const created = await request(app).post('/api/rehearsals').set('Authorization', `Bearer ${directorToken}`)
    .send({ date: '2026-08-01', startTime: '18:00', location: 'Room A' });
  const rehearsalId = created.body.rehearsals[0].id;

  const detail = await request(app)
    .get(`/api/rehearsals/${rehearsalId}`)
    .set('Authorization', `Bearer ${memberToken}`);

  assert.equal(detail.body.attendance.length, 2);
  assert.ok(detail.body.attendance.every((a) => a.status === 'pending'));
});

test('recurring rehearsal with an occurrence count generates the correct number of instances', async () => {
  const token = await registerDirector();

  // 2026-08-03 is a Monday; requesting Mon/Wed for 4 occurrences should yield 4 rehearsals.
  const res = await request(app)
    .post('/api/rehearsals')
    .set('Authorization', `Bearer ${token}`)
    .send({
      date: '2026-08-03',
      startTime: '18:30',
      location: 'Choir Room 2',
      recurrence: { daysOfWeek: [1, 3], occurrences: 4 },
    });

  assert.equal(res.status, 201);
  assert.equal(res.body.rehearsals.length, 4);
  const recurrenceIds = new Set(res.body.rehearsals.map((r) => r.recurrence_id));
  assert.equal(recurrenceIds.size, 1);
  assert.ok([...recurrenceIds][0]);
});

test('recurring rehearsal with an until date stops generating past that date', async () => {
  const token = await registerDirector();

  // Every Monday from 2026-08-03 until 2026-08-17 (inclusive) -> 3 Mondays.
  const res = await request(app)
    .post('/api/rehearsals')
    .set('Authorization', `Bearer ${token}`)
    .send({
      date: '2026-08-03',
      startTime: '18:30',
      location: 'Choir Room 2',
      recurrence: { daysOfWeek: [1], until: '2026-08-17' },
    });

  assert.equal(res.status, 201);
  assert.equal(res.body.rehearsals.length, 3);
});

test('PUT with ?scope=series updates every rehearsal in the recurring series', async () => {
  const token = await registerDirector();

  const created = await request(app)
    .post('/api/rehearsals')
    .set('Authorization', `Bearer ${token}`)
    .send({
      date: '2026-08-03',
      startTime: '18:30',
      location: 'Choir Room 2',
      recurrence: { daysOfWeek: [1], occurrences: 3 },
    });
  const firstId = created.body.rehearsals[0].id;

  const res = await request(app)
    .put(`/api/rehearsals/${firstId}?scope=series`)
    .set('Authorization', `Bearer ${token}`)
    .send({ location: 'New Room' });

  assert.equal(res.status, 200);
  assert.equal(res.body.rehearsals.length, 3);
  assert.ok(res.body.rehearsals.every((r) => r.location === 'New Room'));
});

test('DELETE with ?scope=series removes every rehearsal in the recurring series', async () => {
  const token = await registerDirector();

  const created = await request(app)
    .post('/api/rehearsals')
    .set('Authorization', `Bearer ${token}`)
    .send({
      date: '2026-08-03',
      startTime: '18:30',
      location: 'Choir Room 2',
      recurrence: { daysOfWeek: [1], occurrences: 3 },
    });
  const firstId = created.body.rehearsals[0].id;

  const res = await request(app)
    .delete(`/api/rehearsals/${firstId}?scope=series`)
    .set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 204);

  const list = await request(app).get('/api/rehearsals').set('Authorization', `Bearer ${token}`);
  assert.equal(list.body.rehearsals.length, 0);
});

test('unauthenticated requests are rejected', async () => {
  const res = await request(app).get('/api/rehearsals');
  assert.equal(res.status, 401);
});
