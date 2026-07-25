import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDbPath = path.join(__dirname, 'test-gigs.db');
process.env.DB_PATH = testDbPath;

const { createApp } = await import('../app.js');
const db = (await import('../db/index.js')).default;
const request = (await import('supertest')).default;

const app = createApp();

beforeEach(() => {
  db.exec('DELETE FROM gig_rsvps; DELETE FROM gigs; DELETE FROM absences; DELETE FROM rehearsals; DELETE FROM users;');
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

async function setup() {
  const adminRes = await request(app)
    .post('/api/auth/register')
    .send({ email: 'admin@group.com', password: 'password123', name: 'Admin' });
  const adminToken = adminRes.body.token;

  const memberRes = await request(app)
    .post('/api/auth/register')
    .send({ email: 'member@group.com', password: 'password123', name: 'Member' });
  const memberToken = memberRes.body.token;

  return { adminToken, memberToken };
}

test('admin can create a gig', async () => {
  const token = await registerAdmin();

  const res = await request(app)
    .post('/api/gigs')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Fall Showcase', date: '2026-09-12', time: '19:00', venue: 'Main Hall' });

  assert.equal(res.status, 201);
  assert.equal(res.body.gig.title, 'Fall Showcase');
});

test('member cannot create a gig', async () => {
  const token = await registerMember();

  const res = await request(app)
    .post('/api/gigs')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Fall Showcase', date: '2026-09-12', time: '19:00', venue: 'Main Hall' });

  assert.equal(res.status, 403);
});

test('gig creation rejects invalid date format', async () => {
  const token = await registerAdmin();

  const res = await request(app)
    .post('/api/gigs')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Fall Showcase', date: '09/12/2026', time: '19:00', venue: 'Main Hall' });

  assert.equal(res.status, 400);
});

test('creating a gig auto-creates pending RSVPs for every existing member', async () => {
  const { adminToken, memberToken } = await setup();

  const created = await request(app)
    .post('/api/gigs')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: 'Fall Showcase', date: '2026-09-12', time: '19:00', venue: 'Main Hall' });
  const gigId = created.body.gig.id;

  const detail = await request(app)
    .get(`/api/gigs/${gigId}`)
    .set('Authorization', `Bearer ${adminToken}`);

  assert.equal(detail.body.rsvps.length, 2);
  assert.ok(detail.body.rsvps.every((r) => r.status === 'pending'));

  const list = await request(app)
    .get('/api/gigs')
    .set('Authorization', `Bearer ${memberToken}`);
  assert.equal(list.body.gigs[0].my_rsvp_status, 'pending');
});

test('GET /api/gigs lists gigs in date order with my_rsvp_status attached', async () => {
  const token = await registerAdmin();

  await request(app).post('/api/gigs').set('Authorization', `Bearer ${token}`)
    .send({ title: 'Later Gig', date: '2026-09-20', time: '19:00', venue: 'Venue A' });
  await request(app).post('/api/gigs').set('Authorization', `Bearer ${token}`)
    .send({ title: 'Earlier Gig', date: '2026-09-05', time: '19:00', venue: 'Venue B' });

  const res = await request(app).get('/api/gigs').set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.gigs.length, 2);
  assert.equal(res.body.gigs[0].date, '2026-09-05'); // earliest first
  assert.equal(res.body.gigs[0].my_rsvp_status, 'pending');
});

test('member can update their own RSVP to accepted', async () => {
  const { adminToken, memberToken } = await setup();

  const created = await request(app)
    .post('/api/gigs')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: 'Fall Showcase', date: '2026-09-12', time: '19:00', venue: 'Main Hall' });
  const gigId = created.body.gig.id;

  const res = await request(app)
    .put(`/api/gigs/${gigId}/rsvp`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'accepted' });

  assert.equal(res.status, 200);
  assert.equal(res.body.rsvp.status, 'accepted');

  const detail = await request(app)
    .get(`/api/gigs/${gigId}`)
    .set('Authorization', `Bearer ${adminToken}`);
  const memberRsvp = detail.body.rsvps.find((r) => r.name === 'Member');
  assert.equal(memberRsvp.status, 'accepted');
});

test('member can update their own RSVP to declined', async () => {
  const { adminToken, memberToken } = await setup();

  const created = await request(app)
    .post('/api/gigs')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: 'Fall Showcase', date: '2026-09-12', time: '19:00', venue: 'Main Hall' });
  const gigId = created.body.gig.id;

  const res = await request(app)
    .put(`/api/gigs/${gigId}/rsvp`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'declined' });

  assert.equal(res.status, 200);
  assert.equal(res.body.rsvp.status, 'declined');
});

test('RSVP rejects a "pending" status update — not settable via this route', async () => {
  const { adminToken, memberToken } = await setup();

  const created = await request(app)
    .post('/api/gigs')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: 'Fall Showcase', date: '2026-09-12', time: '19:00', venue: 'Main Hall' });
  const gigId = created.body.gig.id;

  const res = await request(app)
    .put(`/api/gigs/${gigId}/rsvp`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'pending' });

  assert.equal(res.status, 400);
});

test('RSVP for nonexistent gig returns 404', async () => {
  const { memberToken } = await setup();

  const res = await request(app)
    .put('/api/gigs/does-not-exist/rsvp')
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'accepted' });

  assert.equal(res.status, 404);
});

test('admin can delete a gig', async () => {
  const token = await registerAdmin();
  const created = await request(app).post('/api/gigs').set('Authorization', `Bearer ${token}`)
    .send({ title: 'Fall Showcase', date: '2026-09-12', time: '19:00', venue: 'Main Hall' });

  const res = await request(app)
    .delete(`/api/gigs/${created.body.gig.id}`)
    .set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 204);

  const list = await request(app).get('/api/gigs').set('Authorization', `Bearer ${token}`);
  assert.equal(list.body.gigs.length, 0);
});

test('member cannot delete a gig', async () => {
  const { adminToken, memberToken } = await setup();
  const created = await request(app).post('/api/gigs').set('Authorization', `Bearer ${adminToken}`)
    .send({ title: 'Fall Showcase', date: '2026-09-12', time: '19:00', venue: 'Main Hall' });

  const res = await request(app)
    .delete(`/api/gigs/${created.body.gig.id}`)
    .set('Authorization', `Bearer ${memberToken}`);

  assert.equal(res.status, 403);
});

test('unauthenticated requests are rejected', async () => {
  const res = await request(app).get('/api/gigs');
  assert.equal(res.status, 401);
});
