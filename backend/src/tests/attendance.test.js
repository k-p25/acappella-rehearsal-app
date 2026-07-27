import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Each test file gets its own schema BEFORE anything imports the db module, so
// `node --test` can run the files in parallel against one database.
process.env.PG_SCHEMA = 'test_attendance';
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

async function setup() {
  const directorRes = await request(app)
    .post('/api/auth/register')
    .send({ email: 'director@group.com', password: 'password123', name: 'Director', role: 'music_director' });
  const directorToken = directorRes.body.token;

  const memberRes = await request(app)
    .post('/api/auth/register')
    .send({ email: 'member@group.com', password: 'password123', name: 'Member', role: 'member' });
  const memberToken = memberRes.body.token;

  const rehearsalRes = await request(app)
    .post('/api/rehearsals')
    .set('Authorization', `Bearer ${directorToken}`)
    .send({ date: '2026-08-01', startTime: '18:30', endTime: '21:00', location: 'Choir Room 2' });

  return { directorToken, memberToken, rehearsalId: rehearsalRes.body.rehearsals[0].id };
}

test('member can report full attendance with a reason, entering pending approval', async () => {
  const { memberToken, rehearsalId } = await setup();

  const res = await request(app)
    .put(`/api/attendance/${rehearsalId}`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'absent_full', reason: 'Out of town for work' });

  assert.equal(res.status, 200);
  assert.equal(res.body.attendance.status, 'absent_full');
  assert.equal(res.body.attendance.reason, 'Out of town for work');
  assert.equal(res.body.attendance.approval_status, 'pending');
});

test('member absence without a reason is rejected', async () => {
  const { memberToken, rehearsalId } = await setup();

  const res = await request(app)
    .put(`/api/attendance/${rehearsalId}`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'absent_full' });

  assert.equal(res.status, 400);
});

test('music director absence does not require a reason', async () => {
  const { directorToken, rehearsalId } = await setup();

  const res = await request(app)
    .put(`/api/attendance/${rehearsalId}`)
    .set('Authorization', `Bearer ${directorToken}`)
    .send({ status: 'absent_full' });

  assert.equal(res.status, 200);
  assert.equal(res.body.attendance.status, 'absent_full');
});

test('marking present does not require a reason or approval', async () => {
  const { memberToken, rehearsalId } = await setup();

  const res = await request(app)
    .put(`/api/attendance/${rehearsalId}`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'present' });

  assert.equal(res.status, 200);
  assert.equal(res.body.attendance.status, 'present');
  assert.equal(res.body.attendance.approval_status, 'approved');
});

test('partial absence requires both start and end time', async () => {
  const { memberToken, rehearsalId } = await setup();

  const res = await request(app)
    .put(`/api/attendance/${rehearsalId}`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'absent_partial', reason: 'Doctor appointment', absentStartTime: '19:00' });

  assert.equal(res.status, 400);
});

test('partial absence with valid times is recorded', async () => {
  const { memberToken, rehearsalId } = await setup();

  const res = await request(app)
    .put(`/api/attendance/${rehearsalId}`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'absent_partial', reason: 'Doctor appointment', absentStartTime: '19:00', absentEndTime: '21:00' });

  assert.equal(res.status, 200);
  assert.equal(res.body.attendance.status, 'absent_partial');
  assert.equal(res.body.attendance.absent_start_time, '19:00');
  assert.equal(res.body.attendance.absent_end_time, '21:00');
});

test('submitting attendance twice updates the existing record instead of duplicating', async () => {
  const { memberToken, rehearsalId, directorToken } = await setup();

  await request(app).put(`/api/attendance/${rehearsalId}`).set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'absent_full', reason: 'First reason' });
  await request(app).put(`/api/attendance/${rehearsalId}`).set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'absent_full', reason: 'Updated reason' });

  const roster = await request(app)
    .get(`/api/attendance/${rehearsalId}`)
    .set('Authorization', `Bearer ${directorToken}`);

  assert.equal(roster.body.attendance.length, 2); // member + director, pre-created
  const memberRecord = roster.body.attendance.find((a) => a.name === 'Member');
  assert.equal(memberRecord.reason, 'Updated reason');
});

