import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDbPath = path.join(__dirname, 'test-auth.db');

// Point the db module at a throwaway file BEFORE anything imports it
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

test('POST /api/auth/register creates the first user as admin', async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'director@group.com', password: 'password123', name: 'Director' });

  assert.equal(res.status, 201);
  assert.equal(res.body.user.role, 'admin');
  assert.ok(res.body.token);
});

test('POST /api/auth/register creates subsequent users as members', async () => {
  await request(app)
    .post('/api/auth/register')
    .send({ email: 'director@group.com', password: 'password123', name: 'Director' });

  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'member@group.com', password: 'password123', name: 'Member' });

  assert.equal(res.status, 201);
  assert.equal(res.body.user.role, 'member');
});

test('POST /api/auth/register rejects duplicate emails', async () => {
  await request(app)
    .post('/api/auth/register')
    .send({ email: 'dupe@group.com', password: 'password123', name: 'First' });

  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'dupe@group.com', password: 'password123', name: 'Second' });

  assert.equal(res.status, 409);
});

test('POST /api/auth/register rejects short passwords', async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'short@group.com', password: 'abc', name: 'Short' });

  assert.equal(res.status, 400);
});

test('POST /api/auth/login succeeds with correct credentials', async () => {
  await request(app)
    .post('/api/auth/register')
    .send({ email: 'login@group.com', password: 'password123', name: 'Login Test' });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'login@group.com', password: 'password123' });

  assert.equal(res.status, 200);
  assert.ok(res.body.token);
});

test('POST /api/auth/login rejects wrong password', async () => {
  await request(app)
    .post('/api/auth/register')
    .send({ email: 'wrongpw@group.com', password: 'password123', name: 'Test' });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'wrongpw@group.com', password: 'nottherightone' });

  assert.equal(res.status, 401);
});

test('GET /api/auth/me requires a valid token', async () => {
  const res = await request(app).get('/api/auth/me');
  assert.equal(res.status, 401);
});
