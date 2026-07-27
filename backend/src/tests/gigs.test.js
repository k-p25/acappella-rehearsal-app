import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Each test file gets its own schema BEFORE anything imports the db module, so
// `node --test` can run the files in parallel against one database.
process.env.PG_SCHEMA = 'test_gigs';
process.env.DATABASE_URL ||= 'postgresql://localhost:5432/acappella_test';

const { createApp } = await import('../app.js');
const { initDb, truncateAll, closeDb } = await import('../db/index.js');
const request = (await import('supertest')).default;

const app = createApp();

before(async () => {
  await initDb();
});

beforeEach(async () => {
  await truncateAll();
});

after(async () => {
  await closeDb();
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

async function setup() {
  const directorToken = await registerDirector();
  const memberToken = await registerMember();
  return { directorToken, memberToken };
}

test('music director can create a gig', async () => {
  const token = await registerDirector();

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
  const token = await registerDirector();

  const res = await request(app)
    .post('/api/gigs')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Fall Showcase', date: '09/12/2026', time: '19:00', venue: 'Main Hall' });

  assert.equal(res.status, 400);
});

test('gig creation accepts an optional end time', async () => {
  const token = await registerDirector();

  const res = await request(app)
    .post('/api/gigs')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Fall Showcase', date: '2026-09-12', time: '19:00', endTime: '21:00', venue: 'Main Hall' });

  assert.equal(res.status, 201);
  assert.equal(res.body.gig.end_time, '21:00');
});

test('creating a gig auto-creates pending RSVPs for every existing member', async () => {
  const { directorToken, memberToken } = await setup();

  const created = await request(app)
    .post('/api/gigs')
    .set('Authorization', `Bearer ${directorToken}`)
    .send({ title: 'Fall Showcase', date: '2026-09-12', time: '19:00', venue: 'Main Hall' });
  const gigId = created.body.gig.id;

  const detail = await request(app)
    .get(`/api/gigs/${gigId}`)
    .set('Authorization', `Bearer ${directorToken}`);

  assert.equal(detail.body.rsvps.length, 2);
  assert.ok(detail.body.rsvps.every((r) => r.status === 'pending'));

  const list = await request(app)
    .get('/api/gigs')
    .set('Authorization', `Bearer ${memberToken}`);
  assert.equal(list.body.gigs[0].my_rsvp_status, 'pending');
});

test('GET /api/gigs lists gigs in date order with my_rsvp_status attached', async () => {
  const token = await registerDirector();

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
  const { directorToken, memberToken } = await setup();

  const created = await request(app)
    .post('/api/gigs')
    .set('Authorization', `Bearer ${directorToken}`)
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
    .set('Authorization', `Bearer ${directorToken}`);
  const memberRsvp = detail.body.rsvps.find((r) => r.name === 'Member');
  assert.equal(memberRsvp.status, 'accepted');
});

test('member can update their own RSVP to declined', async () => {
  const { directorToken, memberToken } = await setup();

  const created = await request(app)
    .post('/api/gigs')
    .set('Authorization', `Bearer ${directorToken}`)
    .send({ title: 'Fall Showcase', date: '2026-09-12', time: '19:00', venue: 'Main Hall' });
  const gigId = created.body.gig.id;

  const res = await request(app)
    .put(`/api/gigs/${gigId}/rsvp`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'declined', declineReason: 'Busy' });

  assert.equal(res.status, 200);
  assert.equal(res.body.rsvp.status, 'declined');
});

test('RSVP rejects a "pending" status update — not settable via this route', async () => {
  const { directorToken, memberToken } = await setup();

  const created = await request(app)
    .post('/api/gigs')
    .set('Authorization', `Bearer ${directorToken}`)
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

test('music director can delete a gig', async () => {
  const token = await registerDirector();
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
  const { directorToken, memberToken } = await setup();
  const created = await request(app).post('/api/gigs').set('Authorization', `Bearer ${directorToken}`)
    .send({ title: 'Fall Showcase', date: '2026-09-12', time: '19:00', venue: 'Main Hall' });

  const res = await request(app)
    .delete(`/api/gigs/${created.body.gig.id}`)
    .set('Authorization', `Bearer ${memberToken}`);

  assert.equal(res.status, 403);
});

test('president can create a gig', async () => {
  const presidentRes = await request(app)
    .post('/api/auth/register')
    .send({ email: 'president@group.com', password: 'password123', name: 'President', role: 'president' });
  const token = presidentRes.body.token;

  const res = await request(app)
    .post('/api/gigs')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Concert', date: '2026-09-12', time: '19:00', venue: 'Main Hall' });

  assert.equal(res.status, 201);
  assert.equal(res.body.gig.title, 'Concert');
});

test('business manager can create a gig', async () => {
  const bmRes = await request(app)
    .post('/api/auth/register')
    .send({ email: 'bm@group.com', password: 'password123', name: 'Business Manager', role: 'business_manager' });
  const token = bmRes.body.token;

  const res = await request(app)
    .post('/api/gigs')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Concert', date: '2026-09-12', time: '19:00', venue: 'Main Hall' });

  assert.equal(res.status, 201);
});

test('declining a gig requires a reason', async () => {
  const { directorToken, memberToken } = await setup();

  const gigRes = await request(app)
    .post('/api/gigs')
    .set('Authorization', `Bearer ${directorToken}`)
    .send({ title: 'Concert', date: '2026-09-12', time: '19:00', venue: 'Main Hall' });

  const res = await request(app)
    .put(`/api/gigs/${gigRes.body.gig.id}/rsvp`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'declined' });

  assert.equal(res.status, 400);
  assert(res.body.error.includes('reason'));
});

test('member can decline with a reason', async () => {
  const { directorToken, memberToken } = await setup();

  const gigRes = await request(app)
    .post('/api/gigs')
    .set('Authorization', `Bearer ${directorToken}`)
    .send({ title: 'Concert', date: '2026-09-12', time: '19:00', venue: 'Main Hall' });

  const res = await request(app)
    .put(`/api/gigs/${gigRes.body.gig.id}/rsvp`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'declined', declineReason: 'Out of town' });

  assert.equal(res.status, 200);
  assert.equal(res.body.rsvp.declineReason, 'Out of town');
});

test('decline reason is visible to music director', async () => {
  const { directorToken, memberToken } = await setup();

  const gigRes = await request(app)
    .post('/api/gigs')
    .set('Authorization', `Bearer ${directorToken}`)
    .send({ title: 'Concert', date: '2026-09-12', time: '19:00', venue: 'Main Hall' });

  await request(app)
    .put(`/api/gigs/${gigRes.body.gig.id}/rsvp`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'declined', declineReason: 'Sick' });

  const res = await request(app)
    .get(`/api/gigs/${gigRes.body.gig.id}`)
    .set('Authorization', `Bearer ${directorToken}`);

  const memberRsvp = res.body.rsvps.find((r) => r.name === 'Member');
  assert.equal(memberRsvp.decline_reason, 'Sick');
});