test('music director can approve a pending absence request', async () => {
  const { memberToken, directorToken, rehearsalId } = await setup();

  const submitted = await request(app).put(`/api/attendance/${rehearsalId}`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'absent_full', reason: 'Sick' });

  const res = await request(app)
    .put(`/api/attendance/${submitted.body.attendance.id}/review`)
    .set('Authorization', `Bearer ${directorToken}`)
    .send({ approvalStatus: 'approved' });

  assert.equal(res.status, 200);
  assert.equal(res.body.attendance.approval_status, 'approved');
  assert.equal(res.body.attendance.reviewed_by, (await getDirectorId(directorToken)));
});

test('music director can deny a pending absence request', async () => {
  const { memberToken, directorToken, rehearsalId } = await setup();

  const submitted = await request(app).put(`/api/attendance/${rehearsalId}`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'absent_full', reason: 'Sick' });

  const res = await request(app)
    .put(`/api/attendance/${submitted.body.attendance.id}/review`)
    .set('Authorization', `Bearer ${directorToken}`)
    .send({ approvalStatus: 'denied' });

  assert.equal(res.status, 200);
  assert.equal(res.body.attendance.approval_status, 'denied');
});

test('a denied absence no longer counts toward the rehearsal absence_count', async () => {
  const { memberToken, directorToken, rehearsalId } = await setup();

  const submitted = await request(app).put(`/api/attendance/${rehearsalId}`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'absent_full', reason: 'Sick' });

  const beforeReview = await request(app).get('/api/rehearsals').set('Authorization', `Bearer ${directorToken}`);
  assert.equal(beforeReview.body.rehearsals[0].absence_count, 1);

  await request(app)
    .put(`/api/attendance/${submitted.body.attendance.id}/review`)
    .set('Authorization', `Bearer ${directorToken}`)
    .send({ approvalStatus: 'denied' });

  const afterReview = await request(app).get('/api/rehearsals').set('Authorization', `Bearer ${directorToken}`);
  assert.equal(afterReview.body.rehearsals[0].absence_count, 0);
});

test('member cannot review attendance requests', async () => {
  const { memberToken, rehearsalId } = await setup();

  const submitted = await request(app).put(`/api/attendance/${rehearsalId}`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'absent_full', reason: 'Sick' });

  const res = await request(app)
    .put(`/api/attendance/${submitted.body.attendance.id}/review`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ approvalStatus: 'approved' });

  assert.equal(res.status, 403);
});

test('member cannot view the full attendance roster', async () => {
  const { memberToken, rehearsalId } = await setup();

  const res = await request(app)
    .get(`/api/attendance/${rehearsalId}`)
    .set('Authorization', `Bearer ${memberToken}`);

  assert.equal(res.status, 403);
});

test('attendance for a nonexistent rehearsal returns 404', async () => {
  const { memberToken } = await setup();

  const res = await request(app)
    .put('/api/attendance/does-not-exist')
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'absent_full', reason: 'test' });

  assert.equal(res.status, 404);
});

