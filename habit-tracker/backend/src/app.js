import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const credentialsSchema = z.object({
  email: z.email('กรุณากรอกอีเมลให้ถูกต้อง').transform(value => value.trim().toLowerCase()),
  password: z.string().min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร').max(128)
});

const stateSchema = z.object({
  data: z.record(z.string(), z.unknown()).refine(
    value => Buffer.byteLength(JSON.stringify(value), 'utf8') <= 150_000,
    'ข้อมูลมีขนาดใหญ่เกินกำหนด'
  ),
  baseRevision: z.number().int().min(0)
});

function publicUser(row) {
  return { id: row.id, email: row.email };
}

function stateResponse(row) {
  if (!row) return { data: null, revision: 0, updatedAt: null };
  return {
    data: row.data,
    revision: row.revision,
    updatedAt: row.updated_at
  };
}

export function createApp({ pool, config }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Origin is not allowed'));
    }
  }));
  app.use(express.json({ limit: '200kb' }));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอ 15 นาที' }
  });

  function issueToken(user) {
    return jwt.sign({ sub: user.id, email: user.email }, config.jwtSecret, { expiresIn: '30d' });
  }

  function requireAuth(request, response, next) {
    const header = request.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      request.user = { id: payload.sub, email: payload.email };
      next();
    } catch {
      response.status(401).json({ message: 'กรุณาเข้าสู่ระบบใหม่' });
    }
  }

  app.get('/health', async (_request, response, next) => {
    try {
      await pool.query('SELECT 1');
      response.json({ status: 'ok' });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/auth/register', authLimiter, async (request, response, next) => {
    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ message: parsed.error.issues[0].message });
    try {
      const passwordHash = await bcrypt.hash(parsed.data.password, 12);
      const user = {
        id: randomUUID(),
        email: parsed.data.email,
        passwordHash
      };
      const result = await pool.query(
        'INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3) RETURNING id, email',
        [user.id, user.email, user.passwordHash]
      );
      response.status(201).json({ token: issueToken(result.rows[0]), user: publicUser(result.rows[0]) });
    } catch (error) {
      if (error.code === '23505') return response.status(409).json({ message: 'อีเมลนี้มีบัญชีแล้ว' });
      next(error);
    }
  });

  app.post('/api/auth/login', authLimiter, async (request, response, next) => {
    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ message: parsed.error.issues[0].message });
    try {
      const result = await pool.query(
        'SELECT id, email, password_hash FROM users WHERE email = $1',
        [parsed.data.email]
      );
      const user = result.rows[0];
      const valid = user && await bcrypt.compare(parsed.data.password, user.password_hash);
      if (!valid) return response.status(401).json({ message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
      response.json({ token: issueToken(user), user: publicUser(user) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/state', requireAuth, async (request, response, next) => {
    try {
      const result = await pool.query(
        'SELECT data, revision, updated_at FROM habit_states WHERE user_id = $1',
        [request.user.id]
      );
      response.json(stateResponse(result.rows[0]));
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/state', requireAuth, async (request, response, next) => {
    const parsed = stateSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ message: parsed.error.issues[0].message });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const currentResult = await client.query(
        'SELECT data, revision, updated_at FROM habit_states WHERE user_id = $1 FOR UPDATE',
        [request.user.id]
      );
      const current = currentResult.rows[0];
      const expectedRevision = parsed.data.baseRevision;
      const actualRevision = current?.revision || 0;
      if (expectedRevision !== actualRevision) {
        await client.query('ROLLBACK');
        return response.status(409).json({
          code: 'VERSION_CONFLICT',
          message: 'มีข้อมูลใหม่กว่าจากอีกอุปกรณ์',
          state: stateResponse(current)
        });
      }

      let result;
      if (current) {
        result = await client.query(
          `UPDATE habit_states
           SET data = $2::jsonb,
               revision = revision + 1,
               updated_at = NOW()
           WHERE user_id = $1
           RETURNING data, revision, updated_at`,
          [request.user.id, parsed.data.data]
        );
      } else {
        result = await client.query(
          `INSERT INTO habit_states (user_id, data, revision, updated_at)
           VALUES ($1, $2::jsonb, 1, NOW())
           RETURNING data, revision, updated_at`,
          [request.user.id, parsed.data.data]
        );
      }
      await client.query('COMMIT');
      response.json(stateResponse(result.rows[0]));
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      next(error);
    } finally {
      client.release();
    }
  });

  app.use((_request, response) => response.status(404).json({ message: 'ไม่พบ API นี้' }));
  app.use((error, _request, response, _next) => {
    if (error.message === 'Origin is not allowed') {
      return response.status(403).json({ message: 'เว็บไซต์นี้ไม่ได้รับอนุญาต' });
    }
    console.error(error);
    response.status(500).json({ message: 'ระบบขัดข้องชั่วคราว' });
  });

  return app;
}
