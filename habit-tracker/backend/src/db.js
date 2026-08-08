import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

export function createPool(databaseUrl) {
  return new Pool({ connectionString: databaseUrl });
}

export async function ensureSchema(pool) {
  const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url));
  const schema = await readFile(schemaPath, 'utf8');
  await pool.query(schema);
}