test('GET /api/attendance/mine/upcoming only returns the current user attendance records', async () => {
  const { memberToken, rehearsalId } = await setup();

  await request(app).put(`/api/attendance/${rehearsalId}`).set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'absent_full', reason: 'Traveling' });

  const res = await request(app)
    .get('/api/attendance/mine/upcoming')
    .set('Authorization', `Bearer ${memberToken}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.attendance.length, 1);
  assert.equal(res.body.attendance[0].reason, 'Traveling');
});

test('partial absence cannot start before the rehearsal begins', async () => {
  const { memberToken, rehearsalId } = await setup();

  const res = await request(app)
    .put(`/api/attendance/${rehearsalId}`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({
      status: 'absent_partial',
      reason: 'Doctor appointment',
      absentStartTime: '18:00',
      absentEndTime: '19:00',
    });

  assert.equal(res.status, 400);
  assert(res.body.error.includes('cannot start before'));
});

test('partial absence cannot end after the rehearsal ends', async () => {
  const { memberToken, rehearsalId } = await setup();

  const res = await request(app)
    .put(`/api/attendance/${rehearsalId}`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({
      status: 'absent_partial',
      reason: 'Doctor appointment',
      absentStartTime: '20:00',
      absentEndTime: '21:30',
    });

  assert.equal(res.status, 400);
  assert(res.body.error.includes('cannot end after'));
});

test('partial absence at exact rehearsal boundaries is allowed', async () => {
  const { memberToken, rehearsalId } = await setup();

  const res = await request(app)
    .put(`/api/attendance/${rehearsalId}`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({
      status: 'absent_partial',
      reason: 'Doctor appointment',
      absentStartTime: '18:30',
      absentEndTime: '21:00',
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.attendance.status, 'absent_partial');
});

test('absence reason is hidden from non-owner members', async () => {
  const { memberToken, directorToken, rehearsalId } = await setup();

  const member2Res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'member2@group.com', password: 'password123', name: 'Member 2', role: 'member' });
  const member2Token = member2Res.body.token;

  await request(app)
    .put(`/api/attendance/${rehearsalId}`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'absent_full', reason: 'Vacation' });

  const res = await request(app)
    .get(`/api/rehearsals/${rehearsalId}`)
    .set('Authorization', `Bearer ${member2Token}`);

  const memberRecord = res.body.attendance.find((a) => a.name === 'Member');
  assert.equal(memberRecord.reason, null);
});

test('absence reason is visible to the member who submitted it', async () => {
  const { memberToken, rehearsalId } = await setup();

  await request(app)
    .put(`/api/attendance/${rehearsalId}`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'absent_full', reason: 'Vacation' });

  const res = await request(app)
    .get(`/api/rehearsals/${rehearsalId}`)
    .set('Authorization', `Bearer ${memberToken}`);

  const myRecord = res.body.attendance.find((a) => a.name === 'Member');
  assert.equal(myRecord.reason, 'Vacation');
});

test('absence reason is visible to the music director', async () => {
  const { memberToken, directorToken, rehearsalId } = await setup();

  await request(app)
    .put(`/api/attendance/${rehearsalId}`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'absent_full', reason: 'Vacation' });

  const res = await request(app)
    .get(`/api/rehearsals/${rehearsalId}`)
    .set('Authorization', `Bearer ${directorToken}`);

  const memberRecord = res.body.attendance.find((a) => a.name === 'Member');
  assert.equal(memberRecord.reason, 'Vacation');
});

test('GET /api/attendance/pending returns cross-rehearsal pending absences', async () => {
  const { memberToken, directorToken, rehearsalId } = await setup();

  const rehearsal2Res = await request(app)
    .post('/api/rehearsals')
    .set('Authorization', `Bearer ${directorToken}`)
    .send({ date: '2026-08-02', startTime: '18:30', endTime: '21:00', location: 'Choir Room 3' });

  await request(app)
    .put(`/api/attendance/${rehearsalId}`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'absent_full', reason: 'Out of town' });

  await request(app)
    .put(`/api/attendance/${rehearsal2Res.body.rehearsals[0].id}`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'absent_full', reason: 'Sick' });

  const res = await request(app)
    .get('/api/attendance/pending')
    .set('Authorization', `Bearer ${directorToken}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.attendance.length, 2);
});

test('GET /api/attendance/pending is music director only', async () => {
  const { memberToken } = await setup();

  const res = await request(app)
    .get('/api/attendance/pending')
    .set('Authorization', `Bearer ${memberToken}`);

  assert.equal(res.status, 403);
});

test('notification appears after absence is reviewed', async () => {
  const { memberToken, directorToken, rehearsalId } = await setup();

  const submitted = await request(app)
    .put(`/api/attendance/${rehearsalId}`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'absent_full', reason: 'Sick' });

  await request(app)
    .put(`/api/attendance/${submitted.body.attendance.id}/review`)
    .set('Authorization', `Bearer ${directorToken}`)
    .send({ approvalStatus: 'approved' });

  const res = await request(app)
    .get('/api/attendance/mine/notifications')
    .set('Authorization', `Bearer ${memberToken}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.notifications.length, 1);
  assert.equal(res.body.notifications[0].approval_status, 'approved');
});

test('notification disappears after acknowledgment', async () => {
  const { memberToken, directorToken, rehearsalId } = await setup();

  const submitted = await request(app)
    .put(`/api/attendance/${rehearsalId}`)
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ status: 'absent_full', reason: 'Sick' });

  await request(app)
    .put(`/api/attendance/${submitted.body.attendance.id}/review`)
    .set('Authorization', `Bearer ${directorToken}`)
    .send({ approvalStatus: 'approved' });

  await request(app)
    .put(`/api/attendance/${submitted.body.attendance.id}/acknowledge`)
    .set('Authorization', `Bearer ${memberToken}`);

  const res = await request(app)
    .get('/api/attendance/mine/notifications')
    .set('Authorization', `Bearer ${memberToken}`);

  assert.equal(res.body.notifications.length, 0);
});

async function getDirectorId(directorToken) {
  const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${directorToken}`);
  return me.body.user.id;
}
