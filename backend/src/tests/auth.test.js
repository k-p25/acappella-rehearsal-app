import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Each test file gets its own schema BEFORE anything imports the db module, so
// `node --test` can run the files in parallel against one database.
process.env.PG_SCHEMA = 'test_auth';
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

test('POST /api/auth/register requires a valid organization role', async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'director@group.com', password: 'password123', name: 'Director' });

  assert.equal(res.status, 400);
});

test('POST /api/auth/register creates a user with the selected role', async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'director@group.com', password: 'password123', name: 'Director', role: 'music_director' });

  assert.equal(res.status, 201);
  assert.equal(res.body.user.role, 'music_director');
  assert.ok(res.body.token);
});

test('POST /api/auth/register rejects an invalid role', async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'bad@group.com', password: 'password123', name: 'Bad', role: 'admin' });

  assert.equal(res.status, 400);
});

test('POST /api/auth/register rejects duplicate emails', async () => {
  await request(app)
    .post('/api/auth/register')
    .send({ email: 'dupe@group.com', password: 'password123', name: 'First', role: 'member' });

  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'dupe@group.com', password: 'password123', name: 'Second', role: 'member' });

  assert.equal(res.status, 409);
});

test('POST /api/auth/register rejects short passwords', async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'short@group.com', password: 'abc', name: 'Short', role: 'member' });

  assert.equal(res.status, 400);
});

test('POST /api/auth/login succeeds with correct credentials', async () => {
  await request(app)
    .post('/api/auth/register')
    .send({ email: 'login@group.com', password: 'password123', name: 'Login Test', role: 'member' });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'login@group.com', password: 'password123' });

  assert.equal(res.status, 200);
  assert.ok(res.body.token);
});

test('POST /api/auth/login rejects wrong password', async () => {
  await request(app)
    .post('/api/auth/register')
    .send({ email: 'wrongpw@group.com', password: 'password123', name: 'Test', role: 'member' });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'wrongpw@group.com', password: 'nottherightone' });

  assert.equal(res.status, 401);
});

test('GET /api/auth/me requires a valid token', async () => {
  const res = await request(app).get('/api/auth/me');
  assert.equal(res.status, 401);
});
