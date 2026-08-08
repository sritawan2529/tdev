import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { newDb } from 'pg-mem';
import request from 'supertest';
import { createApp } from '../src/app.js';

const config = {
  jwtSecret: 'test-secret-that-is-longer-than-thirty-two-characters',
  allowedOrigins: ['https://sritawan2529.github.io']
};

let app;

beforeEach(async () => {
  const database = newDb();
  database.public.none(`
    CREATE TABLE users (
      id UUID PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE habit_states (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      revision INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  const adapter = database.adapters.createPg();
  const pool = new adapter.Pool();
  app = createApp({ pool, config });
});

async function register() {
  return request(app).post('/api/auth/register').send({
    email: 'ceo@example.com',
    password: 'correct-horse-battery-staple'
  });
}

describe('CEO Habit OS API', () => {
  it('creates an account and rejects duplicate email', async () => {
    const first = await register();
    assert.equal(first.status, 201);
    assert.equal(first.body.user.email, 'ceo@example.com');
    assert.ok(first.body.token);

    const duplicate = await register();
    assert.equal(duplicate.status, 409);
  });

  it('logs in and rejects a wrong password', async () => {
    await register();
    const login = await request(app).post('/api/auth/login').send({
      email: 'CEO@example.com',
      password: 'correct-horse-battery-staple'
    });
    assert.equal(login.status, 200);
    assert.ok(login.body.token);

    const rejected = await request(app).post('/api/auth/login').send({
      email: 'ceo@example.com',
      password: 'definitely-wrong'
    });
    assert.equal(rejected.status, 401);
  });

  it('stores state and detects stale device writes', async () => {
    const registration = await register();
    const authorization = `Bearer ${registration.body.token}`;
    const empty = await request(app).get('/api/state').set('Authorization', authorization);
    assert.equal(empty.status, 200);
    assert.equal(empty.body.data, null);
    assert.equal(empty.body.revision, 0);

    const first = await request(app)
      .put('/api/state')
      .set('Authorization', authorization)
      .send({ data: { habits: [{ name: 'เดิน 30 นาที' }] }, baseRevision: 0 });
    assert.equal(first.status, 200);
    assert.equal(first.body.revision, 1);

    const stale = await request(app)
      .put('/api/state')
      .set('Authorization', authorization)
      .send({ data: { habits: [] }, baseRevision: 0 });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, 'VERSION_CONFLICT');
    assert.equal(stale.body.state.revision, 1);
    assert.equal(stale.body.state.data.habits[0].name, 'เดิน 30 นาที');
  });

  it('blocks private state without a token and rejects unknown origins', async () => {
    const unauthorized = await request(app).get('/api/state');
    assert.equal(unauthorized.status, 401);

    const blocked = await request(app).get('/health').set('Origin', 'https://evil.example');
    assert.equal(blocked.status, 403);
  });
});