test('decline reason is visible to president', async () => {
  const { directorToken, memberToken } = await setup();
  const presidentRes = await request(app)
    .post('/api/auth/register')
    .send({ email: 'president@group.com', password: 'password123', name: 'President', role: 'president' });
  const presidentToken = presidentRes.body.token;
  const gigRes = await request(app)
    .post('/api/gigs')
    .set('Authorization', `Bearer ${directorToken}`)
    .send({ title: 'Concert', date: '2026-09-12', time: '19:00', venue: 'Main Hall' });

  await request(app)
    .put(`/api/gigs/${gigRes.body.gig.id}/rsvp`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'declined', declineReason: 'Conflict' });

  const res = await request(app)
    .get(`/api/gigs/${gigRes.body.gig.id}`)
    .set('Authorization', `Bearer ${presidentToken}`);

  const memberRsvps = res.body.rsvps.filter((r) => r.name === 'Member');
  const memberRsvp = memberRsvps.length > 0 ? memberRsvps[0] : null;
  assert(memberRsvp, 'Member RSVP should exist');
  assert.equal(memberRsvp.decline_reason, 'Conflict');
});

test('decline reason is hidden from other members', async () => {
  const member1Res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'member1@group.com', password: 'password123', name: 'Member 1', role: 'member' });
  const member1Token = member1Res.body.token;

  const member2Res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'member2@group.com', password: 'password123', name: 'Member 2', role: 'member' });
  const member2Token = member2Res.body.token;

  const directorToken = await registerDirector();
  const gigRes = await request(app)
    .post('/api/gigs')
    .set('Authorization', `Bearer ${directorToken}`)
    .send({ title: 'Concert', date: '2026-09-12', time: '19:00', venue: 'Main Hall' });

  await request(app)
    .put(`/api/gigs/${gigRes.body.gig.id}/rsvp`)
    .set('Authorization', `Bearer ${member1Token}`)
    .send({ status: 'declined', declineReason: 'Secret reason' });

  const res = await request(app)
    .get(`/api/gigs/${gigRes.body.gig.id}`)
    .set('Authorization', `Bearer ${member2Token}`);

  const member1Rsvp = res.body.rsvps.find((r) => r.name === 'Member 1');
  assert.equal(member1Rsvp.decline_reason, null);
});

test('president can edit a gig', async () => {
  const presidentRes = await request(app)
    .post('/api/auth/register')
    .send({ email: 'president@group.com', password: 'password123', name: 'President', role: 'president' });
  const presidentToken = presidentRes.body.token;

  const gigRes = await request(app)
    .post('/api/gigs')
    .set('Authorization', `Bearer ${presidentToken}`)
    .send({ title: 'Concert', date: '2026-09-12', time: '19:00', venue: 'Main Hall' });

  const res = await request(app)
    .put(`/api/gigs/${gigRes.body.gig.id}`)
    .set('Authorization', `Bearer ${presidentToken}`)
    .send({ title: 'Updated Concert' });

  assert.equal(res.status, 200);
  assert.equal(res.body.gig.title, 'Updated Concert');
});

test('member cannot edit a gig', async () => {
  const { memberToken, directorToken } = await setup();

  const gigRes = await request(app)
    .post('/api/gigs')
    .set('Authorization', `Bearer ${directorToken}`)
    .send({ title: 'Concert', date: '2026-09-12', time: '19:00', venue: 'Main Hall' });

  const res = await request(app)
    .put(`/api/gigs/${gigRes.body.gig.id}`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ title: 'Hacked' });

  assert.equal(res.status, 403);
});

test('unauthenticated requests are rejected', async () => {
  const res = await request(app).get('/api/gigs');
  assert.equal(res.status, 401);
});
