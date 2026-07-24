import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDbPath = path.join(__dirname, 'test-absences.db');
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

async function setup() {
  const adminRes = await request(app)
    .post('/api/auth/register')
    .send({ email: 'admin@group.com', password: 'password123', name: 'Admin' });
  const adminToken = adminRes.body.token;

  const memberRes = await request(app)
    .post('/api/auth/register')
    .send({ email: 'member@group.com', password: 'password123', name: 'Member' });
  const memberToken = memberRes.body.token;

  const rehearsalRes = await request(app)
    .post('/api/rehearsals')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ date: '2026-08-01', startTime: '18:30', location: 'Choir Room 2' });

  return { adminToken, memberToken, rehearsalId: rehearsalRes.body.rehearsal.id };
}

test('member can mark themselves absent with a reason', async () => {
  const { memberToken, rehearsalId } = await setup();

  const res = await request(app)
    .post('/api/absences')
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ rehearsalId, reason: 'Out of town for work' });

  assert.equal(res.status, 201);
  assert.equal(res.body.absence.reason, 'Out of town for work');
});

test('marking absent twice updates the reason instead of duplicating', async () => {
  const { memberToken, rehearsalId } = await setup();

  await request(app).post('/api/absences').set('Authorization', `Bearer ${memberToken}`)
    .send({ rehearsalId, reason: 'First reason' });
  await request(app).post('/api/absences').set('Authorization', `Bearer ${memberToken}`)
    .send({ rehearsalId, reason: 'Updated reason' });

  const detail = await request(app)
    .get(`/api/rehearsals/${rehearsalId}`)
    .set('Authorization', `Bearer ${memberToken}`);

  assert.equal(detail.body.absences.length, 1);
  assert.equal(detail.body.absences[0].reason, 'Updated reason');
});

test('member can unmark their own absence', async () => {
  const { memberToken, rehearsalId } = await setup();

  await request(app).post('/api/absences').set('Authorization', `Bearer ${memberToken}`)
    .send({ rehearsalId, reason: 'Cannot make it' });

  const res = await request(app)
    .delete(`/api/absences/${rehearsalId}`)
    .set('Authorization', `Bearer ${memberToken}`);

  assert.equal(res.status, 204);

  const detail = await request(app)
    .get(`/api/rehearsals/${rehearsalId}`)
    .set('Authorization', `Bearer ${memberToken}`);
  assert.equal(detail.body.absences.length, 0);
});

test('rehearsal detail shows all absent members to everyone', async () => {
  const { memberToken, adminToken, rehearsalId } = await setup();

  await request(app).post('/api/absences').set('Authorization', `Bearer ${memberToken}`)
    .send({ rehearsalId, reason: 'Sick' });

  const res = await request(app)
    .get(`/api/rehearsals/${rehearsalId}`)
    .set('Authorization', `Bearer ${adminToken}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.absences.length, 1);
  assert.equal(res.body.absences[0].name, 'Member');
  assert.equal(res.body.absences[0].reason, 'Sick');
});

test('absence for nonexistent rehearsal returns 404', async () => {
  const { memberToken } = await setup();

  const res = await request(app)
    .post('/api/absences')
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ rehearsalId: 'does-not-exist', reason: 'test' });

  assert.equal(res.status, 404);
});

test('GET /api/absences/mine only returns the current user upcoming absences', async () => {
  const { memberToken, rehearsalId } = await setup();

  await request(app).post('/api/absences').set('Authorization', `Bearer ${memberToken}`)
    .send({ rehearsalId, reason: 'Traveling' });

  const res = await request(app)
    .get('/api/absences/mine')
    .set('Authorization', `Bearer ${memberToken}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.absences.length, 1);
  assert.equal(res.body.absences[0].reason, 'Traveling');
});
